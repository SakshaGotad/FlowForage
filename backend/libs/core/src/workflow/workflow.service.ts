import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../storage/prisma.service';
import { OperationRegistry } from '../registry/operation.registry';
import { ConnectionService } from '../connections/connection.service';
import {
  WorkflowDefinition,
  WorkflowStatus,
  WorkflowTriggerConfig,
  WorkflowStepDefinition,
} from '../common/interfaces';

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  trigger: WorkflowTriggerConfig;
  steps: WorkflowStepDefinition[];
}

export interface UpdateWorkflowDto {
  name?: string;
  description?: string;
  trigger?: WorkflowTriggerConfig;
  steps?: WorkflowStepDefinition[];
  status?: WorkflowStatus;
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  // In-memory cache / legacy registry for testing and instant lookups
  private readonly memoryWorkflows = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly operationRegistry: OperationRegistry,
    private readonly connectionService: ConnectionService,
  ) {}

  /**
   * Creates and persists a new workflow definition with full validation.
   */
  async createWorkflow(
    userId: string,
    dto: CreateWorkflowDto,
  ): Promise<WorkflowDefinition> {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!dto.name) {
      throw new BadRequestException('Workflow name is required');
    }
    if (!dto.trigger || !dto.trigger.provider || !dto.trigger.operationKey) {
      throw new BadRequestException('Valid trigger definition is required');
    }
    if (!dto.steps || !Array.isArray(dto.steps) || dto.steps.length === 0) {
      throw new BadRequestException('Workflow must have at least one step');
    }

    // 1. Validate Trigger Operation against Registry
    const triggerDef = this.operationRegistry.getTrigger(
      dto.trigger.provider,
      dto.trigger.operationKey,
    );
    if (!triggerDef && dto.trigger.provider !== 'cron') {
      this.logger.warn(
        `Trigger ${dto.trigger.provider}.${dto.trigger.operationKey} not found in registry (proceeding if dynamic)`,
      );
    }

    // 2. Validate Trigger Connection (if connectionId is specified)
    if (dto.trigger.connectionId) {
      await this.connectionService.getConnection(
        dto.trigger.connectionId,
        userId,
      );
    }

    // 3. Validate Step Operations and Connections
    for (const step of dto.steps) {
      if (!step.id || !step.provider || !step.operationKey) {
        throw new BadRequestException(
          'Each step must have an id, provider, and operationKey',
        );
      }

      if (step.connectionId) {
        // Enforce user ownership of the connection
        await this.connectionService.getConnection(step.connectionId, userId);
      }
    }

    // 4. Save to Database
    const record = await this.prisma.workflow.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description || null,
        status: WorkflowStatus.ACTIVE,
        version: 1,
        triggerJson: dto.trigger as any,
        stepsJson: dto.steps as any,
      },
    });

    const workflow = this.mapToDefinition(record);

    // Keep memory cache updated
    this.memoryWorkflows.set(workflow.id, workflow);
    this.memoryWorkflows.set(workflow.name, workflow);

    this.logger.log(`Created workflow: ${workflow.name} (${workflow.id})`);
    return workflow;
  }

  /**
   * Retrieves a workflow by ID or name (checks database and memory cache).
   */
  async getWorkflowById(
    id: string,
    userId?: string,
  ): Promise<WorkflowDefinition> {
    const record = await this.prisma.workflow.findUnique({
      where: { id },
    });

    if (!record) {
      // Check memory cache
      const memWf = this.memoryWorkflows.get(id);
      if (memWf) {
        return memWf;
      }
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    if (userId && record.userId !== userId) {
      throw new ForbiddenException('Unauthorized access to this workflow');
    }

    return this.mapToDefinition(record);
  }

  /**
   * Lists all workflows belonging to a user.
   */
  async listUserWorkflows(userId: string): Promise<WorkflowDefinition[]> {
    const records = await this.prisma.workflow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapToDefinition(r));
  }

  /**
   * Updates an existing workflow (increments version).
   */
  async updateWorkflow(
    id: string,
    userId: string,
    dto: UpdateWorkflowDto,
  ): Promise<WorkflowDefinition> {
    const existing = await this.prisma.workflow.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Unauthorized to update this workflow');
    }

    const updateData: any = {
      version: existing.version + 1,
    };

    if (dto.name) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status) updateData.status = dto.status;
    if (dto.trigger) updateData.triggerJson = dto.trigger;
    if (dto.steps) updateData.stepsJson = dto.steps;

    const updated = await this.prisma.workflow.update({
      where: { id },
      data: updateData,
    });

    const workflow = this.mapToDefinition(updated);
    this.memoryWorkflows.set(workflow.id, workflow);
    this.memoryWorkflows.set(workflow.name, workflow);

    return workflow;
  }

  /**
   * Updates the workflow status (activate / pause).
   */
  async updateStatus(
    id: string,
    userId: string,
    status: WorkflowStatus,
  ): Promise<WorkflowDefinition> {
    return this.updateWorkflow(id, userId, { status });
  }

  /**
   * Deletes a workflow.
   */
  async deleteWorkflow(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.workflow.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Unauthorized to delete this workflow');
    }

    await this.prisma.workflow.delete({
      where: { id },
    });

    this.memoryWorkflows.delete(id);
    this.memoryWorkflows.delete(existing.name);
  }

  /**
   * Finds active workflows matching an incoming event's provider and triggerKey.
   */
  async findActiveWorkflowsByTrigger(
    provider: string,
    operationKey: string,
    connectionId?: string,
  ): Promise<WorkflowDefinition[]> {
    const activeRecords = await this.prisma.workflow.findMany({
      where: { status: WorkflowStatus.ACTIVE },
    });

    const matched = activeRecords.filter((record) => {
      const trigger = record.triggerJson as any;
      if (!trigger) return false;

      const providerMatch =
        trigger.provider?.toLowerCase() === provider.toLowerCase();
      const opMatch =
        trigger.operationKey?.toLowerCase() === operationKey.toLowerCase();

      if (!providerMatch || !opMatch) return false;

      if (connectionId && trigger.connectionId) {
        return trigger.connectionId === connectionId;
      }

      return true;
    });

    return matched.map((r) => this.mapToDefinition(r));
  }

  // ---------------------------------------------------------------------------
  // Backward-compatibility methods for existing engine/worker lookups
  // ---------------------------------------------------------------------------

  registerWorkflow(workflow: any): void {
    this.memoryWorkflows.set(workflow.name, workflow);
    if (workflow.id) {
      this.memoryWorkflows.set(workflow.id, workflow);
    }
  }

  getWorkflow(nameOrId: string): any {
    return this.memoryWorkflows.get(nameOrId);
  }

  getAllWorkflows(): any[] {
    return Array.from(this.memoryWorkflows.values());
  }

  getWorkflowsByEvent(event: string): any[] {
    return Array.from(this.memoryWorkflows.values()).filter(
      (wf) =>
        wf.trigger?.event === event ||
        wf.trigger?.operationKey === event ||
        `${wf.trigger?.provider}.${wf.trigger?.operationKey}` === event,
    );
  }

  getStepIndex(workflowName: string, stepId: string): number {
    const workflow = this.getWorkflow(workflowName);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowName} not found`);
    }

    const index = workflow.steps.findIndex((s: any) => s.id === stepId);
    if (index === -1) {
      throw new NotFoundException(`Step ${stepId} not found in ${workflowName}`);
    }

    return index;
  }

  private mapToDefinition(record: any): WorkflowDefinition {
    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      description: record.description ?? undefined,
      status: record.status as WorkflowStatus,
      version: record.version,
      trigger: record.triggerJson as WorkflowTriggerConfig,
      steps: record.stepsJson as WorkflowStepDefinition[],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

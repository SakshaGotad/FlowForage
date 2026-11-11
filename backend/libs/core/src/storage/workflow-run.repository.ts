import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { v4 as uuidv4 } from 'uuid';

export interface CreateWorkflowRunOptions {
  runId?: string;
  workflowId?: string;
  workflowName: string;
  payload?: any;
  version?: number;
}

@Injectable()
export class WorkflowRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Flexible create method supporting both object options and positional arguments:
   * - create({ workflowName, payload, runId, workflowId })
   * - create(workflowName, payload, runId?, workflowId?)
   * - create(runId, workflowName, payload, workflowId?)
   */
  async create(
    arg1: string | CreateWorkflowRunOptions,
    arg2?: any,
    arg3?: any,
    arg4?: string,
  ) {
    let runId: string;
    let workflowName: string;
    let payload: any = null;
    let workflowId: string | undefined = undefined;
    let version = 1;

    if (typeof arg1 === 'object') {
      runId = arg1.runId || uuidv4();
      workflowName = arg1.workflowName;
      payload = arg1.payload ?? null;
      workflowId = arg1.workflowId;
      version = arg1.version ?? 1;
    } else if (typeof arg2 === 'string') {
      // Called as create(runId, workflowName, payload, workflowId)
      runId = arg1;
      workflowName = arg2;
      payload = arg3 ?? null;
      workflowId = arg4;
    } else {
      // Called as create(workflowName, payload, runId?, workflowId?)
      workflowName = arg1;
      payload = arg2 ?? null;
      runId = typeof arg3 === 'string' ? arg3 : uuidv4();
      workflowId = arg4;
    }

    return this.prisma.workflowRun.create({
      data: {
        id: runId,
        workflowName,
        workflowId: workflowId ?? null,
        workflowVersion: version,
        status: 'running',
        triggerPayload: payload,
      },
    });
  }

  async findAll() {
    return this.prisma.workflowRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        stepRuns: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findById(runId: string) {
    return this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: {
        stepRuns: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async complete(runId: string) {
    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });
  }

  async markFailed(runId: string, error?: string) {
    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        error: error || 'Execution failed',
        completedAt: new Date(),
      },
    });
  }

  async updateCurrentStep(runId: string, stepIndex: number) {
    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        currentStepIndex: stepIndex,
      },
    });
  }

  async updateContext(runId: string, contextJson: Record<string, any>) {
    return this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        contextJson,
      },
    });
  }
}

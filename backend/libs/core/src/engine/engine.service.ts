import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { WorkflowService } from '../workflow/workflow.service';
import { ExecutorService } from '../executor/executor.service';
import { WorkflowRunRepository } from '../storage/workflow-run.repository';
import { QueueService } from '../queue/queue.service';
import { StepRunRepository } from '../storage/step-run.repository';
@Injectable()
export class EngineService {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly executorService: ExecutorService,
    private readonly workflowRunRepository: WorkflowRunRepository,
    private readonly queueService: QueueService,  
    private readonly stepRunRepository: StepRunRepository
  ) { }

  async getAllRuns() {
  return this.workflowRunRepository.findAll();
}
async getRun(runId: string) {
  const run = await this.workflowRunRepository.findById(runId);

  if (!run) {
    throw new NotFoundException(`Run ${runId} not found`);
  }

  return run;
}

async getRunSteps(runId: string) {
  const steps = await this.stepRunRepository.getStepsByRunId(runId);

  if (!steps.length) {
    throw new NotFoundException(
      `No steps found for run ${runId}`,
    );
  }

  return steps;
}
  async startWorkflow(name: string, payload: any): Promise<void> {
    const workflow = this.workflowService.getWorkflow(name);
    if (!workflow) {
      throw new NotFoundException(`Workflow ${name} not found`);
    }

    const run = await this.workflowRunRepository.create(name, payload);

    try {
      await this.executorService.runWorkflow(workflow, payload, run.id);

      await this.workflowRunRepository.complete(run.id);
    } catch (error) {
      console.error('Workflow failed:', error);

      await this.workflowRunRepository.markFailed(run.id);

      throw new InternalServerErrorException(
        `Workflow ${name} execution failed`,
      );
    }
  }

  async emitEvent(name: string, payload: any) {
    // ✅ Validate input
    if (!name) {
      throw new BadRequestException('Event name is required');
    }

    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload must be a valid object');
    }

    const workflows = this.workflowService.getWorkflowsByEvent(name);

    // ✅ Proper error instead of message
    if (!workflows.length) {
      throw new NotFoundException(
        `No workflows found for event: ${name}`
      );
    }

    for (const wf of workflows) {
      const run = await this.workflowRunRepository.create(wf.name, payload);
      await this.queueService.addWorkflowJob({
        workflowName: wf.name,
        payload,
        stepIndex: 0,
        runId: run.id,
      });
    }

    return {
      success: true,
      message: 'Event processed successfully',
      triggeredWorkflows: workflows.map((w) => w.name),
    };
  }

  async retryWorkflow(runId: string) {
    // 1️⃣ Get workflow run
    const run = await this.workflowRunRepository.findById(runId);

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // 2️⃣ Get failed step
    const failedStep =
      await this.stepRunRepository.getFailedStep(runId);

    if (!failedStep) {
      throw new BadRequestException(
        `No failed step found for run ${runId}`,
      );
    }

    // 3️⃣ Get step index
    const stepIndex = this.workflowService.getStepIndex(
      run.workflowName,
      failedStep.stepId,
    );

    // 4️⃣ Requeue from failed step
    const payload = (run as any).triggerPayload || (run as any).payload || {};
    await this.workflowRunRepository.updateCurrentStep(runId, stepIndex);

    await this.queueService.addWorkflowJob({
      workflowName: run.workflowName,
      payload,
      runId,
      stepIndex,
    });

    return {
      message: 'Workflow retry triggered',
      resumedFromStep: failedStep.stepId,
    };
  }
}

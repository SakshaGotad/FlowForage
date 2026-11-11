import { Injectable, Logger } from '@nestjs/common';
import {
  WorkflowDefinition,
  ExecutionContext,
} from '../common/interfaces';
import { StepRunRepository } from '../storage/step-run.repository';
import { WorkflowRunRepository } from '../storage/workflow-run.repository';
import { QueueService } from '../queue/queue.service';
import { ActionDispatcher } from './action.dispatcher';

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);

  constructor(
    private readonly stepRunRepository: StepRunRepository,
    private readonly workflowRunRepository: WorkflowRunRepository,
    private readonly queueService: QueueService,
    private readonly actionDispatcher: ActionDispatcher,
  ) {}

  async runWorkflow(
    workflow: any, // Supports evolved WorkflowDefinition or legacy
    payload: any,
    runId: string,
    stepIndex: number = 0,
  ): Promise<void> {
    this.logger.log(`Starting workflow: ${workflow.name} (runId: ${runId})`);

    // Build or recover execution context
    const executionContext: ExecutionContext = {
      trigger: {
        output: payload || {},
      },
      steps: {},
    };

    // If resuming from a previous step, restore existing run context if available
    if (stepIndex > 0) {
      try {
        const existingRun = await this.workflowRunRepository.findById(runId);
        if (existingRun && existingRun.contextJson) {
          executionContext.steps = existingRun.contextJson as any;
        }
      } catch (err) {
        this.logger.warn(`Could not restore context for run ${runId}: ${err.message}`);
      }
    }

    for (let i = stepIndex; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];

      // Handle step delay (deferred re-enqueueing)
      if (step.delay) {
        this.logger.log(`Delaying workflow for ${step.delay} ms at step: ${step.id}`);

        await this.workflowRunRepository.updateCurrentStep(runId, i);
        await this.workflowRunRepository.updateContext(runId, executionContext.steps);

        await this.queueService.addWorkflowJob(
          {
            workflowName: workflow.name,
            payload,
            runId,
            stepIndex: i + 1, // resume next step
          },
          {
            delay: step.delay,
          },
        );

        return;
      }

      this.logger.log(`Running step: ${step.id} (${step.provider || 'handler'})`);

      await this.stepRunRepository.create(runId, step.id);
      await this.workflowRunRepository.updateCurrentStep(runId, i);

      const maxAttempts =
        step.retry?.maxAttempts || step.retry?.attempts || 3;
      const baseDelay =
        step.retry?.backoffMs || step.retry?.backoff || 1000;

      let success = false;
      let attempts = 0;

      while (!success && attempts < maxAttempts) {
        try {
          attempts++;
          await this.stepRunRepository.incrementAttempts(runId, step.id);

          // Evolved architecture: Dispatch via ActionDispatcher if provider/operationKey are specified
          if (step.provider && step.operationKey) {
            const userId = workflow.userId || 'system';
            const stepResult = await this.actionDispatcher.dispatch(
              step,
              executionContext,
              userId,
            );

            if (!stepResult.success) {
              const errorMessage =
                stepResult.error?.message || `Step ${step.id} action failed`;
              const errorCode = stepResult.error?.code || 'ACTION_ERROR';

              // If marked not retryable, fail immediately
              if (stepResult.error && !stepResult.error.retryable) {
                await this.stepRunRepository.markFailed(
                  runId,
                  step.id,
                  errorMessage,
                  errorCode,
                );
                throw new Error(errorMessage);
              }

              throw new Error(errorMessage);
            }

            // Record step output into accumulated context
            if (stepResult.output) {
              executionContext.steps[step.id] = {
                output: stepResult.output,
              };
            }

            await this.stepRunRepository.complete(
              runId,
              step.id,
              stepResult.output,
              stepResult.durationMs,
            );
            success = true;
          } else if (typeof step.handler === 'function') {
            // Legacy backwards-compatibility: Function handler
            const output = await step.handler(payload);
            if (output !== undefined) {
              executionContext.steps[step.id] = { output };
            }
            await this.stepRunRepository.complete(runId, step.id, output);
            success = true;
          } else {
            throw new Error(
              `Step ${step.id} has neither provider/operationKey nor a valid handler function`,
            );
          }
        } catch (error) {
          this.logger.error(`Step ${step.id} attempt ${attempts} failed:`, error.message);

          if (attempts >= maxAttempts) {
            await this.stepRunRepository.markFailed(
              runId,
              step.id,
              error.message,
            );
            throw new Error(
              `Step ${step.id} failed after ${maxAttempts} attempts: ${error.message}`,
            );
          }

          // Exponential backoff
          const delay = baseDelay * Math.pow(2, attempts - 1);
          this.logger.log(
            `Retrying step ${step.id} in ${delay} ms (attempt ${attempts}/${maxAttempts})`,
          );

          await new Promise((res) => setTimeout(res, delay));
        }
      }

      // Persist latest context snapshot
      await this.workflowRunRepository.updateContext(runId, executionContext.steps);
    }

    this.logger.log(`Workflow ${workflow.name} completed successfully`);
  }
}

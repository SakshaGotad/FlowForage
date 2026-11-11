import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../storage/prisma.service';
import { WorkflowRunRepository } from '../storage/workflow-run.repository';
import { QueueService } from '../queue/queue.service';
import { WorkflowService } from '../workflow/workflow.service';
import { NormalizedEvent } from '../common/interfaces';

export interface DispatchResult {
  processed: boolean;
  duplicate?: boolean;
  matchedWorkflows: number;
  runIds: string[];
}

@Injectable()
export class TriggerDispatcher {
  private readonly logger = new Logger(TriggerDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
    private readonly workflowRunRepository: WorkflowRunRepository,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Receives a normalized event, enforces idempotency, matches active workflows,
   * creates workflow run records, and enqueues execution jobs.
   */
  async dispatch(event: NormalizedEvent): Promise<DispatchResult> {
    this.logger.log(
      `Received normalized event: ${event.provider}.${event.triggerKey} (externalId: ${event.externalEventId})`,
    );

    // 1. Enforce Idempotency / Deduplication via trigger_events table
    const isDuplicate = await this.checkAndRecordEvent(event);
    if (isDuplicate) {
      this.logger.warn(
        `Duplicate event ignored: ${event.provider} event ${event.externalEventId}`,
      );
      return {
        processed: false,
        duplicate: true,
        matchedWorkflows: 0,
        runIds: [],
      };
    }

    // 2. Find active workflows subscribed to this provider & trigger
    const matchingWorkflows =
      await this.workflowService.findActiveWorkflowsByTrigger(
        event.provider,
        event.triggerKey,
        event.connectionId !== 'unscoped' ? event.connectionId : undefined,
      );

    if (matchingWorkflows.length === 0) {
      this.logger.log(
        `No active workflows matched event: ${event.provider}.${event.triggerKey}`,
      );
      return {
        processed: true,
        matchedWorkflows: 0,
        runIds: [],
      };
    }

    this.logger.log(
      `Found ${matchingWorkflows.length} matching workflow(s) for event: ${event.provider}.${event.triggerKey}`,
    );

    const runIds: string[] = [];

    // 3. Create execution run records and enqueue BullMQ jobs
    for (const workflow of matchingWorkflows) {
      try {
        const run = await this.workflowRunRepository.create({
          workflowId: workflow.id,
          workflowName: workflow.name,
          payload: event.payload,
          version: workflow.version,
        });

        await this.queueService.addWorkflowJob({
          workflowName: workflow.name,
          payload: event.payload,
          runId: run.id,
          stepIndex: 0,
        });

        runIds.push(run.id);
        this.logger.log(
          `Enqueued workflow run '${run.id}' for workflow '${workflow.name}'`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to enqueue run for workflow ${workflow.id}: ${err.message}`,
          err.stack,
        );
      }
    }

    // 4. Mark trigger event as processed
    await this.markEventProcessed(event.provider, event.externalEventId);

    return {
      processed: true,
      matchedWorkflows: matchingWorkflows.length,
      runIds,
    };
  }

  /**
   * Checks if this externalEventId was already ingested; if not, records it.
   * Returns true if it was already processed (duplicate).
   */
  private async checkAndRecordEvent(event: NormalizedEvent): Promise<boolean> {
    try {
      const existing = await this.prisma.triggerEvent.findUnique({
        where: {
          provider_externalEventId: {
            provider: event.provider,
            externalEventId: event.externalEventId,
          },
        },
      });

      if (existing) {
        return true;
      }

      await this.prisma.triggerEvent.create({
        data: {
          provider: event.provider,
          externalEventId: event.externalEventId,
          triggerKey: event.triggerKey,
          externalAccountId: event.externalAccountId,
          payload: event.payload as any,
          processed: false,
        },
      });

      return false;
    } catch (err) {
      // In high-concurrency situations, unique constraint violation means another process inserted it
      if (err.code === 'P2002') {
        return true;
      }
      this.logger.error(
        `Error recording trigger event: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }

  private async markEventProcessed(
    provider: string,
    externalEventId: string,
  ): Promise<void> {
    try {
      await this.prisma.triggerEvent.update({
        where: {
          provider_externalEventId: {
            provider,
            externalEventId,
          },
        },
        data: {
          processed: true,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to mark trigger event as processed: ${err.message}`,
      );
    }
  }
}


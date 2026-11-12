import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class StepRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(runId: string, stepId: string, inputData?: any) {
    return this.prisma.stepRun.create({
      data: {
        workflowRunId: runId,
        stepId,
        status: 'running',
        attempts: 0,
        startedAt: new Date(),
        inputData: inputData ?? null,
      },
    });
  }

  async getStepsByRunId(runId: string) {
    return this.prisma.stepRun.findMany({
      where: { workflowRunId: runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async incrementAttempts(runId: string, stepId: string) {
    const existing = await this.prisma.stepRun.findFirst({
      where: { workflowRunId: runId, stepId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.prisma.stepRun.update({
        where: { id: existing.id },
        data: {
          attempts: existing.attempts + 1,
        },
      });
    }
  }

  async complete(
    runId: string,
    stepId: string,
    outputData?: any,
    durationMs?: number,
  ) {
    const existing = await this.prisma.stepRun.findFirst({
      where: { workflowRunId: runId, stepId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.prisma.stepRun.update({
        where: { id: existing.id },
        data: {
          status: 'completed',
          outputData: outputData ?? null,
          durationMs: durationMs ?? null,
          completedAt: new Date(),
        },
      });
    }
  }

  async markFailed(
    runId: string,
    stepId: string,
    errorMessage?: string,
    errorCode?: string,
  ) {
    const existing = await this.prisma.stepRun.findFirst({
      where: { workflowRunId: runId, stepId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.prisma.stepRun.update({
        where: { id: existing.id },
        data: {
          status: 'failed',
          errorMessage: errorMessage || 'Step execution failed',
          errorCode: errorCode || null,
          completedAt: new Date(),
        },
      });
    }
  }

  async getFailedStep(runId: string) {
    return this.prisma.stepRun.findFirst({
      where: {
        workflowRunId: runId,
        status: 'failed',
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}

import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { PrismaService } from './prisma.service';
import { WorkflowRunRepository } from './workflow-run.repository';
import { StepRunRepository } from './step-run.repository';

@Module({
  providers: [
    DatabaseService,
    PrismaService,
    WorkflowRunRepository,
    StepRunRepository,
  ],
  exports: [
    DatabaseService,
    PrismaService,
    WorkflowRunRepository,
    StepRunRepository,
  ],
})
export class DatabaseModule {}

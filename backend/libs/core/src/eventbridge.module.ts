import { Module, OnModuleInit } from '@nestjs/common';
import { CoreService } from './eventbridge.service';
import { EngineModule } from './engine/engine.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ExecutorModule } from './executor/executor.module';
import { QueueModule } from './queue/queue.module';
import { WorkflowService } from './workflow/workflow.service';
import { DatabaseModule } from './storage/database.module';
import { ConnectionsModule } from './connections/connections.module';
import { AuthModule } from './auth/auth.module';
import { RegistryModule } from './registry/registry.module';
import { ProvidersModule } from './providers/providers.module';
import { createWorker } from './queue/worker';
import { ExecutorService } from './executor/executor.service';
import { WorkflowRunRepository } from './storage/workflow-run.repository';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    EngineModule,
    WorkflowModule,
    ExecutorModule,
    QueueModule,
    DatabaseModule,
    ConnectionsModule,
    AuthModule,
    RegistryModule,
    ProvidersModule,
    ScheduleModule.forRoot(),
  ],
  providers: [CoreService, WorkflowService],
  exports: [
    CoreService,
    WorkflowService,
    EngineModule,
    ConnectionsModule,
    AuthModule,
    DatabaseModule,
    QueueModule,
    RegistryModule,
    ProvidersModule,
  ],
})
export class FlowForageModule implements OnModuleInit {
  constructor(
    private readonly executor: ExecutorService,
    private readonly workflowService: WorkflowService,
    private readonly workflowRunRepo: WorkflowRunRepository,
  ) {}

  onModuleInit() {
    createWorker(this.executor, this.workflowService, this.workflowRunRepo);
  }
}

// Backward compatibility alias
export { FlowForageModule as EventbridgeModule };

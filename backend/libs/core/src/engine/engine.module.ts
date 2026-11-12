import { Module } from '@nestjs/common';
import { EngineService } from './engine.service';
import { EngineController } from './engine.controller';
import { SchedulerService } from './schedular.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { ExecutorModule } from '../executor/executor.module';
import { DatabaseModule } from '../storage/database.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [WorkflowModule, ExecutorModule, DatabaseModule, QueueModule],
  controllers: [EngineController],
  providers: [EngineService, SchedulerService],
  exports: [EngineService, SchedulerService],
})
export class EngineModule {}

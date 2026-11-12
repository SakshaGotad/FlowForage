import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { DatabaseModule } from '../storage/database.module';
import { RegistryModule } from '../registry/registry.module';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [DatabaseModule, RegistryModule, ConnectionsModule],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}

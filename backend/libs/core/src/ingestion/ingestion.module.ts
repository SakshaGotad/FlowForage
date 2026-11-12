import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { EventNormalizer } from './event.normalizer';
import { TriggerDispatcher } from './trigger.dispatcher';
import { DatabaseModule } from '../storage/database.module';
import { ProvidersModule } from '../providers/providers.module';
import { ConnectionsModule } from '../connections/connections.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    DatabaseModule,
    ProvidersModule,
    ConnectionsModule,
    WorkflowModule,
    QueueModule,
  ],
  controllers: [WebhookController],
  providers: [EventNormalizer, TriggerDispatcher],
  exports: [EventNormalizer, TriggerDispatcher],
})
export class IngestionModule {}


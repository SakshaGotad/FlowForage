import { Module } from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { ActionDispatcher } from './action.dispatcher';
import { FieldMappingResolver } from './field-mapping.resolver';
import { DatabaseModule } from '../storage/database.module';
import { QueueModule } from '../queue/queue.module';
import { RegistryModule } from '../registry/registry.module';
import { ProvidersModule } from '../providers/providers.module';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    RegistryModule,
    ProvidersModule,
    ConnectionsModule,
  ],
  providers: [ExecutorService, ActionDispatcher, FieldMappingResolver],
  exports: [ExecutorService, ActionDispatcher, FieldMappingResolver],
})
export class ExecutorModule {}

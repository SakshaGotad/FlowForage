import { Module, Global } from '@nestjs/common';
import { IntegrationRegistry } from './integration.registry';
import { OperationRegistry } from './operation.registry';
import { RegistryController } from './registry.controller';

@Global()
@Module({
  controllers: [RegistryController],
  providers: [IntegrationRegistry, OperationRegistry],
  exports: [IntegrationRegistry, OperationRegistry],
})
export class RegistryModule {}

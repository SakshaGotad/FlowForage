import { Module, Global } from '@nestjs/common';
import { IntegrationRegistry } from './integration.registry';
import { OperationRegistry } from './operation.registry';

@Global()
@Module({
  providers: [IntegrationRegistry, OperationRegistry],
  exports: [IntegrationRegistry, OperationRegistry],
})
export class RegistryModule {}


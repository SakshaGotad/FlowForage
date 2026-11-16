import {
  Controller,
  Get,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationRegistry } from './integration.registry';
import { OperationRegistry } from './operation.registry';

@Controller('integrations')
export class RegistryController {
  constructor(
    private readonly integrationRegistry: IntegrationRegistry,
    private readonly operationRegistry: OperationRegistry,
  ) {}

  /**
   * Returns all available applications for the App Catalog UI.
   * Example: [{ key: 'github', displayName: 'GitHub', ... }, { key: 'slack', ... }]
   */
  @Get()
  getAllIntegrations() {
    return this.integrationRegistry.getAll();
  }

  /**
   * Returns metadata for a single provider.
   */
  @Get(':provider')
  getIntegration(@Param('provider') provider: string) {
    const integration = this.integrationRegistry.get(provider);
    if (!integration) {
      throw new NotFoundException(`Integration '${provider}' not found in catalog`);
    }
    return integration;
  }

  /**
   * Returns all triggers supported by a provider, including their outputSchema.
   * The frontend uses this to display available variables for field mapping!
   */
  @Get(':provider/triggers')
  getProviderTriggers(@Param('provider') provider: string) {
    if (!this.integrationRegistry.has(provider)) {
      throw new NotFoundException(`Integration '${provider}' not found in catalog`);
    }
    return this.operationRegistry.getTriggersForProvider(provider);
  }

  /**
   * Returns all actions supported by a provider, including their inputSchema.
   * The frontend uses this to dynamically render input forms for the user!
   */
  @Get(':provider/actions')
  getProviderActions(@Param('provider') provider: string) {
    if (!this.integrationRegistry.has(provider)) {
      throw new NotFoundException(`Integration '${provider}' not found in catalog`);
    }
    return this.operationRegistry.getActionsForProvider(provider);
  }
}

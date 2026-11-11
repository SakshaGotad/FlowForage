import { OnModuleInit, Injectable } from '@nestjs/common';
import {
  ProviderAdapter,
  IntegrationDefinition,
  TriggerDefinition,
  ActionDefinition,
  ActionResult,
  ResolvedCredentials,
} from '../common/interfaces';
import { IntegrationRegistry } from '../registry/integration.registry';
import { OperationRegistry } from '../registry/operation.registry';
import { AdapterRegistry } from './adapter.registry';

@Injectable()
export abstract class BaseProviderAdapter implements ProviderAdapter, OnModuleInit {
  abstract readonly providerKey: string;

  constructor(
    protected readonly integrationRegistry: IntegrationRegistry,
    protected readonly operationRegistry: OperationRegistry,
    protected readonly adapterRegistry: AdapterRegistry,
  ) {}

  abstract getDefinition(): IntegrationDefinition;
  abstract getTriggers(): TriggerDefinition[];
  abstract getActions(): ActionDefinition[];

  abstract executeAction(
    operationKey: string,
    credentials: ResolvedCredentials,
    input: Record<string, any>,
  ): Promise<ActionResult>;

  /**
   * Automatically registers this provider's metadata, triggers, actions,
   * and adapter instance upon NestJS module initialization.
   */
  onModuleInit(): void {
    // 1. Register Integration definition
    this.integrationRegistry.register(this.getDefinition());

    // 2. Register all triggers
    for (const trigger of this.getTriggers()) {
      this.operationRegistry.registerTrigger(trigger);
    }

    // 3. Register all actions
    for (const action of this.getActions()) {
      this.operationRegistry.registerAction(action);
    }

    // 4. Register this adapter instance
    this.adapterRegistry.register(this);
  }
}


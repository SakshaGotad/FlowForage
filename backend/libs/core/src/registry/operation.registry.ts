import { Injectable, Logger } from '@nestjs/common';
import { TriggerDefinition, ActionDefinition } from '../common/interfaces';

@Injectable()
export class OperationRegistry {
  private readonly logger = new Logger(OperationRegistry.name);
  private readonly triggers = new Map<string, TriggerDefinition>();
  private readonly actions = new Map<string, ActionDefinition>();

  private buildKey(provider: string, operationKey: string): string {
    return `${provider.toLowerCase()}:${operationKey.toLowerCase()}`;
  }

  /**
   * Registers a trigger definition for a provider.
   */
  registerTrigger(trigger: TriggerDefinition): void {
    const key = this.buildKey(trigger.provider, trigger.key);
    this.triggers.set(key, trigger);
    this.logger.log(
      `Registered trigger: ${trigger.provider} / ${trigger.displayName} (${trigger.key})`,
    );
  }

  /**
   * Registers an action definition for a provider.
   */
  registerAction(action: ActionDefinition): void {
    const key = this.buildKey(action.provider, action.key);
    this.actions.set(key, action);
    this.logger.log(
      `Registered action: ${action.provider} / ${action.displayName} (${action.key})`,
    );
  }

  /**
   * Retrieves a specific trigger definition.
   */
  getTrigger(provider: string, operationKey: string): TriggerDefinition | undefined {
    return this.triggers.get(this.buildKey(provider, operationKey));
  }

  /**
   * Retrieves a specific action definition.
   */
  getAction(provider: string, operationKey: string): ActionDefinition | undefined {
    return this.actions.get(this.buildKey(provider, operationKey));
  }

  /**
   * Returns all triggers registered for a given provider.
   */
  getTriggersForProvider(provider: string): TriggerDefinition[] {
    const target = provider.toLowerCase();
    return Array.from(this.triggers.values()).filter(
      (t) => t.provider.toLowerCase() === target,
    );
  }

  /**
   * Returns all actions registered for a given provider.
   */
  getActionsForProvider(provider: string): ActionDefinition[] {
    const target = provider.toLowerCase();
    return Array.from(this.actions.values()).filter(
      (a) => a.provider.toLowerCase() === target,
    );
  }

  /**
   * Returns all triggers across all providers.
   */
  getAllTriggers(): TriggerDefinition[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Returns all actions across all providers.
   */
  getAllActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }
}


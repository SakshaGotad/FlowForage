import { Injectable, Logger } from '@nestjs/common';
import { IntegrationDefinition } from '../common/interfaces';

@Injectable()
export class IntegrationRegistry {
  private readonly logger = new Logger(IntegrationRegistry.name);
  private readonly integrations = new Map<string, IntegrationDefinition>();

  /**
   * Registers a provider integration definition.
   */
  register(definition: IntegrationDefinition): void {
    const key = definition.key.toLowerCase();
    if (this.integrations.has(key)) {
      this.logger.warn(`Overwriting integration definition for: ${key}`);
    }
    this.integrations.set(key, definition);
    this.logger.log(`Registered integration: ${definition.displayName} (${key})`);
  }

  /**
   * Retrieves an integration definition by its provider key.
   */
  get(key: string): IntegrationDefinition | undefined {
    return this.integrations.get(key.toLowerCase());
  }

  /**
   * Checks whether an integration definition exists.
   */
  has(key: string): boolean {
    return this.integrations.has(key.toLowerCase());
  }

  /**
   * Returns all registered integration definitions.
   * Useful for the app catalog UI.
   */
  getAll(): IntegrationDefinition[] {
    return Array.from(this.integrations.values());
  }
}


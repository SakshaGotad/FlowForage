import { Injectable, Logger } from '@nestjs/common';
import { ProviderAdapter } from '../common/interfaces';

@Injectable()
export class AdapterRegistry {
  private readonly logger = new Logger(AdapterRegistry.name);
  private readonly adapters = new Map<string, ProviderAdapter>();

  /**
   * Registers a provider adapter instance.
   */
  register(adapter: ProviderAdapter): void {
    const key = adapter.providerKey.toLowerCase();
    if (this.adapters.has(key)) {
      this.logger.warn(`Overwriting provider adapter for: ${key}`);
    }
    this.adapters.set(key, adapter);
    this.logger.log(`Registered adapter for provider: ${key}`);
  }

  /**
   * Retrieves an adapter by provider key.
   */
  get(providerKey: string): ProviderAdapter | undefined {
    return this.adapters.get(providerKey.toLowerCase());
  }

  /**
   * Checks whether an adapter is registered for a provider key.
   */
  has(providerKey: string): boolean {
    return this.adapters.has(providerKey.toLowerCase());
  }

  /**
   * Returns all registered adapters.
   */
  getAll(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }
}


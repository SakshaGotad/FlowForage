import { Injectable } from '@nestjs/common';
import {
  ParsedWebhookEvent,
  NormalizedEvent,
} from '../common/interfaces';

@Injectable()
export class EventNormalizer {
  /**
   * Normalizes a provider-specific parsed webhook event into a uniform internal event.
   */
  normalize(
    provider: string,
    parsed: ParsedWebhookEvent,
    connectionId?: string,
  ): NormalizedEvent {
    return {
      provider: provider.toLowerCase(),
      triggerKey: parsed.triggerKey,
      externalEventId: parsed.externalEventId,
      connectionId: connectionId || 'unscoped',
      externalAccountId: parsed.externalAccountId,
      eventTimestamp: parsed.eventTimestamp || new Date(),
      payload: parsed.payload,
      rawPayload: parsed.rawPayload,
    };
  }
}


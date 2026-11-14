import {
  Controller,
  Post,
  Param,
  Headers,
  Body,
  Req,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AdapterRegistry } from '../providers/adapter.registry';
import { ConnectionService } from '../connections/connection.service';
import { EventNormalizer } from './event.normalizer';
import { TriggerDispatcher } from './trigger.dispatcher';
import { WebhookProvider } from '../common/interfaces';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly adapterRegistry: AdapterRegistry,
    private readonly connectionService: ConnectionService,
    private readonly eventNormalizer: EventNormalizer,
    private readonly triggerDispatcher: TriggerDispatcher,
  ) {}

  @Post(':provider')
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
    @Body() body: any,
  ) {
    const providerKey = provider.toLowerCase();
    this.logger.log(`Received webhook request for provider: ${providerKey}`);

    // Fast return for Slack url_verification challenge
    if (providerKey === 'slack' && body && body.type === 'url_verification') {
      this.logger.log('Responding to Slack url_verification challenge');
      return { challenge: body.challenge };
    }

    // 1. Locate provider adapter
    const adapter = this.adapterRegistry.get(providerKey);
    if (!adapter) {
      throw new NotFoundException(`No adapter registered for provider: ${providerKey}`);
    }

    const webhookProvider = adapter as unknown as Partial<WebhookProvider>;

    // 2. Signature verification (if provider supports webhooks)
    if (typeof webhookProvider.verifyWebhookSignature === 'function') {
      const rawBody =
        (req as any).rawBody ||
        Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));

      const secretEnvKey = `${providerKey.toUpperCase()}_WEBHOOK_SECRET`;
      const secret = process.env[secretEnvKey] || 'flowforage-webhook-secret';

      const isValid = webhookProvider.verifyWebhookSignature(headers, rawBody, secret);
      if (!isValid) {
        this.logger.warn(`Signature verification failed for ${providerKey} webhook`);
        throw new UnauthorizedException(`Invalid webhook signature for ${providerKey}`);
      }
    }

    // 3. Parse provider-specific payload
    if (typeof webhookProvider.parseWebhookEvent !== 'function') {
      return {
        success: true,
        ignored: true,
        message: `Provider ${providerKey} does not support webhook event parsing`,
      };
    }

    const parsedEvent = webhookProvider.parseWebhookEvent(headers, body);
    if (!parsedEvent) {
      return {
        success: true,
        ignored: true,
        message: `Event ignored by ${providerKey} adapter`,
      };
    }

    // 4. Resolve connection by external account (e.g. repo name or organization)
    let connectionId: string | undefined = undefined;
    if (parsedEvent.externalAccountId) {
      const connection = await this.connectionService.findByExternalAccount(
        providerKey,
        parsedEvent.externalAccountId,
      );
      if (connection) {
        connectionId = connection.id;
      }
    }

    // 5. Normalize event
    const normalizedEvent = this.eventNormalizer.normalize(
      providerKey,
      parsedEvent,
      connectionId,
    );

    // 6. Dispatch through engine (deduplicate, match active workflows, enqueue runs)
    const dispatchResult = await this.triggerDispatcher.dispatch(normalizedEvent);

    return {
      success: true,
      provider: providerKey,
      triggerKey: parsedEvent.triggerKey,
      ...dispatchResult,
    };
  }
}


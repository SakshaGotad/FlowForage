import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { BaseProviderAdapter } from '../base-provider.adapter';
import { IntegrationRegistry } from '../../registry/integration.registry';
import { OperationRegistry } from '../../registry/operation.registry';
import { AdapterRegistry } from '../adapter.registry';
import {
  IntegrationDefinition,
  AuthType,
  TriggerDefinition,
  ActionDefinition,
  EventDeliveryType,
  WebhookProvider,
  RefreshableProvider,
  ParsedWebhookEvent,
  ResolvedCredentials,
  ActionResult,
  TokenSet,
} from '../../common/interfaces';

@Injectable()
export class SlackAdapter
  extends BaseProviderAdapter
  implements WebhookProvider, RefreshableProvider
{
  readonly providerKey = 'slack';
  private readonly logger = new Logger(SlackAdapter.name);

  constructor(
    integrationRegistry: IntegrationRegistry,
    operationRegistry: OperationRegistry,
    adapterRegistry: AdapterRegistry,
  ) {
    super(integrationRegistry, operationRegistry, adapterRegistry);
  }

  getDefinition(): IntegrationDefinition {
    return {
      key: 'slack',
      displayName: 'Slack',
      description: 'Send channel messages, monitor team conversations, and automate workspace notifications.',
      authType: AuthType.OAUTH2,
      oauth: {
        authorizationUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: [
          'chat:write',
          'chat:write.public',
          'channels:history',
          'channels:read',
        ],
        supportsRefresh: true,
      },
      iconUrl: 'https://a.slack-edge.com/80588/marketing/img/meta/slack_hash_256.png',
    };
  }

  getTriggers(): TriggerDefinition[] {
    return [
      {
        key: 'message.received',
        provider: 'slack',
        displayName: 'New Message in Channel',
        description: 'Triggers when a new message is posted in a Slack channel.',
        eventDelivery: EventDeliveryType.EVENTS_API,
        configSchema: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              description: 'Slack Channel ID (e.g. C0123456789) to listen to',
            },
          },
          required: ['channel'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Message text content' },
            user: { type: 'string', description: 'User ID of the sender' },
            channel: { type: 'string', description: 'Channel ID where message was posted' },
            ts: { type: 'string', description: 'Message timestamp (unique within channel)' },
            thread_ts: { type: 'string', description: 'Parent thread timestamp if in thread' },
            team_id: { type: 'string', description: 'Slack Workspace / Team ID' },
          },
          required: ['text', 'channel', 'ts'],
        },
        requiredScopes: ['channels:history', 'channels:read'],
      },
    ];
  }

  getActions(): ActionDefinition[] {
    return [
      {
        key: 'message.send',
        provider: 'slack',
        displayName: 'Send Channel Message',
        description: 'Sends a message to a Slack channel.',
        inputSchema: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              description: 'Channel ID or name (e.g. #general or C1234567890)',
            },
            text: {
              type: 'string',
              description: 'Text of the message to send',
            },
            thread_ts: {
              type: 'string',
              description: 'Optional thread timestamp to reply in a thread',
            },
          },
          required: ['channel', 'text'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', description: 'Whether the message was sent successfully' },
            channel: { type: 'string', description: 'Channel ID where message was posted' },
            ts: { type: 'string', description: 'Timestamp of the created message' },
            message_id: { type: 'string', description: 'Identifier of the message' },
          },
          required: ['ok', 'channel', 'ts'],
        },
        requiredScopes: ['chat:write'],
      },
    ];
  }

  /**
   * Verifies Slack Events API request signature using HMAC-SHA256:
   * Header: X-Slack-Signature (format: v0=<hash>)
   * Header: X-Slack-Request-Timestamp
   * Base string: v0:<timestamp>:<rawBody>
   */
  verifyWebhookSignature(
    headers: Record<string, string>,
    rawBody: Buffer,
    secret: string,
  ): boolean {
    const signature = headers['x-slack-signature'] || headers['X-Slack-Signature'];
    const timestamp = headers['x-slack-request-timestamp'] || headers['X-Slack-Request-Timestamp'];

    if (!signature || !timestamp) {
      this.logger.warn('Missing Slack signature or timestamp header');
      return false;
    }

    // Protect against replay attacks (reject timestamps older than 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);
    if (Math.abs(currentTime - requestTime) > 300) {
      this.logger.warn('Slack request timestamp expired (> 5 minutes)');
      return false;
    }

    try {
      const sigBaseString = `v0:${timestamp}:${rawBody.toString('utf8')}`;
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(sigBaseString);
      const expectedSignature = `v0=${hmac.digest('hex')}`;

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (err) {
      this.logger.error(`Error verifying Slack signature: ${err.message}`);
      return false;
    }
  }

  /**
   * Parses incoming Slack Events API payload into normalized intermediate event.
   */
  parseWebhookEvent(
    headers: Record<string, string>,
    body: any,
  ): ParsedWebhookEvent | null {
    // Ignore Slack url_verification challenge (handled separately)
    if (body.type === 'url_verification') {
      return null;
    }

    // Process event_callback
    if (body.type === 'event_callback' && body.event) {
      const event = body.event;

      // Handle message event (ignore bot messages and subtype edits to avoid infinite loops)
      if (event.type === 'message' && !event.subtype && !event.bot_id) {
        return {
          triggerKey: 'message.received',
          externalEventId: body.event_id || `slack-${event.channel}-${event.ts}`,
          externalAccountId: body.team_id || 'unknown-team',
          eventTimestamp: new Date(parseFloat(event.ts) * 1000 || Date.now()),
          payload: {
            text: event.text || '',
            user: event.user,
            channel: event.channel,
            ts: event.ts,
            thread_ts: event.thread_ts,
            team_id: body.team_id,
          },
          rawPayload: body,
        };
      }
    }

    return null;
  }

  /**
   * Executes Slack Web API actions.
   */
  async executeAction(
    operationKey: string,
    credentials: ResolvedCredentials,
    input: Record<string, any>,
  ): Promise<ActionResult> {
    if (operationKey === 'message.send') {
      const { channel, text, thread_ts } = input;

      if (!channel || !text) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Missing required fields 'channel' and 'text'",
            retryable: false,
          },
        };
      }

      try {
        const payload: Record<string, any> = {
          channel,
          text,
        };
        if (thread_ts) {
          payload.thread_ts = thread_ts;
        }

        const response = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!data.ok) {
          const isRateLimit = data.error === 'ratelimited';
          const isAuthError =
            data.error === 'invalid_auth' ||
            data.error === 'token_expired' ||
            data.error === 'not_authed';

          return {
            success: false,
            error: {
              code: isRateLimit ? 'RATE_LIMITED' : data.error?.toUpperCase() || 'SLACK_ERROR',
              message: `Slack API error: ${data.error}`,
              retryable: isRateLimit,
              providerResponse: data,
            },
          };
        }

        return {
          success: true,
          output: {
            ok: data.ok,
            channel: data.channel,
            ts: data.ts,
            message_id: data.message?.ts || data.ts,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: `Failed to call Slack API: ${err.message}`,
            retryable: true,
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: `Operation '${operationKey}' is not supported by Slack adapter`,
        retryable: false,
      },
    };
  }

  /**
   * Refreshes an expired Slack OAuth access token.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET environment variables are required for token refresh');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack token refresh failed: ${data.error}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      tokenType: data.token_type,
      scope: data.scope,
      metadata: {
        team_id: data.team?.id,
        team_name: data.team?.name,
      },
    };
  }
}


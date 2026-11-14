import { Injectable, Logger } from '@nestjs/common';
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
  GatewayProvider,
  ParsedWebhookEvent,
  ResolvedCredentials,
  ActionResult,
} from '../../common/interfaces';

@Injectable()
export class DiscordAdapter extends BaseProviderAdapter implements GatewayProvider {
  readonly providerKey = 'discord';
  private readonly logger = new Logger(DiscordAdapter.name);
  private eventCallback?: (event: ParsedWebhookEvent) => void;
  private isConnected = false;

  constructor(
    integrationRegistry: IntegrationRegistry,
    operationRegistry: OperationRegistry,
    adapterRegistry: AdapterRegistry,
  ) {
    super(integrationRegistry, operationRegistry, adapterRegistry);
  }

  getDefinition(): IntegrationDefinition {
    return {
      key: 'discord',
      displayName: 'Discord',
      description: 'Post messages to channels, send notifications, and interact with Discord servers.',
      authType: AuthType.BOT_TOKEN,
      iconUrl: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    };
  }

  getTriggers(): TriggerDefinition[] {
    return [
      {
        key: 'message.received',
        provider: 'discord',
        displayName: 'New Message in Channel',
        description: 'Triggers when a message is posted to a Discord text channel.',
        eventDelivery: EventDeliveryType.GATEWAY,
        configSchema: {
          type: 'object',
          properties: {
            channelId: {
              type: 'string',
              description: 'Discord Channel Snowflake ID (e.g. 123456789012345678)',
            },
          },
          required: ['channelId'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Discord Message Snowflake ID' },
            content: { type: 'string', description: 'Message content' },
            author: { type: 'string', description: 'Username of author' },
            authorId: { type: 'string', description: 'Author Snowflake ID' },
            channelId: { type: 'string', description: 'Channel Snowflake ID' },
            guildId: { type: 'string', description: 'Guild / Server Snowflake ID' },
            timestamp: { type: 'string', description: 'ISO 8601 creation timestamp' },
          },
          required: ['id', 'content', 'channelId'],
        },
      },
    ];
  }

  getActions(): ActionDefinition[] {
    return [
      {
        key: 'message.send',
        provider: 'discord',
        displayName: 'Send Channel Message',
        description: 'Sends a text message to a Discord channel.',
        inputSchema: {
          type: 'object',
          properties: {
            channelId: {
              type: 'string',
              description: 'Target Channel Snowflake ID (required)',
            },
            content: {
              type: 'string',
              description: 'Text message content (required, max 2000 chars)',
            },
          },
          required: ['channelId', 'content'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Created Message Snowflake ID' },
            channel_id: { type: 'string', description: 'Channel ID' },
            content: { type: 'string', description: 'Message content' },
            timestamp: { type: 'string', description: 'Timestamp' },
          },
          required: ['id', 'channel_id'],
        },
      },
    ];
  }

  /**
   * Executes Discord REST API actions.
   */
  async executeAction(
    operationKey: string,
    credentials: ResolvedCredentials,
    input: Record<string, any>,
  ): Promise<ActionResult> {
    if (operationKey === 'message.send') {
      const { channelId, content } = input;

      if (!channelId || !content) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Missing required fields 'channelId' and 'content'",
            retryable: false,
          },
        };
      }

      // Format authorization header (support Bot token or Bearer)
      const token = credentials.accessToken.startsWith('Bot ')
        ? credentials.accessToken
        : `Bot ${credentials.accessToken}`;

      try {
        const response = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: token,
              'Content-Type': 'application/json',
              'User-Agent': 'FlowForage-Bot (https://flowforage.com, 1.0.0)',
            },
            body: JSON.stringify({ content }),
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          let parsedError: any;
          try {
            parsedError = JSON.parse(errText);
          } catch {
            parsedError = { message: errText };
          }

          const isRateLimit = response.status === 429;
          const isAuthError = response.status === 401 || response.status === 403;

          return {
            success: false,
            error: {
              code: isRateLimit
                ? 'RATE_LIMITED'
                : isAuthError
                  ? 'UNAUTHORIZED'
                  : `DISCORD_ERROR_${response.status}`,
              message: parsedError.message || `Discord API error: ${response.status}`,
              retryable: isRateLimit || response.status >= 500,
              providerResponse: parsedError,
            },
          };
        }

        const data = await response.json();
        return {
          success: true,
          output: {
            id: data.id,
            channel_id: data.channel_id,
            content: data.content,
            timestamp: data.timestamp,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: `Failed to call Discord API: ${err.message}`,
            retryable: true,
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: `Operation '${operationKey}' is not supported by Discord adapter`,
        retryable: false,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GatewayProvider Implementation (Shared Gateway Connection)
  // ---------------------------------------------------------------------------

  async connect(credentials: ResolvedCredentials): Promise<void> {
    if (this.isConnected) {
      return;
    }
    this.logger.log('Initializing shared Discord Gateway connection');
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    this.logger.log('Disconnecting shared Discord Gateway connection');
    this.isConnected = false;
  }

  onEvent(callback: (event: ParsedWebhookEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Internal dispatcher for incoming gateway message events.
   */
  handleIncomingGatewayMessage(data: any): void {
    if (!this.eventCallback || data.author?.bot) {
      return; // Ignore bot messages to prevent feedback loops
    }

    const parsedEvent: ParsedWebhookEvent = {
      triggerKey: 'message.received',
      externalEventId: `discord-${data.id}`,
      externalAccountId: data.guild_id || data.channel_id,
      eventTimestamp: new Date(data.timestamp || Date.now()),
      payload: {
        id: data.id,
        content: data.content,
        author: data.author?.username || 'unknown',
        authorId: data.author?.id,
        channelId: data.channel_id,
        guildId: data.guild_id,
        timestamp: data.timestamp,
      },
      rawPayload: data,
    };

    this.eventCallback(parsedEvent);
  }
}


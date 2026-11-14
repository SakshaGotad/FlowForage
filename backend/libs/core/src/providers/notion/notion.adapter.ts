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
  ParsedWebhookEvent,
  ResolvedCredentials,
  ActionResult,
} from '../../common/interfaces';

@Injectable()
export class NotionAdapter extends BaseProviderAdapter implements WebhookProvider {
  readonly providerKey = 'notion';
  private readonly logger = new Logger(NotionAdapter.name);
  private readonly NOTION_API_VERSION = '2022-06-28';

  constructor(
    integrationRegistry: IntegrationRegistry,
    operationRegistry: OperationRegistry,
    adapterRegistry: AdapterRegistry,
  ) {
    super(integrationRegistry, operationRegistry, adapterRegistry);
  }

  getDefinition(): IntegrationDefinition {
    return {
      key: 'notion',
      displayName: 'Notion',
      description: 'Create pages, organize databases, and sync notes with Notion workspace.',
      authType: AuthType.OAUTH2,
      oauth: {
        authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        scopes: [],
        supportsRefresh: false,
      },
      iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png',
    };
  }

  getTriggers(): TriggerDefinition[] {
    return [
      {
        key: 'page.created',
        provider: 'notion',
        displayName: 'Page Created',
        description: 'Triggers when a new page is created in a Notion database or workspace.',
        eventDelivery: EventDeliveryType.WEBHOOK,
        configSchema: {
          type: 'object',
          properties: {
            databaseId: {
              type: 'string',
              description: 'Notion Database ID to monitor for new pages',
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Notion Page UUID' },
            url: { type: 'string', description: 'Notion web URL for the page' },
            title: { type: 'string', description: 'Page title' },
            created_time: { type: 'string', description: 'Creation timestamp' },
            parent_type: { type: 'string', description: 'Parent type (database_id or page_id)' },
            parent_id: { type: 'string', description: 'Parent UUID' },
          },
          required: ['id', 'url'],
        },
      },
    ];
  }

  getActions(): ActionDefinition[] {
    return [
      {
        key: 'page.create',
        provider: 'notion',
        displayName: 'Create Page',
        description: 'Creates a new page in a specified Notion database or under a parent page.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the new Notion page (required)',
            },
            parentDatabaseId: {
              type: 'string',
              description: 'Database ID to insert page into (e.g. 12345678-1234-1234-1234-123456789abc)',
            },
            parentPageId: {
              type: 'string',
              description: 'Parent page ID if not creating inside a database',
            },
            content: {
              type: 'string',
              description: 'Optional initial paragraph text inside the page',
            },
          },
          required: ['title'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Created Page UUID' },
            url: { type: 'string', description: 'Notion web URL' },
            title: { type: 'string', description: 'Page title' },
            created_time: { type: 'string', description: 'Creation timestamp' },
          },
          required: ['id', 'url'],
        },
      },
    ];
  }

  /**
   * Verifies Notion webhook signature:
   * Header: notion-signature (or x-notion-signature)
   */
  verifyWebhookSignature(
    headers: Record<string, string>,
    rawBody: Buffer,
    secret: string,
  ): boolean {
    const signature = headers['notion-signature'] || headers['x-notion-signature'];
    if (!signature) {
      return true; // Notion custom webhooks without signature configured
    }

    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const expectedSignature = hmac.digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (err) {
      this.logger.error(`Error verifying Notion webhook signature: ${err.message}`);
      return false;
    }
  }

  /**
   * Parses incoming Notion webhook event.
   */
  parseWebhookEvent(
    headers: Record<string, string>,
    body: any,
  ): ParsedWebhookEvent | null {
    if (body.type === 'page' || body.object === 'page') {
      const page = body.data || body;
      const titleProp =
        page.properties?.title || page.properties?.Name || page.properties?.name;

      let title = 'Untitled';
      if (titleProp?.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
        title = titleProp.title[0].plain_text || 'Untitled';
      }

      const parentType = page.parent?.type || 'workspace';
      const parentId =
        page.parent?.database_id || page.parent?.page_id || 'workspace';

      return {
        triggerKey: 'page.created',
        externalEventId: `notion-${page.id}-${body.timestamp || Date.now()}`,
        externalAccountId: parentId,
        eventTimestamp: new Date(page.created_time || Date.now()),
        payload: {
          id: page.id,
          url: page.url,
          title,
          created_time: page.created_time,
          parent_type: parentType,
          parent_id: parentId,
        },
        rawPayload: body,
      };
    }

    return null;
  }

  /**
   * Executes Notion REST API actions.
   */
  async executeAction(
    operationKey: string,
    credentials: ResolvedCredentials,
    input: Record<string, any>,
  ): Promise<ActionResult> {
    if (operationKey === 'page.create') {
      const { title, parentDatabaseId, parentPageId, content } = input;

      if (!title) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Missing required field 'title'",
            retryable: false,
          },
        };
      }

      if (!parentDatabaseId && !parentPageId) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Must specify either 'parentDatabaseId' or 'parentPageId'",
            retryable: false,
          },
        };
      }

      // Build Notion parent object
      const parent = parentDatabaseId
        ? { database_id: parentDatabaseId }
        : { page_id: parentPageId };

      // Build properties object
      const properties: Record<string, any> = {};
      if (parentDatabaseId) {
        properties['Name'] = {
          title: [{ text: { content: title } }],
        };
      } else {
        properties['title'] = {
          title: [{ text: { content: title } }],
        };
      }

      const requestBody: Record<string, any> = {
        parent,
        properties,
      };

      // Add paragraph content if provided
      if (content) {
        requestBody.children = [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content } }],
            },
          },
        ];
      }

      try {
        const response = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Notion-Version': this.NOTION_API_VERSION,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (!response.ok) {
          const isRateLimit = response.status === 429 || data.code === 'rate_limited';
          const isNotFound = response.status === 404 || data.code === 'object_not_found';

          return {
            success: false,
            error: {
              code: data.code?.toUpperCase() || `NOTION_HTTP_${response.status}`,
              message: data.message || `Notion API error: ${response.status}`,
              retryable: isRateLimit || response.status >= 500,
              providerResponse: data,
            },
          };
        }

        return {
          success: true,
          output: {
            id: data.id,
            url: data.url,
            title,
            created_time: data.created_time,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: `Failed to call Notion API: ${err.message}`,
            retryable: true,
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: `Operation '${operationKey}' is not supported by Notion adapter`,
        retryable: false,
      },
    };
  }
}


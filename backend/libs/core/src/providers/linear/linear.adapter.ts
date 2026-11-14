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
export class LinearAdapter
  extends BaseProviderAdapter
  implements WebhookProvider, RefreshableProvider
{
  readonly providerKey = 'linear';
  private readonly logger = new Logger(LinearAdapter.name);

  constructor(
    integrationRegistry: IntegrationRegistry,
    operationRegistry: OperationRegistry,
    adapterRegistry: AdapterRegistry,
  ) {
    super(integrationRegistry, operationRegistry, adapterRegistry);
  }

  getDefinition(): IntegrationDefinition {
    return {
      key: 'linear',
      displayName: 'Linear',
      description: 'Streamline software projects, track issues, and automate development workflows.',
      authType: AuthType.OAUTH2,
      oauth: {
        authorizationUrl: 'https://linear.app/oauth/authorize',
        tokenUrl: 'https://api.linear.app/oauth/token',
        scopes: ['read', 'write', 'issues:create'],
        supportsRefresh: true,
      },
      iconUrl: 'https://linear.app/static/favicon.ico',
    };
  }

  getTriggers(): TriggerDefinition[] {
    return [
      {
        key: 'issue.created',
        provider: 'linear',
        displayName: 'Issue Created',
        description: 'Triggers when a new issue is created in Linear.',
        eventDelivery: EventDeliveryType.WEBHOOK,
        configSchema: {
          type: 'object',
          properties: {
            teamId: {
              type: 'string',
              description: 'Optional team ID filter (e.g. ENG)',
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique Linear Issue ID' },
            identifier: { type: 'string', description: 'Issue key (e.g. ENG-123)' },
            title: { type: 'string', description: 'Issue title' },
            description: { type: 'string', description: 'Issue description markdown' },
            url: { type: 'string', description: 'Linear web URL' },
            state: { type: 'string', description: 'Current status name' },
            priority: { type: 'number', description: 'Priority level (0-4)' },
            teamId: { type: 'string', description: 'Team ID' },
            createdAt: { type: 'string', description: 'Creation timestamp' },
          },
          required: ['id', 'identifier', 'title'],
        },
        requiredScopes: ['read'],
      },
    ];
  }

  getActions(): ActionDefinition[] {
    return [
      {
        key: 'issue.create',
        provider: 'linear',
        displayName: 'Create Issue',
        description: 'Creates a new issue in Linear via the GraphQL API.',
        inputSchema: {
          type: 'object',
          properties: {
            teamId: {
              type: 'string',
              description: 'The ID of the team to create the issue in (required)',
            },
            title: {
              type: 'string',
              description: 'Issue title (required)',
            },
            description: {
              type: 'string',
              description: 'Issue description in Markdown format',
            },
            priority: {
              type: 'number',
              description: 'Priority: 0 (No priority), 1 (Urgent), 2 (High), 3 (Medium), 4 (Low)',
            },
          },
          required: ['teamId', 'title'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Created issue ID' },
            identifier: { type: 'string', description: 'Created issue identifier (e.g. ENG-456)' },
            title: { type: 'string', description: 'Created issue title' },
            url: { type: 'string', description: 'Web URL of the created issue' },
            success: { type: 'boolean', description: 'Whether the issue was created' },
          },
          required: ['id', 'identifier', 'success'],
        },
        requiredScopes: ['write', 'issues:create'],
      },
    ];
  }

  /**
   * Verifies Linear webhook signature:
   * Header: linear-signature
   * HMAC-SHA256 of raw body using webhook secret
   */
  verifyWebhookSignature(
    headers: Record<string, string>,
    rawBody: Buffer,
    secret: string,
  ): boolean {
    const signature = headers['linear-signature'] || headers['Linear-Signature'];
    if (!signature) {
      this.logger.warn('Missing Linear-Signature header in webhook request');
      return false;
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
      this.logger.error(`Error verifying Linear webhook signature: ${err.message}`);
      return false;
    }
  }

  /**
   * Parses incoming Linear webhook payload.
   */
  parseWebhookEvent(
    headers: Record<string, string>,
    body: any,
  ): ParsedWebhookEvent | null {
    if (body.type === 'Issue' && body.action === 'create' && body.data) {
      const issue = body.data;
      const deliveryId =
        headers['linear-delivery'] ||
        `linear-${issue.id}-${body.webhookTimestamp || Date.now()}`;

      return {
        triggerKey: 'issue.created',
        externalEventId: deliveryId,
        externalAccountId: body.organizationId || issue.teamId || 'unknown-org',
        eventTimestamp: new Date(body.createdAt || Date.now()),
        payload: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || '',
          url: body.url || `https://linear.app/issue/${issue.identifier}`,
          state: issue.state?.name || 'Todo',
          priority: issue.priority,
          teamId: issue.teamId,
          createdAt: issue.createdAt,
        },
        rawPayload: body,
      };
    }

    return null;
  }

  /**
   * Executes Linear actions via Linear GraphQL API.
   */
  async executeAction(
    operationKey: string,
    credentials: ResolvedCredentials,
    input: Record<string, any>,
  ): Promise<ActionResult> {
    if (operationKey === 'issue.create') {
      const { teamId, title, description, priority } = input;

      if (!teamId || !title) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Missing required fields 'teamId' and 'title'",
            retryable: false,
          },
        };
      }

      const query = `
        mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              url
            }
          }
        }
      `;

      const variables = {
        input: {
          teamId,
          title,
          description: description || undefined,
          priority: priority !== undefined ? Number(priority) : undefined,
        },
      };

      try {
        const response = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables }),
        });

        const result = await response.json();

        if (result.errors && result.errors.length > 0) {
          const firstError = result.errors[0];
          return {
            success: false,
            error: {
              code: 'GRAPHQL_ERROR',
              message: firstError.message || 'Linear GraphQL error',
              retryable: false,
              providerResponse: result.errors,
            },
          };
        }

        const data = result.data?.issueCreate;
        if (!data || !data.success) {
          return {
            success: false,
            error: {
              code: 'ISSUE_CREATE_FAILED',
              message: 'Failed to create Linear issue',
              retryable: false,
              providerResponse: result,
            },
          };
        }

        return {
          success: true,
          output: {
            id: data.issue.id,
            identifier: data.issue.identifier,
            title: data.issue.title,
            url: data.issue.url,
            success: data.success,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: `Failed to call Linear GraphQL API: ${err.message}`,
            retryable: true,
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: `Operation '${operationKey}' is not supported by Linear adapter`,
        retryable: false,
      },
    };
  }

  /**
   * Refreshes an expired Linear OAuth token.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const clientId = process.env.LINEAR_CLIENT_ID;
    const clientSecret = process.env.LINEAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET are required for token refresh');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`Linear token refresh failed: ${data.error_description || data.error}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }
}


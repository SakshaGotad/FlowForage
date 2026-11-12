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
export class GitHubAdapter extends BaseProviderAdapter implements WebhookProvider {
  readonly providerKey = 'github';
  private readonly logger = new Logger(GitHubAdapter.name);

  constructor(
    integrationRegistry: IntegrationRegistry,
    operationRegistry: OperationRegistry,
    adapterRegistry: AdapterRegistry,
  ) {
    super(integrationRegistry, operationRegistry, adapterRegistry);
  }

  getDefinition(): IntegrationDefinition {
    return {
      key: 'github',
      displayName: 'GitHub',
      description: 'Connect to GitHub repositories, track issue events, and automate code workflows.',
      authType: AuthType.OAUTH2,
      oauth: {
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: ['repo', 'read:user', 'user:email'],
        supportsRefresh: false,
      },
      iconUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    };
  }

  getTriggers(): TriggerDefinition[] {
    return [
      {
        key: 'issue.created',
        provider: 'github',
        displayName: 'Issue Created',
        description: 'Triggers when a new issue is opened in a repository.',
        eventDelivery: EventDeliveryType.WEBHOOK,
        configSchema: {
          type: 'object',
          properties: {
            repository: {
              type: 'string',
              description: 'Target repository in format owner/repo (e.g. facebook/react)',
            },
          },
          required: ['repository'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'GitHub Issue ID' },
            number: { type: 'number', description: 'Issue number' },
            title: { type: 'string', description: 'Issue title' },
            body: { type: 'string', description: 'Issue description body' },
            html_url: { type: 'string', description: 'Web URL to view the issue' },
            state: { type: 'string', description: 'Issue state (open, closed)' },
            repository: { type: 'string', description: 'Full repository name (owner/repo)' },
            author: { type: 'string', description: 'GitHub username of author' },
            created_at: { type: 'string', description: 'ISO 8601 creation timestamp' },
          },
          required: ['number', 'title', 'repository'],
        },
        requiredScopes: ['repo'],
      },
    ];
  }

  getActions(): ActionDefinition[] {
    return [
      {
        key: 'issue.create',
        provider: 'github',
        displayName: 'Create Issue',
        description: 'Creates a new issue in a GitHub repository.',
        inputSchema: {
          type: 'object',
          properties: {
            repository: {
              type: 'string',
              description: 'Target repository in format owner/repo',
            },
            title: {
              type: 'string',
              description: 'Title of the new issue',
            },
            body: {
              type: 'string',
              description: 'Description content of the issue',
            },
          },
          required: ['repository', 'title'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'New issue ID' },
            number: { type: 'number', description: 'Issue number' },
            html_url: { type: 'string', description: 'URL of created issue' },
          },
          required: ['number', 'html_url'],
        },
        requiredScopes: ['repo'],
      },
    ];
  }

  /**
   * Validates GitHub webhook signature (HMAC-SHA256).
   * GitHub sends header 'X-Hub-Signature-256' in format 'sha256=<hash>'.
   */
  verifyWebhookSignature(
    headers: Record<string, string>,
    rawBody: Buffer,
    secret: string,
  ): boolean {
    const signature = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];
    if (!signature) {
      this.logger.warn('Missing X-Hub-Signature-256 header in GitHub webhook');
      return false;
    }

    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const expectedSignature = `sha256=${hmac.digest('hex')}`;

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (err) {
      this.logger.error(`Error verifying GitHub webhook signature: ${err.message}`);
      return false;
    }
  }

  /**
   * Parses an incoming GitHub webhook payload into a normalized intermediate event.
   */
  parseWebhookEvent(
    headers: Record<string, string>,
    body: any,
  ): ParsedWebhookEvent | null {
    const githubEvent = headers['x-github-event'] || headers['X-GitHub-Event'];
    const deliveryId =
      headers['x-github-delivery'] ||
      headers['X-GitHub-Delivery'] ||
      `gh-${Date.now()}`;

    // We are interested in 'issues' event with action 'opened'
    if (githubEvent === 'issues' && body.action === 'opened') {
      const issue = body.issue;
      const repo = body.repository;

      return {
        triggerKey: 'issue.created',
        externalEventId: deliveryId,
        externalAccountId: repo?.full_name || repo?.owner?.login || 'unknown',
        eventTimestamp: new Date(issue.created_at || Date.now()),
        payload: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body || '',
          html_url: issue.html_url,
          state: issue.state,
          repository: repo?.full_name || '',
          author: issue.user?.login || 'anonymous',
          created_at: issue.created_at,
        },
        rawPayload: body,
      };
    }

    // Ignore other unhandled GitHub events
    return null;
  }

  /**
   * Executes GitHub actions (e.g. creating an issue).
   */
  async executeAction(
    operationKey: string,
    credentials: ResolvedCredentials,
    input: Record<string, any>,
  ): Promise<ActionResult> {
    if (operationKey === 'issue.create') {
      const { repository, title, body } = input;
      if (!repository || !title) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Missing required fields 'repository' and 'title'",
            retryable: false,
          },
        };
      }

      try {
        const response = await fetch(
          `https://api.github.com/repos/${repository}/issues`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${credentials.accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'FlowForage-Automation-Engine',
            },
            body: JSON.stringify({ title, body }),
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          const isRateLimit = response.status === 403 || response.status === 429;
          return {
            success: false,
            error: {
              code: isRateLimit ? 'RATE_LIMITED' : `HTTP_${response.status}`,
              message: `GitHub API error (${response.status}): ${errText}`,
              retryable: isRateLimit || response.status >= 500,
            },
          };
        }

        const data = await response.json();
        return {
          success: true,
          output: {
            id: data.id,
            number: data.number,
            html_url: data.html_url,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: `Failed to call GitHub API: ${err.message}`,
            retryable: true,
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: `Operation ${operationKey} is not supported by GitHub adapter`,
        retryable: false,
      },
    };
  }
}


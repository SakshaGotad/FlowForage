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
  ResolvedCredentials,
  ActionResult,
} from '../../common/interfaces';

@Injectable()
export class TodoistAdapter extends BaseProviderAdapter {
  readonly providerKey = 'todoist';
  private readonly logger = new Logger(TodoistAdapter.name);

  constructor(
    integrationRegistry: IntegrationRegistry,
    operationRegistry: OperationRegistry,
    adapterRegistry: AdapterRegistry,
  ) {
    super(integrationRegistry, operationRegistry, adapterRegistry);
  }

  getDefinition(): IntegrationDefinition {
    return {
      key: 'todoist',
      displayName: 'Todoist',
      description: 'Manage tasks, organize projects, and streamline your personal workflow.',
      authType: AuthType.OAUTH2,
      oauth: {
        authorizationUrl: 'https://todoist.com/oauth/authorize',
        tokenUrl: 'https://todoist.com/oauth/access_token',
        scopes: ['data:read_write', 'task:add'],
        supportsRefresh: false,
      },
      iconUrl: 'https://todoist.com/static/favicon.ico',
    };
  }

  getTriggers(): TriggerDefinition[] {
    return []; // We will add Todoist webhook triggers in Phase 6
  }

  getActions(): ActionDefinition[] {
    return [
      {
        key: 'task.create',
        provider: 'todoist',
        displayName: 'Create Task',
        description: 'Creates a new task in Todoist with title, description, and due date.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The task title or text content (required)',
            },
            description: {
              type: 'string',
              description: 'Detailed description or notes for the task',
            },
            due_string: {
              type: 'string',
              description: "Human-readable due date (e.g. 'tomorrow', 'every Monday')",
            },
            priority: {
              type: 'number',
              description: 'Task priority from 1 (normal) to 4 (urgent)',
            },
            project_id: {
              type: 'string',
              description: 'The ID of the project to add the task to',
            },
          },
          required: ['content'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique task ID' },
            content: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            url: { type: 'string', description: 'Todoist web URL for this task' },
            is_completed: { type: 'boolean', description: 'Completion status' },
            created_at: { type: 'string', description: 'Creation timestamp' },
          },
          required: ['id', 'content'],
        },
        requiredScopes: ['task:add'],
      },
    ];
  }

  /**
   * Executes Todoist API actions.
   */
  async executeAction(
    operationKey: string,
    credentials: ResolvedCredentials,
    input: Record<string, any>,
  ): Promise<ActionResult> {
    if (operationKey === 'task.create') {
      const { content, description, due_string, priority, project_id } = input;

      if (!content || typeof content !== 'string') {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: "Missing required string field 'content'",
            retryable: false,
          },
        };
      }

      const bodyPayload: Record<string, any> = { content };
      if (description) bodyPayload.description = description;
      if (due_string) bodyPayload.due_string = due_string;
      if (priority) bodyPayload.priority = priority;
      if (project_id) bodyPayload.project_id = project_id;

      try {
        const response = await fetch('https://api.todoist.com/rest/v2/tasks', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });

        if (!response.ok) {
          const errText = await response.text();
          const isRateLimit = response.status === 429;
          const isAuthError = response.status === 401 || response.status === 403;

          return {
            success: false,
            error: {
              code: isRateLimit
                ? 'RATE_LIMITED'
                : isAuthError
                  ? 'UNAUTHORIZED'
                  : `HTTP_${response.status}`,
              message: `Todoist API error (${response.status}): ${errText}`,
              retryable: isRateLimit || response.status >= 500,
            },
          };
        }

        const data = await response.json();
        return {
          success: true,
          output: {
            id: data.id,
            content: data.content,
            description: data.description,
            url: data.url,
            is_completed: data.is_completed,
            created_at: data.created_at,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: `Failed to call Todoist API: ${err.message}`,
            retryable: true,
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: `Operation ${operationKey} is not supported by Todoist adapter`,
        retryable: false,
      },
    };
  }
}


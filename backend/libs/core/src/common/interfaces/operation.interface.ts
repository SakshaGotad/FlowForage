/**
 * Trigger and action definitions for the operation registry.
 *
 * A trigger is something that STARTS a workflow (e.g., "GitHub Issue Created").
 * An action is something a workflow DOES in response (e.g., "Todoist Create Task").
 */

// ---------------------------------------------------------------------------
// Trigger Definition
// ---------------------------------------------------------------------------

/**
 * Describes a trigger event that a provider can produce.
 * Registered in the OperationRegistry and discovered by the workflow builder UI.
 */
export interface TriggerDefinition {
  /** Unique identifier within the provider. Format: <resource>.<event>
   *  Example: 'issue.created', 'message.received' */
  key: string;

  /** The provider this trigger belongs to. Must match IntegrationDefinition.key.
   *  Example: 'github', 'slack' */
  provider: string;

  /** Human-readable name.
   *  Example: 'Issue Created' */
  displayName: string;

  /** What this trigger does.
   *  Example: 'Triggers when a new issue is created in a GitHub repository.' */
  description: string;

  /** How this trigger receives events from the provider. */
  eventDelivery: EventDeliveryType;

  /** JSON Schema describing user-configurable options for this trigger.
   *  Example: a "repository" selector for GitHub Issue Created.
   *  null means no configuration is required. */
  configSchema: JsonSchemaDefinition | null;

  /** JSON Schema describing the output fields this trigger produces.
   *  These fields become available for mapping into action inputs.
   *  Example: { title: string, body: string, number: number } */
  outputSchema: JsonSchemaDefinition;

  /** Permissions/scopes this trigger requires on the connection.
   *  Validated during workflow activation.
   *  Example: ['repo'] for GitHub, ['channels:history'] for Slack. */
  requiredScopes?: string[];
}

/** How a trigger receives events from the external provider. */
export enum EventDeliveryType {
  /** Provider sends HTTP POST to our webhook endpoint.
   *  Used by: GitHub, Linear, Todoist, Notion. */
  WEBHOOK = 'webhook',

  /** Provider sends events via HTTP with a special protocol (Slack Events API). */
  EVENTS_API = 'events_api',

  /** Provider sends events over a persistent WebSocket connection.
   *  Used by: Discord Gateway. */
  GATEWAY = 'gateway',

  /** We periodically poll the provider's API for changes.
   *  Fallback when webhooks are unavailable for a specific operation. */
  POLLING = 'polling',
}

// ---------------------------------------------------------------------------
// Action Definition
// ---------------------------------------------------------------------------

/**
 * Describes an action that a provider can perform.
 * Registered in the OperationRegistry and discovered by the workflow builder UI.
 */
export interface ActionDefinition {
  /** Unique identifier within the provider. Format: <resource>.<verb>
   *  Example: 'task.create', 'message.send' */
  key: string;

  /** The provider this action belongs to. Must match IntegrationDefinition.key.
   *  Example: 'todoist', 'slack' */
  provider: string;

  /** Human-readable name.
   *  Example: 'Create Task' */
  displayName: string;

  /** What this action does.
   *  Example: 'Creates a new task in the specified Todoist project.' */
  description: string;

  /** JSON Schema describing the input fields this action requires.
   *  The user maps trigger output fields (or static values) into these fields.
   *  Example: { content: string, description?: string, projectId?: string } */
  inputSchema: JsonSchemaDefinition;

  /** JSON Schema describing what this action returns after execution.
   *  Useful for multi-step workflows where step 2 needs step 1's output.
   *  Example: { taskId: string, taskUrl: string } */
  outputSchema: JsonSchemaDefinition;

  /** Permissions/scopes this action requires on the connection.
   *  Example: ['task:add'] for Todoist. */
  requiredScopes?: string[];
}

// ---------------------------------------------------------------------------
// JSON Schema Types (subset of JSON Schema draft-07)
// ---------------------------------------------------------------------------

/**
 * A JSON Schema definition for describing input/output shapes.
 * Used by trigger outputSchemas and action inputSchemas to enable
 * dynamic form rendering and field mapping in the workflow builder.
 */
export interface JsonSchemaDefinition {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  format?: string; // 'date-time', 'uri', 'email', etc.
}


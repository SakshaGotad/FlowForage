import {
  IntegrationDefinition,
} from './integration.interface';
import {
  TriggerDefinition,
  ActionDefinition,
} from './operation.interface';
import { ResolvedCredentials } from './credential-resolver.interface';

/**
 * Base contract that every provider adapter MUST implement.
 *
 * Each supported application (GitHub, Slack, Discord, Linear, Todoist, Notion)
 * has an adapter implementing this interface. The executor interacts with
 * external APIs exclusively through this contract.
 */
export interface ProviderAdapter {
  /** The integration key this adapter handles. Must match IntegrationDefinition.key.
   *  Example: 'github', 'slack', 'discord' */
  readonly providerKey: string;

  /** Return the integration metadata for this provider. */
  getDefinition(): IntegrationDefinition;

  /** Return all trigger definitions this provider supports. */
  getTriggers(): TriggerDefinition[];

  /** Return all action definitions this provider supports. */
  getActions(): ActionDefinition[];

  /**
   * Execute a specific action.
   *
   * @param operationKey - e.g. 'task.create', 'issue.create'
   * @param credentials  - decrypted credentials from CredentialResolver
   * @param input        - resolved input (field mapping already applied)
   * @returns            - the action result, matching its outputSchema
   */
  executeAction(
    operationKey: string,
    credentials: ResolvedCredentials,
    input: Record<string, any>,
  ): Promise<ActionResult>;
}

/**
 * Optional capability: HTTP webhook event ingestion.
 * Implemented by providers that receive events via webhooks:
 * GitHub, Linear, Todoist, Notion, Slack.
 */
export interface WebhookProvider {
  /**
   * Verify that an incoming webhook request genuinely came from this provider.
   *
   * @param headers - HTTP request headers
   * @param rawBody - raw request body as Buffer (before JSON parsing)
   * @param secret  - the webhook secret configured for this subscription
   * @returns true if the signature is valid, false otherwise
   */
  verifyWebhookSignature(
    headers: Record<string, string>,
    rawBody: Buffer,
    secret: string,
  ): boolean;

  /**
   * Parse an incoming webhook request into a structured event.
   *
   * @param headers - HTTP request headers
   * @param body    - parsed JSON body
   * @returns structured event, or null if the event should be ignored
   */
  parseWebhookEvent(
    headers: Record<string, string>,
    body: any,
  ): ParsedWebhookEvent | null;
}

/**
 * Optional capability: OAuth token refresh.
 * Implemented by providers whose tokens expire:
 * GitHub (optional), Slack, Linear, Notion, Todoist.
 */
export interface RefreshableProvider {
  /**
   * Exchange an expired/expiring refresh token for a new access token.
   *
   * @param refreshToken - the stored refresh token
   * @returns new token set to be encrypted and stored
   */
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;
}

/**
 * Optional capability: Persistent connection.
 * Implemented ONLY by Discord (Gateway WebSocket).
 *
 * NOTE: Gateway connections must be shared across workflows,
 * never created per-workflow.
 */
export interface GatewayProvider {
  /** Establish the persistent connection using bot credentials. */
  connect(credentials: ResolvedCredentials): Promise<void>;

  /** Cleanly disconnect. */
  disconnect(): Promise<void>;

  /** Register a callback for incoming gateway events. */
  onEvent(callback: (event: ParsedWebhookEvent) => void): void;
}

// ---------------------------------------------------------------------------
// Supporting Types
// ---------------------------------------------------------------------------

/** Result of executing an action. */
export interface ActionResult {
  /** Whether the action succeeded. */
  success: boolean;

  /** The action's output data. Matches the action's outputSchema.
   *  Example for todoist/task.create: { taskId: '123', taskUrl: 'https://...' } */
  output?: Record<string, any>;

  /** Error details if the action failed. */
  error?: ActionError;
}

/** Structured error from an action execution. */
export interface ActionError {
  /** Machine-readable error code.
   *  Example: 'RATE_LIMITED', 'UNAUTHORIZED', 'NOT_FOUND', 'VALIDATION_ERROR' */
  code: string;

  /** Human-readable error message. */
  message: string;

  /**
   * Whether this error is safe to retry with backoff.
   * Rate limits and transient 5xx errors are retryable.
   * Auth failures (401/403) and validation errors (400) are NOT retryable.
   */
  retryable: boolean;

  /** Provider's raw error response, preserved for debugging. */
  providerResponse?: any;
}

/**
 * An event parsed from a provider's webhook/gateway payload.
 * Intermediate representation before full normalization into NormalizedEvent.
 */
export interface ParsedWebhookEvent {
  /** The trigger key this event corresponds to.
   *  Example: 'issue.created' */
  triggerKey: string;

  /** Provider-assigned unique ID for this event delivery (for deduplication).
   *  Example: GitHub delivery ID, Linear webhook ID. */
  externalEventId: string;

  /** The external account or workspace identifier.
   *  Example: GitHub org/repo, Slack workspace ID. */
  externalAccountId: string;

  /** When the event occurred at the provider. */
  eventTimestamp: Date;

  /** The event payload, normalized to match the trigger's outputSchema. */
  payload: Record<string, any>;

  /** Raw provider payload, preserved for debugging. */
  rawPayload?: any;
}

/**
 * Tokens returned from an OAuth authorization flow or token refresh.
 */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  tokenType?: string;
  /** Provider-specific metadata (e.g. Slack team ID, Notion workspace ID). */
  metadata?: Record<string, any>;
}

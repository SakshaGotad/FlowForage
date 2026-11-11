/**
 * Describes an external application that FlowForage can integrate with.
 * This is metadata only — it does not contain implementation logic.
 *
 * Examples: GitHub, Slack, Discord, Linear, Todoist, Notion.
 */
export interface IntegrationDefinition {
  /** Unique machine identifier. Used in workflow definitions and URL paths.
   *  Example: 'github', 'slack', 'discord' */
  key: string;

  /** Human-readable name shown in the UI.
   *  Example: 'GitHub', 'Slack', 'Discord' */
  displayName: string;

  /** Brief description of what this integration does.
   *  Example: 'Connect to GitHub repositories, issues, and pull requests.' */
  description: string;

  /** How users authenticate with this provider. */
  authType: AuthType;

  /** OAuth configuration. Required when authType is 'oauth2'. */
  oauth?: OAuthConfig;

  /** URL or path to the provider's icon/logo for the UI. */
  iconUrl?: string;
}

export enum AuthType {
  /** Standard OAuth 2.0 authorization code flow.
   *  Used by: GitHub, Slack, Linear, Todoist, Notion. */
  OAUTH2 = 'oauth2',

  /** Static API key provided by the user.
   *  Fallback for providers without OAuth support. */
  API_KEY = 'api_key',

  /** Bot token (e.g., Discord bot token).
   *  Used by: Discord. */
  BOT_TOKEN = 'bot_token',
}

/**
 * OAuth 2.0 configuration for a provider.
 *
 * clientId and clientSecret are loaded from environment variables at runtime,
 * NOT stored in this definition or in the database.
 */
export interface OAuthConfig {
  /** The OAuth authorization endpoint.
   *  Example: 'https://github.com/login/oauth/authorize' */
  authorizationUrl: string;

  /** The OAuth token exchange endpoint.
   *  Example: 'https://github.com/login/oauth/access_token' */
  tokenUrl: string;

  /** The scopes required for this integration's triggers and actions.
   *  Example: ['repo', 'read:user'] */
  scopes: string[];

  /** Whether this provider supports token refresh via refresh_token grant.
   *  If false, the user must re-authorize when the token expires. */
  supportsRefresh: boolean;
}


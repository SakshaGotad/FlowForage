/**
 * Types related to user connections to external applications.
 *
 * A connection represents an authenticated link between a FlowForage user
 * and an external application account or workspace.
 */

/**
 * A stored connection record (maps to the Prisma Connection model).
 * The encryptedCredentials field is NEVER returned to the frontend.
 */
export interface ConnectionRecord {
  id: string;
  userId: string;
  provider: string;
  displayName: string;
  status: ConnectionStatus;
  grantedScopes: string[];
  externalAccountId: string;
  externalDisplayName?: string;
  isWorkspaceConnection: boolean;
  encryptedCredentials: string;
  tokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A safe subset of ConnectionRecord that can be returned to the frontend.
 * Excludes encryptedCredentials.
 */
export interface ConnectionSummary {
  id: string;
  provider: string;
  displayName: string;
  status: ConnectionStatus;
  grantedScopes: string[];
  externalAccountId: string;
  externalDisplayName?: string;
  isWorkspaceConnection: boolean;
  tokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Lifecycle status of a connection. */
export enum ConnectionStatus {
  /** Connection is active and usable. */
  ACTIVE = 'active',

  /** Access token has expired and needs refresh. */
  EXPIRED = 'expired',

  /** Token refresh failed. User must re-authorize. */
  REFRESH_FAILED = 'refresh_failed',

  /** User has revoked this connection. */
  REVOKED = 'revoked',

  /** Connection encountered an unrecoverable error. */
  ERROR = 'error',
}


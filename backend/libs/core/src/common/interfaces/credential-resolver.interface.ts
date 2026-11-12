/**
 * Contract for securely resolving credentials at action execution time.
 *
 * The CredentialResolver is the ONLY path through which decrypted credentials
 * are accessed. It enforces ownership verification and handles token refresh.
 */

/**
 * Resolves credentials for a given connection.
 */
export interface ICredentialResolver {
  /**
   * Resolve credentials for the given connection.
   *
   * Steps performed:
   * 1. Load the connection record by connectionId.
   * 2. Verify that userId has permission to use this connection.
   * 3. Decrypt the stored credentials.
   * 4. If the token is expired and the provider supports refresh, refresh it.
   * 5. If refresh succeeds, re-encrypt and store the new token.
   * 6. Return the decrypted, ready-to-use credentials.
   *
   * @param connectionId - the connection to resolve
   * @param userId       - the user requesting access (for ownership check)
   *
   * @throws ConnectionNotFoundError  if the connection does not exist
   * @throws PermissionDeniedError    if the user does not own the connection
   * @throws CredentialExpiredError   if the token is expired and refresh fails
   */
  resolve(connectionId: string, userId: string): Promise<ResolvedCredentials>;
}

/**
 * Decrypted, ready-to-use credentials.
 *
 * This object exists only in memory during action execution.
 * It is NEVER persisted, logged, serialized to JSON, or transmitted via BullMQ.
 */
export interface ResolvedCredentials {
  /** The access token (or API key, or bot token). */
  accessToken: string;

  /** Provider-specific metadata needed for API calls.
   *  Example: { workspaceId: '...', teamId: '...' }
   *  Some providers require context alongside the token. */
  metadata: Record<string, any>;
}


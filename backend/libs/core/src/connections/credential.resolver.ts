import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConnectionService } from './connection.service';
import { EncryptionService } from './encryption.service';
import { AdapterRegistry } from '../providers/adapter.registry';
import {
  ICredentialResolver,
  ResolvedCredentials,
  ConnectionStatus,
  RefreshableProvider,
} from '../common/interfaces';

@Injectable()
export class CredentialResolver implements ICredentialResolver {
  private readonly logger = new Logger(CredentialResolver.name);

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly encryptionService: EncryptionService,
    @Optional() private readonly adapterRegistry?: AdapterRegistry,
  ) {}

  /**
   * Securely resolves decrypted credentials for an action execution.
   *
   * 1. Fetches connection by ID.
   * 2. Enforces user ownership check.
   * 3. Checks status (rejects revoked or disabled connections).
   * 4. Decrypts credentials.
   * 5. Checks expiration (proactively refreshes if adapter supports it and refresh token exists).
   */
  async resolve(
    connectionId: string,
    userId: string,
  ): Promise<ResolvedCredentials> {
    const connection = await this.connectionService.getRawConnection(connectionId);

    if (!connection) {
      throw new NotFoundException(`Connection ${connectionId} not found`);
    }

    // Tenant / User ownership enforcement
    if (connection.userId !== userId) {
      throw new ForbiddenException(
        `User ${userId} is not authorized to use connection ${connectionId}`,
      );
    }

    if (connection.status === ConnectionStatus.REVOKED) {
      throw new UnauthorizedException(
        `Connection ${connectionId} has been revoked by the user`,
      );
    }

    const tokenSet = this.encryptionService.decrypt(
      connection.encryptedCredentials,
    );

    // Check expiration and proactively refresh if needed
    if (tokenSet.expiresAt) {
      const expiresAt = new Date(tokenSet.expiresAt).getTime();
      const now = Date.now();
      const isExpired = expiresAt <= now;

      if (isExpired) {
        if (!tokenSet.refreshToken) {
          throw new UnauthorizedException(
            `Credentials for connection ${connectionId} have expired and no refresh token is available`,
          );
        }

        // Attempt proactive OAuth token refresh
        if (this.adapterRegistry) {
          const adapter = this.adapterRegistry.get(connection.provider);
          const refreshable = adapter as unknown as Partial<RefreshableProvider>;

          if (typeof refreshable.refreshAccessToken === 'function') {
            try {
              this.logger.log(`Refreshing expired OAuth token for connection: ${connectionId}`);
              const newTokens = await refreshable.refreshAccessToken(tokenSet.refreshToken);

              await this.connectionService.updateTokens({
                connectionId,
                userId,
                tokens: newTokens,
              });

              return {
                accessToken: newTokens.accessToken,
                metadata: newTokens.metadata || tokenSet.metadata || {},
              };
            } catch (refreshErr) {
              this.logger.error(`Failed to refresh token: ${refreshErr.message}`);
              throw new UnauthorizedException(
                `Failed to refresh expired credentials for connection ${connectionId}: ${refreshErr.message}`,
              );
            }
          }
        }
      }
    }

    return {
      accessToken: tokenSet.accessToken,
      metadata: tokenSet.metadata || {},
    };
  }
}

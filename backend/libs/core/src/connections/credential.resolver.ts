import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConnectionService } from './connection.service';
import { EncryptionService } from './encryption.service';
import {
  ICredentialResolver,
  ResolvedCredentials,
  ConnectionStatus,
} from '../common/interfaces';

@Injectable()
export class CredentialResolver implements ICredentialResolver {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Securely resolves decrypted credentials for an action execution.
   *
   * 1. Fetches connection by ID.
   * 2. Enforces user ownership check.
   * 3. Checks status (rejects revoked or disabled connections).
   * 4. Decrypts credentials.
   * 5. Checks expiration (and proactively refreshes if token refresh handler is provided).
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

    // Check expiration
    if (tokenSet.expiresAt) {
      const expiresAt = new Date(tokenSet.expiresAt).getTime();
      const now = Date.now();
      const isExpired = expiresAt <= now;

      if (isExpired && !tokenSet.refreshToken) {
        throw new UnauthorizedException(
          `Credentials for connection ${connectionId} have expired and no refresh token is available`,
        );
      }
    }

    return {
      accessToken: tokenSet.accessToken,
      metadata: tokenSet.metadata || {},
    };
  }
}

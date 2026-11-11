import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../storage/prisma.service';
import { EncryptionService } from './encryption.service';
import {
  ConnectionRecord,
  ConnectionSummary,
  ConnectionStatus,
  TokenSet,
} from '../common/interfaces';

export interface CreateConnectionDto {
  userId: string;
  provider: string;
  displayName: string;
  externalAccountId: string;
  externalDisplayName?: string;
  isWorkspaceConnection?: boolean;
  grantedScopes?: string[];
  tokens: TokenSet;
}

export interface UpdateConnectionTokensDto {
  connectionId: string;
  userId: string;
  tokens: TokenSet;
}

@Injectable()
export class ConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Create a new connection for a user.
   * Credentials are encrypted with AES-256-GCM before saving.
   */
  async createConnection(dto: CreateConnectionDto): Promise<ConnectionSummary> {
    if (!dto.userId || !dto.provider || !dto.externalAccountId) {
      throw new BadRequestException('userId, provider, and externalAccountId are required');
    }

    const encryptedCredentials = this.encryptionService.encrypt(dto.tokens);

    const record = await this.prisma.connection.create({
      data: {
        userId: dto.userId,
        provider: dto.provider.toLowerCase(),
        displayName: dto.displayName || `${dto.provider} connection`,
        externalAccountId: dto.externalAccountId,
        externalDisplayName: dto.externalDisplayName,
        isWorkspaceConnection: dto.isWorkspaceConnection ?? false,
        grantedScopes: dto.grantedScopes ?? [],
        encryptedCredentials,
        tokenExpiresAt: dto.tokens.expiresAt ?? null,
        status: ConnectionStatus.ACTIVE,
      },
    });

    return this.toSummary(record);
  }

  /**
   * List all connections for a specific user (safe summaries only, no credentials).
   */
  async listUserConnections(userId: string): Promise<ConnectionSummary[]> {
    const connections = await this.prisma.connection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return connections.map((conn) => this.toSummary(conn));
  }

  /**
   * Get a single connection summary by ID with ownership verification.
   */
  async getConnection(
    connectionId: string,
    userId: string,
  ): Promise<ConnectionSummary> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException(`Connection ${connectionId} not found`);
    }

    if (connection.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this connection',
      );
    }

    return this.toSummary(connection);
  }

  /**
   * Internal method: Get the raw connection record (including encrypted credentials)
   * strictly for internal engine use (CredentialResolver).
   */
  async getRawConnection(connectionId: string): Promise<ConnectionRecord | null> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return null;
    }

    return {
      ...connection,
      status: connection.status as ConnectionStatus,
      tokenExpiresAt: connection.tokenExpiresAt,
      externalDisplayName: connection.externalDisplayName ?? undefined,
    };
  }

  /**
   * Find an active connection by provider and external account ID.
   * Crucial for incoming webhook routing (e.g. GitHub installation or Slack team).
   */
  async findByExternalAccount(
    provider: string,
    externalAccountId: string,
  ): Promise<ConnectionRecord | null> {
    const connection = await this.prisma.connection.findFirst({
      where: {
        provider: provider.toLowerCase(),
        externalAccountId,
        status: ConnectionStatus.ACTIVE,
      },
    });

    if (!connection) {
      return null;
    }

    return {
      ...connection,
      status: connection.status as ConnectionStatus,
      tokenExpiresAt: connection.tokenExpiresAt,
      externalDisplayName: connection.externalDisplayName ?? undefined,
    };
  }

  /**
   * Update credentials for a connection (e.g. after OAuth token refresh).
   */
  async updateTokens(dto: UpdateConnectionTokensDto): Promise<void> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: dto.connectionId },
    });

    if (!connection) {
      throw new NotFoundException(`Connection ${dto.connectionId} not found`);
    }

    if (connection.userId !== dto.userId) {
      throw new ForbiddenException('Unauthorized to update this connection');
    }

    const encryptedCredentials = this.encryptionService.encrypt(dto.tokens);

    await this.prisma.connection.update({
      where: { id: dto.connectionId },
      data: {
        encryptedCredentials,
        tokenExpiresAt: dto.tokens.expiresAt ?? null,
        status: ConnectionStatus.ACTIVE,
      },
    });
  }

  /**
   * Revoke or delete a connection.
   */
  async deleteConnection(connectionId: string, userId: string): Promise<void> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException(`Connection ${connectionId} not found`);
    }

    if (connection.userId !== userId) {
      throw new ForbiddenException('Unauthorized to delete this connection');
    }

    await this.prisma.connection.delete({
      where: { id: connectionId },
    });
  }

  /**
   * Convert database record to frontend-safe summary.
   */
  private toSummary(record: any): ConnectionSummary {
    return {
      id: record.id,
      provider: record.provider,
      displayName: record.displayName,
      status: record.status as ConnectionStatus,
      grantedScopes: record.grantedScopes,
      externalAccountId: record.externalAccountId,
      externalDisplayName: record.externalDisplayName ?? undefined,
      isWorkspaceConnection: record.isWorkspaceConnection,
      tokenExpiresAt: record.tokenExpiresAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

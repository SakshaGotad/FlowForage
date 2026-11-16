import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  Res,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ConnectionService } from './connection.service';
import { OAuthService } from './oauth.service';
import { IntegrationRegistry } from '../registry/integration.registry';
import { AuthType } from '../common/interfaces';

export interface ManualConnectionDto {
  provider: string;
  displayName?: string;
  token: string;
  externalAccountId: string;
  externalDisplayName?: string;
  metadata?: Record<string, any>;
}

@Controller('connections')
export class ConnectionController {
  private readonly logger = new Logger(ConnectionController.name);

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly oauthService: OAuthService,
    private readonly integrationRegistry: IntegrationRegistry,
  ) {}

  private getUserId(headers: Record<string, any>, body?: any): string {
    const userId = headers['x-user-id'] || body?.userId;
    if (!userId) {
      throw new BadRequestException("User context required: Provide 'x-user-id' header or 'userId' in body");
    }
    return userId;
  }

  /**
   * List all connections owned by the user (safe summaries, secrets stripped).
   */
  @Get()
  async listConnections(@Headers() headers: Record<string, any>) {
    const userId = this.getUserId(headers);
    return this.connectionService.listUserConnections(userId);
  }

  /**
   * Get single connection summary by ID.
   */
  @Get(':id')
  async getConnection(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
  ) {
    const userId = this.getUserId(headers);
    return this.connectionService.getConnection(id, userId);
  }

  /**
   * Connect an app manually using a Token or API Key (e.g. Discord Bot Token).
   */
  @Post('manual')
  async createManualConnection(
    @Headers() headers: Record<string, any>,
    @Body() body: ManualConnectionDto & { userId?: string },
  ) {
    const userId = this.getUserId(headers, body);

    if (!body.provider || !body.token || !body.externalAccountId) {
      throw new BadRequestException("Fields 'provider', 'token', and 'externalAccountId' are required");
    }

    const connection = await this.connectionService.createConnection({
      userId,
      provider: body.provider.toLowerCase(),
      displayName: body.displayName || `${body.provider} connection`,
      externalAccountId: body.externalAccountId,
      externalDisplayName: body.externalDisplayName,
      tokens: {
        accessToken: body.token,
        metadata: body.metadata || {},
      },
    });

    return {
      success: true,
      connection,
      message: `Successfully connected ${body.provider}`,
    };
  }

  /**
   * Initiate OAuth flow for a provider (GitHub, Slack, Linear, Todoist, Notion).
   */
  @Get(':provider/connect')
  async connectOAuth(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, any>,
    @Query('userId') queryUserId: string,
    @Query('redirect') redirectMode: string,
    @Res() res: any,
  ) {
    const userId = headers['x-user-id'] || queryUserId;
    if (!userId) {
      throw new BadRequestException("User ID is required: Provide 'x-user-id' header or ?userId= query parameter");
    }

    const providerKey = provider.toLowerCase();
    const integration = this.integrationRegistry.get(providerKey);

    if (!integration) {
      throw new NotFoundException(`Integration '${providerKey}' not found in catalog`);
    }

    if (integration.authType !== AuthType.OAUTH2 || !integration.oauth) {
      throw new BadRequestException(`Provider '${providerKey}' does not use OAuth 2.0 authentication`);
    }

    const clientIdEnvKey = `${providerKey.toUpperCase()}_CLIENT_ID`;
    const clientId = process.env[clientIdEnvKey];

    if (!clientId) {
      throw new BadRequestException(`Environment variable ${clientIdEnvKey} is not configured`);
    }

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${appBaseUrl}/connections/${providerKey}/callback`;

    // Secure state combining userId and random nonce
    const state = Buffer.from(JSON.stringify({ userId, nonce: Date.now() })).toString('base64');

    const authorizationUrl = this.oauthService.buildAuthorizationUrl(
      integration.oauth,
      {
        clientId,
        redirectUri,
        state,
      },
    );

    if (redirectMode === 'true') {
      return res.redirect(authorizationUrl);
    }

    return res.json({
      success: true,
      provider: providerKey,
      authorizationUrl,
    });
  }

  /**
   * OAuth Callback handler for third-party providers.
   */
  @Get(':provider/callback')
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: any,
  ) {
    if (!code) {
      throw new BadRequestException('Authorization code is missing from callback');
    }

    const providerKey = provider.toLowerCase();
    const integration = this.integrationRegistry.get(providerKey);

    if (!integration || !integration.oauth) {
      throw new NotFoundException(`OAuth configuration not found for '${providerKey}'`);
    }

    // Decode state
    let userId = 'default-user';
    try {
      if (state) {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        userId = decoded.userId || userId;
      }
    } catch (e) {
      this.logger.warn(`Could not parse state parameter: ${e.message}`);
    }

    const clientIdEnvKey = `${providerKey.toUpperCase()}_CLIENT_ID`;
    const clientSecretEnvKey = `${providerKey.toUpperCase()}_CLIENT_SECRET`;
    const clientId = process.env[clientIdEnvKey];
    const clientSecret = process.env[clientSecretEnvKey];

    if (!clientId || !clientSecret) {
      throw new BadRequestException(`OAuth credentials for ${providerKey} are not configured in .env`);
    }

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${appBaseUrl}/connections/${providerKey}/callback`;

    // Exchange code for tokens
    const tokenData = await this.oauthService.exchangeCodeForToken({
      tokenUrl: integration.oauth.tokenUrl,
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    const accessToken = tokenData.access_token || tokenData.accessToken;
    const refreshToken = tokenData.refresh_token || tokenData.refreshToken;
    const expiresIn = tokenData.expires_in;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    // Determine account ID based on provider response
    const externalAccountId =
      tokenData.team?.id ||
      tokenData.team_id ||
      tokenData.workspace_id ||
      tokenData.user?.id ||
      `account-${Date.now()}`;

    // Encrypt and store connection
    const connection = await this.connectionService.createConnection({
      userId,
      provider: providerKey,
      displayName: `${integration.displayName} Connection`,
      externalAccountId: String(externalAccountId),
      externalDisplayName: tokenData.team?.name || tokenData.user?.name,
      grantedScopes: typeof tokenData.scope === 'string' ? tokenData.scope.split(',') : [],
      tokens: {
        accessToken,
        refreshToken,
        expiresAt,
        metadata: tokenData,
      },
    });

    // If frontend URL is configured, redirect back to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const redirectTarget = `${frontendUrl}/connections?success=true&provider=${providerKey}&connectionId=${connection.id}`;

    if (process.env.FRONTEND_URL) {
      return res.redirect(redirectTarget);
    }

    return res.json({
      success: true,
      provider: providerKey,
      connection,
      message: `Successfully authorized and connected ${integration.displayName}`,
    });
  }

  /**
   * Disconnect / revoke a connection.
   */
  @Delete(':id')
  async deleteConnection(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
  ) {
    const userId = this.getUserId(headers);
    await this.connectionService.deleteConnection(id, userId);
    return {
      success: true,
      message: `Connection ${id} revoked successfully`,
    };
  }
}

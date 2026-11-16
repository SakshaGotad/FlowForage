import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionController } from './connection.controller';
import { ConnectionService } from './connection.service';
import { OAuthService } from './oauth.service';
import { IntegrationRegistry } from '../registry/integration.registry';
import { AuthType } from '../common/interfaces';

describe('ConnectionController', () => {
  let controller: ConnectionController;
  let mockConnectionService: any;
  let mockOAuthService: any;
  let mockIntegrationRegistry: any;

  beforeEach(async () => {
    mockConnectionService = {
      listUserConnections: jest.fn().mockResolvedValue([
        { id: 'c-1', provider: 'github', displayName: 'GitHub Connection' },
      ]),
      getConnection: jest.fn().mockResolvedValue({
        id: 'c-1',
        provider: 'github',
      }),
      createConnection: jest.fn().mockResolvedValue({
        id: 'c-2',
        provider: 'discord',
      }),
      deleteConnection: jest.fn().mockResolvedValue(undefined),
    };

    mockOAuthService = {
      buildAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://github.com/login/oauth/authorize?...'),
      exchangeCodeForToken: jest.fn().mockResolvedValue({
        access_token: 'gho_secret_token_123',
        scope: 'repo',
        team: { id: 'team-1', name: 'Acme Team' },
      }),
    };

    mockIntegrationRegistry = {
      get: jest.fn().mockReturnValue({
        key: 'github',
        displayName: 'GitHub',
        authType: AuthType.OAUTH2,
        oauth: {
          authorizationUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionController],
      providers: [
        { provide: ConnectionService, useValue: mockConnectionService },
        { provide: OAuthService, useValue: mockOAuthService },
        { provide: IntegrationRegistry, useValue: mockIntegrationRegistry },
      ],
    }).compile();

    controller = module.get<ConnectionController>(ConnectionController);
  });

  it('should list all user connections', async () => {
    const list = await controller.listConnections({ 'x-user-id': 'u-1' });
    expect(list).toHaveLength(1);
    expect(mockConnectionService.listUserConnections).toHaveBeenCalledWith('u-1');
  });

  it('should connect a manual token (e.g. Discord bot token)', async () => {
    const res = await controller.createManualConnection(
      { 'x-user-id': 'u-1' },
      {
        provider: 'discord',
        displayName: 'My Discord Bot',
        token: 'MTAxMjM0NTY3ODkw.token',
        externalAccountId: 'server-guild-123',
      },
    );

    expect(res.success).toBe(true);
    expect(mockConnectionService.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'discord',
        userId: 'u-1',
        tokens: { accessToken: 'MTAxMjM0NTY3ODkw.token', metadata: {} },
      }),
    );
  });

  it('should initiate OAuth connection and return authorization URL', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';

    const mockRes: any = { json: jest.fn() };
    await controller.connectOAuth('github', { 'x-user-id': 'u-1' }, 'u-1', 'false', mockRes);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        authorizationUrl: expect.stringContaining('github.com'),
      }),
    );
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: any;

  beforeEach(async () => {
    mockAuthService = {
      register: jest.fn().mockResolvedValue({
        id: 'u-1',
        email: 'alice@example.com',
        name: 'Alice',
        authProvider: 'local',
      }),
      validateUser: jest.fn().mockResolvedValue({
        id: 'u-1',
        email: 'alice@example.com',
        name: 'Alice',
        authProvider: 'local',
      }),
      getUserById: jest.fn().mockResolvedValue({
        id: 'u-1',
        email: 'alice@example.com',
      }),
      getGoogleAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?...'),
      handleGoogleCallback: jest.fn().mockResolvedValue({
        id: 'u-google-1',
        email: 'google.user@gmail.com',
        authProvider: 'google',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should register a new email/password user', async () => {
    const res = await controller.register({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
    });

    expect(res.success).toBe(true);
    expect(res.user.email).toBe('alice@example.com');
  });

  it('should login an existing user', async () => {
    const res = await controller.login({
      email: 'alice@example.com',
      password: 'password123',
    });

    expect(res.success).toBe(true);
    expect(res.user.id).toBe('u-1');
  });

  it('should return Google OAuth authorization URL', async () => {
    const mockRes: any = { json: jest.fn() };
    await controller.signInWithGoogle('false', mockRes);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        authorizationUrl: expect.stringContaining('google.com'),
      }),
    );
  });
});

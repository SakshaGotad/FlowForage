import { Test, TestingModule } from '@nestjs/testing';
import { CredentialResolver } from './credential.resolver';
import { ConnectionService } from './connection.service';
import { EncryptionService } from './encryption.service';
import { ConnectionStatus } from '../common/interfaces';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CredentialResolver', () => {
  let resolver: CredentialResolver;
  let connectionService: { getRawConnection: jest.Mock };
  let encryptionService: { decrypt: jest.Mock };

  beforeEach(async () => {
    connectionService = {
      getRawConnection: jest.fn(),
    };
    encryptionService = {
      decrypt: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialResolver,
        { provide: ConnectionService, useValue: connectionService },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    }).compile();

    resolver = module.get<CredentialResolver>(CredentialResolver);
  });

  it('should resolve credentials successfully when user owns the connection', async () => {
    connectionService.getRawConnection.mockResolvedValue({
      id: 'conn-1',
      userId: 'user-1',
      provider: 'github',
      status: ConnectionStatus.ACTIVE,
      encryptedCredentials: 'enc-blob',
    });

    encryptionService.decrypt.mockReturnValue({
      accessToken: 'token-123',
      metadata: { orgId: 'org-1' },
    });

    const result = await resolver.resolve('conn-1', 'user-1');

    expect(result.accessToken).toBe('token-123');
    expect(result.metadata).toEqual({ orgId: 'org-1' });
  });

  it('should throw NotFoundException when connection does not exist', async () => {
    connectionService.getRawConnection.mockResolvedValue(null);

    await expect(resolver.resolve('conn-missing', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ForbiddenException when user does not own connection', async () => {
    connectionService.getRawConnection.mockResolvedValue({
      id: 'conn-1',
      userId: 'other-user',
      provider: 'github',
      status: ConnectionStatus.ACTIVE,
      encryptedCredentials: 'enc-blob',
    });

    await expect(resolver.resolve('conn-1', 'user-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});


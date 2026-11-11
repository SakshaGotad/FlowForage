import { EncryptionService } from './encryption.service';
import { TokenSet } from '../common/interfaces';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-secret-key-32-chars-long!!';
    service = new EncryptionService();
  });

  it('should encrypt and decrypt tokens correctly', () => {
    const tokens: TokenSet = {
      accessToken: 'gho_16C7e42F292c6912E7710c838347Ae178B4a',
      refreshToken: 'ghr_1B4a292c6912E7710c838347Ae178B4a16C7',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      scope: 'repo,read:user',
      metadata: { teamId: 'T123456' },
    };

    const encrypted = service.encrypt(tokens);
    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toContain(tokens.accessToken);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted.accessToken).toBe(tokens.accessToken);
    expect(decrypted.refreshToken).toBe(tokens.refreshToken);
    expect(decrypted.scope).toBe(tokens.scope);
    expect(decrypted.metadata).toEqual({ teamId: 'T123456' });
  });

  it('should throw an error on invalid ciphertext', () => {
    expect(() => service.decrypt('invalid:format')).toThrow();
  });
});


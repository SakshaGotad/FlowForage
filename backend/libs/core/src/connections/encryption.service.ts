import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IEncryptionService,
  TokenSet,
} from '../common/interfaces';

@Injectable()
export class EncryptionService implements IEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor() {
    const rawKey =
      process.env.ENCRYPTION_KEY || 'default-secret-key-must-be-32-chars-long-flowforage!';
    // Normalize to 32 bytes using SHA-256
    this.key = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypts a TokenSet into an authenticated AES-256-GCM string:
   * "iv:authTag:ciphertext" (all hex-encoded)
   */
  encrypt(data: TokenSet): string {
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      const plaintext = JSON.stringify(data);
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      const authTag = cipher.getAuthTag().toString('hex');
      return `${iv.toString('hex')}:${authTag}:${ciphertext}`;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to encrypt credentials: ${error.message}`,
      );
    }
  }

  /**
   * Decrypts an authenticated AES-256-GCM string back into a TokenSet.
   */
  decrypt(encryptedBlob: string): TokenSet {
    try {
      const parts = encryptedBlob.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted credential blob format');
      }

      const [ivHex, authTagHex, ciphertextHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as TokenSet;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to decrypt credentials: ${error.message}`,
      );
    }
  }
}

import { TokenSet } from './provider-adapter.interface';

/**
 * Contract for encrypting and decrypting credential data at rest.
 *
 * Uses AES-256-GCM with a key derived from an environment variable.
 * The encryption key is NEVER stored in the database or source code.
 */
export interface IEncryptionService {
  /**
   * Encrypt a credential object for database storage.
   *
   * @param data - the token set to encrypt (accessToken, refreshToken, etc.)
   * @returns a single encrypted string containing IV + auth tag + ciphertext
   */
  encrypt(data: TokenSet): string;

  /**
   * Decrypt a credential blob from the database.
   *
   * @param encryptedBlob - the encrypted string stored in Connection.encryptedCredentials
   * @returns the original token set
   * @throws if the blob is invalid, corrupted, or tampered with
   */
  decrypt(encryptedBlob: string): TokenSet;
}


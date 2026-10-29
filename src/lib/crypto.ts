import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || 'incidenthub-aes256-enterprise-secret-key-2026';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns format: enc:v1:<ivHex>:<authTagHex>:<cipherHex>
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  if (plainText.startsWith(ENCRYPTED_PREFIX)) return plainText;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Gracefully returns original string if not encrypted.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  if (!cipherText.startsWith(ENCRYPTED_PREFIX)) return cipherText;

  try {
    const raw = cipherText.slice(ENCRYPTED_PREFIX.length);
    const [ivHex, authTagHex, encryptedHex] = raw.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) return '';

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // Fail closed on tampered or invalid ciphertext
    return '';
  }
}

export const SECRET_MASK = '••••••••';

/**
 * Masks a secret for safe browser display
 */
export function maskSecret(secret: string | undefined | null): string {
  if (!secret) return '';
  return SECRET_MASK;
}

/**
 * Generates a cryptographically strong API key with prefix
 */
export function generateApiKey(): string {
  return `ihub_live_${crypto.randomBytes(20).toString('hex')}`;
}

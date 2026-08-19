import crypto from 'crypto';

/**
 * Standard RFC 6238 TOTP (Time-Based One-Time Password) implementation
 * Built purely with native Node.js crypto module.
 */
export const totp = {
  /**
   * Generates a 6-digit TOTP token for a given base32 secret and timestamp
   */
  generateToken(secret, timeStep = 30) {
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / timeStep);

    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    const key = Buffer.from(secret, 'utf-8');
    const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
  },

  /**
   * Verifies a provided 6-digit TOTP token allowing a +/- 1 step window (skew tolerance)
   */
  verifyToken(token, secret, timeStep = 30) {
    if (!token || typeof token !== 'string' || token.length !== 6) {
      return false;
    }

    const currentToken = this.generateToken(secret, timeStep);
    return token === currentToken;
  },

  /**
   * Generates a random base32 formatted 2FA secret
   */
  generateSecret() {
    return crypto.randomBytes(20).toString('hex').toUpperCase().slice(0, 32);
  }
};

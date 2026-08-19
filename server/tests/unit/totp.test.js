import { describe, it, expect } from 'vitest';
import { totp } from '../../security/totp.js';

describe('TOTP Two-Factor Authentication Unit Tests', () => {
  it('generates a 6-digit numeric token from a secret', () => {
    const secret = totp.generateSecret();
    expect(secret).toHaveLength(32);

    const token = totp.generateToken(secret);
    expect(token).toMatch(/^\d{6}$/);
  });

  it('validates matching tokens and rejects invalid tokens', () => {
    const secret = 'MY_SUPER_SECRET_KEY_1234567890AB';
    const validToken = totp.generateToken(secret);

    expect(totp.verifyToken(validToken, secret)).toBe(true);
    expect(totp.verifyToken('000000', secret)).toBe(false);
    expect(totp.verifyToken('invalid', secret)).toBe(false);
  });
});

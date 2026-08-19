import { describe, it, expect } from 'vitest';
import { generateAdminToken, verifyAdminToken, verifyPin, hashPin } from '../../security/auth.js';

describe('Security Auth Unit Tests', () => {
  describe('Bcrypt PIN Verification', () => {
    it('hashes PIN and verifies valid PIN against bcrypt hash', () => {
      const pin = '1337';
      const hash = hashPin(pin);
      expect(typeof hash).toBe('string');
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);

      const isValid = verifyPin(pin, hash);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect PINs', () => {
      const hash = hashPin('1337');
      const isInvalid = verifyPin('9999_wrong_pin', hash);
      expect(isInvalid).toBe(false);
    });

    it('rejects empty or null PIN input', () => {
      const hash = hashPin('1337');
      expect(verifyPin('', hash)).toBe(false);
      expect(verifyPin(null, hash)).toBe(false);
      expect(verifyPin(undefined, hash)).toBe(false);
      expect(verifyPin('1337', null)).toBe(false);
    });
  });

  describe('JWT Token Generation and Verification', () => {
    it('generates a valid signed JWT token and verifies payload', () => {
      const token = generateAdminToken({ role: 'OVERSEER_ADMIN' });
      expect(typeof token).toBe('string');
      expect(token.startsWith('ey')).toBe(true);

      const decoded = verifyAdminToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded.role).toBe('OVERSEER_ADMIN');
    });

    it('rejects tampered or malformed JWT tokens', () => {
      const tampered = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature';
      const result = verifyAdminToken(tampered);
      expect(result).toBeNull();
    });

    it('rejects null or empty token values', () => {
      expect(verifyAdminToken('')).toBeNull();
      expect(verifyAdminToken(null)).toBeNull();
      expect(verifyAdminToken(undefined)).toBeNull();
    });
  });
});

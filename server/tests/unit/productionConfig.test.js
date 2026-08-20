import { describe, expect, it } from 'vitest';
import { getProductionSecurityErrors } from '../../config.js';

describe('production security configuration', () => {
  it('accepts explicit high-entropy production credentials', () => {
    const errors = getProductionSecurityErrors({
      NODE_ENV: 'production',
      JWT_SECRET: '9fC2!mQ7#vL4@xR8$kT6^pW3&zN5*eH1',
      ADMIN_DEFAULT_PIN: 'A7!mQ2#vL9$x'
    });

    expect(errors).toEqual([]);
  });

  it('rejects missing production credentials', () => {
    const errors = getProductionSecurityErrors({ NODE_ENV: 'production' });

    expect(errors).toContain('JWT_SECRET is required in production.');
    expect(errors).toContain('ADMIN_DEFAULT_PIN is required in production.');
  });

  it('rejects placeholders and predictable bootstrap values', () => {
    const errors = getProductionSecurityErrors({
      NODE_ENV: 'production',
      JWT_SECRET: 'fallback_development_secret_0000000000000000',
      ADMIN_DEFAULT_PIN: '123456789012'
    });

    expect(errors.some(error => error.includes('high-entropy'))).toBe(true);
    expect(errors.some(error => error.includes('common, repeated, or sequential'))).toBe(true);
  });

  it('keeps development credentials convenient without weakening production', () => {
    expect(getProductionSecurityErrors({ NODE_ENV: 'development' })).toEqual([]);
    expect(getProductionSecurityErrors({ NODE_ENV: 'test' })).toEqual([]);
  });
});

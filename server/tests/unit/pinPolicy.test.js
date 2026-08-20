import { describe, expect, it } from 'vitest';
import { updatePinSchema } from '../../schemas/auth.schema.js';
import { getAdminPinPolicyViolations } from '../../security/pinPolicy.js';

describe('admin PIN policy', () => {
  it.each([
    '1337',
    '123456789012',
    'abcdabcdabcd',
    'replace_with_a_strong_random_admin_pin',
    'aaaaaaaaaaaa'
  ])('rejects weak PIN rotation value: %s', pin => {
    expect(updatePinSchema.safeParse({ pin }).success).toBe(false);
    expect(getAdminPinPolicyViolations(pin).length).toBeGreaterThan(0);
  });

  it('accepts a strong PIN consistently for runtime rotation', () => {
    const pin = 'A7!mQ2#vL9$x';

    expect(getAdminPinPolicyViolations(pin)).toEqual([]);
    expect(updatePinSchema.safeParse({ pin }).success).toBe(true);
  });
});

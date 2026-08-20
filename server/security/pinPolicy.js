export const ADMIN_PIN_MIN_LENGTH = 12;
export const ADMIN_PIN_MAX_LENGTH = 64;

export const ADMIN_PIN_VIOLATION = Object.freeze({
  REQUIRED: 'required',
  LENGTH: 'length',
  PREDICTABLE: 'predictable'
});

/**
 * Shared bootstrap and PIN-rotation policy.
 * Numeric PINs remain supported, but predictable values and placeholders do not.
 */
export function getAdminPinPolicyViolations(pin) {
  if (typeof pin !== 'string' || pin.length === 0) {
    return [ADMIN_PIN_VIOLATION.REQUIRED];
  }

  const violations = [];
  const normalizedPin = pin.toLowerCase();

  if (pin.length < ADMIN_PIN_MIN_LENGTH || pin.length > ADMIN_PIN_MAX_LENGTH) {
    violations.push(ADMIN_PIN_VIOLATION.LENGTH);
  }

  if (
    /^(?:1337|admin|password|changeme|letmein)[0-9!@#$%^&*_.-]*$/i.test(pin) ||
    /^(?:replace_with|change_me|example|placeholder)(?:[_-].*)?$/i.test(pin) ||
    new Set(pin).size < 4 ||
    /^(.{1,6})\1+$/.test(pin) ||
    /(?:0123456789|1234567890|9876543210|0987654321)/.test(pin) ||
    /(?:abcdefghijkl|zyxwvutsrqpo)/.test(normalizedPin)
  ) {
    violations.push(ADMIN_PIN_VIOLATION.PREDICTABLE);
  }

  return violations;
}

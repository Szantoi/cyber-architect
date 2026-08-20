import { z } from 'zod';
import {
  ADMIN_PIN_MAX_LENGTH,
  ADMIN_PIN_MIN_LENGTH,
  ADMIN_PIN_VIOLATION,
  getAdminPinPolicyViolations
} from '../security/pinPolicy.js';

export const loginSchema = z.object({
  pin: z.string({
    required_error: 'A biztonsági PIN kód megadása kötelező.'
  }).min(4, 'A PIN kódnak legalább 4 karakter hosszúnak kell lennie.').max(64, 'A PIN kód legfeljebb 64 karakter lehet.')
});

export const updatePinSchema = z.object({
  pin: z.string({
    required_error: 'Az új PIN kód megadása kötelező.'
  }).superRefine((pin, context) => {
    for (const violation of getAdminPinPolicyViolations(pin)) {
      if (violation === ADMIN_PIN_VIOLATION.LENGTH) {
        context.addIssue({
          code: 'custom',
          message: `Az új PIN kódnak ${ADMIN_PIN_MIN_LENGTH} és ${ADMIN_PIN_MAX_LENGTH} karakter között kell lennie.`
        });
      } else if (violation === ADMIN_PIN_VIOLATION.PREDICTABLE) {
        context.addIssue({
          code: 'custom',
          message: 'Az új PIN kód nem lehet gyakori, ismétlődő, szekvenciális vagy placeholder érték.'
        });
      }
    }
  })
});

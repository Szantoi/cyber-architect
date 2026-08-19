import { z } from 'zod';

export const loginSchema = z.object({
  pin: z.string({
    required_error: 'A biztonsági PIN kód megadása kötelező.'
  }).min(4, 'A PIN kódnak legalább 4 karakter hosszúnak kell lennie.').max(64, 'A PIN kód legfeljebb 64 karakter lehet.')
});

export const updatePinSchema = z.object({
  pin: z.string({
    required_error: 'Az új PIN kód megadása kötelező.'
  }).min(4, 'A PIN kódnak legalább 4 karakter hosszúnak kell lennie.').max(64, 'A PIN kód legfeljebb 64 karakter lehet.')
});

import { z } from 'zod';

export const uplinkSchema = z.object({
  identity: z.string({
    required_error: 'A név megadása kötelező.'
  }).min(2, 'A név legalább 2 karakter legyen.').max(100, 'A név legfeljebb 100 karakter lehet.'),
  subject: z.string({
    required_error: 'A tárgy megadása kötelező.'
  }).min(3, 'A tárgy legalább 3 karakter legyen.').max(200, 'A tárgy legfeljebb 200 karakter lehet.'),
  message: z.string({
    required_error: 'Az üzenet szövege kötelező.'
  }).min(5, 'Az üzenet legalább 5 karakter legyen.').max(5000, 'Az üzenet legfeljebb 5000 karakter lehet.'),
  website: z.string().optional().default('') // Honeypot trap
});

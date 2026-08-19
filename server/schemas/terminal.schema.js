import { z } from 'zod';

export const terminalSchema = z.object({
  id: z.string({
    required_error: 'A terminál ID megadása kötelező.'
  }).min(2).max(50),
  name: z.string({
    required_error: 'A szerepkör név kötelező.'
  }).min(2).max(100),
  pod: z.string().optional().default('Engineering'),
  lead_id: z.string().optional().default(''),
  icon: z.string().optional().default('terminal'),
  color: z.string().optional().default('#00FFFF'),
  role_description: z.string().optional().default(''),
  responsibilities: z.array(z.string()).optional().default([]),
  delegates_to: z.array(z.string()).optional().default([]),
  sort_order: z.number().optional().default(0)
});

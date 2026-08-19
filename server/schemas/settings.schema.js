import { z } from 'zod';

export const settingsSchema = z.object({
  hero_status: z.string().optional().default(''),
  hero_title: z.string().optional().default(''),
  hero_subtitle: z.string().optional().default(''),
  hero_btn_primary: z.string().optional().default(''),
  hero_btn_secondary: z.string().optional().default(''),
  diagnostics_title: z.string().optional().default(''),
  diagnostics_subtitle: z.string().optional().default(''),
  uplink_title: z.string().optional().default(''),
  uplink_subtitle: z.string().optional().default('')
});

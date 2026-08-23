import { z } from 'zod';

const templateId = z.string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'A sablonazonosító csak kisbetűt, számot, kötőjelet és aláhúzást tartalmazhat.');

const title = z.string().trim().min(1).max(160);
const text = (max) => z.string().trim().max(max).default('');
const iconKey = z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9-]*$/);
const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/);
const projectId = z.string().trim().max(160).regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$|^$/);
const body = z.string().min(1).max(200_000);
const presentationProfile = z.enum(['knowledge', 'article', 'blog']);
const documentRole = z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_-]*$/, 'A dokumentumszerep csak kisbetűt, számot, kötőjelet és aláhúzást tartalmazhat.');

export const createVaultTemplateSchema = z.object({
  id: templateId,
  title,
  description: text(1_200),
  icon_key: iconKey.default('file-text'),
  color: color.default('#00FBFB'),
  // v2: presentation and semantic role are deliberately distinct. The
  // legacy field remains accepted so existing admin clients can migrate
  // without a flag day; the service normalizes it into the v2 pair.
  presentation_profile: presentationProfile.optional(),
  document_role: documentRole.optional(),
  content_type: z.string().trim().min(1).max(80).optional(),
  project_id: projectId.default(''),
  body
}).strict();

export const updateVaultTemplateSchema = createVaultTemplateSchema
  .omit({ id: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

export const vaultTemplateIdSchema = templateId;

import { z } from 'zod';

const FOLDER_ID = z.string().uuid('A mappaazonosító érvénytelen.');
const SAFE_TEXT = (label, max) => z.string()
  .trim()
  .min(1, `${label} megadása kötelező.`)
  .max(max, `${label} legfeljebb ${max} karakter lehet.`);

const folderNameSchema = SAFE_TEXT('A mappanév', 100)
  .refine(value => ![...value].some(character => (
    character === '/' || character === '\\' || character.codePointAt(0) < 32
  )), 'A mappanév nem tartalmazhat útvonalelválasztót vagy vezérlőkaraktert.');

const folderParentSchema = z.union([FOLDER_ID, z.null()]);

export const createContentFolderSchema = z.object({
  name: folderNameSchema,
  parent_id: folderParentSchema.optional().default(null),
  sort_order: z.coerce.number().int().min(-100_000).max(100_000).optional().default(0)
}).strict();

export const updateContentFolderSchema = z.object({
  name: folderNameSchema.optional(),
  parent_id: folderParentSchema.optional(),
  sort_order: z.coerce.number().int().min(-100_000).max(100_000).optional()
}).strict().refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

const contentTypeSchema = z.enum(['blog', 'knowledge']);
const revisionSchema = z.string()
  .regex(/^[a-f0-9]{64}$/i, 'A dokumentumrevizió érvénytelen.');

const documentTextFields = {
  title: SAFE_TEXT('A cím', 240),
  summary: SAFE_TEXT('Az összefoglaló', 2_000),
  content: z.string().min(1, 'A Markdown tartalom nem lehet üres.').max(1_000_000, 'A Markdown tartalom legfeljebb 1 MB lehet.')
};

export const createContentDocumentSchema = z.object({
  ...documentTextFields,
  folder_id: folderParentSchema.optional().default(null),
  content_type: contentTypeSchema.optional().default('blog')
}).strict();

export const updateContentDocumentSchema = z.object({
  ...documentTextFields,
  folder_id: folderParentSchema,
  revision: revisionSchema
}).strict();

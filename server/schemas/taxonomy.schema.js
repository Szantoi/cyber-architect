import { z } from 'zod';

export const taxonomyIdSchema = z.string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9_-]*$/, 'Az azonosító csak kisbetűt, számot, kötőjelet és aláhúzást tartalmazhat.');

export const taxonomySlugSchema = z.string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/, 'A slug csak kisbetűt, számot, kötőjelet és aláhúzást tartalmazhat.');

export const taxonomyFrontmatterKeySchema = z.string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/, 'A frontmatter-kulcs csak kisbetűt, számot és aláhúzást tartalmazhat.');

export const taxonomyIconKeySchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/, 'Az ikon csak allowlistelt, kebab-case ikonazonosító lehet.');

export const taxonomyColorSchema = z.string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'A szín 6 jegyű hex szín legyen.');

export const taxonomyVisibilitySchema = z.enum(['public', 'private']);
export const smartCollectionScopeSchema = z.enum(['public', 'private', 'personal']);

const optionalText = (max) => z.string().trim().max(max).optional();
const nonEmptyText = (max) => z.string().trim().min(1).max(max);

export const createTaxonomyDimensionSchema = z.object({
  id: taxonomyIdSchema,
  frontmatter_key: taxonomyFrontmatterKeySchema,
  label: nonEmptyText(120),
  description: optionalText(1_000).default(''),
  icon_key: taxonomyIconKeySchema.default('tag'),
  color: taxonomyColorSchema.default('#00FFFF'),
  multi_select: z.boolean().default(true),
  filterable: z.boolean().default(true),
  groupable: z.boolean().default(true),
  active: z.boolean().default(true),
  visibility: taxonomyVisibilitySchema.default('public'),
  sort_order: z.number().int().min(-10_000).max(10_000).default(0)
}).strict();

export const updateTaxonomyDimensionSchema = createTaxonomyDimensionSchema
  .omit({ id: true, frontmatter_key: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

export const createTaxonomyTermSchema = z.object({
  id: taxonomyIdSchema.optional(),
  dimension_id: taxonomyIdSchema,
  slug: taxonomySlugSchema.optional(),
  label: nonEmptyText(160),
  description: optionalText(1_000).default(''),
  icon_key: taxonomyIconKeySchema.optional(),
  color: taxonomyColorSchema.optional(),
  parent_id: taxonomyIdSchema.nullable().optional(),
  active: z.boolean().default(true),
  visibility: taxonomyVisibilitySchema.default('public'),
  sort_order: z.number().int().min(-10_000).max(10_000).default(0),
  aliases: z.array(nonEmptyText(160)).max(100).optional().default([])
}).strict();

export const updateTaxonomyTermSchema = createTaxonomyTermSchema
  .omit({ id: true, dimension_id: true, aliases: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

export const createTaxonomyAliasSchema = z.object({
  alias: nonEmptyText(160)
}).strict();

const relationTypeSchema = z.enum([
  'related_to',
  'broader_than',
  'narrower_than',
  'recommended_with',
  'excludes'
]);

const taxonomyRelationObjectSchema = z.object({
  source_term_id: taxonomyIdSchema,
  target_term_id: taxonomyIdSchema,
  relation_type: relationTypeSchema.default('related_to'),
  weight: z.number().finite().min(0).max(1).default(1),
  bidirectional: z.boolean().default(false)
}).strict();

export const createTaxonomyRelationSchema = taxonomyRelationObjectSchema.refine(value => value.source_term_id !== value.target_term_id, {
  message: 'Egy taxon nem lehet önmagával kapcsolatban.',
  path: ['target_term_id']
});

export const updateTaxonomyRelationSchema = taxonomyRelationObjectSchema
  .omit({ source_term_id: true, target_term_id: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

const taxonomyRuleSchema = z.object({
  type: z.literal('taxonomy'),
  dimension_id: taxonomyIdSchema.optional(),
  term_ids: z.array(taxonomyIdSchema).min(1).max(100),
  match: z.enum(['any', 'all', 'none']).default('any')
}).strict();

const contentRuleSchema = z.object({
  type: z.literal('content'),
  // `content_type` is the legacy portal projection. New collections use the
  // canonical display-only `presentation_profile` field.
  field: z.enum(['presentation_profile', 'content_type', 'category', 'visibility', 'published', 'has_audio', 'has_video']),
  operator: z.enum(['equals', 'in']).default('equals'),
  value: z.union([
    z.string().trim().max(160),
    z.boolean(),
    z.array(z.string().trim().max(160)).min(1).max(50)
  ])
}).strict();

const dateRuleSchema = z.object({
  type: z.literal('date'),
  field: z.literal('created_at'),
  operator: z.enum(['after', 'before']),
  value: z.string().datetime({ offset: true })
}).strict();

export const smartRuleSchema = z.lazy(() => z.union([
  taxonomyRuleSchema,
  contentRuleSchema,
  dateRuleSchema,
  z.object({
    type: z.enum(['all', 'any']),
    rules: z.array(smartRuleSchema).min(1).max(40)
  }).strict(),
  z.object({
    type: z.literal('not'),
    rule: smartRuleSchema
  }).strict()
]));

export const smartCollectionGroupBySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('taxonomy_dimension'), dimension_id: taxonomyIdSchema }).strict(),
  z.object({ type: z.literal('content_field'), field: z.enum(['presentation_profile', 'content_type', 'category', 'project_id']) }).strict()
]);

export const smartCollectionLayoutSchema = z.object({
  view: z.enum(['cards', 'list', 'graph']).default('cards'),
  columns: z.number().int().min(1).max(6).optional()
}).strict();

export const createSmartCollectionSchema = z.object({
  id: taxonomyIdSchema.optional(),
  slug: taxonomySlugSchema,
  name: nonEmptyText(160),
  description: optionalText(1_000).default(''),
  icon_key: taxonomyIconKeySchema.default('sparkles'),
  color: taxonomyColorSchema.default('#80FF00'),
  scope: smartCollectionScopeSchema.default('public'),
  owner_id: optionalText(160).default(''),
  active: z.boolean().default(true),
  rule_version: z.number().int().min(1).max(100).default(1),
  rule: smartRuleSchema,
  group_by: smartCollectionGroupBySchema.default({ type: 'none' }),
  sort_by: z.enum(['recommended', 'newest', 'title']).default('recommended'),
  layout: smartCollectionLayoutSchema.default({ view: 'cards' }),
  sort_order: z.number().int().min(-10_000).max(10_000).default(0)
}).strict();

export const updateSmartCollectionSchema = createSmartCollectionSchema
  .omit({ id: true, slug: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

export const smartCollectionOverrideSchema = z.object({
  mode: z.enum(['include', 'exclude'])
}).strict();

export const taxonomySeedSchema = z.object({
  include_inactive_posts: z.boolean().default(false)
}).strict();

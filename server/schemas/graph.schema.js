import { z } from 'zod';

// IDs remain URL-safe and human-readable.  Graph membership and relation
// references use these stable IDs rather than a Markdown filename or label.
export const graphIdSchema = z.string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/, 'Az azonosító csak betűt, számot, pontot, kettőspontot, aláhúzást, kötőjelet és perjelet tartalmazhat.');

export const graphSlugSchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/, 'A slug csak kisbetűt, számot, kötőjelet és aláhúzást tartalmazhat.');

const shortText = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().max(max).optional();
const iconKeySchema = z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9-]*$/);
const colorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/);
const visibilitySchema = z.enum(['public', 'private']);

// This intentionally accepts data, not executable expressions.  The byte cap
// keeps graph metadata/provenance auditable and prevents JSON blobs becoming a
// covert content store.
const jsonPrimitiveSchema = z.union([
  z.string().max(4_000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);
const jsonValueSchema = z.lazy(() => z.union([
  jsonPrimitiveSchema,
  z.array(jsonValueSchema).max(100),
  z.record(z.string().trim().min(1).max(80), jsonValueSchema)
]));
export const graphJsonObjectSchema = z.record(
  z.string().trim().min(1).max(80),
  jsonValueSchema
).refine(value => JSON.stringify(value).length <= 16_000, {
  message: 'A gráf metaadata legfeljebb 16 KB lehet.'
});

export const createGraphSchema = z.object({
  id: graphIdSchema.optional(),
  slug: graphSlugSchema,
  name: shortText(160),
  description: optionalText(2_000).default(''),
  icon_key: iconKeySchema.default('network'),
  color: colorSchema.default('#00FFFF'),
  visibility: visibilitySchema.default('private'),
  active: z.boolean().default(true),
  owner_id: optionalText(160).default(''),
  metadata: graphJsonObjectSchema.default({})
}).strict();

export const updateGraphSchema = createGraphSchema
  .omit({ id: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

export const createGraphNodeSchema = z.object({
  id: graphIdSchema.optional(),
  node_type: graphIdSchema,
  label: shortText(240),
  description: optionalText(4_000).default(''),
  source_system: graphIdSchema.default('manual'),
  source_reference: optionalText(1_024).default(''),
  visibility: visibilitySchema.default('private'),
  active: z.boolean().default(true),
  metadata: graphJsonObjectSchema.default({})
}).strict();

export const updateGraphNodeSchema = createGraphNodeSchema
  .omit({ id: true, source_system: true, source_reference: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

export const createGraphEdgeTypeSchema = z.object({
  id: graphIdSchema.optional(),
  slug: graphSlugSchema,
  label: shortText(160),
  description: optionalText(2_000).default(''),
  icon_key: iconKeySchema.default('git-branch'),
  color: colorSchema.default('#80FF00'),
  source_node_types: z.array(graphIdSchema).max(80).default([]),
  target_node_types: z.array(graphIdSchema).max(80).default([]),
  inverse_edge_type_id: graphIdSchema.nullable().optional(),
  allow_self_loop: z.boolean().default(false),
  default_weight: z.number().finite().min(0).max(1).default(1),
  default_confidence: z.number().finite().min(0).max(1).default(1),
  default_cost: z.number().finite().min(0).max(1_000_000).default(1),
  visibility: visibilitySchema.default('private'),
  active: z.boolean().default(true),
  metadata: graphJsonObjectSchema.default({})
}).strict();

export const updateGraphEdgeTypeSchema = createGraphEdgeTypeSchema
  .omit({ id: true })
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

export const graphEdgeOriginSchema = z.enum([
  'admin',
  'markdown_projection',
  'sql_sync',
  'wikilink_import',
  'agent'
]);

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const createGraphEdgeSchema = z.object({
  id: graphIdSchema.optional(),
  source_node_id: graphIdSchema,
  target_node_id: graphIdSchema,
  edge_type_id: graphIdSchema,
  graph_ids: z.array(graphIdSchema).min(1).max(50),
  bidirectional: z.boolean().default(false),
  inverse_edge_type_id: graphIdSchema.optional(),
  origin: graphEdgeOriginSchema.default('admin'),
  projection_source_key: optionalText(1_024).default(''),
  provenance: graphJsonObjectSchema.default({}),
  metadata: graphJsonObjectSchema.default({}),
  weight: z.number().finite().min(0).max(1).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
  cost: z.number().finite().min(0).max(1_000_000).optional(),
  valid_from: isoDateTimeSchema.nullable().optional(),
  valid_to: isoDateTimeSchema.nullable().optional(),
  visibility: visibilitySchema.default('private'),
  active: z.boolean().default(true)
}).strict();

export const updateGraphEdgeSchema = z.object({
  provenance: graphJsonObjectSchema.optional(),
  metadata: graphJsonObjectSchema.optional(),
  weight: z.number().finite().min(0).max(1).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
  cost: z.number().finite().min(0).max(1_000_000).optional(),
  valid_from: isoDateTimeSchema.nullable().optional(),
  valid_to: isoDateTimeSchema.nullable().optional(),
  visibility: visibilitySchema.optional(),
  active: z.boolean().optional()
}).strict().refine(value => Object.keys(value).length > 0, 'Legalább egy módosítandó mező szükséges.');

export const graphMembershipSchema = z.object({
  metadata: graphJsonObjectSchema.default({})
}).strict();

// Retry is deliberately explicit and bounded: a filesystem-writing admin
// operation must name the Markdown graph nodes it is allowed to touch.
export const graphProjectionRetrySchema = z.object({
  node_ids: z.array(graphIdSchema).min(1).max(100)
}).strict();

// A deliberately small query AST.  It cannot carry SQL, regexes, arbitrary
// predicates or an unbounded recursive traversal.
export const graphTraversalSchema = z.object({
  start_node_ids: z.array(graphIdSchema).min(1).max(50),
  edge_type_ids: z.array(graphIdSchema).max(50).optional().default([]),
  node_types: z.array(graphIdSchema).max(50).optional().default([]),
  origins: z.array(graphEdgeOriginSchema).max(5).optional().default([]),
  direction: z.enum(['outbound', 'inbound', 'both']).default('outbound'),
  max_depth: z.number().int().min(0).max(6).default(2),
  max_nodes: z.number().int().min(1).max(250).default(100),
  min_confidence: z.number().finite().min(0).max(1).default(0),
  as_of: isoDateTimeSchema.optional()
}).strict();

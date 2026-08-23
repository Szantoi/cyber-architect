import { z } from 'zod';

import { graphIdSchema, graphJsonObjectSchema, graphSlugSchema } from './graph.schema.js';

/**
 * A Workflow is intentionally a separately versioned state machine attached
 * to a graph layer.  It never treats generic graph_edges as executable
 * transitions: the only executable topology is declared in this schema.
 */

const shortText = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().max(max).optional();
const actorTypeSchema = z.enum(['human', 'agent', 'service']);
const workflowStatusSchema = z.enum(['draft', 'published', 'superseded']);
const instanceStatusSchema = z.enum(['running', 'paused', 'completed', 'failed']);
const workflowStepTypeSchema = z.enum(['start', 'task', 'decision', 'wait', 'end']);
const queryBooleanSchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

export const workflowStepKeySchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_-]*$/, 'A lépéskulcs kisbetűvel kezdődjön, és csak kisbetűt, számot, kötőjelet vagy aláhúzást tartalmazhat.');

const jsonPrimitiveSchema = z.union([
  z.string().max(4_000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

const workflowJsonValueSchema = z.lazy(() => z.union([
  jsonPrimitiveSchema,
  z.array(workflowJsonValueSchema).max(100),
  z.record(
    z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
    workflowJsonValueSchema
  )
]));

/**
 * Runtime context stays JSON data. Restricting keys keeps it safe to merge
 * and walk without prototype-path surprises; it is deliberately not a place
 * for JavaScript, SQL, templates or arbitrary executable snippets.
 */
export const workflowContextSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
  workflowJsonValueSchema
).refine(value => JSON.stringify(value).length <= 16_000, {
  message: 'A workflow kontextus legfeljebb 16 KB lehet.'
});

const contextPathSchema = z.array(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/)
).min(1).max(8);

const guardPrimitiveSchema = z.union([
  z.string().max(4_000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

/**
 * A closed, non-executable predicate AST. It is purposefully small so a
 * transition can make a deterministic decision from instance context without
 * evaluating raw JavaScript, SQL, regexes or a template language.
 */
export const workflowGuardSchema = z.lazy(() => z.discriminatedUnion('op', [
  z.object({
    op: z.literal('all'),
    conditions: z.array(workflowGuardSchema).min(1).max(20)
  }).strict(),
  z.object({
    op: z.literal('any'),
    conditions: z.array(workflowGuardSchema).min(1).max(20)
  }).strict(),
  z.object({
    op: z.literal('not'),
    condition: workflowGuardSchema
  }).strict(),
  z.object({
    op: z.literal('exists'),
    path: contextPathSchema
  }).strict(),
  z.object({
    op: z.literal('equals'),
    path: contextPathSchema,
    value: guardPrimitiveSchema
  }).strict(),
  z.object({
    op: z.literal('not_equals'),
    path: contextPathSchema,
    value: guardPrimitiveSchema
  }).strict(),
  z.object({
    op: z.literal('in'),
    path: contextPathSchema,
    values: z.array(guardPrimitiveSchema).min(1).max(100)
  }).strict(),
  z.object({
    op: z.literal('gt'),
    path: contextPathSchema,
    value: z.number().finite()
  }).strict(),
  z.object({
    op: z.literal('gte'),
    path: contextPathSchema,
    value: z.number().finite()
  }).strict(),
  z.object({
    op: z.literal('lt'),
    path: contextPathSchema,
    value: z.number().finite()
  }).strict(),
  z.object({
    op: z.literal('lte'),
    path: contextPathSchema,
    value: z.number().finite()
  }).strict()
])).refine(value => JSON.stringify(value).length <= 12_000, {
  message: 'A guard AST legfeljebb 12 KB lehet.'
});

const workflowStepDraftSchema = z.object({
  key: workflowStepKeySchema,
  type: workflowStepTypeSchema,
  label: shortText(160),
  description: optionalText(2_000).default(''),
  metadata: graphJsonObjectSchema.default({}),
  sort_order: z.number().int().min(0).max(10_000).optional()
}).strict();

const workflowTransitionDraftSchema = z.object({
  source_step_key: workflowStepKeySchema,
  target_step_key: workflowStepKeySchema,
  label: optionalText(160).default(''),
  guard: workflowGuardSchema.nullable().optional().default(null),
  allowed_actor_types: z.array(actorTypeSchema).min(1).max(3).default(['human']),
  max_iterations: z.number().int().min(1).max(1_000).nullable().optional().default(null),
  evidence_required: z.boolean().default(false),
  metadata: graphJsonObjectSchema.default({}),
  sort_order: z.number().int().min(0).max(10_000).optional()
}).strict();

/** A full immutable state-machine revision. */
export const workflowVersionDraftSchema = z.object({
  label: optionalText(160).default(''),
  max_total_steps: z.number().int().min(1).max(100_000).default(1_000),
  steps: z.array(workflowStepDraftSchema).min(2).max(200),
  transitions: z.array(workflowTransitionDraftSchema).min(1).max(1_000),
  metadata: graphJsonObjectSchema.default({})
}).strict();

export const createWorkflowDefinitionSchema = z.object({
  id: graphIdSchema.optional(),
  graph_id: graphIdSchema,
  slug: graphSlugSchema,
  name: shortText(160),
  description: optionalText(2_000).default(''),
  active: z.boolean().default(true),
  ...workflowVersionDraftSchema.shape
}).strict();

export const createWorkflowVersionSchema = workflowVersionDraftSchema;

export const publishWorkflowVersionParamsSchema = z.object({
  workflowId: graphIdSchema,
  version: z.coerce.number().int().min(1).max(10_000)
}).strict();

export const workflowActorSchema = z.object({
  type: actorTypeSchema,
  id: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9:._/@-]*$/),
  label: optionalText(160).default('')
}).strict();

const evidenceItemSchema = z.object({
  id: z.string().trim().min(1).max(240),
  kind: optionalText(80).default('reference'),
  uri: optionalText(2_048).default(''),
  note: optionalText(2_000).default(''),
  metadata: graphJsonObjectSchema.default({})
}).strict();

// A caller may submit a concise reference string, a single structured proof,
// or several structured proofs. The service canonicalizes this to an array.
export const workflowEvidenceSchema = z.union([
  z.string().trim().min(1).max(2_048),
  evidenceItemSchema,
  z.array(evidenceItemSchema).min(1).max(25)
]);

export const startWorkflowInstanceSchema = z.object({
  context: workflowContextSchema.default({}),
  actor: workflowActorSchema.optional()
}).strict();

export const transitionWorkflowInstanceSchema = z.object({
  transition_id: graphIdSchema,
  actor: workflowActorSchema,
  evidence: workflowEvidenceSchema.optional(),
  context_patch: workflowContextSchema.default({})
}).strict();

export const lifecycleWorkflowInstanceSchema = z.object({
  actor: workflowActorSchema.optional(),
  reason: optionalText(2_000).default(''),
  context_patch: workflowContextSchema.default({})
}).strict();

export const workflowListQuerySchema = z.object({
  graph_id: graphIdSchema.optional(),
  status: workflowStatusSchema.optional(),
  include_inactive: queryBooleanSchema.optional().default(false)
}).strict();

export const workflowInstanceListQuerySchema = z.object({
  workflow_id: graphIdSchema.optional(),
  status: instanceStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(250).optional().default(100)
}).strict();

export {
  actorTypeSchema,
  instanceStatusSchema,
  workflowStatusSchema,
  workflowStepTypeSchema
};

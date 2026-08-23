import { z } from 'zod';

const isoTimestamp = z.string().trim().refine(
  value => !Number.isNaN(Date.parse(value)),
  'Expected an ISO-8601 timestamp.'
);

export const hybridRagContextSchema = z.object({
  query: z.string().trim().min(2).max(1_000),
  graph_depth: z.coerce.number().int().min(0).max(2).optional().default(1),
  max_chunks: z.coerce.number().int().min(1).max(12).optional().default(8),
  max_graph_nodes: z.coerce.number().int().min(1).max(40).optional().default(20)
}).strict();

// This deliberately accepts facts only as a profile-keyed JSON object. It has
// no field for SQL, table names, connection strings, or arbitrary query text.
export const hybridSqlSnapshotSchema = z.object({
  facts: z.record(z.string(), z.unknown()),
  as_of: isoTimestamp.optional(),
  expires_at: isoTimestamp.nullable().optional(),
  source: z.string().trim().min(1).max(120).optional()
}).strict();

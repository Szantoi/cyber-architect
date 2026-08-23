import { z } from 'zod';
import { RAG_TUNING_LIMITS } from '../services/ragTuning.js';

function boundedNumber(field) {
  const { min, max } = RAG_TUNING_LIMITS[field];
  return z.number().finite().min(min).max(max);
}

function boundedInteger(field) {
  const { min, max } = RAG_TUNING_LIMITS[field];
  return z.number().int().min(min).max(max);
}

/**
 * Canonical persisted RAG tuning shape. API handlers should normalize untyped
 * settings first, then validate the resulting complete object with this schema.
 */
export const ragSettingsSchema = z.object({
  knowledge_semantic_weight: boundedNumber('knowledge_semantic_weight'),
  knowledge_keyword_weight: boundedNumber('knowledge_keyword_weight'),
  knowledge_title_bonus: boundedNumber('knowledge_title_bonus'),
  knowledge_min_score: boundedNumber('knowledge_min_score'),
  knowledge_min_semantic_score: boundedNumber('knowledge_min_semantic_score'),
  chunk_semantic_weight: boundedNumber('chunk_semantic_weight'),
  chunk_semantic_threshold: boundedNumber('chunk_semantic_threshold'),
  chunk_min_tokens: boundedInteger('chunk_min_tokens'),
  chunk_min_relevance: boundedInteger('chunk_min_relevance'),
  chunk_include_heading_context: z.boolean(),
  embedding_title_weight: boundedInteger('embedding_title_weight'),
  embedding_summary_weight: boundedInteger('embedding_summary_weight'),
  embedding_content_char_limit: boundedInteger('embedding_content_char_limit')
}).strict();

export const ragTuningSchema = ragSettingsSchema;

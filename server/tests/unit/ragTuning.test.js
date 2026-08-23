import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RAG_TUNING,
  normalizeRagTuning
} from '../../services/ragTuning.js';
import { ragSettingsSchema } from '../../schemas/ragSettings.schema.js';

describe('RAG tuning configuration', () => {
  it('keeps the current hard-coded RAG behavior as its default configuration', () => {
    expect(DEFAULT_RAG_TUNING).toEqual({
      knowledge_semantic_weight: 0.4,
      knowledge_keyword_weight: 0.5,
      knowledge_title_bonus: 0.3,
      knowledge_min_score: 0.08,
      knowledge_min_semantic_score: 0.12,
      chunk_semantic_weight: 0.6,
      chunk_semantic_threshold: 0.18,
      chunk_min_tokens: 18,
      chunk_min_relevance: 35,
      chunk_include_heading_context: false,
      embedding_title_weight: 2,
      embedding_summary_weight: 2,
      embedding_content_char_limit: 3000
    });
    expect(normalizeRagTuning()).toEqual(DEFAULT_RAG_TUNING);
  });

  it('normalizes persisted strings and supported boolean representations', () => {
    const normalized = normalizeRagTuning(JSON.stringify({
      knowledge_semantic_weight: '0.75',
      chunk_min_tokens: '24',
      chunk_include_heading_context: 'yes',
      embedding_content_char_limit: '4000'
    }));

    expect(normalized).toMatchObject({
      knowledge_semantic_weight: 0.75,
      chunk_min_tokens: 24,
      chunk_include_heading_context: true,
      embedding_content_char_limit: 4000
    });
  });

  it('falls back for invalid and out-of-range untrusted values', () => {
    const normalized = normalizeRagTuning({
      knowledge_keyword_weight: 'not-a-number',
      knowledge_min_score: -0.1,
      chunk_min_tokens: 18.5,
      chunk_include_heading_context: 'maybe',
      embedding_title_weight: 11
    });

    expect(normalized).toMatchObject({
      knowledge_keyword_weight: DEFAULT_RAG_TUNING.knowledge_keyword_weight,
      knowledge_min_score: DEFAULT_RAG_TUNING.knowledge_min_score,
      chunk_min_tokens: DEFAULT_RAG_TUNING.chunk_min_tokens,
      chunk_include_heading_context: DEFAULT_RAG_TUNING.chunk_include_heading_context,
      embedding_title_weight: DEFAULT_RAG_TUNING.embedding_title_weight
    });
  });

  it('strictly validates the canonical complete settings object', () => {
    expect(ragSettingsSchema.safeParse(DEFAULT_RAG_TUNING).success).toBe(true);
    expect(ragSettingsSchema.safeParse({
      ...DEFAULT_RAG_TUNING,
      unexpected: true
    }).success).toBe(false);
    expect(ragSettingsSchema.safeParse({
      ...DEFAULT_RAG_TUNING,
      chunk_min_relevance: 101
    }).success).toBe(false);
  });
});

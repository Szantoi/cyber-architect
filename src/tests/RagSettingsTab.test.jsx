import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RagSettingsTab from '../components/admin/tabs/RagSettingsTab.jsx';

const defaultConfig = {
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
};

function jsonResponse(body, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

describe('RagSettingsTab', () => {
  it('loads the private config and saves a changed query-time weight', async () => {
    const notify = vi.fn();
    const adminFetch = vi.fn(async (url, options) => {
      if (url === '/api/admin/rag-settings' && !options) return jsonResponse({ config: defaultConfig });
      if (url === '/api/admin/rag-settings' && options?.method === 'PUT') {
        return jsonResponse({ config: JSON.parse(options.body) });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<RagSettingsTab adminFetch={adminFetch} onNotify={notify} />);

    const semanticWeight = await screen.findByRole('slider', { name: 'Szemantikus súly' });
    fireEvent.change(semanticWeight, { target: { value: '0.55' } });

    const saveButton = screen.getByRole('button', { name: 'SAVE_RAG_TUNING' });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      '/api/admin/rag-settings',
      expect.objectContaining({ method: 'PUT' })
    ));

    const [, options] = adminFetch.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(JSON.parse(options.body).knowledge_semantic_weight).toBe(0.55);
    expect(notify).toHaveBeenCalledWith('RAG_TUNING_SAVED');
  });
});

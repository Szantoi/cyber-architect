import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeBase from '../components/docs/KnowledgeBase.jsx';

const knowledgeDocument = {
  id: 401,
  slug: 'e2e-knowledge-document',
  title: 'Zárt RAG tudástári dokumentum',
  summary: 'Belső keresési architektúra.',
  content_type: 'knowledge',
  presentation_profile: 'knowledge',
  category: 'RAG',
  dimensions: {},
  read_time: '5 PERC',
  created_at: '2026-08-21',
};

const articleDocument = {
  id: 402,
  slug: 'e2e-blog-document',
  title: 'Publikus blogcikk a RAG-ról',
  summary: 'Közérthető bevezetés a vállalati AI-hoz.',
  content_type: 'blog',
  presentation_profile: 'article',
  category: 'AI',
  dimensions: {},
  read_time: '4 PERC',
  created_at: '2026-08-22',
};

const response = (body) => ({ ok: true, json: vi.fn().mockResolvedValue(body) });

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="unified-corpus-location">{location.pathname}{location.search}</output>;
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('KnowledgeBase unified article corpus', () => {
  it('lists and searches both profiles through the canonical document API, then routes a blog result to its blog reader', async () => {
    const fetchMock = vi.fn((input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/knowledge/taxonomy') return Promise.resolve(response({ dimensions: [], smart_collections: [] }));
      if (url.pathname === '/api/knowledge/projects') return Promise.resolve(response([]));
      if (url.pathname === '/api/documents') return Promise.resolve(response({ documents: [knowledgeDocument, articleDocument] }));
      if (url.pathname === '/api/documents/search') return Promise.resolve(response({ documents: [articleDocument] }));
      if (url.pathname === '/api/documents/e2e-blog-document') return Promise.resolve(response({ ...articleDocument, content: '# Blogcikk' }));
      return Promise.reject(new Error(`Váratlan kérés: ${url.pathname}${url.search}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });

    render(
      <MemoryRouter initialEntries={['/knowledge']}>
        <Routes>
          <Route path="/knowledge/*" element={<KnowledgeBase />} />
          <Route path="/blog/*" element={<div data-testid="blog-reader-route">Blog olvasó</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText(knowledgeDocument.title)).toBeInTheDocument();
    expect(screen.getByText(articleDocument.title)).toBeInTheDocument();
    const sourceBadges = screen.getAllByTestId('vault-document-source');
    expect(sourceBadges).toHaveLength(2);
    expect(sourceBadges.map((badge) => badge.textContent)).toEqual(
      expect.arrayContaining(['TUDÁSTÁR', 'BLOG CIKK']),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/documents')).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: /intelligens rag kereső/i }), { target: { value: 'blog' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
      const url = new URL(String(input), 'http://localhost');
      return url.pathname === '/api/documents/search' && url.searchParams.get('q') === 'blog';
    })).toBe(true));

    fireEvent.click(await screen.findByRole('button', { name: `${articleDocument.title} megnyitása` }));
    expect(await screen.findByTestId('blog-reader-route')).toBeInTheDocument();
    expect(screen.getByTestId('unified-corpus-location')).toHaveTextContent('/blog/e2e-blog-document');
  });
});

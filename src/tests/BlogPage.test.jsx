import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BlogList from '../components/blog/BlogList.jsx';

const articles = [
  {
    id: 301,
    slug: 'rag-cikk',
    title: 'Vállalati RAG biztonság',
    summary: 'Hogyan maradnak a belső adatok kontroll alatt?',
    content_type: 'blog',
    presentation_profile: 'article',
    category: 'AI BIZTONSÁG',
    read_time: '6 PERC',
    created_at: '2026-08-21T10:00:00.000Z',
    updated_at: '2026-08-21T10:00:00.000Z',
  },
  {
    id: 302,
    slug: 'cad-cikk',
    title: 'CAD automatizáció a gyakorlatban',
    summary: 'Adatkinyerés és rajzelőkészítés egy folyamatban.',
    content_type: 'blog',
    presentation_profile: 'article',
    category: 'CAD',
    read_time: '4 PERC',
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-20T10:00:00.000Z',
  },
];

const response = (body) => ({ ok: true, json: vi.fn().mockResolvedValue(body) });

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="blog-location">{location.pathname}{location.search}</output>;
};

const renderBlog = (initialEntry = '/blog') => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/blog/*" element={<><BlogList /><LocationProbe /></>} />
    </Routes>
  </MemoryRouter>,
);

describe('BlogPage', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn((input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/documents') {
        expect(url.searchParams.get('presentation_profile')).toBe('article');
        return Promise.resolve(response({ documents: articles }));
      }
      if (url.pathname === '/api/documents/search') {
        expect(url.searchParams.get('presentation_profile')).toBe('article');
        return Promise.resolve(response({ documents: [articles[0]] }));
      }
      if (url.pathname === '/api/documents/rag-cikk') {
        expect(url.searchParams.get('presentation_profile')).toBe('article');
        return Promise.resolve(response({
          ...articles[0],
          content: '# Biztonságos RAG\n\nA részletes cikk szövege.',
        }));
      }
      return Promise.reject(new Error(`Váratlan kérés: ${url.pathname}${url.search}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the canonical article collection for the lightweight archive and its search', async () => {
    renderBlog();

    expect(await screen.findByRole('heading', { name: /érthető gondolatok/i })).toBeInTheDocument();
    expect(await screen.findByText('Vállalati RAG biztonság')).toBeInTheDocument();
    expect(screen.getByText('CAD automatizáció a gyakorlatban')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('blog-search-input'), { target: { value: 'rag' } });

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
      const url = new URL(String(input), 'http://localhost');
      return url.pathname === '/api/documents/search' && url.searchParams.get('q') === 'rag';
    })).toBe(true));
    expect(screen.getByTestId('blog-location')).toHaveTextContent('/blog?q=rag');
  });

  it('opens a canonical article reader from the archive without returning to the tactical explorer', async () => {
    renderBlog();

    const openButton = await screen.findByRole('button', { name: /vállalati rag biztonság megnyitása/i });
    fireEvent.click(openButton);

    expect(await screen.findByRole('heading', { name: 'Vállalati RAG biztonság' })).toBeInTheDocument();
    expect(screen.getByText('A részletes cikk szövege.')).toBeInTheDocument();
    expect(screen.getByTestId('blog-location')).toHaveTextContent('/blog/rag-cikk');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/documents/rag-cikk?presentation_profile=article'))).toBe(true);
  });
});

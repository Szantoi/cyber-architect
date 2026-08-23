import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TacticalVaultExplorer from '../components/common/TacticalVaultExplorer.jsx';

const projects = [
  { id: 'prj_alpha', name: 'Alfa munkatér', description: 'Első publikus munkatér', color: '#00FFFF', document_count: 1 },
  { id: 'prj_beta', name: 'Béta munkatér', description: 'Második publikus munkatér', color: '#FF00FF', document_count: 1 }
];

const documentFor = (projectId) => ({
  id: projectId === 'prj_alpha' ? 1 : 2,
  slug: `${projectId}-document`,
  title: projectId === 'prj_alpha' ? 'Alfa projekt dokumentum' : 'Béta projekt dokumentum',
  summary: 'Projekt-szintű publikus tudástári tesztdokumentum.',
  category: 'TESZT',
  project_id: projectId,
  dimensions: {},
  read_time: '5 PERC',
  updated_at: '2026-08-21'
});

const response = (body) => ({ ok: true, json: vi.fn().mockResolvedValue(body) });

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="vault-location-search">{location.search}</output>;
};

function createFetchMock() {
  return vi.fn((input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/knowledge/taxonomy') return Promise.resolve(response({ dimensions: [], smart_collections: [] }));
    if (url.pathname === '/api/knowledge/projects') return Promise.resolve(response(projects));

    const projectId = url.searchParams.get('project_id') || 'ALL';
    if (url.pathname === '/api/docs') {
      return Promise.resolve(response({ docs: projectId === 'ALL' ? projects.map(project => documentFor(project.id)) : [documentFor(projectId)] }));
    }
    if (url.pathname === '/api/docs/search') {
      return Promise.resolve(response({ docs: [documentFor(projectId)] }));
    }
    if (url.pathname === '/api/docs/prj_beta-document') {
      return Promise.resolve(response({ ...documentFor('prj_beta'), content: '# Béta projekt dokumentum' }));
    }
    throw new Error(`Unexpected public API request: ${url.pathname}${url.search}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('TacticalVaultExplorer project workspace filter', () => {
  it('loads public projects, preserves project_id in the URL, and scopes list and search requests', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/knowledge?project_id=prj_alpha']}>
        <Routes>
          <Route path="/knowledge/*" element={<><TacticalVaultExplorer /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    );

    const selector = await screen.findByRole('combobox', { name: /projekt \/ munkatér/i });
    expect(selector).toHaveValue('prj_alpha');
    expect(await screen.findByText('Alfa projekt dokumentum')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/docs?project_id=prj_alpha')).toBe(true));

    fireEvent.change(selector, { target: { value: 'prj_beta' } });

    await waitFor(() => expect(screen.getByTestId('vault-location-search')).toHaveTextContent('project_id=prj_beta'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/docs?project_id=prj_beta')).toBe(true));
    expect(await screen.findByText('Béta projekt dokumentum')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /béta projekt dokumentum megnyitása/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/docs/prj_beta-document'));
    expect(screen.getByTestId('vault-location-search')).toHaveTextContent('project_id=prj_beta');
    fireEvent.click(screen.getByTestId('vault-header-title'));
    await waitFor(() => expect(screen.getByTestId('vault-location-search')).toHaveTextContent('project_id=prj_beta'));

    fireEvent.change(screen.getByRole('textbox', { name: /intelligens rag kereső/i }), { target: { value: 'projekt' } });

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
      const searchUrl = new URL(String(input), 'http://localhost');
      return searchUrl.pathname === '/api/docs/search'
        && searchUrl.searchParams.get('q') === 'projekt'
        && searchUrl.searchParams.get('project_id') === 'prj_beta';
    })).toBe(true));
  });
});

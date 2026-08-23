import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ preview: null }));

vi.mock('../context/AdminPreviewContext.jsx', () => ({
  useAdminPreview: () => mocks.preview
}));

import TacticalVaultExplorer from '../components/common/TacticalVaultExplorer.jsx';

const response = (body) => ({ ok: true, json: vi.fn().mockResolvedValue(body) });
const documentItem = {
  id: 42,
  slug: 'vault-elso-dokumentum',
  title: 'Vault első dokumentum',
  summary: 'Szerkeszthető, Vaultban tárolt tesztdokumentum.',
  category: 'TESZT',
  drive_path: 'Content/01_Tudastar/vault-elso-dokumentum/index.md',
  dimensions: {},
  content: '# Vault első dokumentum'
};

function viewerFetch(input) {
  const url = new URL(String(input), 'http://localhost');
  if (url.pathname === '/api/knowledge/taxonomy') return Promise.resolve(response({ dimensions: [], smart_collections: [] }));
  if (url.pathname === '/api/knowledge/projects') return Promise.resolve(response([]));
  if (url.pathname === '/api/docs') return Promise.resolve(response({ docs: [documentItem] }));
  if (url.pathname === '/api/docs/vault-elso-dokumentum') return Promise.resolve(response(documentItem));
  if (url.pathname.endsWith('/related')) return Promise.resolve(response([]));
  return Promise.resolve(response({ docs: [] }));
}

function renderReader() {
  return render(
    <MemoryRouter initialEntries={['/knowledge/vault-elso-dokumentum']}>
      <Routes>
        <Route path="/knowledge/*" element={<TacticalVaultExplorer />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TacticalVaultExplorer contextual Vault editor entry points', () => {
  beforeEach(() => {
    mocks.preview = { canPreview: true, isAdminPreview: false, viewerFetch: vi.fn(viewerFetch) };
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('shows contextual editing for an authenticated admin even in the public preview projection', async () => {
    renderReader();

    expect(await screen.findByTestId('document-contextual-edit')).toBeInTheDocument();
    expect(screen.getByText('VAULT // KANONIKUS')).toBeInTheDocument();
    expect(screen.getByText(/FORRÁS:/)).toHaveTextContent('Content/01_Tudastar/vault-elso-dokumentum/index.md');
  });

  it('does not expose editing controls to a public visitor', async () => {
    mocks.preview = { canPreview: false, isAdminPreview: false, viewerFetch: vi.fn(viewerFetch) };
    renderReader();

    await waitFor(() => expect(screen.getByText('VAULT // KANONIKUS')).toBeInTheDocument());
    expect(screen.queryByTestId('document-contextual-edit')).not.toBeInTheDocument();
  });
});

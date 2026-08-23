import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext.jsx';
import { AdminPreviewProvider, useAdminPreview } from '../context/AdminPreviewContext.jsx';
import AdminPreviewLauncher from '../components/admin/AdminPreviewLauncher.jsx';
import { AdminPreviewVisibilityBadges } from '../components/common/TacticalVaultExplorer.jsx';
import Navbar from '../components/Navbar.jsx';
import { ThemeProvider } from '../context/ThemeContext.jsx';

const TOKEN = 'admin-preview-test-token';

const authPreviewWrapper = ({ children }) => (
  <AuthProvider>
    <AdminPreviewProvider>{children}</AdminPreviewProvider>
  </AuthProvider>
);

const PreviewHarness = () => {
  const location = useLocation();
  const { canPreview } = useAdminPreview();
  return (
    <>
      <Navbar />
      <AdminPreviewLauncher />
      <output data-testid="preview-location">{location.pathname}</output>
      <output data-testid="preview-can">{String(canPreview)}</output>
    </>
  );
};

const PreviewBadgeHarness = () => {
  const { canPreview, exitAdminPreview } = useAdminPreview();
  return (
    <>
      <output data-testid="badge-can-preview">{String(canPreview)}</output>
      <button type="button" onClick={exitAdminPreview}>Publikus nézetre váltás</button>
      <AdminPreviewVisibilityBadges document={{ visibility: 'private', published: 0 }} />
    </>
  );
};

describe('AdminPreviewContext', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('cyber_admin_token', TOKEN);
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
      ok: url === '/api/admin/session',
      status: url === '/api/admin/session' ? 200 : 404,
      json: async () => ({ authenticated: true, role: 'OVERSEER_ADMIN' })
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('uses the server-side admin projection by default and only switches public on explicit choice', async () => {
    const { result } = renderHook(() => useAdminPreview(), { wrapper: authPreviewWrapper });

    await waitFor(() => expect(result.current.canPreview).toBe(true));
    expect(result.current.isAdminPreview).toBe(true);
    globalThis.fetch.mockClear();

    await result.current.viewerFetch('/api/docs');
    const defaultHeaders = new Headers(globalThis.fetch.mock.calls[0][1].headers);
    expect(defaultHeaders.get('X-CA-Preview')).toBe('admin');
    expect(defaultHeaders.get('x-admin-token')).toBe(TOKEN);

    await act(async () => {
      result.current.exitAdminPreview();
    });
    expect(result.current.isAdminPreview).toBe(false);
    expect(result.current.isPublicView).toBe(true);

    await result.current.viewerFetch('/api/docs');
    expect(globalThis.fetch.mock.calls[1][1]).toBeUndefined();

    await act(async () => {
      expect(result.current.enterAdminPreview()).toBe(true);
    });
    expect(result.current.isAdminPreview).toBe(true);

    await result.current.viewerFetch('/api/docs', { headers: { Accept: 'application/json' } });
    const previewHeaders = new Headers(globalThis.fetch.mock.calls[2][1].headers);
    expect(previewHeaders.get('X-CA-Preview')).toBe('admin');
    expect(previewHeaders.get('x-admin-token')).toBe(TOKEN);
    expect(previewHeaders.get('Accept')).toBe('application/json');
  });

  it('uses one top navigation switch for admin and public projections without a persistent preview banner', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <ThemeProvider>
          <AuthProvider>
            <AdminPreviewProvider>
              <PreviewHarness />
            </AdminPreviewProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('admin-view-toggle')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('preview-can')).toHaveTextContent('true'));
    fireEvent.click(screen.getByTestId('admin-preview-open-blog'));

    await waitFor(() => expect(screen.getByTestId('preview-location')).toHaveTextContent('/blog'));
    const viewToggle = screen.getByTestId('admin-view-toggle');
    expect(viewToggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Fő navigáció')).toHaveAttribute('data-admin-active', 'true');

    fireEvent.click(viewToggle);
    await waitFor(() => expect(viewToggle).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByLabelText('Fő navigáció')).toHaveAttribute('data-admin-active', 'false');
    expect(screen.getByTestId('preview-location')).toHaveTextContent('/blog');
  });

  it('labels private and draft records immediately in the authenticated default view', async () => {
    render(
      <AuthProvider>
        <AdminPreviewProvider>
          <PreviewBadgeHarness />
        </AdminPreviewProvider>
      </AuthProvider>
    );

    expect(screen.queryByTestId('admin-preview-visibility-badges')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('badge-can-preview')).toHaveTextContent('true'));

    expect(screen.getByTestId('admin-preview-visibility-badges')).toHaveTextContent('PRIVÁT');
    expect(screen.getByTestId('admin-preview-visibility-badges')).toHaveTextContent('PISZKOZAT');

    fireEvent.click(screen.getByRole('button', { name: 'Publikus nézetre váltás' }));
    expect(screen.queryByTestId('admin-preview-visibility-badges')).not.toBeInTheDocument();
  });
});

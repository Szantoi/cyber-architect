import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminMarkdownEditor from '../components/common/AdminMarkdownEditor.jsx';

const mocks = vi.hoisted(() => ({ auth: null }));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => mocks.auth
}));

vi.mock('../components/markdown/MarkdownRenderer.jsx', async () => {
  const React = await import('react');
  return {
    default: ({ content }) => React.createElement('output', { 'data-testid': 'markdown-preview' }, content)
  };
});

vi.mock('@mdxeditor/editor', async () => {
  const React = await import('react');
  return {
    diffSourcePlugin: vi.fn(() => ({ name: 'diff-source' })),
    MDXEditor: ({ markdown, onChange, trim }) => React.createElement('textarea', {
      'aria-label': 'Markdown forráskód',
      'data-trim': String(trim),
      value: markdown,
      onChange: event => onChange(event.target.value, false)
    })
  };
});

const slug = 'canonikus-cikk';
const rawMarkdown = `---
schema_version: 2
document_id: kb:canonikus-cikk
presentation_profile: knowledge
title: Canonikus cikk
slug: canonikus-cikk
---

# Canonikus cikk

A Vaultban tárolt Markdown.`;

const editableDocument = {
  slug,
  source_path: 'Content/01_Tudastar/canonikus-cikk/index.md',
  content: rawMarkdown,
  revision: 'a'.repeat(64),
  bytes: rawMarkdown.length,
  updated_at: '2026-08-23T06:00:00.000Z'
};

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body)
});

describe('AdminMarkdownEditor', () => {
  beforeEach(() => {
    mocks.auth = { isAuthenticated: true, adminFetch: vi.fn() };
  });

  it('loads and saves the complete canonical Vault Markdown with revision protection', async () => {
    const editedMarkdown = `${rawMarkdown}\n\nFrissítés.`;
    const savedPayload = {
      document: {
        ...editableDocument,
        content: editedMarkdown,
        revision: 'b'.repeat(64)
      },
      sync: { errors: [] }
    };
    mocks.auth.adminFetch.mockImplementation((url, options = {}) => {
      if (url === `/api/admin/vault/documents/${slug}` && options.method === 'PUT') return Promise.resolve(jsonResponse(savedPayload));
      if (url === `/api/admin/vault/documents/${slug}`) return Promise.resolve(jsonResponse({ document: editableDocument }));
      return Promise.reject(new Error(`Váratlan kérés: ${url}`));
    });
    const onSaved = vi.fn();

    render(<AdminMarkdownEditor isOpen documentSlug={slug} onClose={vi.fn()} onSaved={onSaved} />);

    const sourceEditor = await screen.findByRole('textbox', { name: 'Markdown forráskód' });
    expect(sourceEditor).toHaveValue(rawMarkdown);
    expect(sourceEditor).toHaveAttribute('data-trim', 'false');
    expect(mocks.auth.adminFetch).toHaveBeenCalledWith(`/api/admin/vault/documents/${slug}`);
    expect(screen.getByText(/Content\/01_Tudastar\/canonikus-cikk\/index.md/)).toBeInTheDocument();

    fireEvent.change(sourceEditor, { target: { value: editedMarkdown } });
    fireEvent.click(screen.getByRole('tab', { name: 'ELŐNÉZET' }));
    expect(await screen.findByTestId('markdown-preview')).toHaveTextContent('Frissítés.');

    fireEvent.click(screen.getByRole('button', { name: 'MENTÉS // VAULT' }));
    await waitFor(() => expect(mocks.auth.adminFetch).toHaveBeenCalledWith(
      `/api/admin/vault/documents/${slug}`,
      expect.objectContaining({ method: 'PUT' })
    ));
    const [, request] = mocks.auth.adminFetch.mock.calls.find(call => call[1]?.method === 'PUT');
    expect(JSON.parse(request.body)).toEqual({
      content: editedMarkdown,
      revision: 'a'.repeat(64)
    });
    expect(onSaved).toHaveBeenCalledWith(savedPayload);
  });

  it('keeps local changes when the Vault reports a revision conflict', async () => {
    mocks.auth.adminFetch.mockImplementation((url, options = {}) => {
      if (url === `/api/admin/vault/documents/${slug}` && options.method === 'PUT') {
        return Promise.resolve(jsonResponse({
          error: 'VAULT_DOCUMENT_CONFLICT',
          message: 'A dokumentum időközben megváltozott.'
        }, 409));
      }
      if (url === `/api/admin/vault/documents/${slug}`) return Promise.resolve(jsonResponse({ document: editableDocument }));
      return Promise.reject(new Error(`Váratlan kérés: ${url}`));
    });

    render(<AdminMarkdownEditor isOpen documentSlug={slug} onClose={vi.fn()} onSaved={vi.fn()} />);
    const sourceEditor = await screen.findByRole('textbox', { name: 'Markdown forráskód' });
    fireEvent.change(sourceEditor, { target: { value: `${rawMarkdown}\nHelyi módosítás.` } });
    fireEvent.click(screen.getByRole('button', { name: 'MENTÉS // VAULT' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('VERZIÓÜTKÖZÉS // A dokumentum időközben megváltozott.');
    expect(sourceEditor).toHaveValue(`${rawMarkdown}\nHelyi módosítás.`);
    expect(screen.getByRole('button', { name: 'MENTÉS // VAULT' })).toBeDisabled();
  });

  it('does not provide a hidden database-create path when no Vault slug is supplied', async () => {
    render(<AdminMarkdownEditor isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Új dokumentumot az Obsidian sablonból');
    expect(mocks.auth.adminFetch).not.toHaveBeenCalled();
  });

  it('does not mount or request privileged content without an admin session', () => {
    mocks.auth = { isAuthenticated: false, adminFetch: vi.fn() };
    render(<AdminMarkdownEditor isOpen documentSlug={slug} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.auth.adminFetch).not.toHaveBeenCalled();
  });
});

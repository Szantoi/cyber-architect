import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocumentAssetPanel from '../components/common/DocumentAssetPanel.jsx';

const documentId = 42;
const endpoint = `/api/admin/content/documents/${documentId}/assets`;

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body)
});

const diagramAsset = {
  id: 'diagram-01',
  original_name: 'rendszerdiagram.png',
  relative_path: 'media/rendszerdiagram.png',
  url: '/api/documents/canonikus-cikk/assets/diagram-01',
  mime_type: 'image/png',
  byte_size: 2048
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DocumentAssetPanel', () => {
  it('lists only managed, safe asset links without exposing a storage path', async () => {
    const adminFetch = vi.fn().mockResolvedValue(jsonResponse({
      assets: [
        diagramAsset,
        {
          id: 'unsafe-external',
          original_name: 'nem-megbízható-link.pdf',
          relative_path: 'docs/nem-megbízható-link.pdf',
          url: 'https://example.test/private.pdf',
          mime_type: 'application/pdf',
          byte_size: 512
        }
      ]
    }));

    render(<DocumentAssetPanel documentId={documentId} adminFetch={adminFetch} onInsertMarkdown={vi.fn()} />);

    expect(await screen.findByText('rendszerdiagram.png')).toBeInTheDocument();
    expect(screen.getByText(/media\/rendszerdiagram\.png.*image\/png.*2\.0 KB/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MEGNYITÁS' })).toHaveAttribute('href', diagramAsset.url);
    expect(screen.getAllByRole('link', { name: 'MEGNYITÁS' })).toHaveLength(1);
    expect(screen.queryByText(/content-assets|[A-Za-z0-9_-]{24,}/)).not.toBeInTheDocument();
    expect(adminFetch).toHaveBeenCalledWith(endpoint);
  });

  it('uploads a selected asset as a raw binary body with safe logical metadata headers', async () => {
    const uploadedAsset = {
      id: 'brief-01',
      original_name: 'brief.pdf',
      relative_path: 'brief.pdf',
      url: '/api/documents/canonikus-cikk/assets/brief-01',
      mime_type: 'application/pdf',
      byte_size: 13
    };
    const adminFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ assets: [] }))
      .mockResolvedValueOnce(jsonResponse({ asset: uploadedAsset }, 201));

    render(<DocumentAssetPanel documentId={documentId} adminFetch={adminFetch} onInsertMarkdown={vi.fn()} />);
    await screen.findByText(/még nincs feltöltött/i);

    const file = new File(['teszt tartalom'], 'brief.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Dokumentum eszközfájl kiválasztása'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'FELTÖLTÉS' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ method: 'POST', body: expect.any(ArrayBuffer) })
    ));
    const [, request] = adminFetch.mock.calls.find(([url, options]) => url === endpoint && options?.method === 'POST');
    expect(request.headers).toEqual({
      'Content-Type': 'application/octet-stream',
      'X-Content-Asset-Path': 'brief.pdf',
      'X-Content-Asset-Mime-Type': 'application/pdf'
    });
    expect(await screen.findByText('brief.pdf')).toBeInTheDocument();
  });

  it('inserts a managed Markdown reference and deletes an asset only after confirmation', async () => {
    const onInsertMarkdown = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const adminFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ assets: [diagramAsset] }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    render(<DocumentAssetPanel documentId={documentId} adminFetch={adminFetch} onInsertMarkdown={onInsertMarkdown} />);
    await screen.findByText('rendszerdiagram.png');

    fireEvent.click(screen.getByRole('button', { name: 'HIVATKOZÁS BESZÚRÁSA' }));
    expect(onInsertMarkdown).toHaveBeenCalledWith('![rendszerdiagram.png](/api/documents/canonikus-cikk/assets/diagram-01)');

    fireEvent.click(screen.getByRole('button', { name: 'TÖRLÉS' }));
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      `${endpoint}/${encodeURIComponent(diagramAsset.id)}`,
      { method: 'DELETE' }
    ));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('rendszerdiagram.png'));
    await waitFor(() => expect(screen.queryByText('rendszerdiagram.png')).not.toBeInTheDocument());
  });
});

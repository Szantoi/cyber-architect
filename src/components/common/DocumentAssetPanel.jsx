import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

const readResponseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const responseError = (response, payload, fallbackMessage) => {
  const error = new Error(payload?.message || payload?.error || fallbackMessage);
  error.status = response.status;
  return error;
};

const userFacingError = (error, fallbackMessage) => {
  if (error?.message === 'AUTH_REQUIRED') return 'Adminisztrátori munkamenet szükséges a fájlkezeléshez.';
  if (error?.message === 'SESSION_EXPIRED') return 'Az adminisztrátori munkamenet lejárt. Jelentkezz be újra.';
  return error?.message || fallbackMessage;
};

// A managed asset URL is expected to be an API-local, controlled route. This
// prevents an arbitrary response value from becoming a clickable URL in the
// privileged editor. Absolute same-origin URLs are accepted for deployments
// that return them; external URLs deliberately are not.
const safeAssetUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const url = new URL(value.trim(), base);
    if (!/^https?:$/.test(url.protocol) || url.origin !== base) return '';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
};

const safeRelativePath = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) return '';
  return normalized;
};

const assetNameFrom = (asset, relativePath) => {
  const candidate = asset?.name || asset?.original_name || asset?.title || asset?.file_name || relativePath.split('/').at(-1) || 'Csatolmány';
  return String(candidate).slice(0, 240);
};

const normalizeAsset = (asset) => {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return null;
  const id = asset.id ?? asset.asset_id ?? asset.file_id;
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  const relativePath = safeRelativePath(asset.relative_path || asset.path || '');
  const name = assetNameFrom(asset, relativePath);
  return {
    id: String(id),
    name,
    relativePath,
    url: safeAssetUrl(asset.url || asset.public_url || asset.uri || ''),
    contentType: String(asset.content_type || asset.mime_type || '').slice(0, 160),
    size: Number.isFinite(Number(asset.size ?? asset.size_bytes ?? asset.byte_size)) ? Number(asset.size ?? asset.size_bytes ?? asset.byte_size) : null
  };
};

const normalizeAssets = (payload) => (
  Array.isArray(payload?.assets)
    ? payload.assets.map(normalizeAsset).filter(Boolean)
    : []
);

const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
};

const markdownReference = (asset) => {
  if (!asset?.url) return '';
  const label = asset.name.replace(/[\\[\]]/g, '\\$&');
  return /^image\//i.test(asset.contentType)
    ? `![${label}](${asset.url})`
    : `[${label}](${asset.url})`;
};

/**
 * Admin-only UI for the stable, per-document non-text asset storage.
 *
 * Contract:
 * - GET  /api/admin/content/documents/:id/assets -> { assets: [{ id,
 *   original_name, relative_path, url, mime_type, byte_size }] }
 * - POST same URL with raw file bytes, Content-Type `application/octet-stream`,
 *   X-Content-Asset-Path and X-Content-Asset-Mime-Type -> { asset } or { assets }
 * - DELETE /api/admin/content/documents/:id/assets/:assetId -> { success, assets? }
 *
 * `url` must be a same-origin controlled serving route. The component never
 * displays an absolute storage directory and never makes a path executable.
 */
const DocumentAssetPanel = ({ documentId, adminFetch, onInsertMarkdown }) => {
  const fileInputId = useId();
  const fileInputRef = useRef(null);
  const requestIdRef = useRef(0);
  const [assets, setAssets] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const endpoint = documentId
    ? `/api/admin/content/documents/${encodeURIComponent(documentId)}/assets`
    : '';

  const loadAssets = useCallback(async () => {
    if (!endpoint || typeof adminFetch !== 'function') return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError('');
    try {
      const response = await adminFetch(endpoint);
      const payload = await readResponseJson(response);
      if (!response.ok) throw responseError(response, payload, 'A dokumentum eszközei nem tölthetők be.');
      if (requestId !== requestIdRef.current) return;
      setAssets(normalizeAssets(payload));
    } catch (loadError) {
      if (requestId === requestIdRef.current) setError(userFacingError(loadError, 'A dokumentum eszközei nem tölthetők be.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [adminFetch, endpoint]);

  useEffect(() => {
    if (!endpoint) {
      requestIdRef.current += 1;
      setAssets([]);
      setSelectedFile(null);
      setError('');
      setNotice('');
      setIsLoading(false);
      return undefined;
    }
    void loadAssets();
    return () => {
      requestIdRef.current += 1;
    };
  }, [endpoint, loadAssets]);

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setError('');
    setNotice('');
  };

  const uploadAsset = async () => {
    if (!endpoint || !selectedFile || isUploading || typeof adminFetch !== 'function') return;
    setIsUploading(true);
    setError('');
    setNotice('');
    try {
      const bytes = await selectedFile.arrayBuffer();
      const response = await adminFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Content-Asset-Path': selectedFile.name,
          'X-Content-Asset-Mime-Type': selectedFile.type || 'application/octet-stream'
        },
        body: bytes
      });
      const payload = await readResponseJson(response);
      if (!response.ok) throw responseError(response, payload, 'A fájl feltöltése nem sikerült.');

      const returnedAssets = normalizeAssets(payload);
      const returnedAsset = normalizeAsset(payload?.asset);
      if (returnedAssets.length > 0) {
        setAssets(returnedAssets);
      } else if (returnedAsset) {
        setAssets(current => [...current.filter(asset => asset.id !== returnedAsset.id), returnedAsset]);
      } else {
        await loadAssets();
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setNotice('A fájl a dokumentum saját eszköztárába került.');
    } catch (uploadError) {
      setError(userFacingError(uploadError, 'A fájl feltöltése nem sikerült.'));
    } finally {
      setIsUploading(false);
    }
  };

  const deleteAsset = async (asset) => {
    if (!endpoint || deletingAssetId || typeof adminFetch !== 'function') return;
    if (!window.confirm(`Biztosan törlöd ezt a csatolmányt?\n\n${asset.name}`)) return;
    setDeletingAssetId(asset.id);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch(`${endpoint}/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
      const payload = await readResponseJson(response);
      if (!response.ok) throw responseError(response, payload, 'A csatolmány törlése nem sikerült.');
      const returnedAssets = normalizeAssets(payload);
      setAssets(returnedAssets.length > 0 || Array.isArray(payload?.assets)
        ? returnedAssets
        : current => current.filter(item => item.id !== asset.id));
      setNotice('A csatolmány törölve lett a dokumentum eszköztárából.');
    } catch (deleteError) {
      setError(userFacingError(deleteError, 'A csatolmány törlése nem sikerült.'));
    } finally {
      setDeletingAssetId('');
    }
  };

  const insertReference = (asset) => {
    const reference = markdownReference(asset);
    if (!reference) return;
    onInsertMarkdown?.(reference);
    setError('');
    setNotice('A Markdown-hivatkozás bekerült a helyi szerkesztésbe. Mentsd a dokumentumot a közzétételhez.');
  };

  return (
    <section aria-label="Dokumentum eszköztár" className="mt-4 border border-white/10 bg-black/15 p-3 sm:p-4" data-testid="document-asset-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-neonCyan">Dokumentum eszköztár // nem szöveges elemek</p>
          <p className="mt-1 text-[10px] font-medium text-slate-400">Minden fájl kizárólag ehhez a dokumentumhoz tartozó, szerveroldalon kezelt tárba kerül.</p>
        </div>
        {documentId && (
          <button type="button" onClick={() => void loadAssets()} disabled={isLoading || isUploading || Boolean(deletingAssetId)} className="border border-white/20 px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-300 hover:border-neonCyan hover:text-neonCyan disabled:opacity-45">
            {isLoading ? 'FRISSÍTÉS…' : 'FRISSÍTÉS'}
          </button>
        )}
      </div>

      {!documentId && (
        <p className="mt-3 border-l-2 border-amber-300/80 bg-amber-300/10 px-3 py-2 text-[10px] font-bold text-amber-100">Előbb mentsd el az új dokumentumot; utána jelenik meg a saját eszköztára és a feltöltés.</p>
      )}

      {documentId && (
        <>
          <div className="mt-3 flex flex-col gap-2 border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-end">
            <label htmlFor={fileInputId} className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-wide text-neonCyan">
              Fájl kiválasztása
              <input
                ref={fileInputRef}
                id={fileInputId}
                aria-label="Dokumentum eszközfájl kiválasztása"
                type="file"
                onChange={handleFileSelection}
                disabled={isUploading || Boolean(deletingAssetId)}
                className="mt-2 block w-full cursor-pointer border border-white/20 bg-[var(--surface-container)] px-2 py-1.5 text-[11px] font-medium normal-case text-slate-300 file:mr-3 file:border-0 file:bg-neonCyan file:px-2 file:py-1 file:text-[10px] file:font-black file:text-black disabled:cursor-not-allowed"
              />
            </label>
            <button type="button" onClick={() => void uploadAsset()} disabled={!selectedFile || isUploading || Boolean(deletingAssetId)} className="border border-neonCyan px-3 py-2 text-[10px] font-black uppercase text-neonCyan hover:bg-neonCyan hover:text-black disabled:cursor-not-allowed disabled:opacity-45">
              {isUploading ? 'FELTÖLTÉS…' : 'FELTÖLTÉS'}
            </button>
          </div>

          <div aria-live="polite" className="mt-3 min-h-4 text-[10px] font-bold">
            {error && <span role="alert" className="text-neonMagenta">ESZKÖZTÁR HIBA // {error}</span>}
            {!error && notice && <span className="text-plasmaGreen">{notice}</span>}
          </div>

          {isLoading && (
            <div role="status" className="mt-3 border border-neonCyan/25 bg-neonCyan/5 px-3 py-3 text-[10px] font-black uppercase tracking-wide text-neonCyan">CSATOLMÁNYOK BETÖLTÉSE…</div>
          )}

          {!isLoading && !error && assets.length === 0 && (
            <p className="mt-3 border border-dashed border-white/15 px-3 py-3 text-[10px] font-medium text-slate-400">Ehhez a dokumentumhoz még nincs feltöltött nem szöveges elem.</p>
          )}

          {!isLoading && assets.length > 0 && (
            <ul aria-label="Feltöltött dokumentum eszközök" className="mt-3 divide-y divide-white/10 border border-white/10">
              {assets.map(asset => {
                const fileSize = formatFileSize(asset.size);
                const reference = markdownReference(asset);
                return (
                  <li key={asset.id} className="flex flex-col gap-2 bg-black/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-on-surface" title={asset.name}>{asset.name}</p>
                      <p className="mt-1 break-all text-[10px] font-medium text-slate-400">
                        {[asset.relativePath, asset.contentType, fileSize].filter(Boolean).join(' // ') || 'Kezelt csatolmány'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {asset.url && <a href={asset.url} target="_blank" rel="noreferrer" className="border border-white/20 px-2 py-1.5 text-[10px] font-black text-slate-300 hover:border-neonCyan hover:text-neonCyan">MEGNYITÁS</a>}
                      {reference && <button type="button" onClick={() => insertReference(asset)} className="border border-neonCyan/70 px-2 py-1.5 text-[10px] font-black text-neonCyan hover:bg-neonCyan hover:text-black">HIVATKOZÁS BESZÚRÁSA</button>}
                      <button type="button" onClick={() => void deleteAsset(asset)} disabled={Boolean(deletingAssetId)} className="border border-neonMagenta/80 px-2 py-1.5 text-[10px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-white disabled:cursor-wait disabled:opacity-45">
                        {deletingAssetId === asset.id ? 'TÖRLÉS…' : 'TÖRLÉS'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
};

export default DocumentAssetPanel;

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MDXEditor, diffSourcePlugin } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { useAuth } from '../../context/AuthContext.jsx';
import MarkdownRenderer from '../markdown/MarkdownRenderer.jsx';

const EDITOR_STYLE = {
  '--basePageBg': 'var(--surface-panel)',
  '--baseBg': 'var(--surface-container)',
  '--baseBgSubtle': 'var(--surface-subtle)',
  '--baseBgHover': 'var(--surface-container-high)',
  '--baseText': 'var(--text-main)',
  '--baseTextContrast': 'var(--bg-main)',
  '--baseBorder': 'var(--border-main)',
  '--baseBorderHover': 'var(--neon-cyan)',
  '--accentBase': 'var(--neon-cyan)',
  '--accentBg': 'rgba(0, 251, 251, 0.11)',
  '--accentBgHover': 'rgba(0, 251, 251, 0.2)',
  '--accentText': 'var(--text-main)',
  '--accentTextContrast': '#020617',
  '--radius-base': '0px',
  '--radius-small': '0px',
  '--radius-medium': '0px',
  '--radius-large': '0px',
  '--font-body': 'var(--font-body, ui-sans-serif, system-ui, sans-serif)',
  '--font-mono': 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)'
};

const editorPlugins = [diffSourcePlugin({ viewMode: 'source' })];

async function readResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(response, payload, fallbackMessage) {
  const error = new Error(payload?.message || payload?.error || fallbackMessage);
  error.status = response.status;
  error.payload = payload;
  return error;
}

function userFacingError(error, fallbackMessage) {
  if (error?.message === 'AUTH_REQUIRED') return 'Adminisztrátori munkamenet szükséges a szerkesztéshez.';
  if (error?.message === 'SESSION_EXPIRED') return 'Az adminisztrátori munkamenet lejárt. Jelentkezz be újra.';
  return error?.message || fallbackMessage;
}

function documentSnapshot(document) {
  return String(document?.content || '');
}

/**
 * Canonical Vault editor. The editable representation is the complete
 * Markdown file, including frontmatter. SQLite/RAG is refreshed only after
 * the atomic vault write succeeds, so this component has no DB authoring or
 * DB asset-storage path.
 */
const AdminMarkdownEditor = ({
  isOpen,
  documentSlug = '',
  onClose,
  onSaved
}) => {
  const { adminFetch, isAuthenticated } = useAuth();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const requestIdRef = useRef(0);
  const [document, setDocument] = useState(null);
  const [originalSnapshot, setOriginalSnapshot] = useState('');
  const [view, setView] = useState('source');
  const [editorVersion, setEditorVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [conflict, setConflict] = useState(null);
  const titleId = useId();
  const descriptionId = useId();

  const loadEditor = useCallback(async () => {
    if (typeof adminFetch !== 'function') return;
    if (!documentSlug) {
      setDocument(null);
      setLoadError('Új dokumentumot az Obsidian sablonból, a Content/ könyvtárban hozz létre.');
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setLoadError('');
    setSaveError('');
    setSaveNotice('');
    setConflict(null);

    try {
      const response = await adminFetch(`/api/admin/vault/documents/${encodeURIComponent(documentSlug)}`);
      const payload = await readResponseJson(response);
      if (!response.ok) throw responseError(response, payload, 'A Vault-dokumentum betöltése nem sikerült.');
      if (!payload?.document || typeof payload.document.content !== 'string' || !payload.document.revision) {
        throw new Error('A szerver érvénytelen Vault-dokumentumválaszt küldött.');
      }
      if (requestId !== requestIdRef.current) return;
      setDocument(payload.document);
      setOriginalSnapshot(documentSnapshot(payload.document));
      setView('source');
      setEditorVersion(version => version + 1);
    } catch (error) {
      if (requestId === requestIdRef.current) setLoadError(userFacingError(error, 'A szerkesztő betöltése nem sikerült.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [adminFetch, documentSlug]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated || typeof adminFetch !== 'function') return undefined;
    void loadEditor();
    return () => {
      requestIdRef.current += 1;
    };
  }, [adminFetch, isAuthenticated, isOpen, loadEditor]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return undefined;
    previousFocusRef.current = window.document.activeElement;
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      const previousFocus = previousFocusRef.current;
      if (previousFocus instanceof HTMLElement && window.document.contains(previousFocus)) previousFocus.focus();
    };
  }, [isAuthenticated, isOpen]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !isSaving) {
        event.preventDefault();
        onClose?.();
      }
    };
    window.document.addEventListener('keydown', handleEscape);
    return () => window.document.removeEventListener('keydown', handleEscape);
  }, [isAuthenticated, isOpen, isSaving, onClose]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!document || isLoading || isSaving || conflict) return;

    setIsSaving(true);
    setSaveError('');
    setSaveNotice('');
    try {
      const response = await adminFetch(`/api/admin/vault/documents/${encodeURIComponent(document.slug)}`, {
        method: 'PUT',
        body: JSON.stringify({
          content: document.content,
          revision: document.revision
        })
      });
      const payload = await readResponseJson(response);
      if (response.status === 409) {
        setConflict({
          message: payload?.message || payload?.error || 'A dokumentum időközben megváltozott.',
          document: payload?.document || null
        });
        return;
      }
      if (!response.ok) throw responseError(response, payload, 'A Vault-dokumentum mentése nem sikerült.');
      if (!payload?.document || typeof payload.document.content !== 'string' || !payload.document.revision) {
        throw new Error('A szerver érvénytelen Vault-mentési választ küldött.');
      }

      setDocument(payload.document);
      setOriginalSnapshot(documentSnapshot(payload.document));
      setEditorVersion(version => version + 1);
      setSaveNotice(payload?.sync?.errors?.length
        ? 'A fájl elmentve, de a vetület frissítése hibát jelzett.'
        : 'A Vault-fájl és a SQLite/RAG vetület frissült.');
      onSaved?.(payload);
    } catch (error) {
      setSaveError(userFacingError(error, 'A Vault-dokumentum mentése nem sikerült.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDialogKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
    ) || []).filter(element => element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && window.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && window.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const isDirty = Boolean(document) && originalSnapshot !== '' && originalSnapshot !== documentSnapshot(document);
  const canSave = Boolean(document?.content.trim()) && !isLoading && !isSaving && !conflict;

  if (!isOpen || !isAuthenticated || typeof adminFetch !== 'function') return null;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-[#02030a]/90 p-3 font-mono backdrop-blur-md sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleDialogKeyDown}
        className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden border-2 border-neonCyan bg-[var(--surface-panel)] shadow-[0_0_0_1px_rgba(0,251,251,0.16),0_0_52px_rgba(0,251,251,0.18)] sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="corner-bracket-tl text-neonCyan" aria-hidden="true" />
        <div className="corner-bracket-br text-neonMagenta" aria-hidden="true" />

        <header className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-white/10 bg-black/30 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neonCyan">Admin // kanonikus Obsidian Vault</p>
            <h2 id={titleId} className="mt-1 font-headline text-lg font-black uppercase italic text-on-surface sm:text-2xl">
              {document?.slug ? `DOKUMENTUM // ${document.slug}` : 'VAULT-DOKUMENTUM'}
            </h2>
            <p id={descriptionId} className="mt-2 break-all text-[10px] font-bold text-slate-400">
              {document?.source_path ? `Forrás: ${document.source_path}` : 'A teljes fájl (frontmatterrel együtt) az elsődleges szerkesztési felület.'}
              {document?.revision ? ` // revízió: ${document.revision.slice(0, 12)}` : ''}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => onClose?.()}
            disabled={isSaving}
            aria-label="Szerkesztő bezárása"
            className="shrink-0 border border-white/20 px-3 py-2 text-xs font-black text-slate-300 transition-colors hover:border-neonMagenta hover:bg-neonMagenta hover:text-white disabled:cursor-wait disabled:opacity-50"
          >
            ✕ <span className="hidden sm:inline">BEZÁRÁS</span>
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <div role="tablist" aria-label="Markdown szerkesztő nézetei" className="flex flex-wrap gap-2">
            {[
              ['source', 'FORRÁS // MARKDOWN'],
              ['preview', 'ELŐNÉZET']
            ].map(([value, label]) => (
              <button
                key={value}
                id={`admin-markdown-${value}-tab`}
                type="button"
                role="tab"
                aria-selected={view === value}
                aria-controls={`admin-markdown-${value}-panel`}
                onClick={() => setView(value)}
                disabled={isLoading || !document}
                className={`border px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors disabled:cursor-wait disabled:opacity-50 ${
                  view === value ? 'border-neonCyan bg-neonCyan text-black' : 'border-white/20 text-slate-300 hover:border-neonCyan hover:text-neonCyan'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className={`text-[10px] font-black uppercase ${isDirty ? 'text-neonMagenta' : 'text-plasmaGreen'}`}>
            {isDirty ? 'NEM MENTETT MÓDOSÍTÁS' : 'MENTETT ÁLLAPOT'}
          </span>
        </div>

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {isLoading && (
              <div role="status" className="flex min-h-64 items-center justify-center border border-neonCyan/30 bg-black/20 text-xs font-black uppercase tracking-widest text-neonCyan">
                VAULT-SZERKESZTŐ BETÖLTÉSE…
              </div>
            )}

            {!isLoading && loadError && (
              <div role="alert" className="border-l-4 border-neonMagenta bg-neonMagenta/10 p-4 text-xs font-bold text-on-surface">
                <p className="text-neonMagenta">BETÖLTÉSI HIBA // {loadError}</p>
                {documentSlug && (
                  <button type="button" onClick={() => void loadEditor()} className="mt-3 border border-neonMagenta px-3 py-2 text-[10px] font-black uppercase text-neonMagenta hover:bg-neonMagenta hover:text-white">
                    ÚJRAPRÓBÁLÁS
                  </button>
                )}
              </div>
            )}

            {!isLoading && !loadError && conflict && (
              <div role="alert" className="mb-4 border-l-4 border-amber-300 bg-amber-300/10 p-4 text-xs font-bold text-on-surface">
                <p className="text-amber-300">VERZIÓÜTKÖZÉS // {conflict.message}</p>
                <p className="mt-2 text-slate-300">A helyi módosításaid megmaradtak. Töltsd be az aktuális Vault-verziót, majd egyesítsd kézzel.</p>
                <button type="button" onClick={() => void loadEditor()} className="mt-3 border border-amber-300 px-3 py-2 text-[10px] font-black uppercase text-amber-300 hover:bg-amber-300 hover:text-black">
                  VAULT-VERZIÓ ÚJRATÖLTÉSE
                </button>
              </div>
            )}

            {!isLoading && !loadError && !conflict && document && (
              <>
                <div className="border border-neonCyan/30 bg-neonCyan/5 p-3 text-[10px] font-medium text-slate-300">
                  A YAML frontmatter, a normál <code>[[wikilink]]</code>, a <code>ca_graph_refs</code> és a <code>CA:RELATIONS</code> blokk is ebben a fájlban él. A <code>CA:SYSTEM</code> blokk rendszerkezelt; azt ne módosítsd.
                </div>

                {view === 'source' && (
                  <div id="admin-markdown-source-panel" role="tabpanel" aria-labelledby="admin-markdown-source-tab" className="mt-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-neonCyan">Markdown forrás // kanonikus Vault-fájl</p>
                    <MDXEditor
                      key={`${document.slug}-${editorVersion}`}
                      markdown={document.content}
                      trim={false}
                      spellCheck={false}
                      onChange={(markdown, initialMarkdownNormalize) => {
                        if (!initialMarkdownNormalize) setDocument(current => ({ ...current, content: markdown }));
                      }}
                      plugins={editorPlugins}
                      className="min-h-[420px] border border-white/15 bg-[var(--surface-container)] text-on-surface"
                      style={EDITOR_STYLE}
                    />
                  </div>
                )}

                {view === 'preview' && (
                  <div id="admin-markdown-preview-panel" role="tabpanel" aria-labelledby="admin-markdown-preview-tab" className="mt-4 min-h-[420px] border border-neonCyan/30 bg-[var(--bg-main)] p-4 text-on-surface sm:p-6">
                    <p className="mb-5 border-b border-white/10 pb-3 text-[10px] font-black uppercase tracking-widest text-neonCyan">A teljes Vault-forrás előnézete</p>
                    <MarkdownRenderer content={document.content} />
                  </div>
                )}
              </>
            )}
          </div>

          <footer className="flex shrink-0 flex-col gap-3 border-t-2 border-white/10 bg-black/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div aria-live="polite" className="min-h-5 text-[10px] font-bold">
              {saveError && <span className="text-neonMagenta">MENTÉSI HIBA // {saveError}</span>}
              {!saveError && saveNotice && <span className="text-plasmaGreen">MENTVE // {saveNotice}</span>}
              {!saveError && !saveNotice && isDirty && <span className="text-slate-400">A mentés optimista verzióellenőrzéssel és Vaulton belüli mentéssel történik.</span>}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => onClose?.()} disabled={isSaving} className="border-2 border-white/20 px-4 py-2.5 text-xs font-black uppercase text-slate-300 hover:border-white hover:bg-white hover:text-black disabled:opacity-50">Mégse</button>
              <button type="submit" disabled={!canSave || !isDirty} className="border-2 border-neonCyan bg-neonCyan px-5 py-2.5 text-xs font-black uppercase text-black shadow-[3px_3px_0_#020617] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45">
                {isSaving ? 'MENTÉS FOLYAMATBAN…' : 'MENTÉS // VAULT'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default AdminMarkdownEditor;

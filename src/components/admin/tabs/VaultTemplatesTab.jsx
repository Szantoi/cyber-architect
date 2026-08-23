import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Code2,
  Database,
  Eye,
  FileText,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2
} from 'lucide-react';

const TEMPLATES_URL = '/api/admin/vault/templates';
const NEW_TEMPLATE_ID = '__new_vault_template__';
const EMPTY_LIST = Object.freeze([]);

const TEMPLATE_ICON_OPTIONS = Object.freeze([
  { value: 'file-text', label: 'DOKUMENTUM', Icon: FileText },
  { value: 'book-open', label: 'TUDÁSTÁR', Icon: BookOpen },
  { value: 'database', label: 'SQL / ADAT', Icon: Database },
  { value: 'folder', label: 'PROJEKT', Icon: FolderOpen },
  { value: 'code-2', label: 'SPECIFIKÁCIÓ', Icon: Code2 },
  { value: 'sparkles', label: 'SMART / AUTOMATA', Icon: Sparkles }
]);

const inputClass = 'min-h-10 w-full border border-white/15 bg-slate-950 px-3 font-mono text-xs text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-neonCyan disabled:cursor-not-allowed disabled:opacity-60';

const text = (value) => String(value ?? '').trim();
const safeColor = (value) => /^#[0-9a-fA-F]{6}$/.test(text(value)) ? text(value).toUpperCase() : '#00FBFB';
const toSlug = (value) => text(value)
  .toLocaleLowerCase('hu-HU')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'uj-vault-sablon';

const normalizePresentationProfile = (value, legacyContentType = '') => {
  const candidate = text(value || legacyContentType).toLowerCase();
  return candidate === 'article' || candidate === 'blog' ? 'article' : 'knowledge';
};

const normalizeDocumentRole = (value, legacyContentType = '') => {
  const candidate = text(value || legacyContentType).toLowerCase();
  return /^[a-z][a-z0-9_-]{0,79}$/.test(candidate) && !['knowledge', 'blog', 'article'].includes(candidate)
    ? candidate
    : 'document';
};

const createTemplateDraft = () => ({
  id: 'uj-vault-sablon',
  title: 'ÚJ VAULT SABLON',
  description: '',
  icon_key: 'file-text',
  color: '#00FBFB',
  presentation_profile: 'knowledge',
  document_role: 'document',
  project_id: '',
  body: '# {{title}}\n\n## Kontextus\n\n\n## Szakmai jegyzet\n\n',
  updated_at: ''
});

const normalizeTemplate = (value = {}) => ({
  id: text(value.id),
  title: text(value.title) || 'NÉVTELEN SABLON',
  description: String(value.description ?? ''),
  icon_key: text(value.icon_key) || 'file-text',
  color: safeColor(value.color),
  presentation_profile: normalizePresentationProfile(value.presentation_profile, value.content_type),
  document_role: normalizeDocumentRole(value.document_role, value.content_type),
  project_id: text(value.project_id),
  body: String(value.body ?? ''),
  updated_at: text(value.updated_at)
});

const readJson = async (response) => response.json().catch(() => ({}));
const unwrapTemplate = (payload) => payload?.template || payload?.item || payload?.data || payload || {};
const unpackTemplates = (payload) => {
  const list = Array.isArray(payload) ? payload : (payload?.templates || payload?.items || payload?.data || EMPTY_LIST);
  return Array.isArray(list) ? list.map(normalizeTemplate) : EMPTY_LIST;
};

const formatTime = (value) => {
  if (!value) return 'MÉG NINCS MENTETT VERZIÓ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('hu-HU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const lineCount = (value) => value ? String(value).split(/\r?\n/).length : 0;

const yamlValue = (value) => JSON.stringify(String(value ?? ''));

function Field({ label, hint, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.13em] text-slate-500">
      <span>{label}</span>
      {children}
      {hint && <span className="normal-case tracking-normal text-slate-600">{hint}</span>}
    </label>
  );
}

function TemplateGlyph({ iconKey, className = '', size = 16 }) {
  const option = TEMPLATE_ICON_OPTIONS.find(item => item.value === iconKey) || TEMPLATE_ICON_OPTIONS[0];
  const Icon = option.Icon;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

function StaticMetadataPreview({ template }) {
  const metadata = [
    ['TEMPLATE ID', template.id || 'MENTÉSKOR KÉPZŐDIK'],
    ['MEGJELENÍTÉSI PROFIL', template.presentation_profile || 'knowledge'],
    ['DOKUMENTUMSZEREP', template.document_role || 'document'],
    ['PROJECT BINDING', template.project_id || 'NINCS · GLOBÁLIS'],
    ['ICON KEY', template.icon_key || 'file-text'],
    ['COLOR', safeColor(template.color)],
    ['LAST SERVER WRITE', formatTime(template.updated_at)],
    ['BODY SIZE', `${template.body.length} KARAKTER · ${lineCount(template.body)} SOR`]
  ];
  const frontmatter = `---\ntemplate_id: ${yamlValue(template.id)}\npresentation_profile: ${yamlValue(template.presentation_profile)}\ndocument_role: ${yamlValue(template.document_role)}\nproject_id: ${yamlValue(template.project_id)}\ntemplate_icon: ${yamlValue(template.icon_key)}\ntemplate_color: ${yamlValue(safeColor(template.color))}\n---`;

  return (
    <aside aria-label="Sablon statikus metaadat előnézet" className="relative overflow-hidden border border-neonCyan/30 bg-black/30 p-4">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(0,251,251,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,.05)_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative flex items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-neonCyan">STATIC METADATA // PREVIEW</p>
          <p className="mt-1 font-mono text-[9px] leading-relaxed text-slate-500">A központi katalógus adatai; a sablon törzse ettől elkülönülten tárolódik.</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center border border-neonCyan/40" style={{ color: safeColor(template.color) }}><TemplateGlyph iconKey={template.icon_key} size={16} /></span>
      </div>
      <dl className="relative mt-3 space-y-2">
        {metadata.map(([label, value]) => <div key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 border-b border-white/[0.06] pb-2 font-mono text-[9px]"><dt className="font-black tracking-[0.09em] text-slate-600">{label}</dt><dd className="min-w-0 break-words text-slate-300">{value}</dd></div>)}
      </dl>
      <div className="relative mt-4 border border-white/10 bg-slate-950/80 p-3">
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.13em] text-plasmaGreen"><Eye size={12} /> FRONTMATTER-READY HEADER</p>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-400">{frontmatter}</pre>
      </div>
    </aside>
  );
}

const VaultTemplatesTab = ({ adminFetch, onNotify }) => {
  const [templates, setTemplates] = useState(EMPTY_LIST);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const request = useCallback(async (url, options = {}) => {
    const response = await adminFetch(url, options);
    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload.error || payload.message || `HTTP_${response.status}`);
    return payload;
  }, [adminFetch]);

  const loadTemplates = useCallback(async (preferredId = '') => {
    setLoadingList(true);
    setError('');
    try {
      const payload = await request(TEMPLATES_URL);
      const nextTemplates = unpackTemplates(payload);
      setTemplates(nextTemplates);
      setSelectedId(current => {
        const candidate = preferredId || current;
        return candidate !== NEW_TEMPLATE_ID && nextTemplates.some(item => item.id === candidate)
          ? candidate
          : (nextTemplates[0]?.id || '');
      });
    } catch (loadError) {
      setError(`SABLONKATALÓGUS_NEM_ELÉRHETŐ: ${loadError.message}`);
      setTemplates(EMPTY_LIST);
    } finally {
      setLoadingList(false);
    }
  }, [request]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      setBaseline(null);
      return undefined;
    }
    if (selectedId === NEW_TEMPLATE_ID) {
      const nextDraft = createTemplateDraft();
      setDraft(nextDraft);
      setBaseline(nextDraft);
      return undefined;
    }

    let active = true;
    const loadTemplate = async () => {
      setLoadingTemplate(true);
      setError('');
      try {
        const payload = await request(`${TEMPLATES_URL}/${encodeURIComponent(selectedId)}`);
        if (!active) return;
        const nextDraft = normalizeTemplate(unwrapTemplate(payload));
        setDraft(nextDraft);
        setBaseline(nextDraft);
      } catch (loadError) {
        if (active) setError(`SABLON_BETÖLTÉSI_HIBA: ${loadError.message}`);
      } finally {
        if (active) setLoadingTemplate(false);
      }
    };
    loadTemplate();
    return () => { active = false; };
  }, [request, selectedId]);

  const isNew = selectedId === NEW_TEMPLATE_ID;
  const dirty = Boolean(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline));

  const updateDraft = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const chooseTemplate = (id) => {
    if (dirty && !window.confirm('NEM MENTETT SABLONMÓDOSÍTÁS VAN. ELDOBOD ÉS MÁS SABLONT NYITSZ MEG?')) return;
    setSelectedId(id);
  };
  const beginNewTemplate = () => {
    if (dirty && !window.confirm('NEM MENTETT MÓDOSÍTÁS VAN. ÚJ SABLONT NYITSZ HELYETTE?')) return;
    setSelectedId(NEW_TEMPLATE_ID);
  };

  const saveTemplate = async (event) => {
    event.preventDefault();
    if (!draft) return;
    const payload = {
      id: text(draft.id),
      title: text(draft.title),
      description: String(draft.description ?? ''),
      icon_key: text(draft.icon_key) || 'file-text',
      color: safeColor(draft.color),
      presentation_profile: normalizePresentationProfile(draft.presentation_profile),
      document_role: normalizeDocumentRole(draft.document_role),
      project_id: text(draft.project_id),
      body: String(draft.body ?? '')
    };
    // The server keeps a saved template's identifier immutable so filenames,
    // links and audited history cannot drift during an edit.
    if (!isNew) delete payload.id;
    if (!payload.id || !payload.title) {
      onNotify('SABLON_AZONOSÍTÓ_ÉS_CÍM_KÖTELEZŐ', true);
      return;
    }

    setSaving(true);
    try {
      const target = isNew ? TEMPLATES_URL : `${TEMPLATES_URL}/${encodeURIComponent(selectedId)}`;
      const response = await request(target, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(payload) });
      const returned = normalizeTemplate(unwrapTemplate(response));
      const persistedId = returned.id || payload.id;
      onNotify(isNew ? 'VAULT_TEMPLATE_CREATED' : 'VAULT_TEMPLATE_SAVED');
      await loadTemplates(persistedId);
    } catch (saveError) {
      onNotify(`VAULT_TEMPLATE_SAVE_FAILED: ${saveError.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async () => {
    if (!draft || isNew) return;
    if (!window.confirm(`TÖRLÖD A KÖZPONTI SABLONT?\n\n${draft.title}\n${draft.id}`)) return;
    setSaving(true);
    try {
      await request(`${TEMPLATES_URL}/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
      onNotify('VAULT_TEMPLATE_DELETED');
      setSelectedId('');
      await loadTemplates();
    } catch (deleteError) {
      onNotify(`VAULT_TEMPLATE_DELETE_FAILED: ${deleteError.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="relative overflow-hidden border-2 border-slate-900 bg-[#06111d] shadow-[7px_7px_0_#0f172a] dark:border-white/10 dark:shadow-none">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(0,251,251,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,.04)_1px,transparent_1px)] [background-size:28px_28px]" />
      <header className="relative flex flex-col gap-4 border-b border-white/10 bg-slate-950/90 px-5 py-5 md:flex-row md:items-start md:justify-between md:px-7">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-neonCyan"><Database size={14} /> SQL → MARKDOWN // TEMPLATE CATALOG</p>
          <h2 className="mt-2 font-headline text-2xl font-black uppercase tracking-tight text-white">Központi Vault sablonok</h2>
          <p className="mt-2 max-w-3xl font-body text-xs leading-relaxed text-slate-400">A katalogizált Vault-sablonok teljes Markdown-fájlok. A <code>ca_sql_project_index</code> törzse a következő SQL-projekt generálásakor érvényesül, miközben annak kontrollált frontmatterét továbbra is a generátor állítja elő.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-plasmaGreen/50 bg-plasmaGreen/10 px-2.5 py-2 font-mono text-[9px] font-black text-plasmaGreen">{templates.length} SABLON</span>
          <button type="button" onClick={() => loadTemplates(selectedId)} disabled={loadingList || saving} className="inline-flex min-h-9 items-center gap-1.5 border border-white/15 px-2.5 font-mono text-[9px] font-black text-slate-300 transition-colors hover:border-neonCyan hover:text-neonCyan disabled:opacity-50"><RefreshCw size={12} className={loadingList ? 'animate-spin' : ''} /> FRISSÍTÉS</button>
        </div>
      </header>

      <div className="relative grid min-h-[38rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside aria-label="Központi sablonkatalógus" className="border-b border-white/10 bg-black/25 p-4 lg:border-b-0 lg:border-r">
          <button type="button" onClick={beginNewTemplate} disabled={saving} className="flex min-h-11 w-full items-center justify-center gap-2 border border-neonCyan bg-neonCyan/10 px-3 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950 disabled:opacity-50"><Plus size={14} /> ÚJ SABLON</button>
          <div className="mt-4 flex items-center justify-between border-b border-white/10 pb-2"><p className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">REGISTRY LIST</p><span className="font-mono text-[9px] text-slate-600">{loadingList ? 'SYNC...' : `${templates.length} ENTRY`}</span></div>
          <div className="mt-2 max-h-[30rem] space-y-1 overflow-y-auto pr-1">
            {loadingList && !templates.length && <p className="p-4 font-mono text-[10px] text-slate-500"><LoaderCircle size={13} className="mr-2 inline animate-spin text-neonCyan" />BETÖLTÉS…</p>}
            {!loadingList && !templates.length && <p className="p-4 font-mono text-[10px] leading-relaxed text-slate-500">A katalógus még üres. Az első SQL-vezérelt Markdown vázat itt hozhatod létre.</p>}
            {templates.map(template => {
              const active = selectedId === template.id;
              return <button key={template.id} type="button" onClick={() => chooseTemplate(template.id)} className={`group w-full border p-3 text-left transition-colors ${active ? 'border-neonCyan bg-neonCyan/10' : 'border-transparent hover:border-white/15 hover:bg-white/[.035]'}`} aria-current={active ? 'true' : undefined}>
                <span className="flex items-start gap-2.5"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center border border-white/15" style={{ color: safeColor(template.color) }}><TemplateGlyph iconKey={template.icon_key} size={14} /></span><span className="min-w-0"><span className="block truncate font-mono text-[10px] font-black uppercase tracking-[0.07em] text-slate-100">{template.title}</span><span className="mt-1 block truncate font-mono text-[9px] text-slate-500">{template.id} · {template.presentation_profile} · {template.document_role}</span></span></span>
              </button>;
            })}
          </div>
        </aside>

        <div className="p-4 md:p-6">
          {error && <div role="alert" className="mb-4 border border-neonMagenta/60 bg-neonMagenta/10 p-3 font-mono text-[10px] text-neonMagenta">{error}</div>}
          {!draft && !loadingTemplate && <div className="grid min-h-80 place-items-center border border-dashed border-white/15 bg-black/20 p-8 text-center"><div><FileText size={30} className="mx-auto text-neonCyan" /><p className="mt-4 font-mono text-xs font-black uppercase tracking-[0.14em] text-slate-300">Válassz vagy hozz létre egy sablont</p><p className="mt-2 max-w-sm font-mono text-[10px] leading-relaxed text-slate-500">A sablonok közös vázat adnak az SQL-ből indított Markdown-folyamatoknak.</p></div></div>}
          {loadingTemplate && <div className="grid min-h-80 place-items-center border border-white/10 bg-black/20"><p className="font-mono text-[10px] font-black text-neonCyan"><LoaderCircle size={14} className="mr-2 inline animate-spin" />SABLON BETÖLTÉSE…</p></div>}
          {draft && !loadingTemplate && <form onSubmit={saveTemplate} className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4"><div><p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-neonMagenta">{isNew ? 'NEW BLUEPRINT // DRAFT' : 'CENTRAL BLUEPRINT // EDIT'}</p><h3 className="mt-1 flex items-center gap-2 font-headline text-lg font-black uppercase text-white"><TemplateGlyph iconKey={draft.icon_key} className="text-neonCyan" size={18} /> {draft.title}</h3></div><span className={`border px-2 py-1 font-mono text-[9px] font-black ${dirty ? 'border-amber-300/70 text-amber-300' : 'border-plasmaGreen/60 text-plasmaGreen'}`}>{dirty ? 'UNSAVED DELTA' : 'SERVER SYNCHRONIZED'}</span></div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="TEMPLATE ID" hint={isNew ? 'Stabil, URL- és frontmatter-barát azonosító.' : 'A mentett azonosító változatlan marad.'}><input required disabled={!isNew} pattern="^[a-z0-9][a-z0-9_-]*$" value={draft.id} onChange={event => updateDraft('id', toSlug(event.target.value).replace(/-/g, '_'))} className={inputClass} aria-label="Sablon azonosító" /></Field>
                  <Field label="MEGJELENŐ CÍM"><input required value={draft.title} onChange={event => updateDraft('title', event.target.value)} className={inputClass} aria-label="Sablon címe" /></Field>
                  <Field label="MEGJELENÍTÉSI PROFIL" hint="Csak a webes nézetet választja ki; a dokumentumséma azonos."><select value={draft.presentation_profile} onChange={event => updateDraft('presentation_profile', normalizePresentationProfile(event.target.value))} className={inputClass} aria-label="Sablon megjelenítési profilja"><option value="knowledge">TUDÁSTÁR · knowledge</option><option value="article">CIKK / ESETTANULMÁNY · article</option></select></Field>
                  <Field label="DOKUMENTUMSZEREP" hint="A dokumentum szakmai szerepe, nem a webes megjelenése."><input required list="vault-template-document-roles" value={draft.document_role} onChange={event => updateDraft('document_role', normalizeDocumentRole(event.target.value))} className={inputClass} aria-label="Sablon dokumentumszerepe" /><datalist id="vault-template-document-roles"><option value="document" /><option value="project" /><option value="epic" /><option value="task" /><option value="meeting" /><option value="decision" /><option value="asset_package" /><option value="article" /></datalist></Field>
                  <Field label="PROJECT ID · OPCIONÁLIS" hint="Üresen hagyva a sablon globális."><input value={draft.project_id} onChange={event => updateDraft('project_id', event.target.value)} className={inputClass} aria-label="Sablon projekthez kötése" placeholder="PRJ-2026-884" /></Field>
                  <Field label="IKON"><select value={draft.icon_key} onChange={event => updateDraft('icon_key', event.target.value)} className={inputClass} aria-label="Sablon ikonja">{TEMPLATE_ICON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label} · {option.value}</option>)}</select></Field>
                  <Field label="JELZŐSZÍN"><span className="flex border border-white/15 bg-slate-950"><input type="color" value={safeColor(draft.color)} onChange={event => updateDraft('color', event.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer border-r border-white/15 bg-transparent p-1" aria-label="Sablon jelzőszíne" /><input required pattern="^#[0-9a-fA-F]{6}$" value={draft.color} onChange={event => updateDraft('color', event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 font-mono text-xs text-slate-100 outline-none" aria-label="Sablon szín hex értéke" /></span></Field>
                </div>
                <Field label="LEÍRÁS"><textarea value={draft.description} onChange={event => updateDraft('description', event.target.value)} className={`${inputClass} min-h-20 resize-y py-2.5`} aria-label="Sablon leírása" placeholder="Mikor és milyen SQL entitáshoz használható ez a váz?" /></Field>
                <Field label="TELJES MARKDOWN SABLON" hint="A normál Vault-sablon frontmattert és törzset is tartalmaz. A ca_sql_project_index esetén a példafrontmatter csak Obsidian-előnézet; generáláskor a rendszer saját, SQL-kontrollált YAML-t ír."><textarea required value={draft.body} onChange={event => updateDraft('body', event.target.value)} spellCheck="false" className={`${inputClass} min-h-[22rem] resize-y py-3 leading-relaxed`} aria-label="Teljes Markdown sablon" /></Field>
              </div>
              <StaticMetadataPreview template={draft} />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4"><button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 border border-neonCyan bg-neonCyan/10 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950 disabled:opacity-50">{saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}{isNew ? 'SABLON LÉTREHOZÁSA' : 'SABLON MENTÉSE'}</button>{!isNew && <button type="button" onClick={deleteTemplate} disabled={saving} className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta/70 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-50"><Trash2 size={13} /> TÖRLÉS</button>}</div>
          </form>}
        </div>
      </div>
    </section>
  );
};

export default VaultTemplatesTab;

import React, { useCallback, useEffect, useMemo, useState } from 'react';

const percentage = (value) => `${Math.round(Number(value || 0) * 100)}%`;

const numericValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function RangeControl({ label, description, value, min, max, step = 0.01, displayValue, onChange, accent = 'cyan' }) {
  const accentClass = accent === 'magenta' ? 'text-neonMagenta' : 'text-neonCyan';
  const trackClass = accent === 'magenta' ? 'accent-[var(--neon-magenta)]' : 'accent-[var(--neon-cyan)]';

  return (
    <label className="block rounded-none border border-slate-900 dark:border-white/10 bg-white/55 dark:bg-slate-950/55 p-4 transition-colors hover:border-neonCyan/70 dark:hover:border-neonCyan/70">
      <span className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-300">{label}</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-slate-600 dark:text-slate-500">{description}</span>
        </span>
        <output className={`shrink-0 border border-current px-2 py-1 font-mono text-xs font-black ${accentClass}`}>
          {displayValue || value}
        </output>
      </span>
      <input
        aria-label={label}
        className={`mt-4 h-1.5 w-full cursor-pointer ${trackClass}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(numericValue(event.target.value))}
      />
      <span className="mt-2 flex justify-between font-mono text-[9px] font-bold text-slate-500">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </label>
  );
}

function NumberControl({ label, description, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <label className="block rounded-none border border-slate-900 dark:border-white/10 bg-white/55 dark:bg-slate-950/55 p-4 transition-colors hover:border-neonCyan/70 dark:hover:border-neonCyan/70">
      <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-300">{label}</span>
      <span className="mt-1 block min-h-9 text-[11px] leading-relaxed text-slate-600 dark:text-slate-500">{description}</span>
      <span className="mt-3 flex items-center border-2 border-slate-900 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-900">
        <input
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm font-black text-slate-950 outline-none dark:text-white"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(numericValue(event.target.value, min))}
        />
        {suffix && <span className="font-mono text-[10px] font-bold text-neonCyan">{suffix}</span>}
      </span>
    </label>
  );
}

const RagSettingsTab = ({ adminFetch, onNotify }) => {
  const [config, setConfig] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState('');
  const [lastReindex, setLastReindex] = useState(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/rag-settings');
      if (!response.ok) throw new Error('RAG_SETTINGS_LOAD_FAILED');
      const data = await response.json();
      setConfig(data.config);
      setBaseline(data.config);
    } catch {
      setError('A RAG konfiguráció nem tölthető be. Ellenőrizd az admin kapcsolatot.');
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(baseline), [config, baseline]);
  const requiresReindex = useMemo(() => {
    if (!config || !baseline) return false;
    return [
      'embedding_title_weight',
      'embedding_summary_weight',
      'embedding_content_char_limit'
    ].some((key) => config[key] !== baseline[key]);
  }, [config, baseline]);

  const update = (key, value) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const updateChunkSemanticWeight = (value) => {
    const semantic = Math.min(1, Math.max(0, value));
    setConfig((current) => ({
      ...current,
      chunk_semantic_weight: semantic
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const response = await adminFetch('/api/admin/rag-settings', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('RAG_SETTINGS_SAVE_FAILED');
      const data = await response.json();
      setConfig(data.config);
      setBaseline(data.config);
      onNotify('RAG_TUNING_SAVED');
    } catch {
      onNotify('RAG_TUNING_SAVE_FAILED', true);
    } finally {
      setSaving(false);
    }
  };

  const reindex = async () => {
    if (dirty) {
      onNotify('SAVE_RAG_TUNING_BEFORE_REINDEX', true);
      return;
    }
    if (!window.confirm('Újrageneráljam az összes tárolt dokumentumvektort a jelenlegi indexelési súlyokkal?')) return;

    setReindexing(true);
    try {
      const response = await adminFetch('/api/admin/rag-settings/reindex', { method: 'POST' });
      if (!response.ok) throw new Error('RAG_REINDEX_FAILED');
      const data = await response.json();
      setLastReindex(data);
      onNotify(`RAG_REINDEX_COMPLETE_${data.reindexed || 0}`);
    } catch {
      onNotify('RAG_REINDEX_FAILED', true);
    } finally {
      setReindexing(false);
    }
  };

  if (loading) {
    return (
      <div className="border-2 border-slate-900 bg-white p-8 font-mono text-xs font-bold text-slate-700 shadow-[6px_6px_0_#0f172a] dark:border-white/10 dark:bg-[var(--surface-panel)] dark:text-slate-300 dark:shadow-none">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse bg-neonCyan" /> RAG_TUNING_CONSOLE // LOADING
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="border-2 border-neonMagenta bg-neonMagenta/10 p-8 font-mono text-xs font-bold text-neonMagenta shadow-[6px_6px_0_#0f172a] dark:shadow-none">
        <p>{error || 'RAG_CONFIG_UNAVAILABLE'}</p>
        <button type="button" onClick={loadSettings} className="mt-4 border border-neonMagenta px-3 py-2 font-black hover:bg-neonMagenta hover:text-slate-950">
          RETRY_CONNECTION
        </button>
      </div>
    );
  }

  const keywordShare = 1 - numericValue(config.chunk_semantic_weight, 0.6);

  return (
    <form onSubmit={save} className="relative overflow-hidden border-2 border-slate-900 bg-[var(--surface-panel)] shadow-[7px_7px_0_#0f172a] dark:border-white/10 dark:shadow-none">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-neonCyan via-neonMagenta to-plasmaGreen" />
      <div className="corner-bracket-tl dark:text-white/10 text-slate-900" />
      <div className="corner-bracket-br dark:text-white/10 text-slate-900" />

      <div className="border-b-2 border-slate-900 bg-slate-950 px-5 py-5 text-white dark:border-white/10 md:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.18em] text-neonCyan">
              <span className="h-2 w-2 animate-pulse bg-neonCyan" /> LIVE CONTROL PLANE
            </div>
            <h2 className="mt-2 font-headline text-2xl font-black italic uppercase tracking-tight">RAG // Tuning Console</h2>
            <p className="mt-2 max-w-2xl font-body text-xs leading-relaxed text-slate-400">
              A keresési és chunkolási paraméterek mentés után azonnal érvényesek. Az indexelési mezők módosítása után indíts újravektorizálást.
            </p>
          </div>
          <div className={`shrink-0 border px-3 py-2 font-mono text-[10px] font-black ${dirty ? 'border-neonMagenta text-neonMagenta' : 'border-plasmaGreen text-plasmaGreen'}`}>
            {dirty ? 'UNSAVED_DELTA' : 'CONFIG_SYNCED'}
          </div>
        </div>
      </div>

      <div className="space-y-7 p-5 md:p-8">
        <section aria-labelledby="knowledge-ranking-heading" className="relative border-l-4 border-neonCyan bg-slate-100/70 p-4 dark:bg-slate-950/40 md:p-5">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-[10px] font-black tracking-[0.16em] text-neonCyan">01 // QUERY-TIME</p>
              <h3 id="knowledge-ranking-heading" className="mt-1 font-headline text-lg font-black uppercase text-slate-950 dark:text-white">Tudástár rangsorolás</h3>
            </div>
            <p className="font-mono text-[10px] font-bold text-slate-500">AZONNAL ÉRVÉNYES</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <RangeControl
              label="Szemantikus súly"
              description="A vektorhasonlóság hatása a tudástári találatok sorrendjére."
              value={config.knowledge_semantic_weight}
              min="0"
              max="1"
              displayValue={percentage(config.knowledge_semantic_weight)}
              onChange={(value) => update('knowledge_semantic_weight', value)}
            />
            <RangeControl
              label="Kulcsszavas súly"
              description="Az egyező keresőkifejezések súlya a hibrid rangsorolásban."
              value={config.knowledge_keyword_weight}
              min="0"
              max="1"
              displayValue={percentage(config.knowledge_keyword_weight)}
              onChange={(value) => update('knowledge_keyword_weight', value)}
            />
            <RangeControl
              label="Cím-egyezési bónusz"
              description="Külön többletpont, ha a keresés a dokumentum főcímében is szerepel."
              value={config.knowledge_title_bonus}
              min="0"
              max="0.5"
              step="0.01"
              displayValue={`+${percentage(config.knowledge_title_bonus)}`}
              onChange={(value) => update('knowledge_title_bonus', value)}
              accent="magenta"
            />
            <RangeControl
              label="Min. relevancia"
              description="Az ez alatti hibrid pontszámú találatokat a rendszer elrejti."
              value={config.knowledge_min_score}
              min="0"
              max="0.5"
              step="0.01"
              displayValue={percentage(config.knowledge_min_score)}
              onChange={(value) => update('knowledge_min_score', value)}
            />
            <RangeControl
              label="Min. szemantika"
              description="A tisztán vektoros találatok alsó koszinusz-küszöbe."
              value={config.knowledge_min_semantic_score}
              min="0"
              max="0.5"
              step="0.01"
              displayValue={percentage(config.knowledge_min_semantic_score)}
              onChange={(value) => update('knowledge_min_semantic_score', value)}
            />
          </div>
        </section>

        <section aria-labelledby="chunking-heading" className="relative border-l-4 border-neonMagenta bg-slate-100/70 p-4 dark:bg-slate-950/40 md:p-5">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-[10px] font-black tracking-[0.16em] text-neonMagenta">02 // IN-ARTICLE RETRIEVAL</p>
              <h3 id="chunking-heading" className="mt-1 font-headline text-lg font-black uppercase text-slate-950 dark:text-white">Chunk kontextus</h3>
            </div>
            <p className="font-mono text-[10px] font-bold text-slate-500">AZONNAL ÉRVÉNYES</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <RangeControl
              label="Szemantikus részarány"
              description="A chunk relevancián belüli vektoros komponens. A kulcsszavas rész automatikusan kiegészíti 100%-ra."
              value={config.chunk_semantic_weight}
              min="0"
              max="1"
              displayValue={`${percentage(config.chunk_semantic_weight)} / ${percentage(keywordShare)}`}
              onChange={updateChunkSemanticWeight}
              accent="magenta"
            />
            <RangeControl
              label="Szemantikus küszöb"
              description="Minimum koszinuszérték ahhoz, hogy egy bekezdés szemantikus találatnak számítson."
              value={config.chunk_semantic_threshold}
              min="0"
              max="0.5"
              step="0.01"
              displayValue={percentage(config.chunk_semantic_threshold)}
              onChange={(value) => update('chunk_semantic_threshold', value)}
              accent="magenta"
            />
            <NumberControl
              label="Min. chunk token"
              description="Ennyi becsült token felett kap egy releváns bekezdés teljes RAG-chunk jelölést."
              value={config.chunk_min_tokens}
              min="8"
              max="200"
              suffix="TOK"
              onChange={(value) => update('chunk_min_tokens', value)}
            />
            <NumberControl
              label="Min. chunk relevancia"
              description="A teljes RAG-chunk besorolás százalékos küszöbe."
              value={config.chunk_min_relevance}
              min="0"
              max="100"
              suffix="%"
              onChange={(value) => update('chunk_min_relevance', value)}
            />
            <label className="flex cursor-pointer items-center gap-4 border border-slate-900 bg-white/55 p-4 transition-colors hover:border-neonMagenta/70 dark:border-white/10 dark:bg-slate-950/55 dark:hover:border-neonMagenta/70">
              <input
                type="checkbox"
                checked={Boolean(config.chunk_include_heading_context)}
                onChange={(event) => update('chunk_include_heading_context', event.target.checked)}
                className="h-5 w-5 cursor-pointer accent-[var(--neon-magenta)]"
              />
              <span>
                <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 dark:text-slate-300">Alcím mint kontextus</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-slate-600 dark:text-slate-500">A fejezetcím bekerül a követő bekezdések chunk-vektorába.</span>
              </span>
            </label>
          </div>
        </section>

        <section aria-labelledby="indexing-heading" className="relative border-l-4 border-plasmaGreen bg-slate-100/70 p-4 dark:bg-slate-950/40 md:p-5">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-[10px] font-black tracking-[0.16em] text-plasmaGreen">03 // INDEX CONSTRUCTION</p>
              <h3 id="indexing-heading" className="mt-1 font-headline text-lg font-black uppercase text-slate-950 dark:text-white">Dokumentumvektor</h3>
            </div>
            <p className="font-mono text-[10px] font-bold text-plasmaGreen">ÚJRAVEKTORIZÁLÁS SZÜKSÉGES</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <NumberControl
              label="Főcím szorzó"
              description="Hányszor szerepeljen a dokumentum címe az embedding bemenetében."
              value={config.embedding_title_weight}
              min="0"
              max="5"
              suffix="×"
              onChange={(value) => update('embedding_title_weight', value)}
            />
            <NumberControl
              label="Összefoglaló szorzó"
              description="Hányszor szerepeljen az összefoglaló az embedding bemenetében."
              value={config.embedding_summary_weight}
              min="0"
              max="5"
              suffix="×"
              onChange={(value) => update('embedding_summary_weight', value)}
            />
            <NumberControl
              label="Indexelt törzs"
              description="A dokumentumtörzs ennyi első karaktere vesz részt a tárolt dokumentumvektorban."
              value={config.embedding_content_char_limit}
              min="500"
              max="10000"
              step="100"
              suffix="KAR"
              onChange={(value) => update('embedding_content_char_limit', value)}
            />
          </div>

          <div className={`mt-4 flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between ${requiresReindex ? 'border-plasmaGreen bg-plasmaGreen/10' : 'border-slate-900 bg-white/55 dark:border-white/10 dark:bg-slate-950/55'}`}>
            <p className="max-w-2xl font-mono text-[10px] leading-relaxed text-slate-700 dark:text-slate-400">
              {requiresReindex
                ? 'INDEX_DELTA_DETECTED // Mentsd a paramétereket, majd generáld újra a tárolt vektorokat.'
                : 'A tárolt vektorok a jelenlegi indexelési paraméterekkel vannak összhangban.'}
            </p>
            <button
              type="button"
              onClick={reindex}
              disabled={reindexing || dirty}
              className="shrink-0 border-2 border-slate-950 bg-plasmaGreen px-4 py-3 font-headline text-xs font-black italic uppercase text-slate-950 shadow-[3px_3px_0_#0f172a] transition-all hover:bg-slate-950 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {reindexing ? 'REINDEXING…' : 'REBUILD_VECTORS'}
            </button>
          </div>
          {lastReindex && <p className="mt-3 font-mono text-[10px] font-bold text-plasmaGreen">LAST_RUN // {lastReindex.reindexed} DOCUMENT VECTOR(S) REBUILT</p>}
        </section>

        <div className="flex flex-col-reverse gap-3 border-t-2 border-slate-900 pt-6 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] leading-relaxed text-slate-500">A módosítások auditnaplóba kerülnek. A keresési paraméterek nem igényelnek szolgáltatás-újraindítást.</p>
          <div className="flex gap-3">
            <button type="button" onClick={loadSettings} disabled={saving || reindexing} className="border-2 border-slate-900 px-4 py-3 font-headline text-xs font-black italic uppercase text-slate-800 transition-colors hover:bg-slate-900 hover:text-white disabled:opacity-50 dark:border-white/10 dark:text-slate-300">
              RESET
            </button>
            <button type="submit" disabled={!dirty || saving || reindexing} className="border-2 border-slate-950 bg-neonCyan px-5 py-3 font-headline text-xs font-black italic uppercase text-slate-950 shadow-[3px_3px_0_#0f172a] transition-all hover:bg-slate-950 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
              {saving ? 'SAVING…' : 'SAVE_RAG_TUNING'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
};

export default RagSettingsTab;

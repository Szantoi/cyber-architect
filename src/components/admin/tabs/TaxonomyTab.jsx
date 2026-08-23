import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  GitBranch,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X
} from 'lucide-react';
import TaxonomyIcon from '../../common/TaxonomyIcon.jsx';
import { TAXONOMY_ICON_OPTIONS } from '../../../utils/taxonomyIcons.js';
import {
  getTaxonomyColor,
  getTaxonomyColorToken,
  normalizeTaxonomyColor,
  normalizeTaxonomyConfig,
  normalizeTaxonomySlug,
  matchesTaxonomySmartCollection,
  TAXONOMY_COLOR_TOKENS
} from '../../../utils/taxonomyConfig.js';

const ADMIN_REGISTRY_URL = '/api/admin/knowledge/taxonomy';
const EMPTY_ARRAY = Object.freeze([]);

const copyRegistry = (value) => JSON.parse(JSON.stringify(value));

const createDimensionDraft = () => ({
  id: '',
  frontmatter_key: '',
  label: 'ÚJ DIMENZIÓ',
  icon_key: 'tag',
  color: '#00FBFB',
  filterable: true,
  groupable: true,
  multi_select: true,
  sort_order: 100,
  active: true,
  visibility: 'public',
  description: ''
});

const createTermDraft = (dimension) => ({
  id: '',
  dimension_id: dimension?.id || '',
  label: 'ÚJ CÍMKE',
  slug: 'uj-cimke',
  icon_key: dimension?.icon_key || 'tag',
  color: normalizeTaxonomyColor(dimension?.color || '#00FBFB'),
  parent_id: '',
  sort_order: 100,
  active: true,
  visibility: 'public',
  description: ''
});

const createRelationDraft = () => ({
  id: '',
  source_term_id: '',
  target_term_id: '',
  relation_type: 'related_to',
  weight: 1,
  bidirectional: false
});

const createSmartCollectionDraft = () => ({
  id: '',
  slug: 'uj-smart-gyujtemeny',
  name: 'ÚJ SMART GYŰJTEMÉNY',
  icon_key: 'sparkles',
  color: '#80FF00',
  active: true,
  sort_order: 100,
  group_by: { type: 'none' },
  sort_by: 'recommended',
  scope: 'public',
  owner_id: '',
  description: '',
  rule_version: 1,
  layout: { view: 'cards' },
  rule: { type: 'all', rules: [{ type: 'content', field: 'presentation_profile', operator: 'equals', value: 'knowledge' }] }
});

const entityLabel = (term) => `${term?.label || 'NÉVTELEN CÍMKE'} // ${term?.slug || term?.id || 'n/a'}`;

const TEXT_CONTENT_FIELDS = new Set(['presentation_profile', 'content_type', 'category', 'visibility']);
const BOOLEAN_CONTENT_FIELDS = new Set(['published', 'has_audio', 'has_video']);
const RELATION_TYPES = new Set(['related_to', 'broader_than', 'narrower_than', 'recommended_with', 'excludes']);
const SMART_SORTS = new Set(['recommended', 'newest', 'title']);
const SMART_SCOPES = new Set(['public', 'private', 'personal']);
const DEFAULT_SMART_RULE = Object.freeze({
  type: 'all',
  rules: [{ type: 'content', field: 'presentation_profile', operator: 'equals', value: 'knowledge' }]
});

const trimText = (value) => String(value ?? '').trim();
const integer = (value, fallback = 0, minimum = -10_000, maximum = 10_000) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
};
const cloneRule = (value) => copyRegistry(value);
const asRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toTermId = (value, dimensions, dimensionId = '') => {
  const raw = trimText(value);
  if (!raw) return '';
  const terms = dimensions.flatMap(dimension => (
    !dimensionId || dimension.id === dimensionId ? dimension.terms || [] : []
  ));
  return terms.find(term => [term.id, term.slug, term.label].includes(raw))?.id || raw;
};

const serializeLegacyRule = (rule, dimensions) => {
  if (!asRecord(rule)) return cloneRule(DEFAULT_SMART_RULE.rules[0]);
  if (['all', 'any', 'not', 'taxonomy', 'content', 'date'].includes(rule.type)) return serializeSmartRule(rule, dimensions);
  const field = trimText(rule.field);
  if (field.startsWith('dimensions.')) {
    const reference = field.slice('dimensions.'.length);
    const dimension = dimensions.find(item => item.id === reference || item.frontmatter_key === reference);
    const termIds = String(rule.value ?? '')
      .split(',')
      .map(value => toTermId(value, dimensions, dimension?.id || ''))
      .filter(Boolean);
    if (!termIds.length) throw new Error('SMART_RULE_TERM_REQUIRED');
    return {
      type: 'taxonomy',
      ...(dimension?.id ? { dimension_id: dimension.id } : {}),
      term_ids: [...new Set(termIds)],
      match: rule.operator === 'none' || rule.operator === 'not_equals' ? 'none' : rule.operator === 'all' ? 'all' : 'any'
    };
  }
  if (BOOLEAN_CONTENT_FIELDS.has(field)) {
    const normalized = rule.value === true || ['true', '1', 'igen'].includes(trimText(rule.value).toLowerCase());
    return { type: 'content', field, operator: 'equals', value: normalized };
  }
  if (field === 'created_at') {
    const value = trimText(rule.value);
    if (!value) throw new Error('SMART_RULE_DATE_REQUIRED');
    return { type: 'date', field: 'created_at', operator: rule.operator === 'before' ? 'before' : 'after', value };
  }
  const rawValue = trimText(rule.value);
  const values = rule.operator === 'in'
    ? rawValue.split(',').map(value => value.trim()).filter(Boolean)
    : rawValue || 'knowledge';
  return {
    type: 'content',
    field: TEXT_CONTENT_FIELDS.has(field) ? field : 'presentation_profile',
    operator: rule.operator === 'in' && Array.isArray(values) && values.length ? 'in' : 'equals',
    value: values
  };
};

const serializeSmartRule = (rule, dimensions) => {
  if (!asRecord(rule)) return cloneRule(DEFAULT_SMART_RULE);
  if (rule.type === 'all' || rule.type === 'any') {
    const children = (Array.isArray(rule.rules) ? rule.rules : []).map(child => serializeLegacyRule(child, dimensions));
    return { type: rule.type, rules: children.length ? children : cloneRule(DEFAULT_SMART_RULE).rules };
  }
  if (rule.type === 'not' && asRecord(rule.rule)) return { type: 'not', rule: serializeLegacyRule(rule.rule, dimensions) };
  if (rule.type === 'taxonomy') {
    const dimensionId = trimText(rule.dimension_id);
    const termIds = (Array.isArray(rule.term_ids) ? rule.term_ids : [rule.value])
      .map(value => toTermId(value, dimensions, dimensionId))
      .filter(Boolean);
    if (!termIds.length) throw new Error('SMART_RULE_TERM_REQUIRED');
    return { type: 'taxonomy', ...(dimensionId ? { dimension_id: dimensionId } : {}), term_ids: [...new Set(termIds)], match: ['any', 'all', 'none'].includes(rule.match) ? rule.match : 'any' };
  }
  if (rule.type === 'content') {
    const field = TEXT_CONTENT_FIELDS.has(rule.field) || BOOLEAN_CONTENT_FIELDS.has(rule.field) ? rule.field : 'presentation_profile';
    if (BOOLEAN_CONTENT_FIELDS.has(field)) {
      return {
        type: 'content',
        field,
        operator: 'equals',
        value: rule.value === true || ['true', '1', 'igen'].includes(trimText(rule.value).toLowerCase())
      };
    }
    const values = Array.isArray(rule.value) ? rule.value.map(trimText).filter(Boolean) : trimText(rule.value);
    return {
      type: 'content',
      field,
      operator: rule.operator === 'in' && Array.isArray(values) && values.length ? 'in' : 'equals',
      value: Array.isArray(values) ? values : (values || 'knowledge')
    };
  }
  if (rule.type === 'date') return { type: 'date', field: 'created_at', operator: rule.operator === 'before' ? 'before' : 'after', value: trimText(rule.value) };
  return cloneRule(DEFAULT_SMART_RULE.rules[0]);
};

const serializeGroupBy = (value, dimensions) => {
  if (asRecord(value)) {
    if (value.type === 'taxonomy_dimension' && trimText(value.dimension_id)) return { type: 'taxonomy_dimension', dimension_id: trimText(value.dimension_id) };
    if (value.type === 'content_field' && ['presentation_profile', 'content_type', 'category', 'project_id'].includes(value.field)) return { type: 'content_field', field: value.field };
    return { type: 'none' };
  }
  const raw = trimText(value);
  if (!raw) return { type: 'none' };
  if (raw.startsWith('taxonomy:')) {
    const dimensionId = trimText(raw.slice('taxonomy:'.length));
    return dimensions.some(item => item.id === dimensionId)
      ? { type: 'taxonomy_dimension', dimension_id: dimensionId }
      : { type: 'none' };
  }
  if (raw.startsWith('content:')) {
    const field = trimText(raw.slice('content:'.length));
    return ['presentation_profile', 'content_type', 'category', 'project_id'].includes(field)
      ? { type: 'content_field', field }
      : { type: 'none' };
  }
  const dimension = dimensions.find(item => item.id === raw || item.frontmatter_key === raw);
  return dimension ? { type: 'taxonomy_dimension', dimension_id: dimension.id } : { type: 'none' };
};

const getGroupByEditorValue = (value, dimensions) => {
  const groupBy = serializeGroupBy(value, dimensions);
  if (groupBy.type === 'taxonomy_dimension') return `taxonomy:${groupBy.dimension_id}`;
  if (groupBy.type === 'content_field') return `content:${groupBy.field}`;
  return 'none';
};

const getGroupByLabel = (value, dimensions) => {
  const groupBy = serializeGroupBy(value, dimensions);
  if (groupBy.type === 'taxonomy_dimension') {
    return dimensions.find(dimension => dimension.id === groupBy.dimension_id)?.label || groupBy.dimension_id;
  }
  if (groupBy.type === 'content_field') return `FIELD // ${groupBy.field}`;
  return 'NINCS';
};

// Produces only strict Zod-accepted fields. The editor keeps helpful client
// metadata (terms, aliases, labels) locally, but none of that crosses the API.
const serializeTaxonomyEditorPayload = (kind, value = {}, isNew = false, dimensions = []) => {
  const color = normalizeTaxonomyColor(value.color);
  if (kind === 'dimension') {
    const shared = {
      label: trimText(value.label), description: trimText(value.description), icon_key: trimText(value.icon_key) || 'tag', color,
      multi_select: value.multi_select !== false, filterable: value.filterable !== false, groupable: value.groupable !== false,
      active: value.active !== false, visibility: value.visibility === 'private' ? 'private' : 'public', sort_order: integer(value.sort_order)
    };
    if (!isNew) return shared;
    return {
      id: normalizeTaxonomySlug(value.id || value.frontmatter_key || value.label).replace(/-/g, '_'),
      frontmatter_key: normalizeTaxonomySlug(value.frontmatter_key || value.id || value.label).replace(/-/g, '_'),
      ...shared
    };
  }
  if (kind === 'term') {
    const shared = {
      slug: normalizeTaxonomySlug(value.slug || value.label), label: trimText(value.label), description: trimText(value.description),
      icon_key: trimText(value.icon_key) || 'tag', color, parent_id: trimText(value.parent_id) || null,
      active: value.active !== false, visibility: value.visibility === 'private' ? 'private' : 'public', sort_order: integer(value.sort_order)
    };
    if (!isNew) return shared;
    const id = trimText(value.id);
    return { ...(id ? { id } : {}), dimension_id: trimText(value.dimension_id), ...shared, aliases: [] };
  }
  if (kind === 'relation') {
    const shared = {
      relation_type: RELATION_TYPES.has(value.relation_type) ? value.relation_type : 'related_to',
      weight: Math.min(1, Math.max(0, Number(value.weight) || 0)), bidirectional: Boolean(value.bidirectional)
    };
    return isNew ? { source_term_id: trimText(value.source_term_id), target_term_id: trimText(value.target_term_id), ...shared } : shared;
  }
  if (kind === 'smart') {
    const rawRule = Array.isArray(value.rules)
      ? { type: value.rule_logic === 'or' ? 'any' : 'all', rules: value.rules }
      : value.rule || DEFAULT_SMART_RULE;
    const shared = {
      name: trimText(value.name || value.label), description: trimText(value.description), icon_key: trimText(value.icon_key) || 'sparkles', color,
      scope: SMART_SCOPES.has(value.scope) ? value.scope : 'public', owner_id: trimText(value.owner_id), active: value.active !== false,
      rule_version: integer(value.rule_version, 1, 1, 100), rule: serializeSmartRule(rawRule, dimensions), group_by: serializeGroupBy(value.group_by, dimensions),
      sort_by: SMART_SORTS.has(value.sort_by) ? value.sort_by : 'recommended', layout: asRecord(value.layout) ? { view: ['cards', 'list', 'graph'].includes(value.layout.view) ? value.layout.view : 'cards', ...(integer(value.layout.columns, 0, 1, 6) ? { columns: integer(value.layout.columns, 0, 1, 6) } : {}) } : { view: 'cards' },
      sort_order: integer(value.sort_order)
    };
    if (!isNew) return shared;
    const id = trimText(value.id);
    return { ...(id ? { id } : {}), slug: normalizeTaxonomySlug(value.slug || value.name || value.label), ...shared };
  }
  throw new Error('UNKNOWN_TAXONOMY_EDITOR_KIND');
};

function IconPicker({ value, onChange, label = 'IKON' }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="flex items-center gap-2 border border-slate-900 bg-white px-2.5 py-2 dark:border-white/15 dark:bg-slate-950">
        <TaxonomyIcon iconKey={value} size={15} className="shrink-0 text-neonCyan" aria-hidden="true" />
        <select
          value={value || 'tag'}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-[10px] font-black text-slate-900 outline-none dark:text-white"
        >
          {TAXONOMY_ICON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </span>
    </label>
  );
}

function ColorPicker({ value, onChange }) {
  const selectedToken = getTaxonomyColorToken(value);
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">JELZŐSZÍN</span>
      <select
        value={selectedToken}
        onChange={(event) => onChange(TAXONOMY_COLOR_TOKENS.find(color => color.id === event.target.value)?.hex || '#00FBFB')}
        className="w-full border border-slate-900 bg-white px-2.5 py-2 font-mono text-[10px] font-black text-slate-900 outline-none dark:border-white/15 dark:bg-slate-950 dark:text-white"
      >
        {TAXONOMY_COLOR_TOKENS.map(color => <option key={color.id} value={color.id}>{color.label}</option>)}
      </select>
    </label>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full border border-slate-900 bg-white px-2.5 py-2 font-mono text-[11px] font-bold text-slate-900 outline-none transition-colors focus:border-neonCyan dark:border-white/15 dark:bg-slate-950 dark:text-white';

function Toggle({ checked, onChange, label, accent = 'cyan' }) {
  const accentClass = accent === 'magenta' ? 'accent-[var(--neon-magenta)]' : 'accent-[var(--neon-cyan)]';
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 border border-slate-900 bg-white/70 px-2.5 py-2 font-mono text-[9px] font-black uppercase tracking-[0.07em] text-slate-700 dark:border-white/15 dark:bg-slate-950/60 dark:text-slate-300">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} className={`h-4 w-4 ${accentClass}`} />
      {label}
    </label>
  );
}

const toRuleEditorRule = (rule, dimensions) => {
  if (!asRecord(rule)) return { field: 'presentation_profile', operator: 'equals', value: 'knowledge' };
  if (rule.type === 'taxonomy') {
    const dimension = dimensions.find(item => item.id === rule.dimension_id);
    return {
      field: `dimensions.${dimension?.frontmatter_key || dimension?.id || ''}`,
      operator: rule.match === 'none' ? 'none' : rule.match === 'all' ? 'all' : 'equals',
      value: (Array.isArray(rule.term_ids) ? rule.term_ids : []).join(', ')
    };
  }
  if (rule.type === 'content') return {
    field: rule.field || 'presentation_profile',
    operator: rule.operator || 'equals',
    value: Array.isArray(rule.value) ? rule.value.join(', ') : rule.value ?? ''
  };
  if (rule.type === 'date') return { field: 'created_at', operator: rule.operator || 'after', value: rule.value || '' };
  return {
    field: rule.field || 'presentation_profile',
    operator: rule.operator || 'equals',
    value: rule.value ?? ''
  };
};

function RuleEditor({ rules, onChange, dimensions }) {
  const editorRules = (Array.isArray(rules) ? rules : []).map(rule => toRuleEditorRule(rule, dimensions));
  const addRule = () => onChange([...editorRules, { field: 'presentation_profile', operator: 'equals', value: 'knowledge' }]);
  const updateRule = (index, field, value) => onChange(editorRules.map((rule, ruleIndex) => (
    ruleIndex === index ? { ...rule, [field]: value } : rule
  )));
  const removeRule = (index) => onChange(editorRules.filter((_, ruleIndex) => ruleIndex !== index));
  const fields = [
    { value: 'presentation_profile', label: 'MEGJELENÍTÉSI PROFIL' },
    { value: 'content_type', label: 'LEGACY PORTÁL TÍPUS' },
    { value: 'visibility', label: 'LÁTHATÓSÁG' },
    { value: 'published', label: 'PUBLIKÁLT' },
    { value: 'has_audio', label: 'VAN HANG' },
    { value: 'has_video', label: 'VAN VIDEÓ' },
    { value: 'category', label: 'KATEGÓRIA' },
    { value: 'created_at', label: 'LÉTREHOZVA' },
    ...dimensions.map(dimension => ({ value: `dimensions.${dimension.frontmatter_key || dimension.id}`, label: `DIMENZIÓ // ${dimension.label}` }))
  ];

  return (
    <div className="border border-slate-900 bg-slate-100/70 p-3 dark:border-white/10 dark:bg-black/20">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-neonCyan">SZABÁLYÉPÍTŐ // SAFE DSL</span>
        <button type="button" onClick={addRule} className="inline-flex items-center gap-1 border border-neonCyan px-2 py-1 font-mono text-[9px] font-black text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950"><Plus size={11} /> FELTÉTEL</button>
      </div>
      {!editorRules.length && <p className="font-mono text-[10px] leading-relaxed text-slate-500">Nincs egyedi feltétel. A gyűjtemény csak akkor lesz aktív, ha a szerveroldali szabályt hozzáadod.</p>}
      <div className="space-y-2">
        {editorRules.map((rule, index) => {
          const isTaxonomy = String(rule.field || '').startsWith('dimensions.');
          const isBoolean = BOOLEAN_CONTENT_FIELDS.has(rule.field);
          const isDate = rule.field === 'created_at';
          const operators = isTaxonomy
            ? [{ value: 'equals', label: 'BÁRMELYIK' }, { value: 'all', label: 'MIND' }, { value: 'none', label: 'EGYIK SEM' }]
            : isDate
              ? [{ value: 'after', label: 'UTÁN' }, { value: 'before', label: 'ELŐTT' }]
              : isBoolean
                ? [{ value: 'equals', label: 'EGYEZIK' }]
                : [{ value: 'equals', label: 'EGYEZIK' }, { value: 'in', label: 'BÁRMELYIK (VESSZŐVEL)' }];
          return (
          <div key={`${rule.field}-${index}`} className="grid gap-2 border-l-2 border-neonCyan bg-white p-2 dark:bg-slate-950 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)_minmax(0,1fr)_auto]">
            <select aria-label={`Szabály mező ${index + 1}`} value={rule.field || ''} onChange={(event) => updateRule(index, 'field', event.target.value)} className="min-w-0 bg-transparent font-mono text-[10px] font-bold text-slate-900 outline-none dark:text-white">
              {fields.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
            </select>
            <select aria-label={`Szabály operátor ${index + 1}`} value={rule.operator || 'equals'} onChange={(event) => updateRule(index, 'operator', event.target.value)} className="min-w-0 bg-transparent font-mono text-[10px] font-bold text-slate-900 outline-none dark:text-white">
              {operators.map(operator => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
            </select>
            {isBoolean ? (
              <select aria-label={`Szabály érték ${index + 1}`} value={String(rule.value ?? false)} onChange={(event) => updateRule(index, 'value', event.target.value)} className="min-w-0 bg-transparent font-mono text-[10px] font-bold text-slate-900 outline-none dark:text-white"><option value="true">IGEN</option><option value="false">NEM</option></select>
            ) : (
              <input aria-label={`Szabály érték ${index + 1}`} value={rule.value ?? ''} onChange={(event) => updateRule(index, 'value', event.target.value)} className="min-w-0 bg-transparent font-mono text-[10px] font-bold text-slate-900 outline-none dark:text-white" placeholder={isTaxonomy ? 'TERM SLUG / CÍMKE' : isDate ? 'ISO DÁTUM (pl. 2026-08-21T00:00:00.000Z)' : 'ÉRTÉK'} />
            )}
            <button type="button" aria-label={`Szabály ${index + 1} törlése`} onClick={() => removeRule(index)} className="grid min-h-7 min-w-7 place-items-center border border-neonMagenta/60 text-neonMagenta hover:bg-neonMagenta hover:text-slate-950"><Trash2 size={12} /></button>
          </div>
          );
        })}
      </div>
    </div>
  );
}

const membershipOverrideMap = (overrides) => Object.fromEntries((Array.isArray(overrides) ? overrides : [])
  .filter(override => override && ['include', 'exclude'].includes(override.mode))
  .map(override => [String(override.post_id ?? override.postId), override.mode]));

function SmartCollectionMembershipPanel({
  items,
  summary,
  loading,
  error,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  savingPostId,
  onChangeMode
}) {
  const filters = [
    { id: 'included', label: `BENNE (${summary.included})` },
    { id: 'manual', label: `KÉZI (${summary.manual})` },
    { id: 'all', label: `ÖSSZES (${summary.total})` }
  ];
  return (
    <section className="border border-plasmaGreen/60 bg-plasmaGreen/5 p-3" aria-label="Smart gyűjtemény tartalomtagság">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] font-black tracking-[0.12em] text-plasmaGreen">TARTALOM TAGSÁG // KÉZI FELÜLBÍRÁLÁS</p>
          <p className="mt-1 font-mono text-[9px] leading-relaxed text-slate-500">A szabálytól függetlenül betehetsz vagy kizárhatsz egy tudástár-dokumentumot. Az <strong>automatikus</strong> visszaadja a szabály szerinti működést.</p>
        </div>
        <span className="border border-plasmaGreen/60 bg-slate-950 px-2 py-1 font-mono text-[10px] font-black text-plasmaGreen">{summary.included} AKTÍV</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Tartalomtagság szűrése">
        {filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => onFilterChange(item.id)} className={`border px-2 py-1 font-mono text-[8px] font-black transition-colors ${filter === item.id ? 'border-plasmaGreen bg-plasmaGreen text-slate-950' : 'border-slate-900/40 bg-white text-slate-600 hover:border-plasmaGreen dark:border-white/20 dark:bg-slate-950 dark:text-slate-300'}`}>{item.label}</button>)}
      </div>

      <input aria-label="Dokumentum keresése a gyűjteményben" value={query} onChange={(event) => onQueryChange(event.target.value)} className={`mt-3 ${inputClass}`} placeholder="DOKUMENTUM KERESÉSE…" />

      {loading && <p className="mt-3 font-mono text-[10px] font-bold text-plasmaGreen"><LoaderCircle size={12} className="mr-1 inline animate-spin" /> TUDÁSTÁR-DOKUMENTUMOK BETÖLTÉSE…</p>}
      {error && <p className="mt-3 border border-neonMagenta/50 bg-neonMagenta/10 p-2 font-mono text-[9px] font-bold text-neonMagenta">{error}</p>}
      {!loading && !error && !items.length && <p className="mt-3 border border-dashed border-slate-900/40 p-3 font-mono text-[9px] font-bold text-slate-500 dark:border-white/20">NINCS MEGJELENÍTHETŐ DOKUMENTUM EBBEN A NÉZETBEN.</p>}

      <div className="mt-3 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
        {items.map(({ document, automatic, override, included }) => {
          const status = override === 'include'
            ? { label: 'KÉZI FELVÉTEL', className: 'border-plasmaGreen/60 bg-plasmaGreen/10 text-plasmaGreen' }
            : override === 'exclude'
              ? { label: 'KIZÁRVA', className: 'border-neonMagenta/60 bg-neonMagenta/10 text-neonMagenta' }
              : automatic
                ? { label: 'SZABÁLY ALAPJÁN', className: 'border-neonCyan/60 bg-neonCyan/10 text-neonCyan' }
                : { label: 'NINCS BENNE', className: 'border-slate-400/60 bg-slate-100 text-slate-500 dark:border-white/20 dark:bg-slate-900' };
          const busy = savingPostId === String(document.id);
          return <article key={document.id} className={`border p-2.5 ${included ? 'border-plasmaGreen/45 bg-white dark:bg-slate-950/80' : 'border-slate-900/25 bg-slate-100/70 dark:border-white/10 dark:bg-slate-950/35'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h4 className="truncate font-body text-xs font-black text-slate-900 dark:text-white" title={document.title}>{document.title || document.slug || `DOKUMENTUM #${document.id}`}</h4><p className="mt-0.5 truncate font-mono text-[8px] font-bold uppercase text-slate-500">{document.presentation_profile || document.content_type || 'DOKUMENTUM'} // {document.category || 'NINCS KATEGÓRIA'}</p></div>
              <span className={`shrink-0 border px-1.5 py-0.5 font-mono text-[8px] font-black ${status.className}`}>{status.label}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <button type="button" disabled={busy || override === 'include'} onClick={() => onChangeMode(document.id, 'include')} className="border border-plasmaGreen/70 px-1.5 py-1 font-mono text-[8px] font-black text-plasmaGreen transition-colors hover:bg-plasmaGreen hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">BEVESZ</button>
              <button type="button" disabled={busy || override === 'exclude'} onClick={() => onChangeMode(document.id, 'exclude')} className="border border-neonMagenta/70 px-1.5 py-1 font-mono text-[8px] font-black text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">KIZÁR</button>
              <button type="button" disabled={busy || !override} onClick={() => onChangeMode(document.id, 'automatic')} className="border border-slate-900/40 px-1.5 py-1 font-mono text-[8px] font-black text-slate-600 transition-colors hover:border-neonCyan hover:text-neonCyan disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:text-slate-300">AUTOMATIKUS</button>
              {busy && <LoaderCircle size={12} className="ml-1 animate-spin text-neonCyan" aria-label="Tagság mentése" />}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}

function TaxonomyTab({ adminFetch, onNotify }) {
  const [registry, setRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState('dimensions');
  const [selectedDimensionId, setSelectedDimensionId] = useState('');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aliasDraft, setAliasDraft] = useState('');
  const [membershipCatalog, setMembershipCatalog] = useState({ collectionId: '', documents: [], overrides: {}, loading: false, error: '' });
  const [membershipQuery, setMembershipQuery] = useState('');
  const [membershipFilter, setMembershipFilter] = useState('included');
  const [membershipSavingPostId, setMembershipSavingPostId] = useState('');

  const editingSmart = editor?.kind === 'smart' ? editor.value : null;
  const editingSmartId = trimText(editingSmart?.id);

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch(ADMIN_REGISTRY_URL);
      if (!response.ok) throw new Error('TAXONOMY_REGISTRY_LOAD_FAILED');
      const data = await response.json();
      const nextRegistry = normalizeTaxonomyConfig(data.taxonomy || data.registry || data.config || data);
      setRegistry(nextRegistry);
      setSelectedDimensionId(current => current || nextRegistry.dimensions[0]?.id || '');
    } catch {
      setError('A TAXONÓMIA-REGISZTER NEM ÉRHETŐ EL. A publikus felület továbbra is kompatibilitási fallbackkel működik.');
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  useEffect(() => {
    const collectionId = editingSmartId && !editor?.isNew ? editingSmartId : '';
    if (!collectionId) {
      setMembershipCatalog({ collectionId: '', documents: [], overrides: {}, loading: false, error: '' });
      return undefined;
    }
    let isCurrent = true;
    setMembershipCatalog({ collectionId, documents: [], overrides: {}, loading: true, error: '' });
    Promise.all([
      adminFetch('/api/admin/blog?content_type=knowledge&visibility=all'),
      adminFetch(`/api/admin/smart-collections/${encodeURIComponent(collectionId)}/overrides`)
    ]).then(async ([documentsResponse, overridesResponse]) => {
      if (!documentsResponse.ok || !overridesResponse.ok) throw new Error('SMART_COLLECTION_MEMBERSHIP_LOAD_FAILED');
      const [documentsPayload, overridesPayload] = await Promise.all([documentsResponse.json(), overridesResponse.json()]);
      if (!isCurrent) return;
      const documents = Array.isArray(documentsPayload) ? documentsPayload : documentsPayload?.posts;
      setMembershipCatalog({
        collectionId,
        documents: Array.isArray(documents) ? documents : [],
        overrides: membershipOverrideMap(overridesPayload?.overrides),
        loading: false,
        error: ''
      });
    }).catch(() => {
      if (isCurrent) setMembershipCatalog({ collectionId, documents: [], overrides: {}, loading: false, error: 'A dokumentumtagság állapota most nem tölthető be.' });
    });
    return () => { isCurrent = false; };
  }, [adminFetch, editingSmartId, editor?.isNew]);

  const dimensions = registry?.dimensions ?? EMPTY_ARRAY;
  const selectedDimension = dimensions.find(dimension => dimension.id === selectedDimensionId) || dimensions[0] || null;
  const allTerms = useMemo(() => dimensions.flatMap(dimension => dimension.terms.map(term => ({ ...term, dimension }))), [dimensions]);
  const relationships = registry?.relationships ?? EMPTY_ARRAY;
  const smartCollections = registry?.smart_collections ?? EMPTY_ARRAY;

  const membershipItems = useMemo(() => {
    if (!editingSmart || membershipCatalog.collectionId !== editingSmart.id) return EMPTY_ARRAY;
    const collectionRuleOnly = { ...editingSmart, membership_overrides: {}, membershipOverrides: {} };
    const query = trimText(membershipQuery).toLocaleLowerCase('hu-HU');
    return membershipCatalog.documents.map(document => {
      const override = membershipCatalog.overrides[String(document.id)] || '';
      const automatic = matchesTaxonomySmartCollection(document, collectionRuleOnly, dimensions);
      const included = override === 'include' || (override !== 'exclude' && automatic);
      return { document, override, automatic, included };
    }).filter(item => {
      if (membershipFilter === 'included' && !item.included) return false;
      if (membershipFilter === 'manual' && !item.override) return false;
      if (!query) return true;
      return [item.document.title, item.document.slug, item.document.summary, item.document.category]
        .some(value => trimText(value).toLocaleLowerCase('hu-HU').includes(query));
    });
  }, [dimensions, editingSmart, membershipCatalog, membershipFilter, membershipQuery]);

  const membershipSummary = useMemo(() => {
    if (!editingSmart || membershipCatalog.collectionId !== editingSmart.id) return { total: 0, included: 0, manual: 0 };
    const collectionRuleOnly = { ...editingSmart, membership_overrides: {}, membershipOverrides: {} };
    return membershipCatalog.documents.reduce((summary, document) => {
      const override = membershipCatalog.overrides[String(document.id)] || '';
      const automatic = matchesTaxonomySmartCollection(document, collectionRuleOnly, dimensions);
      if (override === 'include' || (override !== 'exclude' && automatic)) summary.included += 1;
      if (override) summary.manual += 1;
      summary.total += 1;
      return summary;
    }, { total: 0, included: 0, manual: 0 });
  }, [dimensions, editingSmart, membershipCatalog]);

  const openEditor = (kind, value, isNew = false) => {
    setAliasDraft('');
    setMembershipQuery('');
    setMembershipFilter('included');
    setEditor({ kind, isNew, value: copyRegistry(value) });
  };
  const updateEditor = (field, value) => setEditor(current => ({ ...current, value: { ...current.value, [field]: value } }));

  const endpointForEditor = (kind, value, isNew) => {
    const routes = {
      dimension: '/api/admin/taxonomy/dimensions',
      term: '/api/admin/taxonomy/terms',
      relation: '/api/admin/taxonomy/relations',
      smart: '/api/admin/smart-collections'
    };
    const base = routes[kind];
    return isNew ? base : `${base}/${encodeURIComponent(value.id)}`;
  };

  const saveEditor = async (event) => {
    event.preventDefault();
    if (!editor?.value) return;
    let payload;
    try {
      payload = serializeTaxonomyEditorPayload(editor.kind, {
        ...editor.value,
        ...(editor.kind === 'term' && editor.isNew && !editor.value.dimension_id
          ? { dimension_id: selectedDimension?.id || '' }
          : {})
      }, editor.isNew, dimensions);
    } catch {
      onNotify('TAXONOMY_PAYLOAD_INVALID', true);
      return;
    }
    if (!editor.isNew && !editor.value.id) return;

    setSaving(true);
    try {
      const response = await adminFetch(endpointForEditor(editor.kind, editor.value, editor.isNew), {
        method: editor.isNew ? 'POST' : 'PUT',
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('TAXONOMY_SAVE_FAILED');
      onNotify(`${editor.kind.toUpperCase()}_${editor.isNew ? 'CREATED' : 'UPDATED'}`);
      setEditor(null);
      await loadRegistry();
    } catch {
      onNotify('TAXONOMY_SAVE_FAILED', true);
    } finally {
      setSaving(false);
    }
  };

  const deleteEditorEntity = async (kind, entity) => {
    if (!entity?.id) return;
    if (!window.confirm(`BIZTOSAN_ARCHIVÁLOD VAGY TÖRLÖD: ${entity.label || entity.id}? A MŰVELET AUDITNAPLÓBA KERÜL.`)) return;
    setSaving(true);
    try {
      const response = await adminFetch(endpointForEditor(kind, entity, false), { method: 'DELETE' });
      if (!response.ok) throw new Error('TAXONOMY_DELETE_FAILED');
      onNotify(`${kind.toUpperCase()}_DELETED`);
      setEditor(null);
      await loadRegistry();
    } catch {
      onNotify('TAXONOMY_DELETE_FAILED', true);
    } finally {
      setSaving(false);
    }
  };

  const createAlias = async () => {
    const termId = editor?.kind === 'term' && !editor.isNew ? editor.value?.id : '';
    const alias = aliasDraft.trim();
    if (!termId || !alias) return;
    setSaving(true);
    try {
      const response = await adminFetch(`/api/admin/taxonomy/terms/${encodeURIComponent(termId)}/aliases`, {
        method: 'POST',
        body: JSON.stringify({ alias })
      });
      if (!response.ok) throw new Error('TAXONOMY_ALIAS_CREATE_FAILED');
      const data = await response.json();
      setEditor(current => current ? {
        ...current,
        value: {
          ...current.value,
          aliases: [...(Array.isArray(current.value.aliases) ? current.value.aliases : []), data.alias || { alias }]
        }
      } : current);
      setAliasDraft('');
      onNotify('TAXONOMY_ALIAS_CREATED');
      await loadRegistry();
    } catch {
      onNotify('TAXONOMY_ALIAS_CREATE_FAILED', true);
    } finally {
      setSaving(false);
    }
  };

  const deleteAlias = async (alias) => {
    const aliasId = alias?.id;
    if (!aliasId) return;
    if (!window.confirm(`BIZTOSAN TÖRLÖD AZ ALIAS-T: ${alias.alias}?`)) return;
    setSaving(true);
    try {
      const response = await adminFetch(`/api/admin/taxonomy/aliases/${encodeURIComponent(aliasId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('TAXONOMY_ALIAS_DELETE_FAILED');
      setEditor(current => current ? {
        ...current,
        value: {
          ...current.value,
          aliases: (Array.isArray(current.value.aliases) ? current.value.aliases : []).filter(item => item.id !== aliasId)
        }
      } : current);
      onNotify('TAXONOMY_ALIAS_DELETED');
      await loadRegistry();
    } catch {
      onNotify('TAXONOMY_ALIAS_DELETE_FAILED', true);
    } finally {
      setSaving(false);
    }
  };

  const updateSmartCollectionMembership = async (postId, mode) => {
    const collectionId = trimText(editingSmart?.id);
    if (!collectionId || !postId) return;
    setMembershipSavingPostId(String(postId));
    try {
      const path = `/api/admin/smart-collections/${encodeURIComponent(collectionId)}/overrides/${encodeURIComponent(postId)}`;
      const response = await adminFetch(path, mode === 'automatic'
        ? { method: 'DELETE' }
        : { method: 'PUT', body: JSON.stringify({ mode }) });
      if (!response.ok) throw new Error('SMART_COLLECTION_MEMBERSHIP_SAVE_FAILED');
      setMembershipCatalog(current => {
        if (current.collectionId !== collectionId) return current;
        const overrides = { ...current.overrides };
        if (mode === 'automatic') delete overrides[String(postId)];
        else overrides[String(postId)] = mode;
        return { ...current, overrides };
      });
      onNotify('SMART_COLLECTION_MEMBERSHIP_UPDATED');
    } catch {
      onNotify('SMART_COLLECTION_MEMBERSHIP_SAVE_FAILED', true);
    } finally {
      setMembershipSavingPostId('');
    }
  };

  if (loading) {
    return <div className="border-2 border-slate-900 bg-white p-8 font-mono text-xs font-black text-slate-700 shadow-[6px_6px_0_#0f172a] dark:border-white/10 dark:bg-[var(--surface-panel)] dark:text-slate-300 dark:shadow-none"><LoaderCircle className="mr-2 inline animate-spin text-neonCyan" size={14} /> TAXONOMY_MATRIX // LOADING_REGISTRY</div>;
  }

  if (error || !registry) {
    return (
      <div className="border-2 border-neonMagenta bg-neonMagenta/10 p-8 font-mono text-xs font-bold text-neonMagenta shadow-[6px_6px_0_#0f172a] dark:shadow-none">
        <p>{error || 'TAXONOMY_REGISTRY_UNAVAILABLE'}</p>
        <button type="button" onClick={loadRegistry} className="mt-4 inline-flex items-center gap-2 border border-neonMagenta px-3 py-2 font-black hover:bg-neonMagenta hover:text-slate-950"><RefreshCw size={13} /> RETRY_CONNECTION</button>
      </div>
    );
  }

  const selectedTerm = editor?.kind === 'term' ? editor.value : null;
  const selectedTermAliases = Array.isArray(selectedTerm?.aliases) ? selectedTerm.aliases : EMPTY_ARRAY;
  const selectedRelation = editor?.kind === 'relation' ? editor.value : null;
  const selectedSmart = editingSmart;
  const selectedDimensionDraft = editor?.kind === 'dimension' ? editor.value : null;

  return (
    <section className="relative overflow-hidden border-2 border-slate-900 bg-[var(--surface-panel)] shadow-[7px_7px_0_#0f172a] dark:border-white/10 dark:shadow-none" data-testid="taxonomy-admin-tab">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-neonCyan via-neonMagenta to-plasmaGreen" />
      <div className="corner-bracket-tl text-slate-900 dark:text-white/10" />
      <div className="corner-bracket-br text-slate-900 dark:text-white/10" />

      <header className="border-b-2 border-slate-900 bg-slate-950 px-5 py-5 text-white dark:border-white/10 md:px-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.18em] text-neonCyan"><span className="h-2 w-2 animate-pulse bg-neonCyan" /> SQL REGISTRY // OBSIDIAN COMPATIBLE</div>
            <h2 className="mt-2 font-headline text-2xl font-black italic uppercase tracking-tight">Taxonomy // Matrix Control</h2>
            <p className="mt-2 max-w-3xl font-body text-xs leading-relaxed text-slate-400">A három fő dimenzió, az ikonok, a terminusok, a kapcsolat-szabályok és a smart gyűjtemények központi vezérlője. A dokumentumok tartalma továbbra is a Vaultban marad; itt csak a kontrollált szótár és a viselkedés szerkeszthető.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] font-black">
            <span className="border border-neonCyan/60 bg-neonCyan/10 px-2.5 py-2 text-neonCyan">SCHEMA_V{registry.schema_version}</span>
            <span className="border border-plasmaGreen/60 bg-plasmaGreen/10 px-2.5 py-2 text-plasmaGreen">{dimensions.length} DIMENZIÓ</span>
            <button type="button" onClick={loadRegistry} disabled={saving} className="inline-flex items-center gap-1.5 border border-white/25 px-2.5 py-2 text-slate-200 transition-colors hover:border-neonCyan hover:text-neonCyan disabled:opacity-40"><RefreshCw size={12} /> FRISSÍTÉS</button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-900 bg-slate-100 px-4 py-3 dark:border-white/10 dark:bg-slate-950/70 md:px-6">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Taxonómia vezérlő nézetei">
          {[
            { id: 'dimensions', label: '01 DIMENZIÓK', icon: 'layers' },
            { id: 'terms', label: `02 CÍMKÉK (${allTerms.length})`, icon: 'tag' },
            { id: 'relations', label: `03 KAPCSOLATOK (${relationships.length})`, icon: 'network' },
            { id: 'smart', label: `04 SMART GYŰJTEMÉNYEK (${smartCollections.length})`, icon: 'sparkles' }
          ].map(tab => (
            <button key={tab.id} type="button" role="tab" aria-selected={activeView === tab.id} onClick={() => setActiveView(tab.id)} className={`inline-flex min-h-10 items-center gap-2 border px-3 font-mono text-[9px] font-black uppercase tracking-[0.09em] transition-all ${activeView === tab.id ? 'border-neonCyan bg-neonCyan text-slate-950 shadow-[2px_2px_0_#0f172a]' : 'border-slate-900 bg-white text-slate-700 hover:border-neonCyan dark:border-white/15 dark:bg-slate-900 dark:text-slate-300'}`}>
              <TaxonomyIcon iconKey={tab.icon} size={13} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,.9fr)]">
        <div className="min-w-0 border-b border-slate-900 p-4 dark:border-white/10 md:p-6 xl:border-b-0 xl:border-r">
          {activeView === 'dimensions' && (
            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><p className="font-mono text-[10px] font-black tracking-[0.16em] text-neonCyan">CORE FACETS</p><h3 className="mt-1 font-headline text-lg font-black uppercase text-slate-950 dark:text-white">Fő kategóriák & felületi viselkedés</h3></div>
                <button type="button" onClick={() => openEditor('dimension', createDimensionDraft(), true)} className="inline-flex min-h-10 items-center gap-2 border-2 border-slate-950 bg-neonCyan px-3 font-mono text-[10px] font-black uppercase text-slate-950 shadow-[2px_2px_0_#0f172a] transition-colors hover:bg-slate-950 hover:text-white"><Plus size={14} /> DIMENZIÓ</button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {dimensions.map(dimension => {
                  const tint = getTaxonomyColor(dimension.color);
                  return <button key={dimension.id} type="button" onClick={() => { setSelectedDimensionId(dimension.id); openEditor('dimension', dimension); }} className={`group min-h-48 border-2 p-4 text-left transition-all ${selectedDimensionId === dimension.id ? 'border-neonCyan bg-neonCyan/10 shadow-[4px_4px_0_#0f172a] dark:shadow-[0_0_20px_rgba(0,251,251,0.12)]' : 'border-slate-900 bg-white hover:border-neonCyan dark:border-white/10 dark:bg-slate-950/60'}`}>
                    <span className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center border" style={{ borderColor: tint, color: tint }}><TaxonomyIcon iconKey={dimension.icon_key} size={19} /></span><span className="font-mono text-[9px] font-black text-slate-500">{dimension.terms.length} TERM</span></span>
                    <span className="mt-5 block font-headline text-base font-black uppercase leading-tight text-slate-950 dark:text-white">{dimension.label}</span>
                    <span className="mt-2 block font-mono text-[9px] font-bold uppercase text-slate-500">{dimension.frontmatter_key}</span>
                    <span className="mt-4 flex flex-wrap gap-1"><span className="border border-slate-400/60 px-1.5 py-0.5 font-mono text-[8px] font-black text-slate-500">{dimension.filterable ? 'FILTER' : 'PASSZÍV'}</span><span className="border border-slate-400/60 px-1.5 py-0.5 font-mono text-[8px] font-black text-slate-500">{dimension.groupable ? 'PIVOT' : 'NEM PIVOT'}</span></span>
                  </button>;
                })}
              </div>
              <div className="mt-5 border-l-4 border-plasmaGreen bg-plasmaGreen/5 p-4 font-mono text-[10px] leading-relaxed text-slate-600 dark:text-slate-400"><strong className="text-plasmaGreen">KOMPATIBILITÁSI ELV:</strong> az ikon, címke és szín a regiszterből jön. A dokumentumokban az Obsidian-kompatibilis top-level lista marad, míg a publikus API a régi <code>dimensions</code> vetületet is szolgáltatja az átállás alatt.</div>
            </div>
          )}

          {activeView === 'terms' && (
            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><p className="font-mono text-[10px] font-black tracking-[0.16em] text-neonCyan">CONTROLLED VOCABULARY</p><h3 className="mt-1 font-headline text-lg font-black uppercase text-slate-950 dark:text-white">Címke-katalógus</h3></div>
                <div className="flex gap-2"><select aria-label="Aktív dimenzió" value={selectedDimension?.id || ''} onChange={(event) => setSelectedDimensionId(event.target.value)} className="border border-slate-900 bg-white px-2 py-2 font-mono text-[10px] font-black text-slate-900 outline-none dark:border-white/15 dark:bg-slate-950 dark:text-white">{dimensions.map(dimension => <option key={dimension.id} value={dimension.id}>{dimension.label}</option>)}</select><button type="button" onClick={() => openEditor('term', createTermDraft(selectedDimension), true)} disabled={!selectedDimension} className="inline-flex min-h-10 items-center gap-2 border-2 border-slate-950 bg-neonCyan px-3 font-mono text-[10px] font-black uppercase text-slate-950 shadow-[2px_2px_0_#0f172a] transition-colors hover:bg-slate-950 hover:text-white disabled:opacity-40"><Plus size={14} /> CÍMKE</button></div>
              </div>
              <div className="overflow-x-auto border border-slate-900 dark:border-white/10"><table className="w-full min-w-[42rem] border-collapse text-left font-mono text-[10px]"><thead className="bg-slate-950 text-slate-400"><tr><th className="px-3 py-2 font-black">CÍMKE</th><th className="px-3 py-2 font-black">OBSIDIAN / CANONICAL</th><th className="px-3 py-2 font-black">SZÜLŐ</th><th className="px-3 py-2 text-right font-black">ÁLLAPOT</th><th className="px-3 py-2" /></tr></thead><tbody>{(selectedDimension?.terms || []).map(term => <tr key={term.id} className="border-t border-slate-900/15 bg-white/70 transition-colors hover:bg-neonCyan/5 dark:border-white/10 dark:bg-slate-950/45"><td className="px-3 py-3"><span className="flex items-center gap-2 font-black text-slate-900 dark:text-white"><TaxonomyIcon iconKey={term.icon_key} size={14} style={{ color: getTaxonomyColor(term.color) }} />{term.label}</span></td><td className="px-3 py-3 text-slate-500">{term.slug}</td><td className="px-3 py-3 text-slate-500">{term.parent_id || '—'}</td><td className="px-3 py-3 text-right"><span className={term.active === false ? 'text-neonMagenta' : 'text-plasmaGreen'}>{term.active === false ? 'ARCHIVED' : 'ACTIVE'}</span></td><td className="px-3 py-3 text-right"><button type="button" onClick={() => openEditor('term', { ...term, dimension_id: selectedDimension.id })} className="border border-neonCyan/60 px-2 py-1 font-black text-neonCyan hover:bg-neonCyan hover:text-slate-950">EDIT</button></td></tr>)}</tbody></table></div>
              {!selectedDimension?.terms.length && <p className="border border-dashed border-slate-900/40 p-5 font-mono text-[10px] text-slate-500 dark:border-white/20">MÉG NINCS KONTROLLÁLT CÍMKE EBBEN A DIMENZIÓBAN.</p>}
            </div>
          )}

          {activeView === 'relations' && (
            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-black tracking-[0.16em] text-neonMagenta">SEMANTIC WIRING</p><h3 className="mt-1 font-headline text-lg font-black uppercase text-slate-950 dark:text-white">Terminológiai kapcsolatok</h3></div><button type="button" onClick={() => openEditor('relation', createRelationDraft(), true)} className="inline-flex min-h-10 items-center gap-2 border-2 border-slate-950 bg-neonMagenta px-3 font-mono text-[10px] font-black uppercase text-slate-950 shadow-[2px_2px_0_#0f172a] transition-colors hover:bg-slate-950 hover:text-white"><Plus size={14} /> KAPCSOLAT</button></div>
              <p className="mb-4 border-l-4 border-neonMagenta bg-neonMagenta/5 p-3 font-mono text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">Ez a réteg a taxonok közötti kontrollált kapcsolat. Nem ír át automatikusan Obsidian <code>[[wikilink]]</code> éleket; azok továbbra is a dokumentumok jóváhagyott kapcsolatai.</p>
              <div className="space-y-2">{relationships.map(relation => { const source = allTerms.find(term => term.id === relation.source_term_id); const target = allTerms.find(term => term.id === relation.target_term_id); return <button key={relation.id || `${relation.source_term_id}-${relation.target_term_id}`} type="button" onClick={() => openEditor('relation', relation)} className="flex w-full flex-wrap items-center gap-3 border border-slate-900 bg-white p-3 text-left transition-colors hover:border-neonMagenta dark:border-white/10 dark:bg-slate-950/45"><span className="inline-flex min-w-0 items-center gap-2 font-mono text-[10px] font-black text-slate-900 dark:text-white"><TaxonomyIcon iconKey={source?.icon_key || 'tag'} size={13} style={{ color: getTaxonomyColor(source?.color) }} />{source?.label || relation.source_term_id}</span><ChevronRight size={14} className="text-neonMagenta" /><span className="border border-neonMagenta/50 bg-neonMagenta/10 px-2 py-1 font-mono text-[9px] font-black text-neonMagenta">{relation.relation_type || 'related_to'}</span><ChevronRight size={14} className="text-neonMagenta" /><span className="inline-flex min-w-0 items-center gap-2 font-mono text-[10px] font-black text-slate-900 dark:text-white"><TaxonomyIcon iconKey={target?.icon_key || 'tag'} size={13} style={{ color: getTaxonomyColor(target?.color) }} />{target?.label || relation.target_term_id}</span><span className="ml-auto font-mono text-[9px] text-slate-500">W:{relation.weight ?? 1}</span></button>; })}</div>
              {!relationships.length && <p className="border border-dashed border-slate-900/40 p-5 font-mono text-[10px] text-slate-500 dark:border-white/20">NINCS MÉG DEFINIÁLT TAXON-KAPCSOLAT.</p>}
            </div>
          )}

          {activeView === 'smart' && (
            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] font-black tracking-[0.16em] text-plasmaGreen">VIRTUAL COLLECTIONS</p><h3 className="mt-1 font-headline text-lg font-black uppercase text-slate-950 dark:text-white">Smart gyűjtemények</h3></div><button type="button" onClick={() => openEditor('smart', createSmartCollectionDraft(), true)} className="inline-flex min-h-10 items-center gap-2 border-2 border-slate-950 bg-plasmaGreen px-3 font-mono text-[10px] font-black uppercase text-slate-950 shadow-[2px_2px_0_#0f172a] transition-colors hover:bg-slate-950 hover:text-white"><Plus size={14} /> GYŰJTEMÉNY</button></div>
              <div className="grid gap-3 md:grid-cols-2">{smartCollections.map(collection => <button key={collection.id} type="button" onClick={() => openEditor('smart', collection)} className="group border-2 border-slate-900 bg-white p-4 text-left transition-all hover:border-plasmaGreen dark:border-white/10 dark:bg-slate-950/55"><span className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center border" style={{ color: getTaxonomyColor(collection.color), borderColor: getTaxonomyColor(collection.color) }}><TaxonomyIcon iconKey={collection.icon_key} size={16} /></span><span className={collection.active === false ? 'font-mono text-[9px] font-black text-neonMagenta' : 'font-mono text-[9px] font-black text-plasmaGreen'}>{collection.active === false ? 'DISABLED' : 'ACTIVE'}</span></span><span className="mt-4 block font-headline text-sm font-black uppercase text-slate-950 dark:text-white">{collection.label}</span><span className="mt-1 block font-mono text-[9px] font-bold text-slate-500">/{collection.slug}</span><span className="mt-4 block font-mono text-[9px] text-slate-500">{collection.rules?.length || 0} SAFE RULE // GROUP: {getGroupByLabel(collection.group_by, dimensions)}</span></button>)}</div>
            </div>
          )}
        </div>

        <aside className="min-w-0 bg-slate-100/70 p-4 dark:bg-slate-950/45 md:p-6" aria-label="Taxonómia szerkesztő és Obsidian előnézet">
          {editor ? (
            <form onSubmit={saveEditor} className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-900 pb-3 dark:border-white/10"><div><p className="font-mono text-[9px] font-black tracking-[0.15em] text-neonCyan">{editor.isNew ? 'NEW REGISTRY ENTITY' : 'EDIT REGISTRY ENTITY'}</p><h3 className="mt-1 font-headline text-base font-black uppercase text-slate-950 dark:text-white">{editor.kind === 'dimension' ? 'Dimenzió' : editor.kind === 'term' ? 'Címke' : editor.kind === 'relation' ? 'Kapcsolat' : 'Smart gyűjtemény'}</h3></div><button type="button" aria-label="Szerkesztő bezárása" onClick={() => setEditor(null)} className="grid h-8 w-8 place-items-center border border-slate-900 text-slate-700 hover:border-neonMagenta hover:text-neonMagenta dark:border-white/15 dark:text-slate-300"><X size={14} /></button></div>

              {selectedDimensionDraft && <>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="MEGJELENŐ NÉV"><input required value={selectedDimensionDraft.label || ''} onChange={(event) => updateEditor('label', event.target.value)} className={inputClass} /></Field><Field label="STABIL KULCS"><input required readOnly={!editor.isNew} value={selectedDimensionDraft.id || ''} onChange={(event) => updateEditor('id', event.target.value)} className={`${inputClass} read-only:opacity-60`} placeholder="pl. iparag" /></Field><Field label="OBSIDIAN FRONTMATTER KULCS"><input required readOnly={!editor.isNew} value={selectedDimensionDraft.frontmatter_key || ''} onChange={(event) => updateEditor('frontmatter_key', event.target.value)} className={`${inputClass} read-only:opacity-60`} placeholder="pl. iparag" /></Field><Field label="SORREND"><input type="number" value={selectedDimensionDraft.sort_order ?? 0} onChange={(event) => updateEditor('sort_order', Number(event.target.value))} className={inputClass} /></Field><IconPicker value={selectedDimensionDraft.icon_key} onChange={(value) => updateEditor('icon_key', value)} /><ColorPicker value={selectedDimensionDraft.color} onChange={(value) => updateEditor('color', value)} /></div><div className="grid gap-2 sm:grid-cols-3"><Toggle checked={selectedDimensionDraft.filterable} onChange={(value) => updateEditor('filterable', value)} label="Szűrhető" /><Toggle checked={selectedDimensionDraft.groupable} onChange={(value) => updateEditor('groupable', value)} label="Pivotolható" /><Toggle checked={selectedDimensionDraft.multi_select} onChange={(value) => updateEditor('multi_select', value)} label="Több érték" /></div>
              </>}

              {selectedTerm && <>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="DIMENZIÓ"><select value={selectedTerm.dimension_id || ''} disabled={!editor.isNew} onChange={(event) => updateEditor('dimension_id', event.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}>{dimensions.map(dimension => <option key={dimension.id} value={dimension.id}>{dimension.label}</option>)}</select></Field><Field label="MEGJELENŐ NÉV"><input required value={selectedTerm.label || ''} onChange={(event) => { updateEditor('label', event.target.value); if (editor.isNew) updateEditor('slug', normalizeTaxonomySlug(event.target.value)); }} className={inputClass} /></Field><Field label="CANONICAL SLUG"><input required value={selectedTerm.slug || ''} onChange={(event) => updateEditor('slug', normalizeTaxonomySlug(event.target.value))} className={inputClass} /></Field><Field label="SZÜLŐ TERM (OPCIONÁLIS)"><select value={selectedTerm.parent_id || ''} onChange={(event) => updateEditor('parent_id', event.target.value)} className={inputClass}><option value="">NINCS</option>{allTerms.filter(term => term.id !== selectedTerm.id).map(term => <option key={term.id} value={term.id}>{entityLabel(term)}</option>)}</select></Field><IconPicker value={selectedTerm.icon_key} onChange={(value) => updateEditor('icon_key', value)} /><ColorPicker value={selectedTerm.color} onChange={(value) => updateEditor('color', value)} /><Field label="SORREND"><input type="number" value={selectedTerm.sort_order ?? 0} onChange={(event) => updateEditor('sort_order', Number(event.target.value))} className={inputClass} /></Field></div><Toggle checked={selectedTerm.active !== false} onChange={(value) => updateEditor('active', value)} label="Aktív / megjeleníthető" accent="magenta" />
                {!editor.isNew && <div className="border border-neonMagenta/40 bg-neonMagenta/5 p-3"><div className="mb-2 flex items-center justify-between gap-3"><div><p className="font-mono text-[9px] font-black tracking-[0.12em] text-neonMagenta">OBSIDIAN SAFE ALIASOK</p><p className="mt-1 font-mono text-[9px] leading-relaxed text-slate-500">A régi vagy Obsidianban problémás tag-eket itt a kanonikus termhez rendeled. A safe slug marad a frontmatter és a tag alias alapja.</p></div><span className="border border-neonMagenta/40 px-1.5 py-0.5 font-mono text-[9px] font-black text-neonMagenta">{selectedTermAliases.length}</span></div><div className="flex gap-2"><input aria-label="Új taxonómia alias" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); createAlias(); } }} disabled={saving} className={inputClass} placeholder="pl. SQL-Vezérelt RAG" /><button type="button" onClick={createAlias} disabled={saving || !aliasDraft.trim()} className="shrink-0 border border-neonMagenta px-2.5 font-mono text-[9px] font-black text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-40">ALIAS +</button></div><div className="mt-2 flex flex-wrap gap-1.5">{selectedTermAliases.map((alias, index) => <span key={alias.id || `${alias.alias || alias}-${index}`} className="inline-flex max-w-full items-center gap-1 border border-slate-900/30 bg-white px-2 py-1 font-mono text-[9px] font-bold text-slate-700 dark:border-white/15 dark:bg-slate-950 dark:text-slate-300"><span className="max-w-36 truncate">{alias.alias || alias}</span>{alias.id && selectedTermAliases.length > 1 && <button type="button" disabled={saving} onClick={() => deleteAlias(alias)} className="text-neonMagenta hover:text-slate-950 dark:hover:text-white disabled:opacity-40" title="Alias törlése">×</button>}</span>)}</div></div>}
              </>}

              {selectedRelation && <div className="space-y-3"><Field label="FORRÁS TERM"><select required value={selectedRelation.source_term_id || ''} disabled={!editor.isNew} onChange={(event) => updateEditor('source_term_id', event.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}><option value="">VÁLASSZ</option>{allTerms.map(term => <option key={term.id} value={term.id}>{entityLabel(term)}</option>)}</select></Field><div className="flex justify-center text-neonMagenta"><GitBranch size={18} /></div><Field label="CÉL TERM"><select required value={selectedRelation.target_term_id || ''} disabled={!editor.isNew} onChange={(event) => updateEditor('target_term_id', event.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}><option value="">VÁLASSZ</option>{allTerms.map(term => <option key={term.id} value={term.id}>{entityLabel(term)}</option>)}</select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="KAPCSOLAT TÍPUSA"><select value={selectedRelation.relation_type || 'related_to'} onChange={(event) => updateEditor('relation_type', event.target.value)} className={inputClass}><option value="related_to">KAPCSOLÓDIK</option><option value="broader_than">TÁGABB MINT</option><option value="narrower_than">SZŰKEBB MINT</option><option value="recommended_with">AJÁNLOTT EGYÜTT</option><option value="excludes">KIZÁRJA</option></select></Field><Field label="SÚLY (0–1)"><input min="0" max="1" step="0.05" type="number" value={selectedRelation.weight ?? 1} onChange={(event) => updateEditor('weight', Number(event.target.value))} className={inputClass} /></Field></div><Toggle checked={selectedRelation.bidirectional === true} onChange={(value) => updateEditor('bidirectional', value)} label="Kétirányú kapcsolat" accent="magenta" /></div>}

              {selectedSmart && <><div className="grid gap-3 sm:grid-cols-2"><Field label="MEGJELENŐ NÉV"><input required value={selectedSmart.name || selectedSmart.label || ''} onChange={(event) => updateEditor('name', event.target.value)} className={inputClass} /></Field><Field label="CANONICAL SLUG"><input required readOnly={!editor.isNew} value={selectedSmart.slug || ''} onChange={(event) => updateEditor('slug', normalizeTaxonomySlug(event.target.value))} className={`${inputClass} read-only:opacity-60`} /></Field><IconPicker value={selectedSmart.icon_key} onChange={(value) => updateEditor('icon_key', value)} /><ColorPicker value={selectedSmart.color} onChange={(value) => updateEditor('color', value)} /><Field label="CSOPORTOSÍTÁS"><select value={getGroupByEditorValue(selectedSmart.group_by, dimensions)} onChange={(event) => updateEditor('group_by', serializeGroupBy(event.target.value, dimensions))} className={inputClass}><option value="none">NINCS</option>{dimensions.filter(dimension => dimension.groupable).map(dimension => <option key={dimension.id} value={`taxonomy:${dimension.id}`}>{dimension.label}</option>)}<option value="content:presentation_profile">MEGJELENÍTÉSI PROFIL</option><option value="content:content_type">LEGACY PORTÁL TÍPUS</option><option value="content:category">KATEGÓRIA</option><option value="content:project_id">PROJEKT</option></select></Field><Field label="RENDEZÉS"><select value={selectedSmart.sort_by || 'recommended'} onChange={(event) => updateEditor('sort_by', event.target.value)} className={inputClass}><option value="recommended">AJÁNLÁS / RAG</option><option value="newest">LEGÚJABB</option><option value="title">CÍM A–Z</option></select></Field><Field label="HATÓKÖR"><select value={selectedSmart.scope || 'public'} onChange={(event) => updateEditor('scope', event.target.value)} className={inputClass}><option value="public">PUBLIKUS</option><option value="private">BELSŐ</option><option value="personal">SZEMÉLYES</option></select></Field><Field label="NÉZET"><select value={selectedSmart.layout?.view || 'cards'} onChange={(event) => updateEditor('layout', { ...(selectedSmart.layout || {}), view: event.target.value })} className={inputClass}><option value="cards">KÁRTYÁK</option><option value="list">LISTA</option><option value="graph">GRÁF</option></select></Field></div><div className="grid gap-2 sm:grid-cols-2"><Toggle checked={selectedSmart.active !== false} onChange={(value) => updateEditor('active', value)} label="Aktív" /><label className="flex min-h-10 items-center gap-2 border border-slate-900 bg-white/70 px-2.5 py-2 font-mono text-[9px] font-black uppercase tracking-[0.07em] text-slate-700 dark:border-white/15 dark:bg-slate-950/60 dark:text-slate-300">SZABÁLY LOGIKA<select value={selectedSmart.rule_logic || 'and'} onChange={(event) => updateEditor('rule_logic', event.target.value)} className="ml-auto bg-transparent text-neonCyan outline-none"><option value="and">ÉS</option><option value="or">VAGY</option></select></label></div><RuleEditor rules={selectedSmart.rules || (selectedSmart.rule ? [selectedSmart.rule] : [])} onChange={(value) => updateEditor('rules', value)} dimensions={dimensions} /></>}

              {selectedSmart && (editor.isNew ? (
                <p className="border border-dashed border-plasmaGreen/60 bg-plasmaGreen/5 p-3 font-mono text-[9px] font-bold leading-relaxed text-slate-600 dark:text-slate-400">A dokumentumok kézi felvétele és kizárása az első mentés után válik elérhetővé.</p>
              ) : (
                <SmartCollectionMembershipPanel
                  items={membershipItems}
                  summary={membershipSummary}
                  loading={membershipCatalog.loading}
                  error={membershipCatalog.error}
                  query={membershipQuery}
                  onQueryChange={setMembershipQuery}
                  filter={membershipFilter}
                  onFilterChange={setMembershipFilter}
                  savingPostId={membershipSavingPostId}
                  onChangeMode={updateSmartCollectionMembership}
                />
              ))}

              <div className="flex flex-wrap gap-2 border-t border-slate-900 pt-4 dark:border-white/10"><button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 border-2 border-slate-950 bg-neonCyan px-3 font-mono text-[10px] font-black uppercase text-slate-950 shadow-[2px_2px_0_#0f172a] transition-colors hover:bg-slate-950 hover:text-white disabled:opacity-40">{saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}{editor.isNew ? 'LÉTREHOZÁS' : 'MENTÉS'}</button>{!editor.isNew && <button type="button" disabled={saving} onClick={() => deleteEditorEntity(editor.kind, editor.value)} className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta px-3 font-mono text-[10px] font-black uppercase text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-40"><Trash2 size={13} /> TÖRLÉS</button>}</div>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="border border-dashed border-neonCyan/60 bg-neonCyan/5 p-4"><p className="font-mono text-[10px] font-black tracking-[0.13em] text-neonCyan">REGISTRY INSPECTOR</p><p className="mt-2 font-body text-xs leading-relaxed text-slate-600 dark:text-slate-400">Válassz egy kártyát vagy táblázatsort a szerkesztéshez. A módosítások egyedi, auditált admin API-hívások, nem teljes JSON-felülírások.</p></div>
              <div className="border border-slate-900 bg-white p-4 dark:border-white/10 dark:bg-slate-950/55"><p className="font-mono text-[9px] font-black tracking-[0.13em] text-plasmaGreen">OBSIDIAN FRONTMATTER PREVIEW</p><pre className="mt-3 overflow-x-auto whitespace-pre font-mono text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">{`${selectedDimension?.frontmatter_key || 'iparag'}:\n  - "${selectedDimension?.terms[0]?.slug || 'gyartas'}"\ntags:\n  - "taxon/${selectedDimension?.frontmatter_key || 'iparag'}/${selectedDimension?.terms[0]?.slug || 'gyartas'}"`}</pre><p className="mt-3 font-mono text-[9px] leading-relaxed text-slate-500">A <code>tags</code> csak biztonságos, normalizált Obsidian alias. A kanonikus kapcsolat a regiszterben és a frontmatter top-level listájában él.</p></div>
              <div className="border-l-4 border-neonMagenta bg-neonMagenta/5 p-4 font-mono text-[10px] leading-relaxed text-slate-600 dark:text-slate-400"><strong className="text-neonMagenta">NESTED YAML TILALOM:</strong> az új template-ekben nincs beágyazott <code>dimensions</code> objektum. Ez akadályozza meg, hogy az Obsidian Properties nézet ismeretlen adattípusként szöveggé alakítsa a mezőt.</div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export default TaxonomyTab;

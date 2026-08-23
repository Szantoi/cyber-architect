import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  FileCheck2,
  GitBranch,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Repeat2,
  Save,
  Send,
  ShieldCheck,
  UserRound,
  Waypoints,
  X
} from 'lucide-react';
import XYFlowDisplayCanvas from '../../graph/XYFlowDisplayCanvas.jsx';

const EMPTY_LIST = Object.freeze([]);
const text = value => String(value ?? '').trim();
const encodePath = value => encodeURIComponent(String(value || ''));

const emptyStep = (index = 1) => ({
  id: `step-${index}`,
  label: index === 1 ? 'Új munkalépés' : `Munkalépés ${index}`,
  description: '',
  kind: 'task',
  actor_type: 'human',
  actor_id: '',
  evidence_required: false,
  timeout_seconds: '3600'
});

const emptyTransition = (index = 1) => ({
  id: `transition-${index}`,
  source_step_id: '',
  target_step_id: '',
  label: 'tovább',
  kind: 'normal',
  guard: '',
  allowed_actor_types: ['human'],
  max_iterations: '1',
  evidence_required: false
});

const emptyWorkflow = () => ({
  id: '',
  slug: '',
  name: '',
  description: '',
  graph_id: '',
  active: true,
  version: '1',
  version_label: 'Első kiadás',
  max_total_steps: '1000',
  timeout_seconds: '86400',
  steps: [
    { ...emptyStep(1), id: 'start', label: 'Indítás', kind: 'start', actor_type: 'human' },
    { ...emptyStep(2), id: 'complete', label: 'Lezárás', kind: 'end', actor_type: 'system' }
  ],
  transitions: [{ ...emptyTransition(1), id: 'start-to-complete', source_step_id: 'start', target_step_id: 'complete', label: 'befejezve' }]
});

const emptyActor = () => ({ type: 'human', id: '', label: '' });
const emptyTransitionCommand = () => ({ transition_id: '', evidence: '', note: '', actor: emptyActor() });

const stringNumber = (value, fallback = '') => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : fallback;
};

const runtimeStepType = value => ({
  human_task: 'task',
  agent_task: 'task',
  service_task: 'task',
  gateway: 'decision'
}[text(value)] || text(value) || 'task');

const parseGuardAst = value => {
  const source = text(value);
  if (!source) return null;
  try {
    const ast = JSON.parse(source);
    if (!ast || Array.isArray(ast) || typeof ast !== 'object' || !text(ast.op)) {
      throw new Error('A guard egy op mezővel rendelkező JSON objektum legyen.');
    }
    return ast;
  } catch (error) {
    throw new Error(`ÉRVÉNYTELEN_GUARD_AST: ${error.message}`);
  }
};

const asArray = (payload, keys = []) => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return EMPTY_LIST;
};

const detailBody = payload => payload?.workflow || payload?.definition || payload || {};

const normalizeActor = (source = {}) => {
  if (typeof source === 'string') {
    const separator = source.indexOf(':');
    const candidateType = separator > 0 ? source.slice(0, separator) : 'human';
    return {
      type: ['human', 'agent', 'service'].includes(candidateType) ? candidateType : 'human',
      id: text(separator > 0 ? source.slice(separator + 1) : source),
      label: ''
    };
  }
  return {
    type: text(source.type || source.actor_type || source.assignee_type || source.kind) || 'human',
    id: text(source.id || source.actor_id || source.assignee_id || source.ref),
    label: text(source.label || source.actor_label || source.assignee_label || source.name)
  };
};

const normalizeStep = (step, index) => ({
  id: text(step?.key || step?.step_key || step?.id || step?.step_id) || `step-${index + 1}`,
  label: text(step?.label || step?.name || step?.title) || `Munkalépés ${index + 1}`,
  description: text(step?.description || step?.summary),
  kind: runtimeStepType(step?.kind || step?.step_type || step?.type),
  actor_type: normalizeActor(step?.metadata?.default_actor || step?.actor || step).type,
  actor_id: normalizeActor(step?.metadata?.default_actor || step?.actor || step).id,
  evidence_required: Boolean(step?.metadata?.evidence_required ?? step?.evidence_required ?? step?.requires_evidence ?? step?.evidenceRequired),
  timeout_seconds: stringNumber(step?.metadata?.suggested_timeout_seconds ?? step?.timeout_seconds ?? step?.timeoutSeconds, '')
});

const normalizeTransition = (transition, index) => ({
  id: text(transition?.id || transition?.transition_id || transition?.key) || `transition-${index + 1}`,
  source_step_id: text(transition?.source_step_key || transition?.source_step_id || transition?.source || transition?.from_step_key || transition?.from_step_id || transition?.from),
  target_step_id: text(transition?.target_step_key || transition?.target_step_id || transition?.target || transition?.to_step_key || transition?.to_step_id || transition?.to),
  label: text(transition?.label || transition?.name || transition?.event) || 'tovább',
  kind: text(transition?.kind || transition?.transition_type || transition?.type) || 'normal',
  guard: typeof (transition?.guard || transition?.condition) === 'object'
    ? JSON.stringify(transition.guard || transition.condition, null, 2)
    : text(transition?.guard || transition?.condition),
  allowed_actor_types: Array.isArray(transition?.allowed_actor_types)
    ? transition.allowed_actor_types
    : (Array.isArray(transition?.allowedActorTypes) ? transition.allowedActorTypes : ['human']),
  max_iterations: stringNumber(transition?.max_iterations ?? transition?.maxIterations, '1'),
  evidence_required: Boolean(transition?.evidence_required ?? transition?.requires_evidence ?? transition?.evidenceRequired)
});

const normalizeWorkflow = raw => {
  const workflow = detailBody(raw);
  const definition = workflow.current_version && typeof workflow.current_version === 'object'
    ? workflow.current_version
    : (workflow.published_version && typeof workflow.published_version === 'object'
      ? workflow.published_version
      : (workflow.definition && typeof workflow.definition === 'object' ? workflow.definition : workflow));
  const rawSteps = asArray(definition, ['steps', 'workflow_steps', 'nodes']);
  const rawTransitions = asArray(definition, ['transitions', 'workflow_transitions', 'edges']);
  const publishedDefinition = workflow.published_version && typeof workflow.published_version === 'object'
    ? workflow.published_version
    : definition;
  const publishedSteps = asArray(publishedDefinition, ['steps', 'workflow_steps', 'nodes']).map(normalizeStep);
  const publishedTransitions = asArray(publishedDefinition, ['transitions', 'workflow_transitions', 'edges']).map(normalizeTransition);
  return {
    id: text(workflow.id || workflow.workflow_id || workflow.slug),
    slug: text(workflow.slug || workflow.workflow_slug || workflow.id),
    name: text(workflow.name || workflow.title || workflow.label) || 'Névtelen workflow',
    description: text(workflow.description || workflow.summary),
    graph_id: text(workflow.graph_id || workflow.graphId || workflow.graph?.id),
    active: workflow.active !== false && workflow.is_active !== false,
    version: stringNumber(definition.version_number || definition.version || workflow.version || workflow.current_version_number, '1'),
    version_label: text(definition.label || workflow.version_label),
    published_version_number: stringNumber(workflow.published_version_number ?? workflow.published_version?.version_number, ''),
    max_total_steps: stringNumber(definition.max_total_steps ?? workflow.max_total_steps, '1000'),
    timeout_seconds: stringNumber(definition.metadata?.execution_policy?.suggested_timeout_seconds ?? workflow.timeout_seconds ?? definition.timeout_seconds, '86400'),
    status: text(definition.status || workflow.status || workflow.lifecycle_status || (workflow.active === false ? 'inactive' : 'active')),
    steps: rawSteps.map(normalizeStep),
    transitions: rawTransitions.map(normalizeTransition),
    published_steps: publishedSteps,
    published_transitions: publishedTransitions,
    raw: workflow
  };
};

const normalizeInstance = raw => {
  const wrapper = raw || {};
  const instance = wrapper?.instance && typeof wrapper.instance === 'object' ? wrapper.instance : wrapper;
  const actor = normalizeActor(instance.current_actor || instance.actor || instance.assignee || {});
  const startedBy = normalizeActor(instance.started_by || instance.startedBy || {});
  const events = asArray(instance, ['events', 'history', 'event_log', 'transitions']).length
    ? asArray(instance, ['events', 'history', 'event_log', 'transitions'])
    : asArray(wrapper, ['events', 'history', 'event_log']);
  const availableTransitions = asArray(instance, ['available_transitions', 'availableTransitions', 'next_transitions']).length
    ? asArray(instance, ['available_transitions', 'availableTransitions', 'next_transitions'])
    : asArray(wrapper, ['available_transitions', 'availableTransitions', 'next_transitions']);
  return {
    id: text(instance.id || instance.instance_id),
    workflow_id: text(instance.workflow_id || instance.workflow?.id),
    workflow_version: instance.workflow_version && typeof instance.workflow_version === 'object'
      ? instance.workflow_version
      : { version_number: instance.workflow_version_number || instance.version_number || null },
    status: text(instance.status || instance.state) || 'running',
    current_step_id: text(instance.current_step_key || instance.current_step?.key || instance.current_step_id || instance.current_step?.id || instance.step_id),
    current_step_label: text(instance.current_step_label || instance.current_step?.label || instance.current_step?.name),
    actor,
    started_by: startedBy,
    started_at: text(instance.started_at || instance.created_at || instance.startedAt),
    updated_at: text(instance.updated_at || instance.updatedAt),
    iteration_count: stringNumber(instance.step_count ?? instance.iteration_count ?? instance.iterations, '0'),
    max_iterations: stringNumber(instance.max_iterations ?? instance.maxIterations, ''),
    evidence: instance.evidence ?? instance.latest_evidence ?? null,
    events,
    availableTransitions,
    raw: instance
  };
};

const requestError = async response => {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  throw new Error(text(payload?.error || payload?.message || payload?.details) || `HTTP_${response.status || 'ERROR'}`);
};

const controlClass = 'min-h-10 w-full border border-white/15 bg-slate-950 px-2.5 font-mono text-xs text-slate-100 outline-none transition-colors focus:border-neonCyan disabled:cursor-not-allowed disabled:opacity-45';

function Panel({ title, icon: Icon, accent = 'text-neonCyan', children, className = '' }) {
  return (
    <section className={`border border-white/10 bg-[#07111e]/85 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] ${className}`}>
      <header className="flex min-h-11 items-center gap-2 border-b border-white/10 bg-black/20 px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[.15em] text-slate-300">
        {React.createElement(Icon, { size: 14, className: accent })}
        <span>{title}</span>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children, className = '' }) {
  const fieldId = React.useId();
  const controls = React.Children.map(children, child => {
    if (!React.isValidElement(child) || typeof child.type !== 'string' || !['input', 'select', 'textarea'].includes(child.type)) {
      return child;
    }
    return React.cloneElement(child, {
      id: child.props.id || fieldId,
      'aria-label': child.props['aria-label'] || label
    });
  });
  return (
    <div className={`flex min-w-0 flex-col gap-1 font-mono text-[9px] font-black uppercase tracking-[.11em] text-slate-500 ${className}`}>
      <label htmlFor={fieldId}>{label}</label>
      {controls}
      {hint && <span className="normal-case tracking-normal text-[9px] font-normal leading-relaxed text-slate-600">{hint}</span>}
    </div>
  );
}

function StateChip({ value, className = '' }) {
  const normalized = text(value).toLowerCase();
  const tone = ['completed', 'complete', 'closed', 'success', 'active'].includes(normalized)
    ? 'border-plasmaGreen/50 bg-plasmaGreen/10 text-plasmaGreen'
    : ['failed', 'error', 'cancelled', 'blocked', 'expired'].includes(normalized)
      ? 'border-neonMagenta/55 bg-neonMagenta/10 text-neonMagenta'
      : ['waiting', 'paused', 'pending', 'review'].includes(normalized)
        ? 'border-amber-300/60 bg-amber-300/10 text-amber-200'
        : 'border-neonCyan/40 bg-neonCyan/10 text-neonCyan';
  return <span className={`inline-flex max-w-full items-center border px-1.5 py-1 font-mono text-[8px] font-black uppercase tracking-[.1em] ${tone} ${className}`}>{text(value) || 'unknown'}</span>;
}

function ActorBadge({ actor, compact = false }) {
  const isAgent = actor?.type === 'agent';
  const Icon = isAgent ? Bot : UserRound;
  const name = text(actor?.label || actor?.id);
  if (!name) return <span className="font-mono text-[9px] text-slate-600">—</span>;
  return <span className={`inline-flex min-w-0 items-center gap-1 border px-1.5 py-1 font-mono ${compact ? 'text-[8px]' : 'text-[9px]'} ${isAgent ? 'border-neonMagenta/35 bg-neonMagenta/5 text-neonMagenta' : 'border-neonCyan/35 bg-neonCyan/5 text-neonCyan'}`}><Icon size={compact ? 10 : 12} /><span className="truncate">{name}</span></span>;
}

function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-neonMagenta/55 bg-neonMagenta/10 p-3 font-mono text-[10px] leading-relaxed text-neonMagenta"><span className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</span>{onRetry && <button type="button" onClick={onRetry} className="border border-neonMagenta px-2.5 py-1.5 font-black hover:bg-neonMagenta hover:text-slate-950">ÚJRAPRÓBÁLÁS</button>}</div>;
}

function LoadingBlock({ label = 'WORKFLOW_STUDIO // BETÖLTÉS' }) {
  return <div role="status" className="flex min-h-40 items-center justify-center gap-3 border border-neonCyan/30 bg-slate-950/50 font-mono text-[10px] font-black tracking-[.13em] text-neonCyan"><LoaderCircle size={17} className="animate-spin" />{label}</div>;
}

function formatMoment(value) {
  if (!text(value)) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? text(value) : new Intl.DateTimeFormat('hu-HU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function evidenceLabel(value) {
  if (Array.isArray(value)) {
    return value.map(item => evidenceLabel(item)).filter(Boolean).join(' · ');
  }
  if (value && typeof value === 'object') {
    return text(value.id || value.uri || value.note || value.label || value.kind) || 'strukturált bizonyíték';
  }
  return text(value);
}

function stepAccent(step) {
  if (step.kind === 'agent_task' || step.actor_type === 'agent') return 'border-neonMagenta/50 text-neonMagenta';
  if (step.kind === 'gateway' || step.kind === 'decision') return 'border-amber-300/55 text-amber-200';
  if (step.kind === 'end' || step.kind === 'end_event') return 'border-plasmaGreen/50 text-plasmaGreen';
  return 'border-neonCyan/45 text-neonCyan';
}

function WorkflowTopology({ workflow, selectedStepId, instance, onPickStep }) {
  const steps = workflow?.steps || EMPTY_LIST;
  const transitions = workflow?.transitions || EMPTY_LIST;
  const currentStepId = text(instance?.current_step_id);
  const visualSteps = useMemo(() => steps.map(step => {
    const isAgent = step.actor_type === 'agent' || step.kind === 'agent_task';
    const isEnd = step.kind === 'end' || step.kind === 'end_event';
    const isDecision = step.kind === 'gateway' || step.kind === 'decision';
    const current = text(step.id) === currentStepId;
    const actor = text(step.actor_id) || (isAgent ? 'AGENT' : step.actor_type === 'human' ? 'EMBER' : 'RENDSZER');
    return {
      ...step,
      id: text(step.id),
      type: text(step.kind) || 'LÉPÉS',
      accent: isAgent ? '#ff00ff' : (isEnd ? '#80ff00' : (isDecision ? '#ffb74d' : '#00fbfb')),
      highlighted: current || text(step.id) === text(selectedStepId),
      current,
      status: current ? `${text(instance?.status).toUpperCase() || 'FUTÁSBAN'} · AKTUÁLIS` : (isAgent ? 'AGENT' : isEnd ? 'LEZÁRÁS' : isDecision ? 'DÖNTÉSI KAPU' : 'LÉPÉS'),
      context: actor,
      metricLabel: current ? 'FUTÁS' : 'SZEREPLŐ',
      metric: current ? (text(instance?.id) || 'AKTÍV PÉLDÁNY') : actor
    };
  }), [currentStepId, instance?.id, instance?.status, selectedStepId, steps]);
  const visualTransitions = useMemo(() => transitions.map((transition, index) => {
    const source = text(transition.source_step_id);
    const target = text(transition.target_step_id);
    const loop = transition.kind === 'loop' || source === target;
    return {
      ...transition,
      id: text(transition.id) || `transition-${index + 1}`,
      source,
      target,
      color: loop ? '#ff00ff' : '#80ff00',
      loop,
      highlighted: source === currentStepId,
      label: text(transition.label) || (loop ? 'ismétlés' : 'tovább'),
      ariaLabel: `${source} → ${target}; ${text(transition.label) || 'workflow átmenet'}${loop ? ', loop' : ''}`
    };
  }), [currentStepId, transitions]);

  return (
    <section data-testid="workflow-topology" className="overflow-hidden border border-neonCyan/25 bg-[#040b14] shadow-[0_0_38px_rgba(0,251,251,.055)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3">
        <div><p className="font-mono text-[9px] font-black uppercase tracking-[.15em] text-neonCyan">Definíciós topológia // XYFlow irányított átmenetek</p><p className="mt-1 font-mono text-[9px] text-slate-500">{steps.length} lépés · {transitions.length} átmenet · a visszahajló ív explicit loop</p></div>
        <span className="font-mono text-[8px] font-black text-slate-500">LÉPÉSRE KATTINTVA SZERKESZTHETŐ</span>
      </header>
      <XYFlowDisplayCanvas
        canvasId="workflow-topology-canvas"
        ariaLabel={`${workflow?.name || 'Workflow'} lépései és irányított átmenetei`}
        nodes={visualSteps}
        edges={visualTransitions}
        selectedNodeId={selectedStepId}
        onSelectNode={step => onPickStep(step.id)}
        layout="workflow"
        storageKey={`workflow-topology-display:${text(workflow?.id || workflow?.slug || 'draft')}:v1`}
        emptyMessage="Adj legalább egy workflow-lépést a vizuális definícióhoz."
        className="xyflow-display-canvas--workflow"
      />
      <div className="grid gap-2 border-t border-white/10 bg-black/15 p-3 sm:grid-cols-3"><span className="flex items-center gap-1.5 font-mono text-[8px] text-neonCyan"><CircleDot size={11} /> emberi / általános lépés</span><span className="flex items-center gap-1.5 font-mono text-[8px] text-neonMagenta"><Bot size={11} /> agent lépés</span><span className="flex items-center gap-1.5 font-mono text-[8px] text-plasmaGreen"><ArrowRight size={11} /> irányított átmenet</span></div>
      {transitions.some(item => item.kind === 'loop' || item.source_step_id === item.target_step_id) && <div className="border-t border-neonMagenta/25 bg-neonMagenta/5 px-3 py-2 font-mono text-[9px] leading-relaxed text-slate-400"><Repeat2 size={11} className="mr-1 inline text-neonMagenta" />A loop nem önmagában fut: a transition őre, iterációs limitje és a globális lépésbudget együttesen korlátozza. Az időkeret metadata policy, a scheduler a következő runtime-réteg feladata.</div>}
    </section>
  );
}

function WorkflowList({ workflows, selectedId, onSelect, onNew, loading }) {
  return <Panel title="Workflow regiszter" icon={Layers3} accent="text-neonCyan" className="h-full"><div className="mb-3 flex items-center justify-between gap-3"><p className="font-mono text-[9px] leading-relaxed text-slate-500">Definíciók a gráfréteg felett. A futási példányok nem módosítják a Markdownot.</p><button type="button" onClick={onNew} className="inline-flex min-h-9 shrink-0 items-center gap-1 border border-neonCyan/65 bg-neonCyan/10 px-2.5 font-mono text-[9px] font-black text-neonCyan hover:bg-neonCyan hover:text-slate-950"><Plus size={12} />ÚJ</button></div>{loading ? <LoadingBlock label="REGISZTER BETÖLTÉS" /> : <div className="space-y-2">{workflows.map(workflow => { const selected = workflow.id === selectedId; return <button type="button" key={workflow.id} onClick={() => onSelect(workflow.id)} className={`w-full border p-3 text-left transition-colors ${selected ? 'border-neonCyan bg-neonCyan/10 shadow-[inset_3px_0_0_#00FFFF]' : 'border-white/10 bg-black/20 hover:border-neonCyan/50'}`}><div className="flex gap-2"><span className={`mt-1 h-2 w-2 shrink-0 ${workflow.active ? 'bg-plasmaGreen shadow-[0_0_10px_#80FF00]' : 'bg-slate-600'}`} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><b className="truncate font-mono text-[11px] text-slate-100">{workflow.name}</b><StateChip value={workflow.status} /></div><p className="mt-1 truncate font-mono text-[9px] text-slate-500">{workflow.slug || workflow.id}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="border border-white/10 px-1.5 py-0.5 font-mono text-[8px] text-slate-400">v{workflow.version}</span><span className="border border-white/10 px-1.5 py-0.5 font-mono text-[8px] text-slate-400">{workflow.steps.length} LÉPÉS</span><span className="border border-white/10 px-1.5 py-0.5 font-mono text-[8px] text-slate-400">{workflow.transitions.length} ÍV</span></div></div></div></button>; })}{!workflows.length && <div className="border border-dashed border-white/20 px-3 py-8 text-center font-mono text-[10px] leading-relaxed text-slate-500">Még nincs workflow-definíció. Hozd létre az első folyamatot egy irányított gráfhoz.</div>}</div>}</Panel>;
}

function WorkflowIdentityForm({ workflow, onChange, onSave, onPublish, saving, publishing, isNew }) {
  const update = field => event => onChange(current => ({
    ...current,
    [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value
  }));
  const immutable = !isNew;

  return (
    <Panel title={isNew ? 'Új workflow-definíció' : 'Definíció és immutable verzió'} icon={Waypoints} accent="text-neonCyan">
      <form onSubmit={onSave} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Név" hint={immutable ? 'A v1-ben a workflow-identitás nem szerkeszthető; új verzió csak a topológiát módosítja.' : undefined}>
          <input required disabled={immutable} className={controlClass} value={workflow.name} onChange={update('name')} placeholder="Pl. CAD változtatás-jóváhagyás" />
        </Field>
        <Field label="Slug / stabil kulcs" hint="Az adatbázis-azonosítóhoz és hivatkozásokhoz.">
          <input required disabled={immutable} className={controlClass} value={workflow.slug} onChange={update('slug')} placeholder="cad-change-approval" />
        </Field>
        <Field label="Kapcsolt gráfréteg ID" hint="Kötelező tulajdonosi kapcsolat, de a gráf edge-ei nem válnak transitionné.">
          <input required disabled={immutable} className={controlClass} value={workflow.graph_id} onChange={update('graph_id')} placeholder="workflow/cad-approval" />
        </Field>
        <Field label="Verzió címkéje" hint="Egy meglévő definíció mentése új, immutable draft verziót készít.">
          <input className={controlClass} value={workflow.version_label} onChange={update('version_label')} placeholder="pl. QA loop szigorítás" />
        </Field>
        <Field label="Leírás" className="md:col-span-2">
          <textarea disabled={immutable} className={`${controlClass} min-h-20 resize-y`} value={workflow.description} onChange={update('description')} placeholder="Mi indítja el, mi a végeredmény, és milyen emberi kapu kötelező?" />
        </Field>
        <Field label="Globális végrehajtási lépéslimit" hint="A szerver ténylegesen kényszeríti; nem helyettesíti a loopok saját limitjét.">
          <input required min="1" max="100000" type="number" className={controlClass} value={workflow.max_total_steps} onChange={update('max_total_steps')} />
        </Field>
        <Field label="Javasolt időkeret (mp)" hint="v1: metadata policy, a jelenlegi runtime még nem indít időzítőt/schedulert.">
          <input min="0" type="number" className={controlClass} value={workflow.timeout_seconds} onChange={update('timeout_seconds')} />
        </Field>
        <div className="flex flex-wrap items-end justify-between gap-3 border border-white/10 bg-black/20 px-3 py-2.5 xl:col-span-4">
          <label className="inline-flex items-center gap-2 font-mono text-[10px] text-slate-300">
            <input type="checkbox" disabled={immutable} checked={workflow.active} onChange={update('active')} /> AKTÍV DEFINÍCIÓ
          </label>
          <div className="flex flex-wrap gap-2">
            {!isNew && <button type="button" onClick={onPublish} disabled={saving || publishing || workflow.status === 'published'} className="inline-flex min-h-10 items-center gap-2 border border-plasmaGreen/60 bg-plasmaGreen/10 px-3 font-mono text-[9px] font-black text-plasmaGreen hover:bg-plasmaGreen hover:text-slate-950 disabled:opacity-45">{publishing ? <LoaderCircle size={13} className="animate-spin" /> : <ShieldCheck size={13} />}{workflow.status === 'published' ? 'VERZIÓ PUBLIKÁLVA' : `V${workflow.version} PUBLIKÁLÁSA`}</button>}
            <button type="submit" disabled={saving || publishing} className="inline-flex min-h-10 items-center gap-2 border border-neonCyan/65 bg-neonCyan/10 px-3 font-mono text-[10px] font-black uppercase tracking-[.11em] text-neonCyan hover:bg-neonCyan hover:text-slate-950 disabled:opacity-45">{saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}{isNew ? 'WORKFLOW LÉTREHOZÁSA' : 'ÚJ DRAFT VERZIÓ MENTÉSE'}</button>
          </div>
        </div>
      </form>
    </Panel>
  );
}

function StepEditor({ workflow, selectedStepId, onPickStep, onChange }) {
  const updateStep = (id, key, value) => onChange(current => {
    const steps = current.steps.map(step => step.id === id ? { ...step, [key]: value } : step);
    if (key !== 'id' || value === id) return { ...current, steps };
    return {
      ...current,
      steps,
      transitions: current.transitions.map(transition => ({
        ...transition,
        source_step_id: transition.source_step_id === id ? value : transition.source_step_id,
        target_step_id: transition.target_step_id === id ? value : transition.target_step_id
      }))
    };
  });
  const removeStep = id => onChange(current => ({
    ...current,
    steps: current.steps.filter(step => step.id !== id),
    transitions: current.transitions.filter(transition => transition.source_step_id !== id && transition.target_step_id !== id)
  }));
  const addStep = () => onChange(current => ({ ...current, steps: [...current.steps, emptyStep(current.steps.length + 1)] }));

  return (
    <Panel title="Lépések és felelősök" icon={CircleDot} accent="text-neonCyan">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl font-mono text-[9px] leading-relaxed text-slate-500">A lépéshez tárolható ajánlott ember vagy agent. A tényleges végrehajtó minden transition-eseményen külön, auditáltan kerül rögzítésre; a jogosultságot az él <b className="text-slate-300">allowed_actor_types</b> mezője szabályozza.</p>
        <button type="button" onClick={addStep} className="inline-flex min-h-9 items-center gap-1 border border-neonCyan/55 px-2.5 font-mono text-[9px] font-black text-neonCyan hover:bg-neonCyan hover:text-slate-950"><Plus size={12} />LÉPÉS</button>
      </div>
      <div className="space-y-3">
        {workflow.steps.map(step => (
          <article key={step.id} className={`border p-3 transition-colors ${selectedStepId === step.id ? 'border-neonCyan bg-neonCyan/[.055]' : 'border-white/10 bg-black/20'}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => onPickStep(step.id)} className="flex min-w-0 items-center gap-2 text-left"><span className={`border px-1.5 py-1 font-mono text-[8px] font-black ${stepAccent(step)}`}>{step.kind}</span><b className="truncate font-mono text-xs text-slate-100">{step.label || step.id}</b></button>
              <button type="button" onClick={() => removeStep(step.id)} disabled={workflow.steps.length <= 2} className="inline-flex min-h-8 items-center gap-1 border border-neonMagenta/40 px-2 font-mono text-[8px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-40"><X size={11} />ELTÁVOLÍTÁS</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Stabil lépéskulcs" hint="Kisbetű, szám, kötőjel vagy aláhúzás."><input required className={controlClass} value={step.id} onChange={event => updateStep(step.id, 'id', event.target.value)} /></Field>
              <Field label="Megjelenő név"><input required className={controlClass} value={step.label} onChange={event => updateStep(step.id, 'label', event.target.value)} /></Field>
              <Field label="Lépéstípus"><select className={controlClass} value={step.kind} onChange={event => updateStep(step.id, 'kind', event.target.value)}><option value="start">INDÍTÁS</option><option value="task">FELADAT</option><option value="decision">DÖNTÉS / GATEWAY</option><option value="wait">VÁRAKOZÁS</option><option value="end">LEZÁRÁS</option></select></Field>
              <Field label="Ajánlott végrehajtó típusa"><select className={controlClass} value={step.actor_type} onChange={event => updateStep(step.id, 'actor_type', event.target.value)}><option value="human">EMBER</option><option value="agent">AGENT</option><option value="service">SZOLGÁLTATÁS</option></select></Field>
              <Field label="Ajánlott felelős / agent" className="xl:col-span-2"><input className={controlClass} value={step.actor_id} onChange={event => updateStep(step.id, 'actor_id', event.target.value)} placeholder="pl. technical-lead vagy quality-agent" /></Field>
              <Field label="Javasolt időkeret (mp)" hint="Metadata policy; a v1 runtime nem indít automatikus timeoutot."><input min="0" type="number" className={controlClass} value={step.timeout_seconds} onChange={event => updateStep(step.id, 'timeout_seconds', event.target.value)} /></Field>
              <div className="flex min-h-10 items-center border border-white/10 bg-slate-950 px-2.5 font-mono text-[9px] leading-relaxed text-slate-500">A bizonyíték-kötelezettség az egyes <b className="ml-1 text-slate-300">átmenetekhez</b> tartozik.</div>
              <Field label="Lépés leírás" className="md:col-span-2 xl:col-span-4"><textarea className={`${controlClass} min-h-16 resize-y`} value={step.description} onChange={event => updateStep(step.id, 'description', event.target.value)} placeholder="Mit kell teljesíteni, és mit ellenőriz a következő lépés?" /></Field>
            </div>
          </article>
        ))}
        {!workflow.steps.length && <p className="border border-dashed border-white/15 p-5 text-center font-mono text-[10px] text-slate-500">A definíció jelenleg üres.</p>}
      </div>
    </Panel>
  );
}

function TransitionEditor({ workflow, onChange }) {
  const updateTransition = (id, key, value) => onChange(current => ({
    ...current,
    transitions: current.transitions.map(transition => transition.id === id ? { ...transition, [key]: value } : transition)
  }));
  const addTransition = () => onChange(current => ({ ...current, transitions: [...current.transitions, emptyTransition(current.transitions.length + 1)] }));
  const removeTransition = id => onChange(current => ({ ...current, transitions: current.transitions.filter(transition => transition.id !== id) }));
  const addReverseTransition = transition => onChange(current => ({
    ...current,
    transitions: [
      ...current.transitions,
      {
        ...emptyTransition(current.transitions.length + 1),
        source_step_id: transition.target_step_id,
        target_step_id: transition.source_step_id,
        label: `vissza: ${transition.label || 'átmenet'}`,
        kind: 'loop',
        allowed_actor_types: [...transition.allowed_actor_types],
        evidence_required: Boolean(transition.evidence_required)
      }
    ]
  }));
  const toggleActor = (id, actorType) => onChange(current => ({
    ...current,
    transitions: current.transitions.map(transition => {
      if (transition.id !== id) return transition;
      const allowed = transition.allowed_actor_types.includes(actorType)
        ? transition.allowed_actor_types.filter(value => value !== actorType)
        : [...transition.allowed_actor_types, actorType];
      return { ...transition, allowed_actor_types: allowed.length ? allowed : ['human'] };
    })
  }));

  return (
    <Panel title="Irányított runtime-transitionök és kontrollált loopok" icon={GitBranch} accent="text-neonMagenta">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl font-mono text-[9px] leading-relaxed text-slate-500"><b className="text-neonMagenta">NEM a tudásgráf általános edge-ei.</b> Csak itt, a workflow-verzióban deklarált átmenetek futtathatók. A kétirányúság két külön transition rekord — külön guarddal, bizonyíték-szabállyal és iterációs limittel; a visszairányú ív loop.</p>
        <button type="button" onClick={addTransition} disabled={workflow.steps.length < 2} className="inline-flex min-h-9 items-center gap-1 border border-neonMagenta/60 px-2.5 font-mono text-[9px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-45"><Plus size={12} />ÁTMENT</button>
      </div>
      <div className="space-y-3">
        {workflow.transitions.map(transition => {
          const sourceIndex = workflow.steps.findIndex(step => step.id === transition.source_step_id);
          const targetIndex = workflow.steps.findIndex(step => step.id === transition.target_step_id);
          const loop = transition.kind === 'loop' || (sourceIndex >= 0 && targetIndex >= 0 && targetIndex <= sourceIndex);
          return <article key={transition.id} className={`border p-3 ${loop ? 'border-neonMagenta/45 bg-neonMagenta/[.045]' : 'border-white/10 bg-black/20'}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`border px-1.5 py-1 font-mono text-[8px] font-black ${loop ? 'border-neonMagenta/55 text-neonMagenta' : 'border-plasmaGreen/50 text-plasmaGreen'}`}>{loop ? '↻ LOOP' : '→ ÁTMENET'}</span><span className="font-mono text-[9px] text-slate-500">{transition.id}</span></div><div className="flex gap-2"><button type="button" onClick={() => addReverseTransition(transition)} disabled={!transition.source_step_id || !transition.target_step_id} className="inline-flex min-h-8 items-center gap-1 border border-neonCyan/40 px-2 font-mono text-[8px] font-black text-neonCyan hover:bg-neonCyan hover:text-slate-950 disabled:opacity-40"><Repeat2 size={11} />VISSZAÉL</button><button type="button" onClick={() => removeTransition(transition.id)} disabled={workflow.transitions.length <= 1} className="inline-flex min-h-8 items-center gap-1 border border-neonMagenta/40 px-2 font-mono text-[8px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-40"><X size={11} />ELTÁVOLÍTÁS</button></div></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Átmenet ID"><input required className={controlClass} value={transition.id} onChange={event => updateTransition(transition.id, 'id', event.target.value)} /></Field>
              <Field label="Címke / esemény"><input className={controlClass} value={transition.label} onChange={event => updateTransition(transition.id, 'label', event.target.value)} placeholder="elfogadva / javításra vissza" /></Field>
              <Field label="Forráslépés"><select required className={controlClass} value={transition.source_step_id} onChange={event => updateTransition(transition.id, 'source_step_id', event.target.value)}><option value="">-- FORRÁS --</option>{workflow.steps.map(step => <option key={step.id} value={step.id}>{step.label} // {step.id}</option>)}</select></Field>
              <Field label="Céllépés"><select required className={controlClass} value={transition.target_step_id} onChange={event => updateTransition(transition.id, 'target_step_id', event.target.value)}><option value="">-- CÉL --</option>{workflow.steps.map(step => <option key={step.id} value={step.id}>{step.label} // {step.id}</option>)}</select></Field>
              <Field label="Megjelenítési mód"><select className={controlClass} value={transition.kind} onChange={event => updateTransition(transition.id, 'kind', event.target.value)}><option value="normal">NORMÁLIS</option><option value="loop">VISSZACSATOLÓ LOOP</option><option value="exception">KIVÉTEL / ESKALÁCIÓ</option></select></Field>
              <Field label="Max. iteráció" hint="A backend a ciklusba eső transitionöknél kötelezően érvényesíti."><input required min="1" max="1000" type="number" className={controlClass} value={transition.max_iterations} onChange={event => updateTransition(transition.id, 'max_iterations', event.target.value)} /></Field>
              <fieldset className="border border-white/10 bg-slate-950 px-2.5 py-2"><legend className="px-1 font-mono text-[8px] font-black uppercase tracking-[.1em] text-slate-500">Engedélyezett végrehajtó</legend><div className="mt-1 flex flex-wrap gap-2">{['human', 'agent', 'service'].map(actorType => <label key={actorType} className="inline-flex items-center gap-1 font-mono text-[9px] text-slate-300"><input type="checkbox" checked={transition.allowed_actor_types.includes(actorType)} onChange={() => toggleActor(transition.id, actorType)} />{actorType.toUpperCase()}</label>)}</div></fieldset>
              <label className="flex min-h-10 items-center gap-2 border border-white/10 bg-slate-950 px-2.5 font-mono text-[9px] text-slate-300"><input type="checkbox" checked={transition.evidence_required} onChange={event => updateTransition(transition.id, 'evidence_required', event.target.checked)} /> BIZONYÍTÉK KÖTELEZŐ</label>
              <Field label="Guard AST (zárt JSON)" hint='Példa: {"op":"equals","path":["qa_result"],"value":"failed"}' className="md:col-span-2 xl:col-span-4"><textarea className={`${controlClass} min-h-20 resize-y`} value={transition.guard} onChange={event => updateTransition(transition.id, 'guard', event.target.value)} placeholder='{"op":"equals","path":["qa_result"],"value":"failed"}' /></Field>
            </div>
            {loop && <p className="mt-3 border-l-2 border-neonMagenta pl-2 font-mono text-[9px] leading-relaxed text-slate-400">A futtató a guardot, a transition saját iterációs limitjét és a workflow globális lépéslimitjét érvényesíti. Az időzítő policy külön metadata; v1-ben nincs automatikus scheduler.</p>}
          </article>;
        })}
        {!workflow.transitions.length && <p className="border border-dashed border-white/15 p-5 text-center font-mono text-[10px] text-slate-500">Még nincs irányított transition. A workflow nem indítható értelmes útvonal nélkül.</p>}
      </div>
    </Panel>
  );
}

function InstancePanel({
  workflow,
  instances,
  selectedInstanceId,
  onSelectInstance,
  onStart,
  onTransition,
  onLifecycle,
  loading,
  working,
  error
}) {
  const selected = instances.find(instance => instance.id === selectedInstanceId) || instances[0] || null;
  const [startActor, setStartActor] = useState(emptyActor);
  const [startContext, setStartContext] = useState('');
  const [command, setCommand] = useState(emptyTransitionCommand);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const activeInstanceRef = React.useRef('');
  const instanceVersion = Number(selected?.workflow_version?.version_number);
  const publishedVersion = Number(workflow?.published_version_number);
  const boundTransitions = instanceVersion && publishedVersion && instanceVersion === publishedVersion
    ? (workflow?.published_transitions || EMPTY_LIST)
    : EMPTY_LIST;
  const available = selected?.availableTransitions?.length
    ? selected.availableTransitions
    : boundTransitions.filter(transition => !selected?.current_step_id || transition.source_step_id === selected.current_step_id);
  const defaultTransitionId = text(available[0]?.id || available[0]?.transition_id);
  const selectedActorId = text(selected?.actor?.id);
  const selectedActorType = text(selected?.actor?.type) || 'human';
  const selectedActorLabel = text(selected?.actor?.label);

  useEffect(() => {
    const instanceChanged = activeInstanceRef.current !== (selected?.id || '');
    activeInstanceRef.current = selected?.id || '';
    setCommand(current => ({
      ...current,
      transition_id: instanceChanged ? defaultTransitionId : (current.transition_id || defaultTransitionId),
      actor: instanceChanged && selectedActorId ? { type: selectedActorType, id: selectedActorId, label: selectedActorLabel } : current.actor
    }));
  }, [defaultTransitionId, selected?.id, selectedActorId, selectedActorLabel, selectedActorType]);

  const setActorField = (setter, field) => event => setter(current => ({ ...current, [field]: event.target.value }));
  const setCommandActor = field => event => setCommand(current => ({ ...current, actor: { ...current.actor, [field]: event.target.value } }));
  const submitStart = event => {
    event.preventDefault();
    onStart({ actor: text(startActor.id) ? startActor : null, evidence: startContext });
  };
  const submitTransition = event => {
    event.preventDefault();
    onTransition(selected?.id, command);
  };
  const runLifecycle = action => {
    onLifecycle(selected?.id, action, {
      actor: text(command.actor.id) ? command.actor : null,
      reason: lifecycleReason
    });
  };

  return (
    <Panel title="Futási példányok // ember–agent átadás" icon={Activity} accent="text-plasmaGreen">
      <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <form onSubmit={submitStart} className="border border-plasmaGreen/30 bg-plasmaGreen/[.035] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[9px] font-black uppercase tracking-[.13em] text-plasmaGreen">Új futás indítása</p>
              <Play size={14} className="text-plasmaGreen" />
            </div>
            <p className="mt-1 font-mono text-[9px] leading-relaxed text-slate-500">A publikált definícióból új auditálható példány készül. A Markdown és a workflow-verzió nem változik.</p>
            <div className="mt-3 grid gap-2">
              <Field label="Indító típusa"><select className={controlClass} value={startActor.type} onChange={setActorField(setStartActor, 'type')}><option value="human">EMBER</option><option value="agent">AGENT</option><option value="service">SZOLGÁLTATÁS</option></select></Field>
              <Field label="Indító ID" hint="Opcionális; kitöltve az indító actor eseményként auditálódik."><input className={controlClass} value={startActor.id} onChange={setActorField(setStartActor, 'id')} placeholder="technical-lead / quality-agent" /></Field>
              <Field label="Indító név"><input className={controlClass} value={startActor.label} onChange={setActorField(setStartActor, 'label')} placeholder="Megjelenő név" /></Field>
              <Field label="Kezdő kontextus / hivatkozás" hint="Az instance context initial_evidence mezőjébe kerül."><textarea className={[controlClass, 'min-h-16 resize-y'].join(' ')} value={startContext} onChange={event => setStartContext(event.target.value)} placeholder="pl. /assets/brief.pdf vagy https://…" /></Field>
              <button type="submit" disabled={working || !workflow?.id} className="inline-flex min-h-10 items-center justify-center gap-2 border border-plasmaGreen/65 bg-plasmaGreen/10 px-3 font-mono text-[9px] font-black text-plasmaGreen hover:bg-plasmaGreen hover:text-slate-950 disabled:opacity-45">{working ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={13} />}PÉLDÁNY INDÍTÁSA</button>
            </div>
          </form>

          <div className="border border-white/10 bg-black/20">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><p className="font-mono text-[9px] font-black uppercase tracking-[.13em] text-slate-300">Példányok</p><span className="font-mono text-[9px] text-slate-500">{instances.length}</span></div>
            <div className="max-h-[24rem] space-y-1 overflow-auto p-2">
              {loading ? <p className="p-3 font-mono text-[9px] text-slate-500">PÉLDÁNYOK BETÖLTÉSE…</p> : instances.map(instance => (
                <button type="button" onClick={() => onSelectInstance(instance.id)} key={instance.id} className={['w-full border p-2.5 text-left', instance.id === selected?.id ? 'border-plasmaGreen bg-plasmaGreen/10' : 'border-transparent hover:border-white/15 hover:bg-white/[.025]'].join(' ')}>
                  <div className="flex items-start justify-between gap-2"><b className="truncate font-mono text-[10px] text-slate-200">{instance.id}</b><StateChip value={instance.status} /></div>
                  <p className="mt-1 truncate font-mono text-[8px] text-slate-500">{instance.current_step_label || instance.current_step_id || 'nincs aktív lépés'}</p>
                  <div className="mt-2"><ActorBadge actor={instance.started_by?.id ? instance.started_by : instance.actor} compact /></div>
                </button>
              ))}
              {!loading && !instances.length && <p className="p-3 font-mono text-[9px] leading-relaxed text-slate-500">Nincs futó vagy archivált példány ehhez a definícióhoz.</p>}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {error && <ErrorBox error={error} />}
          {!selected ? <div className="flex min-h-64 items-center justify-center border border-dashed border-white/15 bg-black/15 p-8 text-center font-mono text-[10px] leading-relaxed text-slate-500">Indíts vagy válassz workflow-példányt a jelenlegi állapot, a bizonyítékok és az átadás kezeléséhez.</div> : <>
            <section className="border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono text-[9px] font-black uppercase tracking-[.13em] text-plasmaGreen">Aktív futás // {selected.id}</p><h3 className="mt-1 font-headline text-lg font-black uppercase text-slate-100">{selected.current_step_label || selected.current_step_id || 'Állapot ismeretlen'}</h3></div>
                <StateChip value={selected.status} />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="border border-white/10 p-2"><p className="font-mono text-[8px] text-slate-600">INDÍTÓ</p><div className="mt-1"><ActorBadge actor={selected.started_by?.id ? selected.started_by : selected.actor} /></div></div>
                <div className="border border-white/10 p-2"><p className="font-mono text-[8px] text-slate-600">LÉPÉSBUDGET</p><p className="mt-1 font-mono text-[10px] text-slate-200">{selected.iteration_count} / {selected.max_iterations || workflow.max_total_steps}</p></div>
                <div className="border border-white/10 p-2"><p className="font-mono text-[8px] text-slate-600">INDÍTVA</p><p className="mt-1 font-mono text-[9px] text-slate-300">{formatMoment(selected.started_at)}</p></div>
                <div className="border border-white/10 p-2"><p className="font-mono text-[8px] text-slate-600">UTOLSÓ VÁLTOZÁS</p><p className="mt-1 font-mono text-[9px] text-slate-300">{formatMoment(selected.updated_at)}</p></div>
              </div>
              {evidenceLabel(selected.evidence) && <div className="mt-3 border-l-2 border-plasmaGreen/65 bg-plasmaGreen/[.035] px-3 py-2 font-mono text-[9px] leading-relaxed text-slate-300"><FileCheck2 size={12} className="mr-1 inline text-plasmaGreen" />{evidenceLabel(selected.evidence)}</div>}
            </section>

            <section className="border border-amber-300/30 bg-amber-300/[.035] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-mono text-[9px] font-black uppercase tracking-[.13em] text-amber-200">Életciklus-kontroll</p><p className="mt-1 font-mono text-[9px] text-slate-500">Szünet, folytatás vagy hibára állítás önálló audit-eseményt ad a példányhoz.</p></div>
                <Clock3 size={15} className="text-amber-200" />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input aria-label="Életciklus indoklás" className={controlClass} value={lifecycleReason} onChange={event => setLifecycleReason(event.target.value)} placeholder="Opcionális indoklás / handoff kontextus" />
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={working || selected.status !== 'running'} onClick={() => runLifecycle('pause')} className="border border-amber-300/55 px-2.5 font-mono text-[9px] font-black text-amber-200 hover:bg-amber-300 hover:text-slate-950 disabled:opacity-40">SZÜNET</button>
                  <button type="button" disabled={working || selected.status !== 'paused'} onClick={() => runLifecycle('resume')} className="border border-plasmaGreen/55 px-2.5 font-mono text-[9px] font-black text-plasmaGreen hover:bg-plasmaGreen hover:text-slate-950 disabled:opacity-40">FOLYTATÁS</button>
                  <button type="button" disabled={working || ['completed', 'failed'].includes(selected.status)} onClick={() => runLifecycle('fail')} className="border border-neonMagenta/55 px-2.5 font-mono text-[9px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-40">HIBÁRA ÁLLÍTÁS</button>
                </div>
              </div>
            </section>

            <form onSubmit={submitTransition} className="border border-neonMagenta/35 bg-neonMagenta/[.035] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-mono text-[9px] font-black uppercase tracking-[.13em] text-neonMagenta">Irányított átadás végrehajtása</p><p className="mt-1 font-mono text-[9px] leading-relaxed text-slate-500">A transition új eseményt hoz létre; nem írja felül a korábbi workflow-történetet.</p></div>
                <Send size={16} className="text-neonMagenta" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Engedélyezett transition" className="md:col-span-2"><select required className={controlClass} value={command.transition_id} onChange={event => setCommand(current => ({ ...current, transition_id: event.target.value }))}><option value="">-- TRANSITION --</option>{available.map(transition => { const id = text(transition.id || transition.transition_id); const label = text(transition.label || transition.name || transition.event) || id; return <option key={id} value={id}>{label} // {id}</option>; })}</select></Field>
                <Field label="Végrehajtó típusa"><select className={controlClass} value={command.actor.type} onChange={setCommandActor('type')}><option value="human">EMBER</option><option value="agent">AGENT</option><option value="service">SZOLGÁLTATÁS</option></select></Field>
                <Field label="Végrehajtó ID"><input required className={controlClass} value={command.actor.id} onChange={setCommandActor('id')} placeholder="agent vagy felhasználó ID" /></Field>
                <Field label="Végrehajtó neve"><input className={controlClass} value={command.actor.label} onChange={setCommandActor('label')} placeholder="Megjelenő név" /></Field>
                <Field label="Bizonyíték / hivatkozás" className="md:col-span-2"><textarea className={[controlClass, 'min-h-16 resize-y'].join(' ')} value={command.evidence} onChange={event => setCommand(current => ({ ...current, evidence: event.target.value }))} placeholder="Link, fájlútvonal, mérési azonosító vagy rövid indoklás" /></Field>
                <Field label="Audit megjegyzés" className="md:col-span-2"><textarea className={[controlClass, 'min-h-16 resize-y'].join(' ')} value={command.note} onChange={event => setCommand(current => ({ ...current, note: event.target.value }))} placeholder="Miért ez az átmenet, milyen döntés született?" /></Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><p className="font-mono text-[9px] text-slate-500">A szerver az aktuális lépést, a zárt guard AST-t, az actor-típust, a bizonyíték-kötelezettséget és az iterációs limiteket érvényesíti.</p><button type="submit" disabled={working || !command.transition_id || !text(command.actor.id)} className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta/65 bg-neonMagenta/10 px-3 font-mono text-[9px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-45">{working ? <LoaderCircle size={13} className="animate-spin" /> : <ChevronRight size={14} />}ÁTADÁS RÖGZÍTÉSE</button></div>
            </form>

            <section className="border border-white/10 bg-black/20 p-3">
              <p className="mb-3 font-mono text-[9px] font-black uppercase tracking-[.13em] text-slate-300">Eseménynapló / bizonyítéklánc</p>
              <div className="space-y-2">
                {selected.events.slice(0, 10).map((event, index) => <div key={text(event?.id || event?.event_id) || index} className="border-l-2 border-neonCyan/50 pl-3"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[9px] font-black text-slate-200">{text(event?.label || event?.name || event?.transition_label || event?.event_type || event?.type) || 'ÁLLAPOTVÁLTÁS'}</span><span className="font-mono text-[8px] text-slate-600">{formatMoment(event?.occurred_at || event?.created_at || event?.at)}</span></div><p className="mt-1 font-mono text-[9px] leading-relaxed text-slate-500">{evidenceLabel(event?.evidence) || text(event?.note || event?.message || event?.description) || 'Nincs további megjegyzés.'}</p></div>)}
                {!selected.events.length && <p className="font-mono text-[9px] text-slate-500">A szerver még nem adott át eseménynaplót ehhez a példányhoz.</p>}
              </div>
            </section>
          </>}
        </div>
      </div>
    </Panel>
  );
}

const WorkflowStudioTab = ({ adminFetch, onNotify }) => {
  const [workflows, setWorkflows] = useState(EMPTY_LIST);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [workflow, setWorkflow] = useState(null);
  const [draft, setDraft] = useState(emptyWorkflow);
  const [selectedStepId, setSelectedStepId] = useState('');
  const [instances, setInstances] = useState(EMPTY_LIST);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [working, setWorking] = useState(false);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [instanceError, setInstanceError] = useState('');

  const request = useCallback(async (url, options = {}) => requestError(await adminFetch(url, options)), [adminFetch]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const data = await request('/api/admin/workflows');
      const rows = asArray(data, ['workflows', 'items', 'definitions']).map(normalizeWorkflow);
      setWorkflows(rows);
      setSelectedWorkflowId(current => current && rows.some(item => item.id === current) ? current : (rows[0]?.id || ''));
    } catch (error) {
      setListError(`WORKFLOW_REGISZTER_HIBA: ${error.message}`);
    } finally {
      setLoadingList(false);
    }
  }, [request]);

  const loadDetail = useCallback(async workflowId => {
    if (!workflowId) return;
    setLoadingDetail(true);
    setDetailError('');
    try {
      const data = await request(`/api/admin/workflows/${encodePath(workflowId)}`);
      const nextWorkflow = normalizeWorkflow(data);
      setWorkflow(nextWorkflow);
      setDraft(nextWorkflow);
      setSelectedStepId(current => current && nextWorkflow.steps.some(step => step.id === current) ? current : (nextWorkflow.steps[0]?.id || ''));
    } catch (error) {
      setWorkflow(null);
      setDetailError(`WORKFLOW_DEFINÍCIÓ_HIBA: ${error.message}`);
    } finally {
      setLoadingDetail(false);
    }
  }, [request]);

  const loadInstances = useCallback(async workflowId => {
    if (!workflowId) {
      setInstances([]);
      return;
    }
    setLoadingInstances(true);
    setInstanceError('');
    try {
      const data = await request(`/api/admin/workflow-instances?workflow_id=${encodePath(workflowId)}`);
      const rows = asArray(data, ['instances', 'items', 'workflow_instances']).map(normalizeInstance);
      setInstances(rows);
      setSelectedInstanceId(current => current && rows.some(item => item.id === current) ? current : (rows[0]?.id || ''));
    } catch (error) {
      setInstances([]);
      setInstanceError(`WORKFLOW_PÉLDÁNY_HIBA: ${error.message}`);
    } finally {
      setLoadingInstances(false);
    }
  }, [request]);

  const loadInstanceDetail = useCallback(async instanceId => {
    if (!instanceId) return;
    try {
      const data = await request(`/api/admin/workflow-instances/${encodePath(instanceId)}`);
      const detailed = normalizeInstance(data);
      setInstances(current => current.map(instance => instance.id === instanceId ? { ...instance, ...detailed } : instance));
    } catch (error) {
      setInstanceError(`WORKFLOW_AUDIT_HIBA: ${error.message}`);
    }
  }, [request]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (!selectedWorkflowId) return;
    loadDetail(selectedWorkflowId);
    loadInstances(selectedWorkflowId);
  }, [loadDetail, loadInstances, selectedWorkflowId]);
  useEffect(() => { loadInstanceDetail(selectedInstanceId); }, [loadInstanceDetail, selectedInstanceId]);

  const newWorkflow = () => {
    setSelectedWorkflowId('');
    setWorkflow(null);
    setDraft(emptyWorkflow());
    setSelectedStepId('start');
    setInstances([]);
    setSelectedInstanceId('');
    setDetailError('');
    setInstanceError('');
  };

  const saveWorkflow = async event => {
    event.preventDefault();
    setSaving(true);
    setDetailError('');
    try {
      const isNew = !workflow?.id;
      const steps = draft.steps.map((step, index) => {
        const actorId = text(step.actor_id);
        const suggestedTimeout = Number(step.timeout_seconds || 0);
        return {
          key: text(step.id),
          type: runtimeStepType(step.kind),
          label: text(step.label),
          description: text(step.description),
          sort_order: index,
          metadata: {
            ...(actorId ? { default_actor: { type: step.actor_type === 'system' ? 'service' : (text(step.actor_type) || 'human'), id: actorId } } : {}),
            ...(suggestedTimeout > 0 ? { suggested_timeout_seconds: suggestedTimeout } : {})
          }
        };
      });
      const transitions = draft.transitions.map((transition, index) => ({
        source_step_key: text(transition.source_step_id),
        target_step_key: text(transition.target_step_id),
        label: text(transition.label),
        guard: parseGuardAst(transition.guard),
        allowed_actor_types: transition.allowed_actor_types.map(type => type === 'system' ? 'service' : type),
        max_iterations: Number(transition.max_iterations || 1),
        evidence_required: Boolean(transition.evidence_required),
        sort_order: index,
        metadata: {}
      }));
      const validStepTypes = new Set(['start', 'task', 'decision', 'wait', 'end']);
      const duplicateKey = new Set(steps.map(step => step.key)).size !== steps.length;
      const invalidTransition = transitions.find(item => !item.source_step_key || !item.target_step_key || !item.allowed_actor_types.length);
      if (!text(draft.name) || !text(draft.slug) || !text(draft.graph_id) || steps.length < 2 || !steps.every(step => step.key && step.label && validStepTypes.has(step.type)) || duplicateKey || !transitions.length || invalidTransition) {
        throw new Error('A név, slug és gráfréteg ID kötelező; legalább két egyedi, érvényes lépés és egy teljes transition szükséges.');
      }
      const suggestedTimeout = Number(draft.timeout_seconds || 0);
      const versionPayload = {
        label: text(draft.version_label),
        max_total_steps: Number(draft.max_total_steps || 1),
        steps,
        transitions,
        metadata: suggestedTimeout > 0 ? { execution_policy: { suggested_timeout_seconds: suggestedTimeout } } : {}
      };
      const payload = isNew
        ? {
          ...(text(draft.id) ? { id: text(draft.id) } : {}),
          graph_id: text(draft.graph_id),
          slug: text(draft.slug),
          name: text(draft.name),
          description: text(draft.description),
          active: Boolean(draft.active),
          ...versionPayload
        }
        : versionPayload;
      const data = await request(isNew ? '/api/admin/workflows' : `/api/admin/workflows/${encodePath(workflow.id)}/versions`, {
        method: 'POST', body: JSON.stringify(payload)
      });
      const saved = normalizeWorkflow(data.workflow || data.definition || data);
      const id = saved.id || workflow?.id || payload.slug;
      setWorkflow(saved);
      setDraft(saved);
      setSelectedWorkflowId(id);
      onNotify(isNew ? 'WORKFLOW_DEFINÍCIÓ_LÉTREHOZVA' : 'WORKFLOW_DRAFT_VERZIÓ_LÉTREHOZVA');
      await loadList();
      if (id) {
        await Promise.all([loadDetail(id), loadInstances(id)]);
      }
    } catch (error) {
      const message = `WORKFLOW_MENTÉSI_HIBA: ${error.message}`;
      setDetailError(message);
      onNotify(message, true);
    } finally {
      setSaving(false);
    }
  };

  const publishWorkflowVersion = async () => {
    if (!workflow?.id) return;
    const version = Number(draft.version || workflow.version);
    if (!Number.isInteger(version) || version < 1) {
      const message = 'Nincs publikálható workflow-verzió.';
      setDetailError(message);
      onNotify(message, true);
      return;
    }
    setPublishing(true);
    setDetailError('');
    try {
      await request(`/api/admin/workflows/${encodePath(workflow.id)}/versions/${version}/publish`, { method: 'POST' });
      onNotify(`WORKFLOW_V${version}_PUBLIKÁLVA`);
      await Promise.all([loadList(), loadDetail(workflow.id), loadInstances(workflow.id)]);
    } catch (error) {
      const message = `WORKFLOW_PUBLIKÁLÁSI_HIBA: ${error.message}`;
      setDetailError(message);
      onNotify(message, true);
    } finally {
      setPublishing(false);
    }
  };

  const startInstance = async input => {
    if (!workflow?.id) return;
    setWorking(true);
    setInstanceError('');
    try {
      const actor = input.actor?.id
        ? { ...input.actor, type: input.actor.type === 'system' ? 'service' : input.actor.type }
        : null;
      const initialEvidence = text(input.evidence);
      const payload = {
        context: initialEvidence ? { initial_evidence: initialEvidence } : {},
        ...(actor ? { actor } : {})
      };
      const data = await request(`/api/admin/workflows/${encodePath(workflow.id)}/instances`, { method: 'POST', body: JSON.stringify(payload) });
      const created = normalizeInstance(data.instance || data);
      setSelectedInstanceId(created.id);
      onNotify('WORKFLOW_PÉLDÁNY_ELINDÍTVA');
      await loadInstances(workflow.id);
    } catch (error) {
      const message = `WORKFLOW_INDÍTÁSI_HIBA: ${error.message}`;
      setInstanceError(message);
      onNotify(message, true);
    } finally {
      setWorking(false);
    }
  };

  const transitionInstance = async (instanceId, command) => {
    if (!instanceId) return;
    setWorking(true);
    setInstanceError('');
    try {
      const actor = { ...command.actor, type: command.actor.type === 'system' ? 'service' : command.actor.type };
      if (!text(actor.id)) throw new Error('A transition végrehajtójának stabil ID-ja kötelező.');
      const evidence = text(command.evidence);
      const note = text(command.note);
      const payload = {
        transition_id: text(command.transition_id),
        actor,
        ...(evidence ? { evidence } : {}),
        context_patch: note ? { audit_note: note } : {}
      };
      const data = await request(`/api/admin/workflow-instances/${encodePath(instanceId)}/transitions`, { method: 'POST', body: JSON.stringify(payload) });
      const updated = normalizeInstance(data.instance || data);
      setSelectedInstanceId(updated.id || instanceId);
      onNotify('WORKFLOW_ÁTADÁS_RÖGZÍTVE');
      if (workflow?.id) await loadInstances(workflow.id);
    } catch (error) {
      const message = `WORKFLOW_ÁTADÁSI_HIBA: ${error.message}`;
      setInstanceError(message);
      onNotify(message, true);
    } finally {
      setWorking(false);
    }
  };

  const changeInstanceLifecycle = async (instanceId, action, input) => {
    if (!instanceId) return;
    setWorking(true);
    setInstanceError('');
    try {
      const actor = input.actor?.id
        ? { ...input.actor, type: input.actor.type === 'system' ? 'service' : input.actor.type }
        : null;
      const reason = text(input.reason);
      const payload = {
        ...(actor ? { actor } : {}),
        ...(reason ? { reason } : {}),
        context_patch: reason ? { lifecycle_reason: reason } : {}
      };
      const data = await request(`/api/admin/workflow-instances/${encodePath(instanceId)}/${action}`, { method: 'POST', body: JSON.stringify(payload) });
      const updated = normalizeInstance(data.instance || data);
      setSelectedInstanceId(updated.id || instanceId);
      onNotify(`WORKFLOW_PÉLDÁNY_${action.toUpperCase()}_RÖGZÍTVE`);
      if (workflow?.id) await loadInstances(workflow.id);
    } catch (error) {
      const message = `WORKFLOW_ÉLETCIKLUS_HIBA: ${error.message}`;
      setInstanceError(message);
      onNotify(message, true);
    } finally {
      setWorking(false);
    }
  };

  const visibleWorkflow = workflow || draft;
  const selectedSummary = useMemo(() => workflows.find(item => item.id === selectedWorkflowId) || null, [selectedWorkflowId, workflows]);
  const selectedWorkflowInstance = useMemo(() => instances.find(instance => instance.id === selectedInstanceId) || instances[0] || null, [instances, selectedInstanceId]);

  return (
    <div className="space-y-5" data-testid="workflow-studio">
      <section className="relative overflow-hidden border border-neonCyan/30 bg-[#07111e] p-5 shadow-[0_0_50px_rgba(0,251,251,.06)]">
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(90deg,rgba(0,251,251,.06)_1px,transparent_1px),linear-gradient(rgba(0,251,251,.04)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[.18em] text-neonCyan"><Waypoints size={14} />Definíció → futás → bizonyíték</p>
            <h2 className="mt-2 font-headline text-2xl font-black italic uppercase text-slate-100">Workflow Studio</h2>
            <p className="mt-2 max-w-3xl font-mono text-[10px] leading-relaxed text-slate-400">Irányított, korlátos állapotgépek emberi és agent feladatokhoz. A workflow-verzió külön runtime-topológia: nem teszi futtathatóvá a kapcsolt tudásgráf összes élét. A futási példány külön auditnapló; a köröket guard és iterációs limit védi.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-neonCyan/35 bg-neonCyan/5 px-2 py-1 font-mono text-[9px] text-neonCyan">{workflows.length} DEFINÍCIÓ</span>
            <span className="border border-plasmaGreen/35 bg-plasmaGreen/5 px-2 py-1 font-mono text-[9px] text-plasmaGreen">{instances.length} PÉLDÁNY</span>
            <button type="button" onClick={() => { loadList(); if (selectedWorkflowId) { loadDetail(selectedWorkflowId); loadInstances(selectedWorkflowId); } }} className="inline-flex min-h-9 items-center gap-1 border border-white/15 px-2.5 font-mono text-[9px] font-black text-slate-300 hover:border-neonCyan hover:text-neonCyan"><RefreshCw size={12} />FRISSÍTÉS</button>
          </div>
        </div>
      </section>

      <ErrorBox error={listError} onRetry={loadList} />

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <WorkflowList workflows={workflows} selectedId={selectedWorkflowId} onSelect={setSelectedWorkflowId} onNew={newWorkflow} loading={loadingList} />
        <div className="min-w-0 space-y-5">
          {loadingDetail && selectedWorkflowId ? <LoadingBlock label="DEFINÍCIÓ BETÖLTÉS" /> : <>
            {detailError && <ErrorBox error={detailError} onRetry={() => selectedWorkflowId ? loadDetail(selectedWorkflowId) : undefined} />}
            {selectedSummary && !workflow && !detailError && <p className="font-mono text-[9px] text-slate-500">{selectedSummary.name} részleteinek előkészítése…</p>}
            <WorkflowIdentityForm workflow={draft} onChange={setDraft} onSave={saveWorkflow} onPublish={publishWorkflowVersion} saving={saving} publishing={publishing} isNew={!workflow?.id} />
            <WorkflowTopology workflow={visibleWorkflow} selectedStepId={selectedStepId} instance={selectedWorkflowInstance} onPickStep={setSelectedStepId} />
            <div className="grid gap-5 2xl:grid-cols-2">
              <StepEditor workflow={draft} selectedStepId={selectedStepId} onPickStep={setSelectedStepId} onChange={setDraft} />
              <TransitionEditor workflow={draft} onChange={setDraft} />
            </div>
            {workflow?.id && <InstancePanel workflow={workflow} instances={instances} selectedInstanceId={selectedInstanceId} onSelectInstance={setSelectedInstanceId} onStart={startInstance} onTransition={transitionInstance} onLifecycle={changeInstanceLifecycle} loading={loadingInstances} working={working} error={instanceError} />}
          </>}
        </div>
      </div>
    </div>
  );
};

export default WorkflowStudioTab;

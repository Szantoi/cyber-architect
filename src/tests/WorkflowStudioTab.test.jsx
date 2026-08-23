import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkflowStudioTab from '../components/admin/tabs/WorkflowStudioTab.jsx';

const graphId = 'workflow/quality-loop';
const workflowId = 'workflow-quality-loop';
const instanceId = 'workflow-instance-1';

const steps = [
  { id: 'workflow-step-db-start', key: 'start', step_type: 'start', label: 'Indítás', description: '', metadata: {}, sort_order: 0 },
  { id: 'workflow-step-db-review', key: 'review', step_type: 'task', label: 'Szakmai ellenőrzés', description: '', metadata: { default_actor: { type: 'agent', id: 'quality-agent' } }, sort_order: 1 },
  { id: 'workflow-step-db-end', key: 'complete', step_type: 'end', label: 'Lezárás', description: '', metadata: {}, sort_order: 2 }
];

const transitions = [
  {
    id: 'workflow-transition-forward',
    source_step_key: 'start',
    target_step_key: 'review',
    label: 'ellenőrzésre küldés',
    guard: null,
    allowed_actor_types: ['human', 'agent'],
    max_iterations: 1,
    evidence_required: false,
    metadata: {},
    sort_order: 0
  },
  {
    id: 'workflow-transition-loop',
    source_step_key: 'review',
    target_step_key: 'start',
    label: 'javításra vissza',
    guard: { op: 'equals', path: ['qa_result'], value: 'failed' },
    allowed_actor_types: ['agent'],
    max_iterations: 3,
    evidence_required: true,
    metadata: {},
    sort_order: 1
  }
];

const workflowDetail = {
  workflow: {
    id: workflowId,
    graph_id: graphId,
    slug: 'quality-loop',
    name: 'Minőségi loop',
    description: 'Agent és ember közös ellenőrzése.',
    active: true,
    latest_version: 2,
    published_version_number: 2,
    versions: [{ version_number: 2, status: 'published' }],
    current_version: {
      version_number: 2,
      status: 'published',
      label: 'Aktuális',
      max_total_steps: 20,
      metadata: {},
      steps,
      transitions
    },
    published_version: {
      version_number: 2,
      status: 'published',
      label: 'Aktuális',
      max_total_steps: 20,
      metadata: {},
      steps,
      transitions
    }
  }
};

const instanceSummary = {
  id: instanceId,
  workflow_definition_id: workflowId,
  workflow: { id: workflowId, graph_id: graphId },
  workflow_version: { version_number: 2, max_total_steps: 20, status: 'published' },
  status: 'running',
  current_step_id: 'workflow-step-db-start',
  current_step_key: 'start',
  current_step_label: 'Indítás',
  step_count: 1,
  max_total_steps: 20,
  started_by: 'human:technical-lead',
  started_at: '2026-08-21T18:00:00.000Z',
  updated_at: '2026-08-21T18:01:00.000Z'
};

const jsonResponse = body => ({ ok: true, json: vi.fn().mockResolvedValue(body) });

function renderStudio({ initialWorkflows = [{ id: workflowId, graph_id: graphId, slug: 'quality-loop', name: 'Minőségi loop', active: true, latest_version: 2, instance_count: 1 }], onRequest } = {}) {
  const onNotify = vi.fn();
  const adminFetch = vi.fn(async (url, options = {}) => {
    if (onRequest) {
      const handled = await onRequest(url, options);
      if (handled) return handled;
    }
    if (url === '/api/admin/workflows') return jsonResponse({ workflows: initialWorkflows });
    if (url === `/api/admin/workflows/${encodeURIComponent(workflowId)}`) return jsonResponse(workflowDetail);
    if (url === `/api/admin/workflow-instances?workflow_id=${encodeURIComponent(workflowId)}`) return jsonResponse({ instances: [instanceSummary] });
    if (url === `/api/admin/workflow-instances/${encodeURIComponent(instanceId)}`) return jsonResponse({ instance: { ...instanceSummary, events: [] } });
    throw new Error(`Unexpected request: ${url} ${options.method || 'GET'}`);
  });
  render(<WorkflowStudioTab adminFetch={adminFetch} onNotify={onNotify} />);
  return { adminFetch, onNotify };
}

afterEach(() => localStorage.clear());

describe('WorkflowStudioTab', () => {
  it('renders the versioned workflow topology and explicitly separates transitions from graph edges', async () => {
    renderStudio();

    expect(await screen.findByDisplayValue('review')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-topology')).toBeInTheDocument();
    const canvas = await screen.findByTestId('workflow-topology-canvas');
    const switcher = within(canvas).getByTestId('workflow-topology-canvas-mode-switcher');
    fireEvent.click(within(switcher).getByRole('tab', { name: 'RÉSZLETES' }));
    expect(await screen.findByTestId('graph-node-start')).toHaveClass('xyflow-display-card');
    expect(screen.getByText(/NEM a tudásgráf általános edge-ei/i)).toBeInTheDocument();
    expect(screen.getAllByText('↻ LOOP')[0]).toBeInTheDocument();
    expect(screen.getByDisplayValue(/"op": "equals"/)).toBeInTheDocument();
  });

  it('creates a schema-shaped workflow definition with stable step keys and transition records', async () => {
    const createdWorkflow = {
      ...workflowDetail.workflow,
      id: 'workflow-new',
      slug: 'new-workflow',
      name: 'Új workflow'
    };
    const { adminFetch } = renderStudio({
      initialWorkflows: [],
      onRequest: async (url, options) => {
        if (url === '/api/admin/workflows' && options.method === 'POST') return jsonResponse({ workflow: createdWorkflow });
        if (url === '/api/admin/workflows/workflow-new') return jsonResponse({ workflow: createdWorkflow });
        if (url === '/api/admin/workflow-instances?workflow_id=workflow-new') return jsonResponse({ instances: [] });
        return null;
      }
    });

    await screen.findByText(/Még nincs workflow-definíció/i);
    fireEvent.change(screen.getByLabelText(/^Név/), { target: { value: 'Új workflow' } });
    fireEvent.change(screen.getByLabelText(/Slug \/ stabil kulcs/), { target: { value: 'new-workflow' } });
    fireEvent.change(screen.getByLabelText(/Kapcsolt gráfréteg ID/), { target: { value: graphId } });
    fireEvent.click(screen.getByRole('button', { name: 'WORKFLOW LÉTREHOZÁSA' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      '/api/admin/workflows',
      expect.objectContaining({ method: 'POST' })
    ));
    const [, options] = adminFetch.mock.calls.find(call => call[0] === '/api/admin/workflows' && call[1]?.method === 'POST');
    const payload = JSON.parse(options.body);
    expect(payload).toMatchObject({ graph_id: graphId, slug: 'new-workflow', name: 'Új workflow', max_total_steps: 1000 });
    expect(payload.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'start', type: 'start' }),
      expect.objectContaining({ key: 'complete', type: 'end' })
    ]));
    expect(payload.transitions[0]).toMatchObject({ source_step_key: 'start', target_step_key: 'complete', allowed_actor_types: ['human'] });
    expect(payload.transitions[0]).not.toHaveProperty('source_step_id');
  });

  it('records a runtime transition with the server transition ID, actor and evidence', async () => {
    const updated = { ...instanceSummary, status: 'running', current_step_key: 'review', current_step_label: 'Szakmai ellenőrzés', step_count: 2, events: [] };
    const { adminFetch } = renderStudio({
      onRequest: async (url, options) => {
        if (url === `/api/admin/workflow-instances/${encodeURIComponent(instanceId)}/transitions` && options.method === 'POST') return jsonResponse({ instance: updated });
        return null;
      }
    });

    await screen.findByRole('option', { name: /ellenőrzésre küldés/ });
    fireEvent.change(screen.getByLabelText(/Végrehajtó típusa/), { target: { value: 'agent' } });
    fireEvent.change(screen.getByLabelText(/^Végrehajtó ID/), { target: { value: 'quality-agent' } });
    fireEvent.change(screen.getByLabelText(/Bizonyíték \/ hivatkozás/), { target: { value: 'asset:qa-report-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'ÁTADÁS RÖGZÍTÉSE' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/workflow-instances/${encodeURIComponent(instanceId)}/transitions`,
      expect.objectContaining({ method: 'POST' })
    ));
    const [, options] = adminFetch.mock.calls.find(call => call[0] === `/api/admin/workflow-instances/${encodeURIComponent(instanceId)}/transitions`);
    expect(JSON.parse(options.body)).toMatchObject({
      transition_id: 'workflow-transition-forward',
      actor: { type: 'agent', id: 'quality-agent' },
      evidence: 'asset:qa-report-7',
      context_patch: {}
    });
  });
});

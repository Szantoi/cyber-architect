import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GraphManagementTab from '../components/admin/tabs/GraphManagementTab.jsx';

const graphId = 'project/prj-2026-884';
const sharedMemberships = [
  { graph_id: graphId, graph_name: 'Projektgráf', graph_color: '#00FFFF' },
  { graph_id: 'impact/production', graph_name: 'Hatásgráf', graph_color: '#FF00FF' }
];
const sourceNode = { id: 'node-project', node_type: 'project', label: 'PRJ-2026-884', source_system: 'sql', source_reference: 'PRJ-2026-884', graph_ids: [graphId], graph_memberships: sharedMemberships.slice(0, 1) };
const targetNode = { id: 'node-task', node_type: 'task', label: 'TASK-004', source_system: 'sql', source_reference: 'TASK-004', graph_ids: [graphId, 'impact/production'], graph_memberships: sharedMemberships };
const detachedNode = { id: 'node-document', node_type: 'document', label: 'Külső dokumentum', source_system: 'manual', source_reference: 'DOC-1', graph_ids: ['impact/production'], graph_memberships: [sharedMemberships[1]] };
const edge = {
  id: 'edge-depends',
  source_node_id: sourceNode.id,
  target_node_id: targetNode.id,
  source_label: sourceNode.label,
  target_label: targetNode.label,
  edge_type_label: 'Függ ettől',
  edge_type_color: '#80FF00',
  graph_ids: [graphId, 'impact/production'],
  graph_memberships: sharedMemberships,
  relation_group_id: 'relation-44',
  reciprocal_edge_id: 'edge-depends-back',
  reciprocal_role: 'asserted',
  provenance: { source: 'test-fixture' },
  confidence: 1,
  origin: 'admin'
};
const unattachedEdge = { ...edge, id: 'edge-attach', graph_ids: ['impact/production'], graph_memberships: [sharedMemberships[1]], relation_group_id: null, reciprocal_edge_id: null };

const jsonResponse = body => ({ ok: true, json: vi.fn().mockResolvedValue(body) });

function renderTab() {
  const onNotify = vi.fn();
  const adminFetch = vi.fn(async (url, options) => {
    if (url === '/api/admin/graphs' && (!options || Object.keys(options).length === 0)) {
      return jsonResponse({ graphs: [{ id: graphId, slug: 'prj-2026-884', name: 'Projektgráf', icon_key: 'network', color: '#00FFFF', active: true, visibility: 'private', node_count: 2, edge_count: 1 }, { id: 'impact/production', slug: 'impact', name: 'Hatásgráf', icon_key: 'activity', color: '#FF00FF', active: true, visibility: 'private', node_count: 1, edge_count: 1 }] });
    }
    if (url === '/api/admin/graphs/edge-types') return jsonResponse({ edge_types: [] });
    if (url === '/api/admin/graphs/nodes?limit=250') return jsonResponse({ nodes: [sourceNode, targetNode, detachedNode] });
    if (url === '/api/admin/graphs/edges?limit=250') return jsonResponse({ edges: [edge, unattachedEdge] });
    if (url === `/api/admin/graphs/${encodeURIComponent(graphId)}/nodes?limit=250`) return jsonResponse({ nodes: [sourceNode, targetNode] });
    if (url === `/api/admin/graphs/${encodeURIComponent(graphId)}/edges?limit=250`) return jsonResponse({ edges: [edge] });
    if (url === `/api/admin/graphs/${encodeURIComponent(graphId)}/traverse` && options?.method === 'POST') return jsonResponse({ nodes: [sourceNode, targetNode], edges: [edge], paths: [{ node_id: targetNode.id, node_ids: [sourceNode.id, targetNode.id], edge_ids: [edge.id] }], truncated: false });
    if (options?.method === 'PUT') return jsonResponse({ success: true });
    throw new Error(`Unexpected request: ${url}`);
  });
  render(<GraphManagementTab adminFetch={adminFetch} onNotify={onNotify} />);
  return { adminFetch, onNotify };
}

afterEach(() => localStorage.clear());

describe('GraphManagementTab multilayer memberships', () => {
  it('renders the selected directed graph as a topology preview', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'ÉLEK / BEJÁRÁS' }));
    expect(await screen.findByLabelText('Projektgráf irányított multigráfja')).toBeInTheDocument();
    expect(screen.getByTestId(`graph-edge-${edge.id}`)).toBeInTheDocument();
  });

  it('switches the directed graph between point and operational card projections', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'ÉLEK / BEJÁRÁS' }));
    const canvas = await screen.findByTestId('directed-multigraph-canvas');
    const switcher = within(canvas).getByTestId('directed-multigraph-canvas-mode-switcher');
    expect(within(switcher).getByRole('tab', { name: 'PONT' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(within(switcher).getByRole('tab', { name: 'RÉSZLETES' }));
    expect(within(switcher).getByRole('tab', { name: 'RÉSZLETES' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId(`graph-node-${sourceNode.id}`)).toHaveClass('xyflow-display-card');
  });

  it('opens an edge inspector with M:N and provenance details instead of merging parallel arcs', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'ÉLEK / BEJÁRÁS' }));
    fireEvent.click(await screen.findByTestId(`graph-edge-${edge.id}`));
    expect(await screen.findByTestId('graph-edge-inspector')).toHaveTextContent('relation_group_id: relation-44');
    expect(screen.getByTestId('graph-edge-inspector')).toHaveTextContent('test-fixture');
    expect(screen.getByTestId('graph-edge-inspector')).toHaveTextContent('Hatásgráf');
  });

  it('sends the configured traversal AST and renders a concrete path', async () => {
    const { adminFetch } = renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'ÉLEK / BEJÁRÁS' }));
    fireEvent.change(await screen.findByLabelText('Bejárás kezdőcsúcsa'), { target: { value: sourceNode.id } });
    fireEvent.change(screen.getByLabelText('Admin bejárás iránya'), { target: { value: 'both' } });
    fireEvent.change(screen.getByLabelText('Admin bejárás mélysége'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'BEJÁRÁS INDÍTÁSA' }));
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/graphs/${encodeURIComponent(graphId)}/traverse`,
      expect.objectContaining({ method: 'POST' })
    ));
    const [, options] = adminFetch.mock.calls.find(call => call[0] === `/api/admin/graphs/${encodeURIComponent(graphId)}/traverse`);
    expect(JSON.parse(options.body)).toMatchObject({ start_node_ids: [sourceNode.id], direction: 'both', max_depth: 3, max_nodes: 50, min_confidence: 0 });
    expect(await screen.findByText(/EREDMÉNY:/)).toBeInTheDocument();
  });

  it('adds an existing node to another graph without creating a duplicate node', async () => {
    const { adminFetch } = renderTab();
    const selector = await screen.findByLabelText('Meglévő csúcs hozzáadása');
    fireEvent.change(selector, { target: { value: detachedNode.id } });
    fireEvent.click(screen.getByRole('button', { name: 'CSÚCS HOZZÁADÁSA' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/graphs/${encodeURIComponent(graphId)}/nodes/${detachedNode.id}`,
      expect.objectContaining({ method: 'PUT' })
    ));
    const [, options] = adminFetch.mock.calls.find(call => call[0] === `/api/admin/graphs/${encodeURIComponent(graphId)}/nodes/${detachedNode.id}`);
    expect(JSON.parse(options.body)).toEqual({ metadata: {} });
  });

  it('reuses an existing directed edge in another graph layer after adding both endpoints', async () => {
    const { adminFetch } = renderTab();
    const selector = await screen.findByLabelText('Meglévő él hozzáadása');
    fireEvent.change(selector, { target: { value: unattachedEdge.id } });
    fireEvent.click(screen.getByRole('button', { name: 'ÉL HOZZÁADÁSA' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/graphs/${encodeURIComponent(graphId)}/edges/${unattachedEdge.id}`,
      expect.objectContaining({ method: 'PUT' })
    ));
    expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/graphs/${encodeURIComponent(graphId)}/nodes/${sourceNode.id}`,
      expect.objectContaining({ method: 'PUT' })
    );
    expect(adminFetch).toHaveBeenCalledWith(
      `/api/admin/graphs/${encodeURIComponent(graphId)}/nodes/${targetNode.id}`,
      expect.objectContaining({ method: 'PUT' })
    );
  });
});

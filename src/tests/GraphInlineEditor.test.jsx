import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GraphInlineEditor from '../components/graph/GraphInlineEditor.jsx';

const graph = {
  id: 'project/prj-2026-884',
  name: 'Projektgráf',
  description: 'A projekt kanonikus relációi.',
  icon_key: 'network',
  color: '#00FFFF',
  visibility: 'private',
  active: true
};

const publicNode = {
  id: 'task:TASK-004',
  node_type: 'task',
  label: 'Publikus felirat',
  source_system: 'sql',
  visibility: 'private',
  active: true
};

const secondNode = {
  id: 'task:TASK-018',
  node_type: 'task',
  label: 'Gyártási folyamat',
  source_system: 'sql',
  visibility: 'private',
  active: true
};

const hydratedNode = {
  ...publicNode,
  label: 'Belső CAD feladat',
  description: 'Admin által látható leírás.',
  metadata: { sensitivity: 'private', owner: 'ops' }
};

const edgeType = { id: 'depends_on', label: 'depends_on', icon_key: 'git-branch', color: '#80FF00' };
const jsonResponse = body => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(body) });

function renderEditor({ selectedNode, selectedEdge, nodes = [publicNode, secondNode] } = {}) {
  const onGraphChanged = vi.fn();
  const adminFetch = vi.fn(async (url, options = {}) => {
    if (url === `/api/admin/graphs/${encodeURIComponent(graph.id)}/nodes?limit=250`) {
      return jsonResponse({ nodes: [hydratedNode, secondNode] });
    }
    if (url === `/api/admin/graphs/${encodeURIComponent(graph.id)}/edges?limit=250`) {
      return jsonResponse({ edges: [] });
    }
    if (url === '/api/admin/graphs/edge-types') return jsonResponse({ edge_types: [edgeType] });
    if (url === `/api/admin/graphs/nodes/${encodeURIComponent(hydratedNode.id)}` && options.method === 'PUT') {
      return jsonResponse({ node: { ...hydratedNode, ...JSON.parse(options.body) } });
    }
    if (url === '/api/admin/graphs/edges' && options.method === 'POST') {
      return jsonResponse({ edge: { id: 'edge-created' } });
    }
    if (url === `/api/admin/graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(secondNode.id)}` && options.method === 'PUT') {
      return jsonResponse({ membership: { graph_id: graph.id, node_id: secondNode.id } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  render(
    <GraphInlineEditor
      graph={graph}
      nodes={nodes}
      selectedNode={selectedNode}
      selectedEdge={selectedEdge}
      adminFetch={adminFetch}
      onGraphChanged={onGraphChanged}
    />
  );

  return { adminFetch, onGraphChanged };
}

describe('GraphInlineEditor', () => {
  it('hydrates a selected public node from the admin record and writes the full safe update payload', async () => {
    const { adminFetch, onGraphChanged } = renderEditor({ selectedNode: publicNode });

    const label = await screen.findByLabelText('Felirat');
    await waitFor(() => expect(label).toHaveValue('Belső CAD feladat'));
    expect(screen.getByLabelText('Metaadat (JSON objektum)')).toHaveValue(JSON.stringify(hydratedNode.metadata, null, 2));

    fireEvent.change(label, { target: { value: 'CAD automatizálási feladat' } });
    fireEvent.click(screen.getByTestId('graph-admin-save-node'));

    const updateUrl = `/api/admin/graphs/nodes/${encodeURIComponent(hydratedNode.id)}`;
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(updateUrl, expect.objectContaining({ method: 'PUT' })));
    const [, options] = adminFetch.mock.calls.find(([url, requestOptions]) => url === updateUrl && requestOptions?.method === 'PUT');
    expect(JSON.parse(options.body)).toEqual({
      node_type: 'task',
      label: 'CAD automatizálási feladat',
      description: 'Admin által látható leírás.',
      visibility: 'private',
      active: true,
      metadata: hydratedNode.metadata
    });
    await waitFor(() => expect(onGraphChanged).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('CSÚCS_BEÁLLÍTÁSAI_MENTVE');
  });

  it('creates a paired directed relationship with the graph membership instead of copying either node', async () => {
    const { adminFetch } = renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'KAPCSOLAT' }));
    const source = await screen.findByLabelText('Forráscsúcs');
    fireEvent.change(source, { target: { value: publicNode.id } });
    fireEvent.change(screen.getByLabelText('Célcsúcs'), { target: { value: secondNode.id } });
    fireEvent.change(screen.getByLabelText('Éltípus'), { target: { value: edgeType.id } });
    fireEvent.click(screen.getByLabelText('↔ KÉTIRÁNYÚ TÉNY'));
    fireEvent.click(screen.getByTestId('graph-admin-save-edge'));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith('/api/admin/graphs/edges', expect.objectContaining({ method: 'POST' })));
    const [, options] = adminFetch.mock.calls.find(([url, requestOptions]) => url === '/api/admin/graphs/edges' && requestOptions?.method === 'POST');
    expect(JSON.parse(options.body)).toMatchObject({
      source_node_id: publicNode.id,
      target_node_id: secondNode.id,
      edge_type_id: edgeType.id,
      graph_ids: [graph.id],
      bidirectional: true,
      origin: 'admin',
      active: true,
      visibility: 'private',
      provenance: {},
      metadata: {}
    });
    expect(JSON.parse(options.body)).not.toHaveProperty('relation_group_id');
    expect(await screen.findByRole('status')).toHaveTextContent('KÉT_PÁROSÍTOTT_IRÁNYÍTOTT_ÉL_LÉTREHOZVA');
  });

  it('shows a clear validation error and does not mutate when node metadata is not a JSON object', async () => {
    const { adminFetch } = renderEditor({ selectedNode: publicNode });

    await screen.findByDisplayValue('Belső CAD feladat');
    fireEvent.change(screen.getByLabelText('Metaadat (JSON objektum)'), { target: { value: '{hibás json' } });
    fireEvent.click(screen.getByTestId('graph-admin-save-node'));

    expect(await screen.findByRole('alert')).toHaveTextContent('CSÚCS_METAADAT_ÉRVÉNYTELEN_JSON');
    expect(adminFetch.mock.calls.some(([url, options]) => url === `/api/admin/graphs/nodes/${encodeURIComponent(hydratedNode.id)}` && options?.method === 'PUT')).toBe(false);
  });

  it('adds an existing node to this layer through an M:N membership without creating a copy', async () => {
    const { adminFetch } = renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'RÉTEG' }));
    fireEvent.change(screen.getByLabelText('Meglévő rekord stabil ID'), { target: { value: secondNode.id } });
    fireEvent.change(screen.getByLabelText('Tagsági metaadat (JSON objektum)'), { target: { value: '{"pin":"right"}' } });
    fireEvent.click(screen.getByTestId('graph-admin-attach-membership'));

    const membershipUrl = `/api/admin/graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(secondNode.id)}`;
    await waitFor(() => expect(adminFetch).toHaveBeenCalledWith(membershipUrl, expect.objectContaining({ method: 'PUT' })));
    const [, options] = adminFetch.mock.calls.find(([url, requestOptions]) => url === membershipUrl && requestOptions?.method === 'PUT');
    expect(JSON.parse(options.body)).toEqual({ metadata: { pin: 'right' } });
    expect(await screen.findByRole('status')).toHaveTextContent('MEGLÉVŐ CSÚCS RÉTEGHEZ RENDELVE');
    expect(adminFetch.mock.calls.some(([url, requestOptions]) => url === '/api/admin/graphs/nodes' && requestOptions?.method === 'POST')).toBe(false);
  });
});

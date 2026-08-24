import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import KnowledgeGraphPage from '../components/graph/KnowledgeGraphPage.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { AdminPreviewProvider } from '../context/AdminPreviewContext.jsx';

const graph = {
  id: 'project/prj-2026-884', slug: 'prj-2026-884', name: 'Projektgráf', icon_key: 'network', color: '#00FFFF',
  visibility: 'public', description: 'Projekt relációk', node_count: 2, edge_count: 2
};
const impact = { id: 'impact/production', slug: 'production', name: 'Hatásgráf', icon_key: 'activity', color: '#FF00FF', visibility: 'public', node_count: 1, edge_count: 1 };
const memberships = [
  { graph_id: graph.id, graph_name: graph.name, graph_color: graph.color, graph_icon_key: graph.icon_key, graph_visibility: 'public' },
  { graph_id: impact.id, graph_name: impact.name, graph_color: impact.color, graph_icon_key: impact.icon_key, graph_visibility: 'public' }
];
const wikiDocuments = [
  { id: 31, slug: 'cad-alapok', title: 'CAD alapok', content_type: 'knowledge', category: 'TUDÁSTÁR', dimensions: {} },
  { id: 32, slug: 'gyartasi-folyamat', title: 'Gyártási folyamat', content_type: 'knowledge', category: 'TUDÁSTÁR', dimensions: {} }
];
const wikiEdges = [{ id: 'wiki-cad-flow', source_post_id: 31, target_post_id: 32, relation_type: 'wikilink' }];
const nodes = [
  { id: 'task:TASK-004', label: 'CAD alapok', node_type: 'task', source_system: 'sql', graph_ids: memberships.map(item => item.graph_id), graph_memberships: memberships, document_binding: { slug: 'cad-alapok', document_id: 'kb:cad', content_type: 'knowledge', href: '/knowledge/cad-alapok' } },
  { id: 'task:TASK-018', label: 'Gyártási folyamat', node_type: 'task', source_system: 'sql', graph_ids: [graph.id], graph_memberships: memberships.slice(0, 1), document_binding: { slug: 'gyartasi-folyamat', document_id: 'kb:flow', content_type: 'knowledge', href: '/knowledge/gyartasi-folyamat' } }
];
const edge = {
  id: 'edge-depends', source_node_id: nodes[0].id, target_node_id: nodes[1].id,
  source_label: nodes[0].label, target_label: nodes[1].label,
  edge_type: { id: 'depends_on', label: 'depends_on', icon_key: 'git-branch', color: '#80FF00' },
  graph_ids: memberships.map(item => item.graph_id), graph_memberships: memberships,
  relation_group_id: 'relation-1', reciprocal_edge_id: 'edge-depends-back', reciprocal_role: 'asserted',
  weight: 0.8, confidence: 0.9, cost: 2, origin: 'agent', provenance: { run: 'fixture' }
};
const parallelEdge = { ...edge, id: 'edge-blocks', edge_type: { id: 'blocks', label: 'blocks', icon_key: 'ban', color: '#FF00FF' }, relation_group_id: null, reciprocal_edge_id: null };

const response = body => ({ ok: true, json: vi.fn().mockResolvedValue(body) });
const renderGraph = content => render(<MemoryRouter initialEntries={['/graph']}>{content}</MemoryRouter>);

function mockGraphApi() {
  return vi.fn(async (url, options = {}) => {
    if (url === '/api/graph/documents') return response({ documents: wikiDocuments });
    if (url === '/api/graph') return response({ documents: wikiDocuments, edges: wikiEdges });
    if (url === '/api/knowledge/graphs') return response({ graphs: [graph, impact] });
    if (url === `/api/knowledge/graphs/${encodeURIComponent(graph.id)}`) return response({ graph, nodes, edges: [edge, parallelEdge], snapshot_truncated: false });
    if (url === `/api/knowledge/graphs/${encodeURIComponent(graph.id)}/traverse` && options.method === 'POST') return response({ graph, nodes, edges: [edge], paths: [{ node_id: nodes[1].id, node_ids: nodes.map(node => node.id), edge_ids: [edge.id] }], truncated: false });
    if (url === `/api/knowledge/graphs/${encodeURIComponent(impact.id)}`) return response({ graph: impact, nodes: [], edges: [], snapshot_truncated: false });
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('KnowledgeGraphPage wikilink base with DB overlays', () => {
  it('keeps the Obsidian wikilink graph visible by default and overlays independent parallel DB arcs only when enabled', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    expect(await screen.findByTestId('graph-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('graph-app-bar')).toHaveAttribute('data-admin-active', 'false');
    expect(screen.getByTestId('graph-app-home')).toHaveAttribute('href', '/');
    expect(document.querySelector('.graph-workspace-footer')).not.toBeInTheDocument();
    expect(screen.queryByText('RÉTEGEZETT TUDÁSTÉR')).not.toBeInTheDocument();
    expect(screen.queryByText('ADATBÁZIS-DOKUMENTUMOK // GRÁFTOPOLOGIA')).not.toBeInTheDocument();
    expect(screen.queryByTestId('graph-model-selection-strip')).not.toBeInTheDocument();
    expect(screen.queryByText('OBSIDIAN WIKILINK ALAPRÉTEG')).not.toBeInTheDocument();
    expect(screen.queryByTestId('graph-workspace-properties')).not.toBeInTheDocument();
    expect(screen.getByTestId('graph-edge-wiki-cad-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('graph-admin-workbench')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(`/api/knowledge/graphs/${encodeURIComponent(graph.id)}`);

    fireEvent.click(screen.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }));
    expect(await screen.findByText('OBSIDIAN WIKILINK ALAPRÉTEG')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Projektgráf DB-réteg'));
    expect(await screen.findByTestId(`graph-layer-overlay-${graph.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`graph-layer-edge-${edge.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`graph-layer-edge-${parallelEdge.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('graph-edge-wiki-cad-flow')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`graph-layer-edge-${edge.id}`));
    expect(screen.queryByTestId('graph-model-selection-strip')).not.toBeInTheDocument();
    expect(await screen.findByTestId('graph-cad-quick-menu')).toHaveAttribute('data-selection-kind', 'db-edge');
    expect(screen.queryByTestId('graph-workspace-properties')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Tulajdonságok megnyitása' }));
    const properties = await screen.findByTestId('graph-workspace-properties');
    await waitFor(() => expect(within(properties).getByTestId('graph-layer-inspector')).toHaveTextContent('relation_group_id: relation-1'));
    expect(within(properties).getByTestId('graph-layer-inspector')).toHaveTextContent('fixture');
  });

  it('uses an explicitly bound base document as the DB traversal start instead of deriving a Markdown edge', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }));
    fireEvent.click(screen.getByLabelText('Projektgráf DB-réteg'));
    await screen.findByTestId(`graph-layer-overlay-${graph.id}`);
    fireEvent.click(screen.getByTestId('graph-node-31'));
    expect(screen.queryByTestId('graph-workspace-properties')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('graph-ribbon-tab-tools'));
    fireEvent.click(screen.getByRole('button', { name: 'ÚTVONALAK panel megnyitása' }));
    fireEvent.change(await screen.findByLabelText('Bejárás iránya'), { target: { value: 'both' } });
    fireEvent.change(screen.getByLabelText('Bejárás mélysége'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'BEJÁRÁS INDÍTÁSA' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/knowledge/graphs/${encodeURIComponent(graph.id)}/traverse`,
      expect.objectContaining({ method: 'POST' })
    ));
    const [, options] = fetchMock.mock.calls.find(call => call[0] === `/api/knowledge/graphs/${encodeURIComponent(graph.id)}/traverse`);
    expect(JSON.parse(options.body)).toMatchObject({ start_node_ids: [nodes[0].id], direction: 'both', max_depth: 3, edge_type_ids: [], origins: [] });
    expect(await screen.findByTestId('graph-traversal-result')).toHaveTextContent('Gyártási folyamat');
  });

  it('opens the document explorer only on an explicit FILE-ribbon command and filters the canonical corpus', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    expect(screen.queryByTestId('graph-document-explorer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('graph-ribbon-tab-file'));
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORER panel megnyitása' }));

    const explorer = await screen.findByTestId('graph-document-explorer');
    expect(within(explorer).getByText('PIVOT STRUKTÚRA')).toBeInTheDocument();
    expect(within(explorer).getByText('CAD alapok')).toBeInTheDocument();
    fireEvent.change(within(explorer).getByPlaceholderText('KERESÉS A TUDÁSTÉRBEN…'), { target: { value: 'CAD' } });
    expect(within(explorer).getByText('CAD alapok')).toBeInTheDocument();
    expect(within(explorer).queryByText('Gyártási folyamat')).not.toBeInTheDocument();
  });

  it('opens one CAD panel command center that docks, floats and saves a personal workspace layout', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    fireEvent.click(screen.getByTestId('workspace-panel-launcher'));
    const commandCenter = await screen.findByTestId('workspace-panel-command-center');
    const explorerCommand = within(commandCenter).getByTestId('workspace-panel-command-graph-explorer-panel');
    expect(explorerCommand).toHaveAttribute('data-panel-location', 'closed');

    fireEvent.click(within(explorerCommand).getByTestId('workspace-panel-dock-left-graph-explorer-panel'));
    expect(await screen.findByTestId('graph-document-explorer')).toBeInTheDocument();
    await waitFor(() => expect(within(commandCenter).getByTestId('workspace-panel-command-graph-explorer-panel')).toHaveAttribute('data-panel-location', 'grid'));

    fireEvent.click(within(commandCenter).getByTestId('workspace-panel-float-graph-explorer-panel'));
    await waitFor(() => expect(within(commandCenter).getByTestId('workspace-panel-command-graph-explorer-panel')).toHaveAttribute('data-panel-location', 'floating'));

    fireEvent.click(within(commandCenter).getByRole('button', { name: 'MENTÉS' }));
    expect(within(commandCenter).getByRole('button', { name: /VISSZAÁLLÍTÁS/i })).not.toBeDisabled();
  });

  it('keeps panels closed until the app-bar CAD menu explicitly shows, docks or floats them', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    expect(screen.queryByRole('dialog', { name: 'Munkatér panelek' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('graph-document-explorer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('workspace-panel-customizer-trigger'));
    const menu = await screen.findByRole('dialog', { name: 'Munkatér panelek' });
    expect(within(menu).getByText('PUBLIKUS')).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Show EXPLORER' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(within(menu).getByRole('button', { name: 'Show EXPLORER' }));
    expect(await screen.findByTestId('graph-document-explorer')).toBeInTheDocument();
    await waitFor(() => expect(within(menu).getByRole('button', { name: 'Hide EXPLORER' })).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(within(menu).getByRole('button', { name: 'Float EXPLORER' }));
    await waitFor(() => expect(within(menu).getByRole('button', { name: 'Float EXPLORER' })).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(within(menu).getByRole('button', { name: 'Hide EXPLORER' }));
    await waitFor(() => expect(screen.queryByTestId('graph-document-explorer')).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('graph-cad:public:panels'))['graph-explorer-panel']).toMatchObject({ open: false, placement: 'float' });
  });

  it('keeps frequently used display layers one click away from the persistent application bar', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    const layerLauncher = screen.getByTestId('graph-layers-panel-toggle');
    expect(layerLauncher).toHaveAttribute('aria-pressed', 'false');
    expect(layerLauncher).toHaveAccessibleName('RÉTEGEK gyorspanel megnyitása');

    fireEvent.click(layerLauncher);
    expect(await screen.findByText('OBSIDIAN WIKILINK ALAPRÉTEG')).toBeInTheDocument();
    expect(layerLauncher).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(layerLauncher);
    await waitFor(() => expect(screen.queryByText('OBSIDIAN WIKILINK ALAPRÉTEG')).not.toBeInTheDocument());
    expect(layerLauncher).toHaveAccessibleName('RÉTEGEK gyorspanel megnyitása');
  });

  it('creates and switches independently persisted workspace profiles from the layout tab bar', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    const tabs = screen.getByTestId('graph-workspace-layout-tabs');
    const model = within(tabs).getByRole('tab', { name: 'MODEL' });
    expect(model).toHaveAttribute('aria-selected', 'true');

    await act(async () => {
      fireEvent.click(within(tabs).getByTestId('graph-workspace-layout-add'));
      await new Promise(resolve => window.setTimeout(resolve, 0));
    });
    const layout = await within(tabs).findByRole('tab', { name: 'LAYOUT 1' });
    expect(layout).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('graph-workspace-layouts:v1'));
      expect(stored.activeId).not.toBe('model');
      expect(stored.profiles).toHaveLength(2);
      expect(stored.profiles.find(profile => profile.id === 'model')?.snapshot).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(model);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    });
    expect(model).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the selected DB project in the XYFlow point/card workspace panel', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }));
    fireEvent.click(await screen.findByLabelText('Projektgráf DB-réteg'));
    await screen.findByTestId(`graph-layer-overlay-${graph.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'XYFLOW panel megnyitása' }));

    expect(await screen.findByTestId('graph-workspace-flow-view')).toBeInTheDocument();
    expect(await screen.findByTestId('directed-multigraph-canvas')).toBeInTheDocument();
  });

  it('keeps the XYFlow compact and detailed projection independent for each workspace profile', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    const adminDisplayKey = `directed-multigraph-display:${graph.id}:v1`;
    localStorage.setItem(adminDisplayKey, 'detailed');
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }));
    fireEvent.click(await screen.findByLabelText('Projektgráf DB-réteg'));
    await screen.findByTestId(`graph-layer-overlay-${graph.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'XYFLOW panel megnyitása' }));

    const modelFlow = await screen.findByTestId('graph-workspace-flow-view');
    const modelMode = within(modelFlow).getByTestId('directed-multigraph-canvas-mode-switcher');
    expect(within(modelFlow).getByTestId('directed-multigraph-workspace-profile')).toHaveTextContent('MODEL PROFIL');
    expect(within(modelMode).getByRole('tab', { name: 'PONT' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(modelMode).getByRole('tab', { name: 'RÉSZLETES' }));
    expect(await within(modelFlow).findByTestId('graph-node-task:TASK-004')).toHaveClass('xyflow-display-card');

    const layouts = screen.getByTestId('graph-workspace-layout-tabs');
    const model = within(layouts).getByRole('tab', { name: 'MODEL' });
    await act(async () => {
      fireEvent.click(within(layouts).getByTestId('graph-workspace-layout-add'));
      await new Promise(resolve => window.setTimeout(resolve, 0));
    });
    const layout = await within(layouts).findByRole('tab', { name: 'LAYOUT 1' });
    fireEvent.click(screen.getByRole('button', { name: 'XYFLOW panel megnyitása' }));

    const layoutFlow = await screen.findByTestId('graph-workspace-flow-view');
    const layoutMode = within(layoutFlow).getByTestId('directed-multigraph-canvas-mode-switcher');
    expect(within(layoutFlow).getByTestId('directed-multigraph-workspace-profile')).toHaveTextContent('LAYOUT 1 PROFIL');
    expect(within(layoutMode).getByRole('tab', { name: 'PONT' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(layoutMode).getByRole('tab', { name: 'PONT' }));
    expect(await within(layoutFlow).findByTestId('graph-node-task:TASK-004')).toHaveClass('xyflow-display-point');

    await act(async () => {
      fireEvent.click(model);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    });
    const restoredModelFlow = await screen.findByTestId('graph-workspace-flow-view');
    expect(within(restoredModelFlow).getByRole('tab', { name: 'RÉSZLETES' })).toHaveAttribute('aria-selected', 'true');

    await act(async () => {
      fireEvent.click(layout);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    });
    const restoredLayoutFlow = await screen.findByTestId('graph-workspace-flow-view');
    expect(within(restoredLayoutFlow).getByRole('tab', { name: 'PONT' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('graph-workspace-layouts:v1'));
      const layoutId = stored.profiles.find(profile => profile.name === 'LAYOUT 1')?.id;
      expect(localStorage.getItem(`directed-multigraph-display:workspace:model:${graph.id}:v2`)).toBe('detailed');
      expect(localStorage.getItem(`directed-multigraph-display:workspace:${layoutId}:${graph.id}:v2`)).toBe('compact');
      expect(localStorage.getItem(adminDisplayKey)).toBe('detailed');
    });
  });

  it('keeps the RAG search out of the model height until its ribbon command is requested', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    expect(screen.queryByTestId('graph-search-console')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('graph-ribbon-tab-file'));
    fireEvent.click(screen.getByRole('button', { name: 'RAG kereső megnyitása' }));
    expect(await screen.findByTestId('graph-workspace-search-popover')).toBeVisible();
    expect(screen.getByTestId('graph-search-console')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'SZŰRŐK ELREJTÉSE' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'SZŰRŐK' })).toBeVisible());
    expect(screen.getByTestId('graph-search-console')).toBeVisible();
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
  });

  it('keeps the display controls inside a collapsed in-canvas navigation cube', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    expect(screen.queryByTestId('graph-universe-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('graph-navigation-cube-toggle')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByTestId('graph-navigation-cube-toggle'));
    expect(await screen.findByTestId('graph-navigation-cube')).toBeVisible();
    expect(screen.queryByTestId('graph-navigation-cube-backdrop')).not.toBeInTheDocument();
    expect(screen.getByTestId('graph-universe-controls')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Csomópontok minimális távolsága'), { target: { value: '140' } });
    expect(screen.getByTestId('graph-canvas')).toHaveAttribute('viewBox', '0 0 1842 1032');

    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('graph-navigation-cube')).not.toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
  });

  it('keeps graph telemetry inside an editable transparent canvas panel and expands only the workspace to fullscreen', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    const frame = screen.getByTestId('graph-workspace-frame');
    const infoPanel = screen.getByTestId('graph-info-panel');
    expect(screen.queryByTestId('graph-model-selection-strip')).not.toBeInTheDocument();
    expect(within(infoPanel).getByText('LÁTHATÓ CSOMÓPONT')).toBeInTheDocument();
    expect(within(infoPanel).getByText('VALÓDI KAPCSOLAT')).toBeInTheDocument();

    fireEvent.click(within(infoPanel).getByRole('button', { name: 'Infopanel szerkesztése' }));
    const title = within(infoPanel).getByLabelText('Infopanel címe');
    fireEvent.change(title, { target: { value: 'SAJÁT TELEMETRIA' } });
    expect(title).toHaveValue('SAJÁT TELEMETRIA');
    fireEvent.click(within(infoPanel).getByRole('checkbox', { name: 'VALÓDI KAPCSOLAT' }));
    expect(infoPanel.querySelector('[data-metric="edges"]')).not.toBeInTheDocument();

    const fullscreenToggle = screen.getByTestId('graph-fullscreen-toggle');
    fireEvent.click(fullscreenToggle);
    await waitFor(() => expect(frame).toHaveClass('is-immersive-fullscreen'));
    expect(screen.getByTestId('graph-fullscreen-toggle')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('graph-fullscreen-toggle'));
    await waitFor(() => expect(frame).not.toHaveClass('is-immersive-fullscreen'));
  });

  it('persists a personalized ribbon command set and exposes a safe default reset', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    const ribbon = screen.getByTestId('graph-cad-ribbon');
    expect(ribbon).toHaveAttribute('data-minimized', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Szalag összecsukása' }));
    expect(ribbon).toHaveAttribute('data-minimized', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Szalag kibontása' }));
    expect(ribbon).toHaveAttribute('data-minimized', 'false');
    fireEvent.click(screen.getByTestId('graph-ribbon-tab-file'));
    fireEvent.click(screen.getByRole('button', { name: 'Ribbon személyre szabása' }));
    const customizer = await screen.findByTestId('graph-ribbon-customizer');
    fireEvent.click(within(customizer).getByRole('button', { name: /MAGENTA/i }));
    expect(within(customizer).getByRole('button', { name: /MAGENTA/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(customizer).getByRole('checkbox', { name: /RÉTEGEK/i }));

    fireEvent.click(screen.getByTestId('graph-ribbon-tab-view'));
    expect(screen.queryByRole('button', { name: 'RÉTEGEK panel megnyitása' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('graph-ribbon-tab-file'));
    fireEvent.click(within(customizer).getByRole('button', { name: 'ALAPÉRTELMEZETT' }));
    fireEvent.click(screen.getByTestId('graph-ribbon-tab-view'));
    expect(screen.getByRole('button', { name: 'RÉTEGEK panel megnyitása' })).toBeInTheDocument();
  });

  it('uses a two-step compact ribbon menu, closes after commands, and still toggles its Dockview panels', async () => {
    const fetchMock = mockGraphApi();
    vi.stubGlobal('fetch', fetchMock);
    renderGraph(<KnowledgeGraphPage />);

    await screen.findByTestId('graph-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Szalag összecsukása' }));
    fireEvent.click(screen.getByTestId('graph-ribbon-tab-view'));

    const compactMenu = await screen.findByTestId('graph-ribbon-compact-menu');
    expect(within(compactMenu).getByText('2 / FUNKCIÓCSOPORT')).toBeInTheDocument();
    expect(within(compactMenu).getByRole('button', { name: /RÉTEGEK/i })).toBeInTheDocument();
    expect(within(compactMenu).getByRole('button', { name: /NÉZET/i })).toBeInTheDocument();
    expect(within(compactMenu).getByRole('button', { name: /INFORMÁCIÓ/i })).toBeInTheDocument();
    expect(within(compactMenu).getByRole('button', { name: /KAMERA/i })).toBeInTheDocument();
    expect(within(compactMenu).queryByRole('button', { name: 'RÉTEGEK panel megnyitása' })).not.toBeInTheDocument();

    fireEvent.click(within(compactMenu).getByRole('button', { name: /RÉTEGEK/i }));
    const layersCommand = within(compactMenu).getByRole('button', { name: 'RÉTEGEK panel megnyitása' });
    fireEvent.click(layersCommand);
    expect(await screen.findByText('OBSIDIAN WIKILINK ALAPRÉTEG')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('graph-ribbon-compact-menu')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('graph-ribbon-tab-view'));
    const reopenedCompactMenu = await screen.findByTestId('graph-ribbon-compact-menu');
    fireEvent.click(within(reopenedCompactMenu).getByRole('button', { name: /RÉTEGEK/i }));
    fireEvent.click(within(reopenedCompactMenu).getByRole('button', { name: 'RÉTEGEK panel bezárása' }));
    await waitFor(() => expect(screen.queryByText('OBSIDIAN WIKILINK ALAPRÉTEG')).not.toBeInTheDocument());
    expect(screen.queryByTestId('graph-ribbon-compact-menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('graph-ribbon-tab-view'));
    await screen.findByTestId('graph-ribbon-compact-menu');
    fireEvent.pointerLeave(screen.getByTestId('graph-cad-ribbon'));
    await waitFor(() => expect(screen.queryByTestId('graph-ribbon-compact-menu')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('graph-ribbon-tab-view'));
    await screen.findByTestId('graph-ribbon-compact-menu');
    fireEvent.blur(screen.getByTestId('graph-cad-ribbon'), { relatedTarget: document.body });
    await waitFor(() => expect(screen.queryByTestId('graph-ribbon-compact-menu')).not.toBeInTheDocument());
  });

  it('reveals the direct workbench only after a verified administrator session', async () => {
    localStorage.setItem('cyber_admin_token', 'verified-admin-token');
    localStorage.setItem('graph-cad:public:panels', JSON.stringify({
      'graph-explorer-panel': { open: false, placement: 'float' }
    }));
    const publicApi = mockGraphApi();
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/admin/session') return response({ authenticated: true, role: 'OVERSEER_ADMIN' });
      if (url === `/api/admin/graphs/${encodeURIComponent(graph.id)}/nodes?limit=250`) return response({ nodes });
      if (url === `/api/admin/graphs/${encodeURIComponent(graph.id)}/edges?limit=250`) return response({ edges: [edge, parallelEdge] });
      if (url === '/api/admin/graphs/edge-types') return response({ edge_types: [edge.edge_type, parallelEdge.edge_type] });
      return publicApi(url, options);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderGraph(<AuthProvider><AdminPreviewProvider><KnowledgeGraphPage /></AdminPreviewProvider></AuthProvider>);

    await screen.findByTestId('graph-canvas');
    expect(screen.getByTestId('graph-app-bar')).toHaveAttribute('data-admin-active', 'true');
    expect(screen.queryByTestId('graph-admin-mode-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('workspace-panel-customizer-trigger'));
    const adminPanelMenu = await screen.findByRole('dialog', { name: 'Munkatér panelek' });
    expect(within(adminPanelMenu).getByText('ADMIN')).toBeInTheDocument();
    expect(within(adminPanelMenu).getByRole('button', { name: 'Dock EXPLORER' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(adminPanelMenu).getByRole('button', { name: 'Float EXPLORER' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(within(adminPanelMenu).getByRole('button', { name: 'Munkatér panelmenü bezárása' }));
    fireEvent.click(screen.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }));
    fireEvent.click(screen.getByLabelText('Projektgráf DB-réteg'));
    fireEvent.click(screen.getByTestId('graph-ribbon-tab-edit'));
    fireEvent.click(await screen.findByRole('button', { name: /(?:ÚJ CSÚCS|SZERKESZTŐ) panel megnyitása/ }));
    expect(await screen.findByTestId('graph-admin-workbench')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/graphs/${encodeURIComponent(graph.id)}/nodes?limit=250`,
      expect.objectContaining({ headers: expect.objectContaining({ 'x-admin-token': 'verified-admin-token' }) })
    ));
  });
});

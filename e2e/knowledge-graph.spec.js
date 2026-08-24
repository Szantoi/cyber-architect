import { test, expect } from '@playwright/test';

const graph = {
  id: 'project/prj-e2e', slug: 'prj-e2e', name: 'E2E Projektgráf', icon_key: 'network', color: '#00FFFF',
  visibility: 'public', description: 'Determinista DB-gráf teszt', node_count: 2, edge_count: 2
};
const impact = { id: 'impact/e2e', slug: 'impact-e2e', name: 'E2E Hatásgráf', icon_key: 'activity', color: '#FF00FF', visibility: 'public', node_count: 1, edge_count: 1 };
const memberships = [
  { graph_id: graph.id, graph_name: graph.name, graph_color: graph.color, graph_icon_key: graph.icon_key, graph_visibility: 'public', graph_active: true },
  { graph_id: impact.id, graph_name: impact.name, graph_color: impact.color, graph_icon_key: impact.icon_key, graph_visibility: 'public', graph_active: true }
];
const wikiDocuments = [
  { id: 31, slug: 'cad-alapok', title: 'CAD alapok', content_type: 'knowledge', category: 'TUDÁSTÁR', dimensions: {} },
  { id: 32, slug: 'gyartasi-folyamat', title: 'Gyártási folyamat', content_type: 'knowledge', category: 'TUDÁSTÁR', dimensions: {} }
];
const wikiEdges = [{ id: 'wiki-cad-flow', source_post_id: 31, target_post_id: 32, relation_type: 'wikilink' }];
const nodes = [
  { id: 'task:TASK-004', label: 'CAD alapok', node_type: 'task', source_system: 'markdown', graph_ids: memberships.map(item => item.graph_id), graph_memberships: memberships, document_binding: { document_id: 'kb:cad', slug: 'cad-alapok', content_type: 'knowledge', href: '/knowledge/cad-alapok' } },
  { id: 'task:TASK-018', label: 'Gyártási folyamat', node_type: 'task', source_system: 'markdown', graph_ids: [graph.id], graph_memberships: memberships.slice(0, 1), document_binding: { document_id: 'kb:flow', slug: 'gyartasi-folyamat', content_type: 'knowledge', href: '/knowledge/gyartasi-folyamat' } }
];
const baseEdge = {
  source_node_id: nodes[0].id, target_node_id: nodes[1].id, source_label: nodes[0].label, target_label: nodes[1].label,
  graph_ids: memberships.map(item => item.graph_id), graph_memberships: memberships, weight: 0.85, confidence: 0.9, cost: 3,
  valid_from: null, valid_to: null, origin: 'agent', provenance: { fixture: 'e2e' }, visibility: 'public', active: true
};
const edges = [
  { ...baseEdge, id: 'edge-depends', edge_type_id: 'depends_on', edge_type: { id: 'depends_on', label: 'depends_on', icon_key: 'git-branch', color: '#80FF00' }, relation_group_id: 'relation-e2e', reciprocal_edge_id: 'edge-depends-back', reciprocal_role: 'asserted' },
  { ...baseEdge, id: 'edge-blocks', edge_type_id: 'blocks', edge_type: { id: 'blocks', label: 'blocks', icon_key: 'ban', color: '#FF00FF' }, relation_group_id: null, reciprocal_edge_id: null, reciprocal_role: 'asserted' }
];

async function mockGraphApi(page) {
  await page.route('**/api/graph**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/graph/documents') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ documents: wikiDocuments }) });
    if (pathname === '/api/graph') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ documents: wikiDocuments, edges: wikiEdges }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND' }) });
  });
  await page.route('**/api/knowledge/graphs**', async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === '/api/knowledge/graphs') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ graphs: [graph, impact] }) });
    if (pathname.endsWith('/traverse')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ graph, nodes, edges: [edges[0]], paths: [{ node_id: nodes[1].id, node_ids: nodes.map(node => node.id), edge_ids: [edges[0].id] }], truncated: false }) });
    if (decodeURIComponent(pathname).endsWith(graph.id)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ graph, nodes, edges, snapshot_truncated: false }) });
    if (decodeURIComponent(pathname).endsWith(impact.id)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ graph: impact, nodes: [], edges: [], snapshot_truncated: false }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND' }) });
  });
}

const xyflowCanvasStateKey = workspaceId => `directed-multigraph-display:workspace:${workspaceId}:${graph.id}:v2:canvas-state:v1`;

const readStoredXYFlowState = (page, storageKey) => page.evaluate(key => {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : null;
}, storageKey);

async function dragXYFlowNode(page, flowView, { x, y }) {
  const node = flowView.locator('.react-flow__node[data-id="task:TASK-004"]');
  await expect(node).toBeVisible();
  const before = await node.evaluate(element => element.style.transform);
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + x, box.y + (box.height / 2) + y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => node.evaluate(element => element.style.transform)).not.toBe(before);
  return node.evaluate(element => element.style.transform);
}

async function zoomXYFlowCanvas(page, flowView, deltaY) {
  const pane = flowView.locator('.react-flow__pane');
  const viewport = flowView.locator('.react-flow__viewport');
  await expect(pane).toBeVisible();
  const before = await viewport.evaluate(element => element.style.transform);
  const box = await pane.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + (box.width / 2), box.y + box.height - 28);
  await page.mouse.wheel(0, deltaY);
  await expect.poll(() => viewport.evaluate(element => element.style.transform)).not.toBe(before);
  return viewport.evaluate(element => element.style.transform);
}

async function mockAdminGraphEditorApi(page, mutations) {
  let editorEdges = edges.map(edge => ({
    ...edge,
    description: 'Admin szerkesztői fixture él.',
    metadata: { test: 'e2e' }
  }));
  const editorNodes = nodes.map(node => ({
    ...node,
    description: 'Admin szerkesztői fixture csúcs.',
    metadata: { test: 'e2e' },
    visibility: 'private',
    active: true
  }));

  await page.route('**/api/admin/graphs**', async route => {
    const request = route.request();
    const path = decodeURIComponent(new URL(request.url()).pathname);
    const headers = request.headers();
    const recordMutation = () => mutations.push({
      path,
      method: request.method(),
      hasAdminToken: Boolean(headers['x-admin-token']),
      body: request.postDataJSON()
    });

    if (path === `/api/admin/graphs/${graph.id}/nodes` && request.method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ nodes: editorNodes }) });
    }
    if (path === `/api/admin/graphs/${graph.id}/edges` && request.method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ edges: editorEdges }) });
    }
    if (path === '/api/admin/graphs/edge-types' && request.method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ edge_types: edges.map(edge => edge.edge_type) }) });
    }
    if (path === `/api/admin/graphs/edges/${edges[0].id}` && request.method() === 'PUT') {
      recordMutation();
      const patch = request.postDataJSON();
      editorEdges = editorEdges.map(edge => edge.id === edges[0].id ? { ...edge, ...patch } : edge);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, edge: editorEdges[0] }) });
    }
    if (path === '/api/admin/graphs/edges' && request.method() === 'POST') {
      recordMutation();
      const created = { id: 'edge-created-in-e2e', ...request.postDataJSON() };
      editorEdges = [...editorEdges, created];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, edge: created }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND' }) });
  });
}

test('Obsidian wikilinks stay as the default graph and typed DB arcs overlay them without duplication', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await mockGraphApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/graph', { waitUntil: 'domcontentloaded' });

  const appBar = page.getByTestId('graph-app-bar');
  await expect(appBar).toBeVisible();
  await expect(appBar).toHaveAttribute('data-admin-active', 'false');
  await expect(page.getByTestId('graph-app-home')).toHaveAttribute('href', '/');
  await expect(page.getByLabel('Fő navigáció')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expect(page.locator('.graph-workspace-footer')).toHaveCount(0);
  await expect(page.getByTestId('graph-cad-ribbon')).toBeVisible();
  const frameBox = await page.getByTestId('graph-workspace-frame').boundingBox();
  const workspaceBox = await page.getByTestId('graph-workspace-dock').boundingBox();
  expect(frameBox?.y).toBe(0);
  expect(frameBox?.height).toBeLessThanOrEqual(1001);
  expect(workspaceBox?.width).toBeGreaterThan(1200);
  expect(workspaceBox?.height).toBeGreaterThan(650);
  expect((workspaceBox?.y || 0) + (workspaceBox?.height || 0)).toBeLessThanOrEqual(1001);
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  expect((await page.getByTestId('graph-canvas').boundingBox())?.height).toBeGreaterThan(600);
  const scrollState = await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    window.scrollTo(0, 500);
    return { clientHeight: root.clientHeight, scrollHeight: root.scrollHeight, scrollY: window.scrollY };
  });
  expect(scrollState.scrollHeight).toBeLessThanOrEqual(scrollState.clientHeight + 2);
  expect(scrollState.scrollY).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('graph-search-console')).toHaveCount(0);
  const canvasHeightBeforeSearch = (await page.getByTestId('graph-canvas').boundingBox())?.height;
  await page.getByTestId('graph-ribbon-tab-file').click();
  await page.getByRole('button', { name: 'RAG kereső megnyitása' }).click();
  await expect(page.getByTestId('graph-workspace-search-popover')).toBeVisible();
  await expect(page.getByTestId('graph-search-console')).toBeVisible();
  expect((await page.getByTestId('graph-canvas').boundingBox())?.height).toBe(canvasHeightBeforeSearch);
  await page.getByRole('button', { name: 'SZŰRŐK ELREJTÉSE' }).click();
  await expect(page.getByRole('button', { name: 'SZŰRŐK' })).toBeVisible();
  await expect(page.getByTestId('graph-search-console')).toBeVisible();
  await page.getByRole('dialog', { name: 'KERESŐ' }).getByLabel('Panel bezárása').click();
  await expect(page.getByTestId('graph-search-console')).toHaveCount(0);
  // SVG lines and groups have no independent layout box in Playwright. Their
  // presence plus the following interaction assertions are the meaningful UI
  // contract here.
  await expect(page.getByTestId('graph-edge-wiki-cad-flow')).toHaveCount(1);
  await expect(page.getByTestId('graph-info-panel')).toBeVisible();
  await expect(page.getByText('RÉTEGEZETT TUDÁSTÉR', { exact: true })).toHaveCount(0);
  await expect(page.getByText('ADATBÁZIS-DOKUMENTUMOK // GRÁFTOPOLOGIA', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('graph-universe-controls')).toHaveCount(0);
  await page.getByTestId('graph-navigation-cube-toggle').click();
  await expect(page.getByTestId('graph-navigation-cube')).toBeVisible();
  await expect(page.getByTestId('graph-universe-controls')).toBeVisible();
  await page.getByLabel('Csomópontok minimális távolsága').fill('140');
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('viewBox', '0 0 1842 1032');
  await page.getByLabel('Csomópontcímkék megjelenítése').selectOption('all');
  await expect(page.getByTestId('graph-node-label-31')).toBeVisible();
  await expect(page.getByTestId('graph-node-label-32')).toBeVisible();
  await page.getByTestId('graph-canvas').dispatchEvent('wheel', { deltaY: -140 });
  await expect(page.getByTestId('graph-viewport')).toHaveAttribute('data-zoom', '1');
  await page.getByTestId('graph-canvas').dispatchEvent('wheel', { deltaY: -140, shiftKey: true });
  await expect(page.getByTestId('graph-viewport')).toHaveAttribute('data-zoom', '1.1');
  await page.getByRole('button', { name: 'Nézet illesztése' }).click();
  await page.getByRole('button', { name: 'Nagyítás' }).click();
  await expect(page.getByTestId('graph-viewport')).toHaveAttribute('data-zoom', '1.1');
  await page.getByRole('button', { name: 'Nézet illesztése' }).click();
  await expect(page.getByTestId('graph-viewport')).toHaveAttribute('transform', 'translate(0 0) scale(1)');
  await page.getByTestId('graph-navigation-cube-toggle').click();
  await expect(page.getByTestId('graph-navigation-cube')).toHaveCount(0);
  await expect(page.getByText('OBSIDIAN WIKILINK ALAPRÉTEG')).toHaveCount(0);
  await expect(page.getByTestId(`graph-layer-overlay-${graph.id}`)).toHaveCount(0);

  await page.getByTestId('graph-ribbon-tab-view').click();
  await page.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }).click();
  await expect(page.getByText('OBSIDIAN WIKILINK ALAPRÉTEG')).toBeVisible();
  await page.getByTestId(`graph-layer-toggle-${graph.id}`).click();
  await expect(page.getByTestId(`graph-layer-overlay-${graph.id}`)).toHaveCount(1);
  await expect(page.getByTestId('graph-layer-edge-edge-depends')).toHaveCount(1);
  await expect(page.getByTestId('graph-layer-edge-edge-blocks')).toHaveCount(1);
  await expect(page.getByTestId('graph-edge-wiki-cad-flow')).toHaveCount(1);

  await page.getByTestId('graph-layer-edge-edge-depends').click({ force: true });
  await expect(page.getByTestId('graph-model-selection-strip')).toHaveCount(0);

  await expect(page.getByTestId('graph-cad-quick-menu')).toBeVisible();
  await expect(page.getByTestId('graph-workspace-properties')).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Tulajdonságok megnyitása' }).click();
  const properties = page.getByTestId('graph-workspace-properties');
  await expect(properties.getByTestId('graph-layer-inspector')).toContainText('relation_group_id: relation-e2e');
  await expect(properties.getByTestId('graph-layer-inspector')).toContainText('e2e');
  await page.getByTestId('graph-ribbon-tab-tools').click();
  await page.getByRole('button', { name: 'ÚTVONALAK panel megnyitása' }).click();
  await page.getByLabel('Bejárás iránya').selectOption('both');
  await page.getByLabel('Bejárás mélysége').fill('3');
  await page.getByRole('button', { name: 'BEJÁRÁS INDÍTÁSA' }).click();
  await expect(page.getByTestId('graph-traversal-result')).toContainText('Gyártási folyamat');
  await page.getByTestId('graph-app-home').click();
  await expect(page).toHaveURL(/\/$/);
});

test('the floating CAD panel manager stays fully inside the mobile workspace', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await mockGraphApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/graph', { waitUntil: 'domcontentloaded' });

  await page.getByTestId('workspace-panel-launcher').click();
  const manager = page.getByRole('dialog', { name: 'PANELEK' });
  await expect(manager).toBeVisible();
  await expect(page.getByTestId('workspace-panel-command-center')).toBeVisible();

  const [root, managerBox] = await Promise.all([
    page.evaluate(() => {
      const documentRoot = document.scrollingElement || document.documentElement;
      return {
        clientWidth: documentRoot.clientWidth,
        scrollWidth: documentRoot.scrollWidth,
        clientHeight: documentRoot.clientHeight,
        scrollHeight: documentRoot.scrollHeight
      };
    }),
    manager.boundingBox()
  ]);
  expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 2);
  expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 2);
  expect(managerBox).not.toBeNull();
  expect(managerBox.x).toBeGreaterThanOrEqual(0);
  expect(managerBox.y).toBeGreaterThanOrEqual(0);
  expect(managerBox.x + managerBox.width).toBeLessThanOrEqual(root.clientWidth + 2);
  expect(managerBox.y + managerBox.height).toBeLessThanOrEqual(root.clientHeight + 2);
});

test('the workspace opens project cards in XYFlow and preserves separate layout tabs', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await mockGraphApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/graph', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }).click();
  await page.getByTestId(`graph-layer-toggle-${graph.id}`).click();
  await expect(page.getByTestId(`graph-layer-overlay-${graph.id}`)).toBeVisible();
  await page.getByRole('button', { name: 'XYFLOW panel megnyitása' }).click();

  const flowView = page.getByTestId('graph-workspace-flow-view');
  await expect(flowView).toBeVisible();
  await expect(flowView.getByTestId('directed-multigraph-workspace-profile')).toHaveText('MODEL PROFIL');
  const displayMode = flowView.getByTestId('directed-multigraph-canvas-mode-switcher');
  await displayMode.getByRole('tab', { name: 'RÉSZLETES' }).click();
  await expect(displayMode.getByRole('tab', { name: 'RÉSZLETES' })).toHaveAttribute('aria-selected', 'true');
  await expect(flowView.getByTestId('graph-node-task:TASK-004')).toBeVisible();
  await expect(flowView.getByTestId('graph-edge-path-edge-depends')).toHaveCount(1);

  const modelCanvasStateKey = xyflowCanvasStateKey('model');
  const modelNodeTransform = await dragXYFlowNode(page, flowView, { x: 96, y: 54 });
  const modelViewportTransform = await zoomXYFlowCanvas(page, flowView, -180);
  await expect.poll(async () => (await readStoredXYFlowState(page, modelCanvasStateKey))?.positions?.['task:TASK-004']).not.toBeNull();
  await expect.poll(async () => (await readStoredXYFlowState(page, modelCanvasStateKey))?.viewport).not.toBeNull();
  const modelCanvasState = await readStoredXYFlowState(page, modelCanvasStateKey);

  const layouts = page.getByTestId('graph-workspace-layout-tabs');
  await expect(layouts.getByRole('tab', { name: 'MODEL' })).toHaveAttribute('aria-selected', 'true');
  await layouts.getByTestId('graph-workspace-layout-add').click();
  await expect(layouts.getByRole('tab', { name: 'LAYOUT 1' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => page.evaluate(() => {
    const layouts = JSON.parse(localStorage.getItem('graph-workspace-layouts:v1') || '{}');
    return layouts.profiles?.find(profile => profile.name === 'LAYOUT 1')?.id || '';
  })).not.toBe('');
  const layoutId = await page.evaluate(() => {
    const layouts = JSON.parse(localStorage.getItem('graph-workspace-layouts:v1') || '{}');
    return layouts.profiles?.find(profile => profile.name === 'LAYOUT 1')?.id || '';
  });
  const layoutCanvasStateKey = xyflowCanvasStateKey(layoutId);
  await page.getByRole('button', { name: 'XYFLOW panel megnyitása' }).click();
  const layoutFlowView = page.getByTestId('graph-workspace-flow-view');
  await expect(layoutFlowView.getByTestId('directed-multigraph-workspace-profile')).toHaveText('LAYOUT 1 PROFIL');
  const layoutDisplayMode = layoutFlowView.getByTestId('directed-multigraph-canvas-mode-switcher');
  await expect(layoutDisplayMode.getByRole('tab', { name: 'PONT' })).toHaveAttribute('aria-selected', 'true');
  await layoutDisplayMode.getByRole('tab', { name: 'PONT' }).click();
  const layoutNodeTransform = await dragXYFlowNode(page, layoutFlowView, { x: -72, y: 86 });
  const layoutViewportTransform = await zoomXYFlowCanvas(page, layoutFlowView, 160);
  await expect.poll(async () => (await readStoredXYFlowState(page, layoutCanvasStateKey))?.positions?.['task:TASK-004']).not.toBeNull();
  await expect.poll(async () => (await readStoredXYFlowState(page, layoutCanvasStateKey))?.viewport).not.toBeNull();
  const layoutCanvasState = await readStoredXYFlowState(page, layoutCanvasStateKey);
  expect(layoutCanvasState).not.toEqual(modelCanvasState);
  expect(await readStoredXYFlowState(page, modelCanvasStateKey)).toEqual(modelCanvasState);

  await layouts.getByRole('tab', { name: 'MODEL' }).click();
  await expect(layouts.getByRole('tab', { name: 'MODEL' })).toHaveAttribute('aria-selected', 'true');
  const restoredModelFlow = page.getByTestId('graph-workspace-flow-view');
  const restoredModelMode = restoredModelFlow.getByTestId('directed-multigraph-canvas-mode-switcher');
  await expect(restoredModelMode.getByRole('tab', { name: 'RÉSZLETES' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => restoredModelFlow.locator('.react-flow__node[data-id="task:TASK-004"]').evaluate(element => element.style.transform)).toBe(modelNodeTransform);
  await expect.poll(() => restoredModelFlow.locator('.react-flow__viewport').evaluate(element => element.style.transform)).toBe(modelViewportTransform);
  await layouts.getByRole('tab', { name: 'LAYOUT 1' }).click();
  const restoredLayoutFlow = page.getByTestId('graph-workspace-flow-view');
  const restoredLayoutMode = restoredLayoutFlow.getByTestId('directed-multigraph-canvas-mode-switcher');
  await expect(restoredLayoutMode.getByRole('tab', { name: 'PONT' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => restoredLayoutFlow.locator('.react-flow__node[data-id="task:TASK-004"]').evaluate(element => element.style.transform)).toBe(layoutNodeTransform);
  await expect.poll(() => restoredLayoutFlow.locator('.react-flow__viewport').evaluate(element => element.style.transform)).toBe(layoutViewportTransform);
});

test('the reusable panel kit calibrates information density and keeps explorer rows within their dock', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await mockGraphApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/graph', { waitUntil: 'domcontentloaded' });

  await page.getByTestId('workspace-panel-launcher').click();
  await page.getByTestId('workspace-panel-dock-left-graph-explorer-panel').click();
  const explorer = page.getByTestId('graph-document-explorer');
  await expect(explorer).toBeVisible();
  const explorerSizing = await explorer.locator('.graph-document-explorer__tree').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX
  }));
  expect(explorerSizing.scrollWidth).toBeLessThanOrEqual(explorerSizing.clientWidth + 1);
  expect(explorerSizing.overflowX).toBe('hidden');

  await page.getByTestId('workspace-panel-focus-graph-ribbon-panel').click();
  const customizer = page.getByTestId('graph-ribbon-customizer');
  await expect(customizer).toBeVisible();
  await customizer.getByRole('tab', { name: 'TÖMÖR' }).click();
  await customizer.getByRole('tab', { name: 'FÓKUSZ' }).click();
  const frame = page.getByTestId('graph-workspace-frame');
  await expect(frame).toHaveAttribute('data-cad-density', 'compact');
  await expect(frame).toHaveAttribute('data-cad-detail', 'focus');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(frame).toHaveAttribute('data-cad-density', 'compact');
  await expect(frame).toHaveAttribute('data-cad-detail', 'focus');
});

test('a verified admin can edit a selected directed DB edge from the graph view', async ({ page }) => {
  const mutations = [];
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await mockGraphApi(page);
  await mockAdminGraphEditorApi(page, mutations);

  await page.goto('/admin');
  await page.getByLabel('BIZTONSÁGI_PIN:~$').fill(process.env.CYBER_ARCHITECT_E2E_ADMIN_PIN || 'E2e-Admin-Pin-2026!');
  await page.getByRole('button', { name: /KONZOL MEGNYITÁSA/i }).click();
  await expect(page.getByRole('heading', { name: /Tactical CMS Matrix/i })).toBeVisible();

  await page.goto('/graph');
  await expect(page.getByTestId('admin-view-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('graph-app-bar')).toHaveAttribute('data-admin-active', 'true');
  await page.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }).click();
  await page.getByTestId(`graph-layer-toggle-${graph.id}`).click();
  await page.getByTestId('graph-ribbon-tab-edit').click();
  await page.getByRole('button', { name: /(?:ÚJ CSÚCS|SZERKESZTŐ) panel megnyitása/ }).click();
  await expect(page.getByTestId('graph-admin-workbench')).toBeVisible();
  await page.getByTestId(`graph-layer-edge-${edges[0].id}`).click({ force: true });
  await expect(page.getByTestId('graph-admin-edge-form')).toBeVisible();
  await page.getByLabel('Bizonyosság 0..1').fill('0.72');
  await page.getByTestId('graph-admin-save-edge').click();

  await expect(page.getByTestId('graph-admin-workbench').getByRole('status')).toContainText('IRÁNYÍTOTT_ÉL_BEÁLLÍTÁSAI_MENTVE');
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0]).toMatchObject({
    path: `/api/admin/graphs/edges/${edges[0].id}`,
    method: 'PUT',
    hasAdminToken: true,
    body: { confidence: 0.72, metadata: { test: 'e2e' } }
  });
});

test('a verified admin can draw a connection on the XYFlow canvas and save it through the validated relationship form', async ({ page }) => {
  const mutations = [];
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await mockGraphApi(page);
  await mockAdminGraphEditorApi(page, mutations);

  await page.goto('/admin');
  await page.getByLabel('BIZTONSÁGI_PIN:~$').fill(process.env.CYBER_ARCHITECT_E2E_ADMIN_PIN || 'E2e-Admin-Pin-2026!');
  await page.getByRole('button', { name: /KONZOL MEGNYITÁSA/i }).click();
  await expect(page.getByRole('heading', { name: /Tactical CMS Matrix/i })).toBeVisible();

  await page.goto('/graph');
  await expect(page.getByTestId('admin-view-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('graph-app-bar')).toHaveAttribute('data-admin-active', 'true');
  await page.getByRole('button', { name: 'RÉTEGEK panel megnyitása' }).click();
  await page.getByTestId(`graph-layer-toggle-${graph.id}`).click();
  await page.getByTestId('graph-ribbon-tab-edit').click();
  await page.getByRole('button', { name: /(?:ÚJ CSÚCS|SZERKESZTŐ) panel megnyitása/ }).click();
  await expect(page.getByTestId('graph-admin-workbench')).toBeVisible();
  await page.getByTestId('graph-admin-workbench').getByRole('button', { name: 'VÁSZON' }).click();
  await expect(page.getByTestId('graph-admin-relation-canvas')).toBeVisible();
  await page.waitForTimeout(350);

  const sourceHandle = page.getByLabel(`${nodes[0].label} kapcsolat forrása`);
  const targetHandle = page.getByLabel(`${nodes[1].label} kapcsolat célpontja`);
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox.x + (sourceBox.width / 2), sourceBox.y + (sourceBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(targetBox.x + (targetBox.width / 2), targetBox.y + (targetBox.height / 2), { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('graph-admin-edge-form')).toBeVisible();
  await expect(page.getByLabel('Forráscsúcs')).toHaveValue(nodes[0].id);
  await expect(page.getByLabel('Célcsúcs')).toHaveValue(nodes[1].id);
  await expect(page.getByLabel('Éltípus')).toHaveValue(edges[0].edge_type.id);
  await page.getByTestId('graph-admin-save-edge').click();

  await expect(page.getByTestId('graph-admin-workbench').getByRole('status')).toContainText('ÚJ_IRÁNYÍTOTT_ÉL_LÉTREHOZVA');
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0]).toMatchObject({
    path: '/api/admin/graphs/edges',
    method: 'POST',
    hasAdminToken: true,
    body: {
      source_node_id: nodes[0].id,
      target_node_id: nodes[1].id,
      edge_type_id: edges[0].edge_type.id,
      graph_ids: [graph.id],
      origin: 'admin'
    }
  });
});

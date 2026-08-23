import { test, expect } from '@playwright/test';

const VALID_ADMIN_PIN = process.env.CYBER_ARCHITECT_E2E_ADMIN_PIN || 'E2e-Admin-Pin-2026!';

const graph = {
  id: 'project/prj-document-relation-e2e',
  slug: 'document-relation-e2e',
  name: 'Dokumentumkapcsolat E2E',
  icon_key: 'network',
  color: '#00FFFF',
  visibility: 'private',
  active: true
};

const edgeType = {
  id: 'depends_on',
  label: 'Függ ettől',
  icon_key: 'git-branch',
  color: '#80FF00',
  active: true
};

const sourceDocument = {
  id: 4401,
  slug: 'forras-dokumentum-e2e',
  title: 'Forrás dokumentum E2E',
  summary: 'Egy privát dokumentum admin kapcsolat-szerkesztési teszthez.',
  content: '# Forrás dokumentum E2E\n\nA kapcsolat innen indul.',
  content_type: 'knowledge',
  presentation_profile: 'knowledge',
  visibility: 'private',
  published: 0,
  category: 'TESZT',
  folder_path: 'Tudástár / E2E',
  dimensions: {},
  read_time: '2 PERC',
  assets: []
};

const targetDocument = {
  id: 4402,
  slug: 'cel-dokumentum-e2e',
  title: 'Cél dokumentum E2E',
  summary: 'A kiválasztott céljegyzet.',
  content: '# Cél dokumentum E2E',
  content_type: 'knowledge',
  presentation_profile: 'knowledge',
  visibility: 'private',
  published: 0,
  category: 'TESZT',
  folder_path: 'Tudástár / E2E',
  dimensions: {},
  read_time: '1 PERC',
  assets: []
};

const sourceNode = {
  id: 'document:source-e2e',
  label: sourceDocument.title,
  node_type: 'document',
  source_system: 'markdown',
  source_reference: 'post:4401',
  graph_ids: [graph.id],
  graph_memberships: [{ graph_id: graph.id, graph_name: graph.name }]
};

const targetNode = {
  id: 'document:target-e2e',
  label: targetDocument.title,
  node_type: 'document',
  source_system: 'markdown',
  source_reference: 'post:4402',
  graph_ids: [],
  graph_memberships: []
};

const json = (body, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

async function mockKnowledgeDocuments(page, documentRequests) {
  await page.route('**/api/documents**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const headers = request.headers();
    documentRequests.push({
      path: pathname,
      preview: headers['x-ca-preview'] === 'admin',
      hasAdminToken: Boolean(headers['x-admin-token'])
    });

    if (pathname === '/api/documents') {
      return route.fulfill(json({ docs: [sourceDocument, targetDocument] }));
    }
    if (pathname === `/api/documents/${sourceDocument.slug}`) {
      return route.fulfill(json(sourceDocument));
    }
    if (pathname === `/api/documents/${targetDocument.slug}`) {
      return route.fulfill(json(targetDocument));
    }
    if (pathname.startsWith('/api/documents/related/')) {
      return route.fulfill(json([]));
    }
    return route.fulfill(json({ error: 'NOT_FOUND' }, 404));
  });

  // These two independent datasets are not part of this relationship fixture,
  // but stubbing them avoids a live DB record changing reader startup timing.
  await page.route('**/api/knowledge/taxonomy**', (route) =>
    route.fulfill(json({ dimensions: [], smart_collections: [] })));
  await page.route('**/api/knowledge/projects**', (route) =>
    route.fulfill(json([])));
}

async function mockDocumentRelationGraphApi(page, mutations) {
  let relations = [];

  await page.route('**/api/admin/graphs**', async (route) => {
    const request = route.request();
    const path = decodeURIComponent(new URL(request.url()).pathname);
    const headers = request.headers();
    const recordMutation = () => {
      let body = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      mutations.push({
        path,
        method: request.method(),
        hasAdminToken: Boolean(headers['x-admin-token']),
        body
      });
    };

    if (path === '/api/admin/graphs' && request.method() === 'GET') {
      return route.fulfill(json({ graphs: [graph] }));
    }
    if (path === '/api/admin/graphs/edge-types' && request.method() === 'GET') {
      return route.fulfill(json({ edge_types: [edgeType] }));
    }
    if (path === `/api/admin/graphs/document-bindings/${sourceDocument.id}` && request.method() === 'GET') {
      return route.fulfill(json({ nodes: [sourceNode] }));
    }
    if (path === `/api/admin/graphs/document-bindings/${targetDocument.id}` && request.method() === 'GET') {
      return route.fulfill(json({ nodes: [] }));
    }
    if (path === `/api/admin/graphs/document-bindings/${targetDocument.id}/ensure` && request.method() === 'POST') {
      recordMutation();
      return route.fulfill(json({ success: true, created: true, node: targetNode }, 201));
    }
    if (path === `/api/admin/graphs/nodes/${sourceNode.id}/relations` && request.method() === 'GET') {
      return route.fulfill(json({ source_node: sourceNode, relations }));
    }
    if (path === `/api/admin/graphs/${graph.id}/nodes/${targetNode.id}` && request.method() === 'PUT') {
      recordMutation();
      return route.fulfill(json({
        success: true,
        membership: { graph_id: graph.id, node_id: targetNode.id }
      }));
    }
    if (path === '/api/admin/graphs/edges' && request.method() === 'POST') {
      recordMutation();
      const edge = request.postDataJSON();
      relations = [{
        edge_id: 'edge-document-relation-e2e',
        direction: 'outbound',
        target: { node_id: targetNode.id, label: targetNode.label, metadata: { post_id: targetDocument.id } },
        edge_type: edgeType,
        graph_ids: edge.graph_ids,
        graph_memberships: [{ graph_id: graph.id, graph_name: graph.name }],
        origin: 'admin',
        weight: edge.weight,
        confidence: edge.confidence,
        cost: edge.cost,
        visibility: edge.visibility,
        active: true,
        provenance: edge.provenance,
        metadata: edge.metadata
      }];
      return route.fulfill(json({ success: true, edge: { id: 'edge-document-relation-e2e' } }, 201));
    }
    return route.fulfill(json({ error: 'NOT_FOUND' }, 404));
  });
}

test('an authenticated admin creates a typed document relationship, then can return to the public projection', async ({ page }) => {
  const documentRequests = [];
  const mutations = [];
  await page.setViewportSize({ width: 1440, height: 1400 });
  // All data mocks are installed before either the login or reader navigation.
  await mockKnowledgeDocuments(page, documentRequests);
  await mockDocumentRelationGraphApi(page, mutations);

  await page.goto('/admin');
  await page.getByLabel('BIZTONSÁGI_PIN:~$').fill(VALID_ADMIN_PIN);
  await page.getByRole('button', { name: /KONZOL MEGNYITÁSA/i }).click();
  await expect(page.getByRole('heading', { name: /Tactical CMS Matrix/i })).toBeVisible();

  await page.goto(`/knowledge/${sourceDocument.slug}`);
  await expect(page.getByTestId('admin-view-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Fő navigáció')).toHaveAttribute('data-admin-active', 'true');
  await expect(page.getByTestId('document-relation-workbench')).toBeVisible();
  await expect(page.getByTestId('document-relation-source-node')).toContainText(sourceNode.id);
  await expect.poll(() => documentRequests.some((request) => (
    request.path === '/api/documents' && request.preview && request.hasAdminToken
  ))).toBe(true);

  await page.getByTestId('document-relation-target-node')
    .getByLabel('Céljegyzet')
    .selectOption(String(targetDocument.id));
  const pairedDirection = page.locator('label').filter({ hasText: 'Tényleges ↔' });
  await pairedDirection.scrollIntoViewIfNeeded();
  await pairedDirection.click();
  await expect(page.getByLabel('Tényleges ↔')).toBeChecked();
  const evidenceProfile = page.getByRole('button', { name: 'BIZONYÍTOTT' });
  await evidenceProfile.scrollIntoViewIfNeeded();
  await evidenceProfile.click();
  await expect(page.getByTestId('document-relation-create-save')).toBeEnabled();
  await page.getByTestId('document-relation-create-save').click();

  await expect(page.getByTestId('document-relation-status')).toContainText('KÉT PÁROSÍTOTT DOKUMENTUMKAPCSOLAT MENTVE');
  await expect.poll(() => mutations.some((mutation) => (
    mutation.path === '/api/admin/graphs/edges' && mutation.method === 'POST'
  ))).toBe(true);

  // Every graph mutation travels through adminFetch. The edge payload is
  // intentionally asserted as a DB-first, typed directed relation rather than
  // any inferred Markdown relation.
  expect(mutations).toHaveLength(3);
  expect(mutations.every((mutation) => mutation.hasAdminToken)).toBe(true);
  expect(mutations).toContainEqual({
    path: `/api/admin/graphs/document-bindings/${targetDocument.id}/ensure`,
    method: 'POST',
    hasAdminToken: true,
    body: {}
  });
  expect(mutations).toContainEqual({
    path: `/api/admin/graphs/${graph.id}/nodes/${targetNode.id}`,
    method: 'PUT',
    hasAdminToken: true,
    body: { metadata: { attached_via: 'document_relation_composer' } }
  });
  expect(mutations).toContainEqual({
    path: '/api/admin/graphs/edges',
    method: 'POST',
    hasAdminToken: true,
    body: {
      source_node_id: sourceNode.id,
      target_node_id: targetNode.id,
      edge_type_id: edgeType.id,
      graph_ids: [graph.id],
      bidirectional: true,
      origin: 'admin',
      weight: 0.95,
      confidence: 0.95,
      cost: 1,
      valid_from: null,
      valid_to: null,
      visibility: 'private',
      active: true,
      provenance: {
        editor: 'document_relation_composer',
        source_document: { post_id: sourceDocument.id, slug: sourceDocument.slug },
        target_document: { post_id: targetDocument.id, slug: targetDocument.slug }
      },
      metadata: {}
    }
  });

  await page.getByTestId('admin-view-toggle').click();
  await expect(page.getByTestId('admin-view-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('document-relation-workbench')).toHaveCount(0);
});

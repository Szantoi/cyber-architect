import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { graphService } from '../../services/graphService.js';
import { projectGraphBindingService } from '../../services/projectGraphBindingService.js';

const actors = [];
const projectIds = [];
const postSlugs = [];

function fixtureId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 14);
}

afterEach(() => {
  for (const slug of postSlugs.splice(0).reverse()) {
    db.prepare('DELETE FROM blog_posts WHERE slug = ?').run(slug);
  }
  for (const id of projectIds.splice(0).reverse()) {
    db.prepare('DELETE FROM knowledge_projects WHERE id = ?').run(id);
  }
  for (const actor of actors.splice(0).reverse()) {
    db.prepare('DELETE FROM graph_edges WHERE created_by = ?').run(actor);
    db.prepare('DELETE FROM graph_definitions WHERE created_by = ?').run(actor);
    db.prepare('DELETE FROM graph_nodes WHERE created_by = ?').run(actor);
  }
});

describe('project graph binding projection', () => {
  it('places a project and its Vault document into one maintained graph layer', () => {
    const suffix = fixtureId();
    const actor = `PROJECT_BINDING_TEST_${suffix}`;
    actors.push(actor);
    const projectId = `prj_binding_${suffix}`;
    projectIds.push(projectId);
    const slug = `project-binding-note-${suffix}`;
    postSlugs.push(slug);
    dbService.createKnowledgeProject({
      id: projectId,
      name: 'Projektkötés teszt',
      slug: `project-binding-${suffix}`,
      visibility: 'private'
    }, actor);
    const post = dbService.createBlogPost({
      project_id: projectId,
      content_type: 'knowledge',
      slug,
      title: 'Kötött dokumentum',
      summary: 'Projekt gráf teszt.',
      content: '# Kötött dokumentum',
      category: 'TESZT',
      visibility: 'private',
      published: false
    }, actor);

    const result = projectGraphBindingService.syncDocumentProjectBinding({
      post,
      documentId: `kb:test:project-binding:${suffix}`,
      sourcePath: `KnowledgeBase/Test/project-binding-${suffix}/index.md`,
      frontmatter: { ca_node_type: 'document' },
      actor
    });

    expect(result).toMatchObject({
      status: 'bound',
      graph_id: projectGraphBindingService.projectGraphId(projectId)
    });
    expect(graphService.getGraph(result.graph_id)).toMatchObject({ owner_id: `knowledge_project:${projectId}` });
    expect(graphService.getEdge(result.edge.id)).toMatchObject({
      edge_type_id: 'contains',
      origin: 'markdown_projection',
      projection_source_key: `project-binding:kb:test:project-binding:${suffix}`
    });
  });
});

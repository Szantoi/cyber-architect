import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { dbService } from '../../services/dbService.js';

const slugs = {
  publishedPublic: 'publication-guard-published-public-doc',
  unpublishedPublic: 'publication-guard-unpublished-public-doc',
  publishedPrivate: 'publication-guard-published-private-doc',
  workspacePublic: 'publication-guard-workspace-public-doc',
  workspaceOther: 'publication-guard-workspace-other-doc',
  workspacePrivate: 'publication-guard-workspace-private-doc',
  workspaceUnpublished: 'publication-guard-workspace-unpublished-doc'
};

const workspaceIds = {
  target: 'prj_public_workspace_filter',
  other: 'prj_other_workspace_filter'
};

function createKnowledgeDoc({ slug, visibility, published, projectId = 'prj_general' }) {
  return dbService.createBlogPost({
    project_id: projectId,
    content_type: 'knowledge',
    slug,
    title: `Publication guard: ${slug}`,
    summary: 'Regression fixture for the public knowledge API.',
    content: '# Publication guard fixture',
    category: 'TEST',
    visibility,
    published
  }, 'TEST');
}

describe('Public knowledge publication guard', () => {
  beforeAll(() => {
    createKnowledgeDoc({
      slug: slugs.publishedPublic,
      visibility: 'public',
      published: 1
    });
    createKnowledgeDoc({
      slug: slugs.unpublishedPublic,
      visibility: 'public',
      published: 0
    });
    createKnowledgeDoc({
      slug: slugs.publishedPrivate,
      visibility: 'private',
      published: 1
    });
    createKnowledgeDoc({
      slug: slugs.workspacePublic,
      visibility: 'public',
      published: 1,
      projectId: workspaceIds.target
    });
    createKnowledgeDoc({
      slug: slugs.workspaceOther,
      visibility: 'public',
      published: 1,
      projectId: workspaceIds.other
    });
    createKnowledgeDoc({
      slug: slugs.workspacePrivate,
      visibility: 'private',
      published: 1,
      projectId: workspaceIds.target
    });
    createKnowledgeDoc({
      slug: slugs.workspaceUnpublished,
      visibility: 'public',
      published: 0,
      projectId: workspaceIds.target
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists only published public knowledge documents', async () => {
    const getKnowledgeDocs = vi.spyOn(dbService, 'getKnowledgeDocs');

    const response = await request(app).get('/api/docs');

    expect(response.status).toBe(200);
    expect(getKnowledgeDocs).toHaveBeenCalledWith({
      publishedOnly: true,
      visibility: 'public'
    });

    const listedSlugs = response.body.docs.map(doc => doc.slug);
    expect(listedSlugs).toContain(slugs.publishedPublic);
    expect(listedSlugs).not.toContain(slugs.unpublishedPublic);
    expect(listedSlugs).not.toContain(slugs.publishedPrivate);
  });

  it('returns published public documents and hides unpublished or private details', async () => {
    const getBlogPostBySlug = vi.spyOn(dbService, 'getBlogPostBySlug');

    const publishedResponse = await request(app).get(`/api/docs/${slugs.publishedPublic}`);
    const unpublishedResponse = await request(app).get(`/api/docs/${slugs.unpublishedPublic}`);
    const privateResponse = await request(app).get(`/api/docs/${slugs.publishedPrivate}`);

    expect(publishedResponse.status).toBe(200);
    expect(publishedResponse.body.slug).toBe(slugs.publishedPublic);
    expect(unpublishedResponse.status).toBe(404);
    expect(privateResponse.status).toBe(404);

    for (const slug of [slugs.publishedPublic, slugs.unpublishedPublic, slugs.publishedPrivate]) {
      expect(getBlogPostBySlug).toHaveBeenCalledWith(slug, {
        publishedOnly: true,
        visibility: 'public'
      });
    }
  });

  it('does not surface unpublished or private documents through public search', async () => {
    const response = await request(app)
      .get('/api/docs/search')
      .query({ q: 'Publication guard' });

    expect(response.status).toBe(200);
    const matchedSlugs = response.body.docs.map(doc => doc.slug);

    expect(matchedSlugs).toContain(slugs.publishedPublic);
    expect(matchedSlugs).not.toContain(slugs.unpublishedPublic);
    expect(matchedSlugs).not.toContain(slugs.publishedPrivate);
  });

  it('scopes both public list paths by project_id without relaxing publication visibility', async () => {
    const requests = await Promise.all([
      request(app).get('/api/docs').query({ project_id: workspaceIds.target }),
      request(app).get('/api/knowledge/docs').query({ project_id: workspaceIds.target })
    ]);

    for (const response of requests) {
      expect(response.status).toBe(200);
      const listedSlugs = response.body.docs.map(document => document.slug);
      expect(listedSlugs).toContain(slugs.workspacePublic);
      expect(listedSlugs).not.toContain(slugs.workspaceOther);
      expect(listedSlugs).not.toContain(slugs.workspacePrivate);
      expect(listedSlugs).not.toContain(slugs.workspaceUnpublished);
      expect(response.body.docs.every(document => document.project_id === workspaceIds.target)).toBe(true);
    }
  });

  it('keeps the existing public search project_id boundary', async () => {
    const response = await request(app)
      .get('/api/docs/search')
      .query({ q: 'Publication guard', project_id: workspaceIds.target });

    expect(response.status).toBe(200);
    const listedSlugs = response.body.docs.map(document => document.slug);
    expect(listedSlugs).toContain(slugs.workspacePublic);
    expect(listedSlugs).not.toContain(slugs.workspaceOther);
    expect(listedSlugs).not.toContain(slugs.workspacePrivate);
    expect(listedSlugs).not.toContain(slugs.workspaceUnpublished);
  });

  it('accepts project_id for the public knowledge search while retaining the camelCase alias', async () => {
    const responses = await Promise.all([
      request(app).get('/api/knowledge/search').query({ q: 'Publication guard', project_id: workspaceIds.target }),
      request(app).get('/api/knowledge/search').query({ q: 'Publication guard', projectId: workspaceIds.target })
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      const listedSlugs = response.body.map(document => document.slug);
      expect(listedSlugs).toContain(slugs.workspacePublic);
      expect(listedSlugs).not.toContain(slugs.workspaceOther);
      expect(listedSlugs).not.toContain(slugs.workspacePrivate);
      expect(listedSlugs).not.toContain(slugs.workspaceUnpublished);
    }
  });
});

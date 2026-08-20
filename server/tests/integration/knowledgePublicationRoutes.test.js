import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { dbService } from '../../services/dbService.js';

const slugs = {
  publishedPublic: 'publication-guard-published-public-doc',
  unpublishedPublic: 'publication-guard-unpublished-public-doc',
  publishedPrivate: 'publication-guard-published-private-doc'
};

function createKnowledgeDoc({ slug, visibility, published }) {
  return dbService.createBlogPost({
    project_id: 'prj_general',
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

    for (const slug of Object.values(slugs)) {
      expect(getBlogPostBySlug).toHaveBeenCalledWith(slug, {
        publishedOnly: true,
        visibility: 'public'
      });
    }
  });
});

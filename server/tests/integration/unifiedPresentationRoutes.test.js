import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { db, initDatabase } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { hybridKnowledgeService } from '../../services/hybridKnowledgeService.js';

const projectId = 'prj_unified_presentation_api';
const otherProjectId = 'prj_unified_presentation_other';
const marker = 'unifiedpresentationmarker';
const slugs = {
  knowledge: 'unified-presentation-knowledge',
  article: 'unified-presentation-article',
  otherArticle: 'unified-presentation-article-other',
  privateArticle: 'unified-presentation-private-article'
};

function createDocument({ slug, presentationProfile, visibility = 'public', project_id = projectId }) {
  return dbService.createBlogPost({
    project_id,
    presentation_profile: presentationProfile,
    content_type: presentationProfile === 'article' ? 'blog' : 'knowledge',
    slug,
    title: `Unified presentation: ${slug}`,
    summary: `Summary ${marker}`,
    content: `# ${slug}\n\n${marker} canonical document evidence.`,
    category: 'TEST',
    visibility,
    published: 1
  }, 'TEST');
}

beforeAll(() => {
  initDatabase();
  db.prepare(`DELETE FROM blog_posts WHERE slug IN (${Object.values(slugs).map(() => '?').join(', ')})`)
    .run(...Object.values(slugs));
  createDocument({ slug: slugs.knowledge, presentationProfile: 'knowledge' });
  const article = createDocument({ slug: slugs.article, presentationProfile: 'article' });
  createDocument({ slug: slugs.otherArticle, presentationProfile: 'article', project_id: otherProjectId });
  createDocument({ slug: slugs.privateArticle, presentationProfile: 'article', visibility: 'private' });
  hybridKnowledgeService.indexDocument({
    post: article,
    frontmatter: {
      document_id: 'public:unified-presentation-article',
      classification: 'public',
      rag_index: true,
      assets: [{
        provider: 'github',
        file_id: 'unified-public-asset',
        uri: 'https://example.com/unified-presentation.pdf',
        mime_type: 'application/pdf',
        visibility: 'public'
      }]
    }
  });
});

afterAll(() => {
  db.prepare(`DELETE FROM blog_posts WHERE slug IN (${Object.values(slugs).map(() => '?').join(', ')})`)
    .run(...Object.values(slugs));
});

describe('unified public document presentation routes', () => {
  it('lists one canonical document collection across profiles and filters it by project/profile', async () => {
    const allResponse = await request(app)
      .get('/api/documents')
      .query({ project_id: projectId });
    const articlesResponse = await request(app)
      .get('/api/documents')
      .query({ project_id: projectId, presentation_profile: 'article' });

    expect(allResponse.status).toBe(200);
    expect(allResponse.body.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: slugs.knowledge, presentation_profile: 'knowledge', content_type: 'knowledge' }),
      expect.objectContaining({ slug: slugs.article, presentation_profile: 'article', content_type: 'blog' })
    ]));
    expect(allResponse.body.documents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: slugs.otherArticle }),
      expect.objectContaining({ slug: slugs.privateArticle })
    ]));

    expect(articlesResponse.status).toBe(200);
    expect(articlesResponse.body.documents).toEqual([
      expect.objectContaining({ slug: slugs.article, presentation_profile: 'article', project_id: projectId })
    ]);
  });

  it('searches the canonical collection with optional presentation-profile filtering', async () => {
    const allResponse = await request(app)
      .get('/api/documents/search')
      .query({ q: marker, project_id: projectId });
    const knowledgeResponse = await request(app)
      .get('/api/documents/search')
      .query({ q: marker, project_id: projectId, presentation_profile: 'knowledge' });

    expect(allResponse.status).toBe(200);
    expect(allResponse.body.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: slugs.knowledge, presentation_profile: 'knowledge' }),
      expect.objectContaining({ slug: slugs.article, presentation_profile: 'article' })
    ]));
    expect(knowledgeResponse.status).toBe(200);
    expect(knowledgeResponse.body.documents).toEqual([
      expect.objectContaining({ slug: slugs.knowledge, presentation_profile: 'knowledge' })
    ]);
  });

  it('keeps /api/blog as the article presentation view and scopes its list/search by project_id', async () => {
    const listResponse = await request(app)
      .get('/api/blog')
      .query({ project_id: projectId });
    const searchResponse = await request(app)
      .get('/api/blog/search')
      .query({ q: marker, project_id: projectId });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: slugs.article, presentation_profile: 'article', project_id: projectId })
    ]));
    expect(listResponse.body).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: slugs.knowledge }),
      expect.objectContaining({ slug: slugs.otherArticle })
    ]));

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.posts).toEqual([
      expect.objectContaining({ slug: slugs.article, presentation_profile: 'article', project_id: projectId })
    ]);
  });

  it('reads a canonical document across profiles but preserves public and filter boundaries', async () => {
    const articleResponse = await request(app).get(`/api/documents/${slugs.article}`);
    const privateResponse = await request(app).get(`/api/documents/${slugs.privateArticle}`);
    const mismatchedResponse = await request(app)
      .get(`/api/documents/${slugs.article}`)
      .query({ presentation_profile: 'knowledge' });

    expect(articleResponse.status).toBe(200);
    expect(articleResponse.body).toMatchObject({
      slug: slugs.article,
      content_type: 'blog',
      presentation_profile: 'article'
    });
    expect(privateResponse.status).toBe(404);
    expect(mismatchedResponse.status).toBe(404);
  });

  it('uses the generic asset route for every public profile without relaxing visibility', async () => {
    const publicAsset = await request(app)
      .get(`/api/documents/${slugs.article}/assets/unified-public-asset`)
      .redirects(0);
    const privateAsset = await request(app)
      .get(`/api/documents/${slugs.privateArticle}/assets/unified-public-asset`)
      .redirects(0);

    expect(publicAsset.status).toBe(302);
    expect(publicAsset.headers.location).toBe('https://example.com/unified-presentation.pdf');
    expect(privateAsset.status).toBe(404);
  });

  it('fails closed when legacy content_type contradicts presentation_profile', async () => {
    const response = await request(app)
      .get('/api/documents')
      .query({ content_type: 'knowledge', presentation_profile: 'article' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT');
  });

  it('publishes the all-profile MCP search contract in the machine-readable registry', async () => {
    const response = await request(app).get('/api/mcp/tools');
    const searchTool = response.body.tools.find(tool => tool.name === 'search_knowledge');

    expect(response.status).toBe(200);
    expect(searchTool.inputSchema.properties.content_type.default).toBe('all');
    expect(searchTool.inputSchema.properties.presentation_profile.enum).toEqual([
      'knowledge', 'article', 'blog', 'all'
    ]);
  });
});

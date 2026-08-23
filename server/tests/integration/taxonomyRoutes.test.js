import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { adminRouter } from '../../routes/admin.routes.js';
import { knowledgeRouter } from '../../routes/knowledge.routes.js';
import { generateAdminToken } from '../../security/auth.js';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { taxonomyService } from '../../services/taxonomyService.js';

const app = express();
app.use(express.json());
app.use('/api', knowledgeRouter);
app.use('/api', adminRouter);

const adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: 'TAXONOMY_ROUTE_TEST' });
const authenticated = (method, url) => request(app)[method](url).set('x-admin-token', adminToken);
const createdDimensions = [];
const createdTerms = [];
const createdPosts = [];

afterEach(() => {
  for (const postId of createdPosts.splice(0).reverse()) {
    db.prepare('DELETE FROM blog_posts WHERE id = ?').run(postId);
  }
  for (const termId of createdTerms.splice(0).reverse()) {
    taxonomyService.deleteTerm(termId, 'TEST_SUITE_CLEANUP');
  }
  for (const dimensionId of createdDimensions.splice(0).reverse()) {
    taxonomyService.deleteDimension(dimensionId, 'TEST_SUITE_CLEANUP');
  }
});

describe('taxonomy registry HTTP contract', () => {
  it('publishes only active public vocabulary and keeps the extensible pain-point facet admin-only until activated', async () => {
    const response = await request(app).get('/api/knowledge/taxonomy');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('max-age=60');
    expect(response.body.dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'industry', frontmatter_key: 'tax_industry', icon_key: 'factory' }),
      expect.objectContaining({ id: 'technology', frontmatter_key: 'tax_technology', icon_key: 'zap' }),
      expect.objectContaining({ id: 'audience_role', frontmatter_key: 'tax_audience_role', icon_key: 'target' })
    ]));
    expect(response.body.dimensions.find(dimension => dimension.id === 'pain_point')).toBeUndefined();

    const forbidden = await request(app).get('/api/admin/knowledge/taxonomy');
    expect(forbidden.status).toBe(401);

    const admin = await authenticated('get', '/api/admin/knowledge/taxonomy');
    expect(admin.status).toBe(200);
    expect(admin.body.dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'pain_point',
        frontmatter_key: 'tax_pain_point',
        active: false,
        filterable: false,
        groupable: false
      })
    ]));
  });

  it('validates and persists granular registry CRUD without exposing document assignment writes', async () => {
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const dimensionId = `route_dimension_${suffix}`;
    const termId = `route_term_${suffix}`;

    const invalid = await authenticated('post', '/api/admin/taxonomy/dimensions').send({
      id: dimensionId,
      frontmatter_key: `tax_route_${suffix}`,
      label: 'Nem biztonságos ikon',
      icon_key: '<svg onload=alert(1)>'
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('VALIDATION_ERROR');

    const dimension = await authenticated('post', '/api/admin/taxonomy/dimensions').send({
      id: dimensionId,
      frontmatter_key: `tax_route_${suffix}`,
      label: 'Route teszt dimenzió',
      description: 'Kizárólag integrációs teszt.',
      icon_key: 'layers',
      color: '#13579B',
      multi_select: true,
      filterable: true,
      groupable: true,
      active: true,
      visibility: 'public',
      sort_order: 9999
    });
    expect(dimension.status).toBe(201);
    expect(dimension.body.dimension).toMatchObject({ id: dimensionId, icon_key: 'layers' });
    createdDimensions.push(dimensionId);

    const term = await authenticated('post', '/api/admin/taxonomy/terms').send({
      id: termId,
      dimension_id: dimensionId,
      slug: 'route-term',
      label: 'Route term',
      aliases: ['Route legacy term']
    });
    expect(term.status).toBe(201);
    expect(term.body.term).toMatchObject({ id: termId, dimension_id: dimensionId });
    createdTerms.push(termId);

    const publicRegistry = await request(app).get('/api/knowledge/taxonomy');
    const publicDimension = publicRegistry.body.dimensions.find(dimensionItem => dimensionItem.id === dimensionId);
    expect(publicDimension).toMatchObject({ id: dimensionId });
    expect(publicDimension.terms).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: termId, slug: 'route-term', label: 'Route term' })
    ]));
  });

  it('uses every public registry dimension as a server-side facet for list and search routes', async () => {
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const dimensionId = `route_facet_dimension_${suffix}`;
    const termId = `route_facet_term_${suffix}`;
    const dimension = taxonomyService.createDimension({
      id: dimensionId,
      frontmatter_key: `tax_route_facet_${suffix}`,
      label: 'Dinamikus route facet',
      icon_key: 'filter',
      color: '#13579B',
      filterable: true,
      groupable: true,
      active: true,
      visibility: 'public'
    }, 'TEST_SUITE');
    createdDimensions.push(dimension.id);
    const term = taxonomyService.createTerm({
      id: termId,
      dimension_id: dimension.id,
      slug: 'route-facet',
      label: 'Route facet érték',
      aliases: ['Régi route facet']
    }, 'TEST_SUITE');
    createdTerms.push(term.id);
    const post = dbService.createBlogPost({
      content_type: 'knowledge',
      slug: `route-facet-post-${suffix}`,
      title: 'Dinamikus route facet dokumentum',
      summary: 'Taxonómia route teszt.',
      content: '# Dinamikus route facet',
      category: 'TEST',
      dimensions: {},
      visibility: 'public',
      published: 1
    }, 'TEST_SUITE');
    createdPosts.push(post.id);
    taxonomyService.replaceAssignmentsForPost({
      postId: post.id,
      assignments: { [dimension.frontmatter_key]: [term.slug] },
      actor: 'TEST_SUITE'
    });

    const query = { [dimension.frontmatter_key]: term.slug };
    const list = await request(app).get('/api/docs').query(query);
    expect(list.status).toBe(200);
    expect(list.body.docs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: post.id, slug: post.slug })
    ]));

    const knowledgeSearch = await request(app).get('/api/knowledge/search').query(query);
    expect(knowledgeSearch.status).toBe(200);
    expect(knowledgeSearch.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: post.id, slug: post.slug })
    ]));

    const docsSearch = await request(app)
      .get('/api/docs/search')
      .query({ [dimension.frontmatter_key]: 'Régi route facet' });
    expect(docsSearch.status).toBe(200);
    expect(docsSearch.body.docs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: post.id, slug: post.slug })
    ]));
  });
});

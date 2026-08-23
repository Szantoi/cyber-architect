import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { taxonomyService } from '../../services/taxonomyService.js';

const created = [];

function unique(prefix) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
}

function createDimension() {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const id = `test_dimension_${suffix}`;
  const dimension = taxonomyService.createDimension({
    id,
    frontmatter_key: `tax_test_${suffix}`,
    label: 'Teszt dimenzió',
    description: 'Taxonómia szolgáltatás teszt.',
    icon_key: 'layers',
    color: '#12AB34',
    multi_select: true,
    filterable: true,
    groupable: true,
    active: true,
    visibility: 'public',
    sort_order: 9000
  }, 'TEST_SUITE');
  created.push({ type: 'dimension', id: dimension.id });
  return dimension;
}

function createPost(dimensions = {}) {
  const post = dbService.createBlogPost({
    content_type: 'knowledge',
    slug: unique('taxonomy-service-post'),
    title: 'Taxonomy service test post',
    summary: 'Taxonomy service test summary.',
    content: '# Taxonomy service test',
    category: 'TEST',
    dimensions,
    visibility: 'public',
    published: 1
  }, 'TEST_SUITE');
  created.push({ type: 'post', id: post.id });
  return post;
}

afterEach(() => {
  for (const item of created.splice(0).reverse()) {
    if (item.type === 'post') {
      db.prepare('DELETE FROM blog_posts WHERE id = ?').run(item.id);
      continue;
    }
    if (item.type === 'collection') {
      db.prepare('DELETE FROM smart_collections WHERE id = ?').run(item.id);
      continue;
    }
    if (item.type === 'dimension') {
      const termIds = db.prepare('SELECT id FROM taxonomy_terms WHERE dimension_id = ?').all(item.id).map(row => row.id);
      if (termIds.length) {
        db.prepare(`DELETE FROM taxonomy_term_relations WHERE source_term_id IN (${termIds.map(() => '?').join(', ')}) OR target_term_id IN (${termIds.map(() => '?').join(', ')})`).run(...termIds, ...termIds);
        db.prepare(`DELETE FROM taxonomy_term_aliases WHERE term_id IN (${termIds.map(() => '?').join(', ')})`).run(...termIds);
        db.prepare('DELETE FROM taxonomy_terms WHERE dimension_id = ?').run(item.id);
      }
      db.prepare('DELETE FROM taxonomy_dimensions WHERE id = ?').run(item.id);
    }
  }
});

describe('taxonomyService registry', () => {
  it('seeds the three primary dimensions and keeps the extensible pain-point dimension inactive', () => {
    const dimensions = taxonomyService.listDimensions({ includeInactive: true, visibility: 'all' });
    expect(dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'industry', frontmatter_key: 'tax_industry', active: true, is_core: true }),
      expect.objectContaining({ id: 'technology', frontmatter_key: 'tax_technology', active: true, is_core: true }),
      expect.objectContaining({ id: 'audience_role', frontmatter_key: 'tax_audience_role', active: true, is_core: true }),
      expect.objectContaining({ id: 'pain_point', frontmatter_key: 'tax_pain_point', active: false, filterable: false, groupable: false, is_core: false })
    ]));
  });

  it('manages a term, aliases and explicit term relationships with audit-safe stable IDs', () => {
    const dimension = createDimension();
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 18);
    const first = taxonomyService.createTerm({
      id: `test_term_alpha_${suffix}`,
      dimension_id: dimension.id,
      slug: 'alpha',
      label: 'Alpha érték',
      icon_key: 'tag',
      color: '#123456',
      aliases: ['Első érték']
    }, 'TEST_SUITE');
    const second = taxonomyService.createTerm({
      id: `test_term_beta_${suffix}`,
      dimension_id: dimension.id,
      slug: 'beta',
      label: 'Béta érték'
    }, 'TEST_SUITE');

    expect(taxonomyService.resolveTerm({ dimensionId: dimension.id, value: 'Első érték' })).toMatchObject({ id: first.id });

    const updated = taxonomyService.updateTerm(first.id, { label: 'Alpha kanonikus érték' }, 'TEST_SUITE');
    expect(updated.aliases.map(alias => alias.alias)).toContain('Alpha érték');
    expect(taxonomyService.resolveTerm({ dimensionId: dimension.id, value: 'Alpha érték' })).toMatchObject({ id: first.id });

    const relation = taxonomyService.createRelation({
      source_term_id: first.id,
      target_term_id: second.id,
      relation_type: 'recommended_with',
      weight: 0.8,
      bidirectional: true
    }, 'TEST_SUITE');
    expect(relation).toMatchObject({
      source_term_id: first.id,
      target_term_id: second.id,
      relation_type: 'recommended_with',
      weight: 0.8,
      bidirectional: true
    });

    expect(() => taxonomyService.deleteTerm(first.id, 'TEST_SUITE')).toThrow('TAXONOMY_TERM_IN_USE');
  });

  it('projects vault-owned assignments into a normalized pivot and evaluates a safe smart collection', () => {
    const dimension = createDimension();
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 18);
    const term = taxonomyService.createTerm({
      id: `test_term_assignment_${suffix}`,
      dimension_id: dimension.id,
      slug: 'assigned',
      label: 'Hozzárendelt érték',
      aliases: ['Legacy display value']
    }, 'TEST_SUITE');
    const post = createPost();

    const assignments = taxonomyService.replaceAssignmentsForPost({
      postId: post.id,
      assignments: { [dimension.frontmatter_key]: ['Legacy display value'] },
      source: 'vault_frontmatter',
      actor: 'TEST_SUITE'
    });
    expect(assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ post_id: post.id, term_id: term.id, dimension_id: dimension.id })
    ]));

    const collection = taxonomyService.createSmartCollection({
      id: `test_collection_${suffix}`,
      slug: `test-collection-${suffix}`,
      name: 'Hozzárendelt tesztgyűjtemény',
      scope: 'public',
      rule: {
        type: 'taxonomy',
        dimension_id: dimension.id,
        term_ids: [term.id],
        match: 'all'
      },
      group_by: { type: 'taxonomy_dimension', dimension_id: dimension.id },
      sort_by: 'title',
      layout: { view: 'cards', columns: 2 }
    }, 'TEST_SUITE');
    created.push({ type: 'collection', id: collection.id });

    const result = taxonomyService.evaluateSmartCollection(collection.slug, {
      visibility: 'public',
      publishedOnly: true
    });
    expect(result.collection.id).toBe(collection.id);
    expect(result.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: post.id, dimensions: {} })
    ]));

    taxonomyService.setSmartCollectionOverride({
      collectionId: collection.id,
      postId: post.id,
      mode: 'exclude',
      actor: 'TEST_SUITE'
    });
    expect(taxonomyService.evaluateSmartCollection(collection.id, { visibility: 'public' }).documents).toHaveLength(0);
  });

  it('uses presentation_profile for smart collection rules and grouping while retaining legacy content_type support', () => {
    const article = dbService.createBlogPost({
      presentation_profile: 'article',
      slug: unique('taxonomy-article-profile'),
      title: 'Article profile document',
      summary: 'Same document model, article presentation.',
      content: '# Article profile',
      category: 'TEST',
      dimensions: {},
      visibility: 'public',
      published: 1
    }, 'TEST_SUITE');
    created.push({ type: 'post', id: article.id });

    const collection = taxonomyService.createSmartCollection({
      id: unique('presentation-profile-collection').replace(/-/g, '_'),
      slug: unique('presentation-profile-collection'),
      name: 'Article profile documents',
      scope: 'public',
      rule: { type: 'content', field: 'presentation_profile', operator: 'equals', value: 'article' },
      group_by: { type: 'content_field', field: 'presentation_profile' },
      layout: { view: 'cards' }
    }, 'TEST_SUITE');
    created.push({ type: 'collection', id: collection.id });

    expect(collection.group_by).toEqual({ type: 'content_field', field: 'presentation_profile' });
    expect(taxonomyService.evaluateSmartCollection(collection.id, { visibility: 'public', publishedOnly: true }).documents)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: article.id, presentation_profile: 'article', content_type: 'blog' })
      ]));
  });

  it('matches generic facet keys through the assignment pivot and legacy projection fallback', () => {
    const dimension = createDimension();
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 18);
    const term = taxonomyService.createTerm({
      id: `test_term_facet_${suffix}`,
      dimension_id: dimension.id,
      slug: 'facet-term',
      label: 'Kanonikus facet érték',
      aliases: ['Régi facet felirat']
    }, 'TEST_SUITE');
    const assignedPost = createPost();
    const legacyProjectionPost = createPost({
      [dimension.frontmatter_key]: ['Régi facet felirat']
    });

    taxonomyService.replaceAssignmentsForPost({
      postId: assignedPost.id,
      assignments: { [dimension.frontmatter_key]: [term.slug] },
      actor: 'TEST_SUITE'
    });

    const matchesBySlug = taxonomyService.filterDocumentsByFacets(
      [assignedPost, legacyProjectionPost],
      { [dimension.frontmatter_key]: [term.slug] },
      { visibility: 'public' }
    );
    expect(matchesBySlug.map(post => post.id).sort()).toEqual(
      [assignedPost.id, legacyProjectionPost.id].sort()
    );

    const matchesByAlias = taxonomyService.filterDocumentsByFacets(
      [assignedPost, legacyProjectionPost],
      { [dimension.id]: ['Régi facet felirat'] },
      { visibility: 'public' }
    );
    expect(matchesByAlias.map(post => post.id).sort()).toEqual(
      [assignedPost.id, legacyProjectionPost.id].sort()
    );

    expect(taxonomyService.filterDocumentsByFacets(
      [assignedPost, legacyProjectionPost],
      { [dimension.id]: ['nincs-ilyen-facet'] },
      { visibility: 'public' }
    )).toEqual([]);
  });

  it('extracts every registry frontmatter key, rejects legacy drift, and explicitly bootstraps an initial vault vocabulary', () => {
    const dimension = createDimension();
    const frontmatter = {
      [dimension.frontmatter_key]: ['Vault controlled value'],
      // Inactive dimensions must still survive import so later activation is
      // lossless; an empty list deliberately means no assignment.
      tax_pain_point: []
    };
    const extracted = taxonomyService.extractAssignmentsFromFrontmatter(frontmatter);
    expect(extracted).toEqual({
      [dimension.id]: ['Vault controlled value'],
      pain_point: []
    });

    const bootstrap = taxonomyService.bootstrapTermsForAssignments({
      assignments: extracted,
      actor: 'TEST_SUITE'
    });
    expect(bootstrap.created_count).toBe(1);
    const term = bootstrap.created_terms[0];
    expect(term).toMatchObject({ dimension_id: dimension.id, label: 'Vault controlled value' });

    const post = createPost();
    const assigned = taxonomyService.replaceAssignmentsForPost({
      postId: post.id,
      assignments: extracted,
      actor: 'TEST_SUITE'
    });
    expect(assigned).toEqual(expect.arrayContaining([
      expect.objectContaining({ post_id: post.id, term_id: term.id })
    ]));

    expect(() => taxonomyService.extractAssignmentsFromFrontmatter({
      tax_industry: ['Kanonikus érték'],
      dimensions: { iparag: ['Eltérő legacy érték'] }
    })).toThrow('TAXONOMY_FRONTMATTER_CONFLICT');
  });

  it('rejects raw-code-like smart rules and unknown taxonomy assignments', () => {
    const dimension = createDimension();
    const post = createPost();
    expect(() => taxonomyService.replaceAssignmentsForPost({
      postId: post.id,
      assignments: { [dimension.id]: ['nincs-ilyen-term'] }
    })).toThrow('UNKNOWN_TAXONOMY_TERM');

    expect(() => taxonomyService.createSmartCollection({
      slug: unique('unsafe-smart-rule'),
      name: 'Unsafe rule',
      rule: { type: 'sql', query: 'DROP TABLE blog_posts' }
    }, 'TEST_SUITE')).toThrow();
  });
});

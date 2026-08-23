import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { taxonomyService } from '../../services/taxonomyService.js';

const created = [];

const unique = (prefix) => `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;

function createPost({ visibility = 'public', published = 1 } = {}) {
  const post = dbService.createBlogPost({
    content_type: 'knowledge',
    slug: unique('smart-membership-post'),
    title: 'Smart membership test document',
    summary: 'Manual Smart collection membership test.',
    content: '# Smart membership test',
    category: 'TEST',
    visibility,
    published,
    dimensions: {}
  }, 'TEST_SUITE');
  created.push({ type: 'post', id: post.id });
  return post;
}

function createCollection() {
  const slug = unique('smart-membership-collection');
  const collection = taxonomyService.createSmartCollection({
    id: slug.replace(/-/g, '_'),
    slug,
    name: 'Smart membership test',
    scope: 'public',
    rule: { type: 'content', field: 'category', operator: 'equals', value: 'NO_AUTOMATIC_MATCH' },
    group_by: { type: 'none' },
    layout: { view: 'cards' }
  }, 'TEST_SUITE');
  created.push({ type: 'collection', id: collection.id });
  return collection;
}

afterEach(() => {
  for (const item of created.splice(0).reverse()) {
    if (item.type === 'collection') {
      db.prepare('DELETE FROM smart_collection_membership_overrides WHERE collection_id = ?').run(item.id);
      db.prepare('DELETE FROM smart_collections WHERE id = ?').run(item.id);
    }
    if (item.type === 'post') db.prepare('DELETE FROM blog_posts WHERE id = ?').run(item.id);
  }
});

describe('smart collection manual membership', () => {
  it('lists overrides for the admin editor and publishes only public effective overrides', () => {
    const collection = createCollection();
    const publicPost = createPost();
    const privateDraft = createPost({ visibility: 'private', published: 0 });

    taxonomyService.setSmartCollectionOverride({
      collectionId: collection.id,
      postId: publicPost.id,
      mode: 'include',
      actor: 'TEST_SUITE'
    });
    taxonomyService.setSmartCollectionOverride({
      collectionId: collection.id,
      postId: privateDraft.id,
      mode: 'exclude',
      actor: 'TEST_SUITE'
    });

    expect(taxonomyService.listSmartCollectionOverrides(collection.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ collection_id: collection.id, post_id: publicPost.id, mode: 'include' }),
      expect.objectContaining({ collection_id: collection.id, post_id: privateDraft.id, mode: 'exclude' })
    ]));
    expect(taxonomyService.evaluateSmartCollection(collection.id, { visibility: 'public' }).documents)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: publicPost.id })]));

    const publicCollection = taxonomyService.getRegistry({ visibility: 'public', includeSmartCollections: true })
      .smart_collections.find(item => item.id === collection.id);
    expect(publicCollection.membership_overrides).toEqual({ [publicPost.id]: 'include' });
    expect(publicCollection.membership_overrides[String(privateDraft.id)]).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { db, initDatabase } from '../../db.js';
import { taxonomyService } from '../../services/taxonomyService.js';

describe('default smart collections migration', () => {
  it('restores the legacy public collection set once without overriding a later admin choice', () => {
    const collections = taxonomyService.listSmartCollections({ scope: 'public', includeInactive: false });

    expect(collections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'featured',
        slug: 'featured',
        name: 'KIEMELT',
        active: true,
        rule: { type: 'content', field: 'published', operator: 'equals', value: true }
      }),
      expect.objectContaining({
        id: 'audio',
        slug: 'audio',
        name: 'AUDIO',
        active: true,
        rule: { type: 'content', field: 'has_audio', operator: 'equals', value: true }
      }),
      expect.objectContaining({
        id: 'video',
        slug: 'video',
        name: 'VIDEÓ',
        active: true,
        rule: { type: 'content', field: 'has_video', operator: 'equals', value: true }
      }),
      expect.objectContaining({
        id: 'specs',
        slug: 'specs',
        name: 'SPEC',
        active: true,
        rule: { type: 'content', field: 'content_type', operator: 'equals', value: 'knowledge' }
      })
    ]));
    expect(db.prepare('SELECT version FROM schema_migrations WHERE component = ?')
      .get('default_smart_collections')).toMatchObject({ version: 1 });

    db.prepare('DELETE FROM smart_collections WHERE id IN (?, ?, ?, ?)')
      .run('featured', 'audio', 'video', 'specs');
    initDatabase();

    expect(taxonomyService.listSmartCollections({ scope: 'public', includeInactive: false }))
      .toHaveLength(0);
  });
});

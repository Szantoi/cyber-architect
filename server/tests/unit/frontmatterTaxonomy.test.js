import { describe, expect, it } from 'vitest';
import {
  createCanonicalTaxonomyFrontmatter,
  createPainPointObsidianTags,
  normalizeFrontmatterTaxonomy
} from '../../services/frontmatterTaxonomy.js';

describe('frontmatter taxonomy normalization', () => {
  it('projects canonical flat Obsidian lists into the existing dimensions shape', () => {
    const normalized = normalizeFrontmatterTaxonomy({
      schema_version: 2,
      taxonomy_schema: 2,
      tax_industry: ['manufacturing'],
      tax_technology: ['obsidian', 'graph-rag'],
      tax_audience_role: ['process-engineer']
    });

    expect(normalized).toMatchObject({
      dimensions: {
        iparag: ['manufacturing'],
        technologia: ['obsidian', 'graph-rag'],
        celcsoport: ['process-engineer']
      },
      needs_migration: false
    });
  });

  it('dual-reads the legacy nested dimensions mapping without changing its terms', () => {
    const normalized = normalizeFrontmatterTaxonomy({
      dimensions: {
        iparag: ['Gyártás'],
        technologia: ['C# / .NET'],
        celcsoport: ['Műszaki Vezető']
      }
    });

    expect(normalized.taxonomy).toEqual({
      tax_industry: ['Gyártás'],
      tax_technology: ['C# / .NET'],
      tax_audience_role: ['Műszaki Vezető']
    });
    expect(normalized.needs_migration).toBe(true);
  });

  it('accepts a recoverable JSON-text legacy mapping but rejects Obsidian object coercion', () => {
    expect(normalizeFrontmatterTaxonomy({
      dimensions: '{"iparag":["Gyártás"],"technologia":[],"celcsoport":[]}'
    }).dimensions.iparag).toEqual(['Gyártás']);

    try {
      normalizeFrontmatterTaxonomy({ dimensions: '[object Object]' });
      throw new Error('Expected frontmatter coercion to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_LEGACY_DIMENSIONS_TEXT' });
    }
  });

  it('fails closed when canonical and legacy values conflict', () => {
    try {
      normalizeFrontmatterTaxonomy({
        tax_industry: ['manufacturing'],
        dimensions: { iparag: ['finance'] }
      });
      throw new Error('Expected taxonomy conflict to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ code: 'FRONTMATTER_TAXONOMY_CONFLICT' });
    }
  });

  it('writes only flat canonical taxonomy fields', () => {
    const canonical = createCanonicalTaxonomyFrontmatter({
      dimensions: {
        iparag: ['Gyártás'],
        technologia: ['Obsidian'],
        celcsoport: []
      }
    });

    expect(canonical).toEqual({
      schema_version: 2,
      taxonomy_schema: 2,
      tax_industry: ['Gyártás'],
      tax_technology: ['Obsidian'],
      tax_audience_role: []
    });
    expect(canonical).not.toHaveProperty('dimensions');
  });

  it('preserves the optional pain-point taxonomy and derives safe Obsidian tags', () => {
    const canonical = createCanonicalTaxonomyFrontmatter({
      dimensions: {
        iparag: [],
        technologia: [],
        celcsoport: [],
        fajdalompont: ['Információkeresési idő', 'Feketedoboz AI átláthatatlanság']
      },
      tags: ['existing']
    }, { includePainPointTags: true });

    expect(canonical).toMatchObject({
      tax_pain_point: ['Információkeresési idő', 'Feketedoboz AI átláthatatlanság'],
      tags: [
        'existing',
        'ca/pain-point/informaciokeresesi-ido',
        'ca/pain-point/feketedoboz-ai-atlathatatlansag'
      ]
    });
    expect(createPainPointObsidianTags(['Rossz keresési találatok']))
      .toEqual(['ca/pain-point/rossz-keresesi-talalatok']);
  });
});

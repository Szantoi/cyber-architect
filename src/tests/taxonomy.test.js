import { describe, it, expect } from 'vitest';
import { getTreeFolders, getMultiCategoriesForDoc } from '../utils/taxonomy.js';
import {
  buildTaxonomyFacetOptions,
  documentMatchesFacets,
  getDocumentDimensionValues,
  matchesTaxonomySmartCollection,
  normalizeTaxonomyConfig
} from '../utils/taxonomyConfig.js';

describe('Information Architecture & Taxonomy Unit Tests', () => {
  const sampleDoc = {
    slug: 'vallalati-ai-adatbiztonsag-rag',
    title: 'Hogyan vezessünk be AI-t anélkül, hogy kiszivárognának a céges adatok?',
    summary: 'A zárt RAG architektúra lényege és a Python adatbiztonság.',
    category: '01_AI_es_Adatbiztonsag',
    dimensions: {
      iparag: ['Gyártás', 'Pénzügy'],
      technologia: ['Python', 'Local LLM', 'SQLite FTS5'],
      celcsoport: ['COO / Operatív Vezető', 'IT Vezető']
    }
  };

  describe('getMultiCategoriesForDoc (Semantic Polyhierarchy)', () => {
    it('correctly maps keywords into semantic topic folders', () => {
      const cats = getMultiCategoriesForDoc(sampleDoc);
      expect(cats).toContain('AI & RAG RENDSZEREK');
      expect(cats).toContain('ADATBIZTONSÁG & GDPR');
      expect(cats).toContain('KÓD-ALAPÚ AUTOMATIZÁLÁS');
    });

    it('handles null/undefined gracefully', () => {
      expect(getMultiCategoriesForDoc(null)).toEqual(['Általános']);
      expect(getMultiCategoriesForDoc({})).toEqual(['Általános']);
    });
  });

  describe('getTreeFolders (Faceted Pivot Matrix)', () => {
    it('falls back to the category when a document has no Vault path', () => {
      const folders = getTreeFolders(sampleDoc, 'drive');
      expect(folders).toEqual(['01_AI_es_Adatbiztonsag']);
    });

    it('groups descendant documents under their canonical Content collection rather than frontmatter category', () => {
      const firstChild = {
        ...sampleDoc,
        category: 'ARCHITEKTÚRA',
        drive_path: 'Content/01_Zart_Vallalati_RAG/zero-raw-query-es-sqlite-wal-adatbiztonsag/index.md'
      };
      const secondChild = {
        ...sampleDoc,
        category: 'BIZTONSÁG',
        drive_path: 'Content/01_Zart_Vallalati_RAG/nexus-knowledge-service-multi-agent-flotta/index.md'
      };

      expect(getTreeFolders(firstChild, 'drive')).toEqual(['ZÁRT VÁLLALATI RAG']);
      expect(getTreeFolders(secondChild, 'drive')).toEqual(['ZÁRT VÁLLALATI RAG']);
    });

    it('keeps the category fallback for records without a persisted Drive path', () => {
      expect(getTreeFolders({ ...sampleDoc, drive_path: '' }, 'drive')).toEqual(['01_AI_es_Adatbiztonsag']);
    });

    it('groups by semantic topic in topic mode', () => {
      const folders = getTreeFolders(sampleDoc, 'topic');
      expect(folders).toContain('AI & RAG RENDSZEREK');
      expect(folders).toContain('ADATBIZTONSÁG & GDPR');
    });

    it('groups by industry dimensions in industry mode', () => {
      const folders = getTreeFolders(sampleDoc, 'industry');
      expect(folders).toEqual(['Gyártás', 'Pénzügy']);
    });

    it('groups by tech stack dimensions in tech mode', () => {
      const folders = getTreeFolders(sampleDoc, 'tech');
      expect(folders).toEqual(['Python', 'Local LLM', 'SQLite FTS5']);
    });

    it('provides fallback for items with empty dimensions', () => {
      const emptyDoc = { slug: 'test-doc', title: 'Test' };
      expect(getTreeFolders(emptyDoc, 'industry')).toEqual(['Általános Iparág']);
      expect(getTreeFolders(emptyDoc, 'tech')).toEqual(['Kód & Algoritmusok']);
    });
  });

  describe('registry-backed taxonomy compatibility', () => {
    it('reads an old Hungarian dimensions projection through a new SQL registry alias', () => {
      const registry = normalizeTaxonomyConfig({
        dimensions: [
          {
            id: 'industry',
            frontmatter_key: 'tax_industry',
            label: 'IPARÁG',
            filterable: true
          }
        ],
        terms: [{ id: 'manufacturing', dimension_id: 'industry', slug: 'manufacturing', label: 'Gyártás' }],
        smart_collections: [],
        relations: [{ id: 'manufacturing-related', source_term_id: 'manufacturing', target_term_id: 'manufacturing' }]
      });
      const [industry] = registry.dimensions;
      const legacyProjectionDocument = { dimensions: { iparag: ['Gyártás'] } };

      expect(getDocumentDimensionValues(legacyProjectionDocument, industry)).toEqual(['Gyártás']);
      expect(documentMatchesFacets(legacyProjectionDocument, registry.dimensions, {
        industry: 'manufacturing'
      })).toBe(true);
      expect(buildTaxonomyFacetOptions([legacyProjectionDocument], registry.dimensions, {}).industry).toEqual([
        expect.objectContaining({ value: 'manufacturing', label: 'Gyártás', count: 1 })
      ]);
      expect(registry.relationships).toHaveLength(1);
    });

    it('honours explicit admin flags instead of reintroducing fallback pivots or smart folders', () => {
      const registry = normalizeTaxonomyConfig({
        dimensions: [{ id: 'custom', label: 'CUSTOM', filterable: false, groupable: false, multi_select: false, terms: [] }],
        smart_collections: [{ id: 'archived-smart', slug: 'archived-smart', label: 'ARCHIVED', active: false, rules: [] }]
      });

      expect(registry.dimensions[0]).toMatchObject({ filterable: false, groupable: false, multi_select: false });
      expect(registry.smart_collections).toHaveLength(1);
      expect(registry.smart_collections[0].active).toBe(false);
      expect(matchesTaxonomySmartCollection({}, registry.smart_collections[0])).toBe(false);
      expect(normalizeTaxonomyConfig({ smart_collections: [] }).smart_collections).toEqual([]);
    });

    it('evaluates an admin smart collection against flat Obsidian taxonomy properties', () => {
      const registry = normalizeTaxonomyConfig({
        dimensions: [{
          id: 'industry',
          frontmatter_key: 'tax_industry',
          label: 'IPARÁG',
          filterable: true,
          terms: [{ id: 'manufacturing', slug: 'manufacturing', label: 'Gyártás' }]
        }],
        smart_collections: [{
          id: 'manufacturing-collection',
          slug: 'manufacturing-collection',
          name: 'Gyártás',
          rule: { type: 'taxonomy', dimension_id: 'industry', term_ids: ['manufacturing'], match: 'any' }
        }]
      });

      expect(matchesTaxonomySmartCollection(
        { tax_industry: ['manufacturing'] },
        registry.smart_collections[0],
        registry.dimensions
      )).toBe(true);
      expect(matchesTaxonomySmartCollection(
        { tax_industry: ['services'] },
        registry.smart_collections[0],
        registry.dimensions
      )).toBe(false);
    });

    it('applies persisted manual memberships before the Smart collection rule', () => {
      const registry = normalizeTaxonomyConfig({
        smart_collections: [{
          id: 'manual-membership',
          name: 'Kézi tagság',
          rule: { type: 'content', field: 'published', operator: 'equals', value: true },
          membership_overrides: { 41: 'include', 42: 'exclude' }
        }]
      });
      const [collection] = registry.smart_collections;

      expect(matchesTaxonomySmartCollection({ id: 41, published: 0 }, collection)).toBe(true);
      expect(matchesTaxonomySmartCollection({ id: 42, published: 1 }, collection)).toBe(false);
      expect(matchesTaxonomySmartCollection({ id: 43, published: 1 }, collection)).toBe(true);
    });
  });
});

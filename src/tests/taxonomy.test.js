import { describe, it, expect } from 'vitest';
import { getTreeFolders, getMultiCategoriesForDoc } from '../components/common/TacticalVaultExplorer.jsx';

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
    it('groups by canonical Drive folder in drive mode', () => {
      const folders = getTreeFolders(sampleDoc, 'drive');
      expect(folders).toEqual(['01_AI_es_Adatbiztonsag']);
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
});

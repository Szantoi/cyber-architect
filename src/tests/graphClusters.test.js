import { describe, expect, it } from 'vitest';
import { buildArchiveGraphClusters, getGraphGroupMemberships } from '../utils/graphClusters.js';

const documents = [
  {
    id: 1,
    title: 'CAD tudástár',
    content_type: 'knowledge',
    drive_path: 'knowledge/02_CAD_Automatizacio/cad-tudastar',
    category: 'CAD AUTOMATIZÁCIÓ',
    dimensions: {
      iparag: ['Gyártás'],
      technologia: ['C# / .NET', 'AutoCAD API'],
      celcsoport: ['Műszaki vezető']
    }
  },
  {
    id: 2,
    title: 'RAG blog',
    content_type: 'blog',
    drive_path: 'blog/01_AI_es_Adatbiztonsag/rag-blog',
    category: 'AI ÉS ADATBIZTONSÁG',
    dimensions: {
      iparag: ['Pénzügy'],
      technologia: ['Python'],
      celcsoport: ['CTO']
    }
  }
];

describe('graph cluster layout', () => {
  it('retains every taxonomy membership while plotting a node only once', () => {
    expect(getGraphGroupMemberships(documents[0], 'technology')).toEqual(['C# / .NET', 'AutoCAD API']);

    const layout = buildArchiveGraphClusters(documents, { grouping: 'technology' });
    const cadNode = layout.nodes.find(node => node.id === 1);

    expect(layout.nodes).toHaveLength(documents.length);
    expect(layout.clusters.map(cluster => cluster.label)).toEqual(['C# / .NET', 'Python']);
    expect(cadNode).toMatchObject({
      primaryGroupLabel: 'C# / .NET',
      secondaryGroupMemberships: ['AutoCAD API']
    });
  });

  it('creates stable, bounded clusters for every supported grouping dimension', () => {
    ['content_type', 'drive', 'topic', 'industry', 'technology', 'audience'].forEach((grouping) => {
      const layout = buildArchiveGraphClusters(documents, { grouping });

      expect(layout.nodes).toHaveLength(documents.length);
      expect(layout.clusters.length).toBeGreaterThan(0);
      expect(layout.clusters.every(cluster => cluster.rx > 0 && cluster.ry > 0)).toBe(true);
      expect(layout.nodes.every(node => node.x >= 0 && node.x <= 1000 && node.y >= 0 && node.y <= 560)).toBe(true);
    });
  });
});

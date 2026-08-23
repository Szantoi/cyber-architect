import React from 'react';
import TacticalVaultExplorer from '../common/TacticalVaultExplorer.jsx';

/**
 * ============================================================================
 * KNOWLEDGE BASE // UNIFIED TACTICAL MOTOR
 * ============================================================================
 * A KnowledgeBase vékony adapterként hívja meg az egységes TacticalVaultExplorer
 * motort, garantálva a 100%-ban megegyező viselkedést, fluid Framer Motion
 * animációkat és kódminőséget a Bloggal.
 */
const KnowledgeBase = () => {
  return (
    <TacticalVaultExplorer
      vaultType="knowledge"
      baseRoute="/knowledge"
      apiEndpoints={{
        // Canonical document collection: it contains both knowledge material
        // and public blog articles, preserving each item's source profile.
        list: '/api/documents',
        search: '/api/documents/search',
        doc: (slug) => `/api/documents/${slug}`
      }}
      headerConfig={{
        badge: 'CYBER-ARCHITECT // TELJES CIKKADATBÁZIS',
        title: 'Iparági AI Automatizálás, Tudástár és Blog.',
        description: 'A teljes szakmai cikkadatbázis egy helyen: tudástári dokumentumok, blogcikkek, esettanulmányok és kódminták egységes, kereshető archívuma.',
        version: 'v2.0',
        statusBadge: '// UNIFIED_DOCUMENT_SEARCH_ACTIVE',
        hubButtonLabel: 'TELJES_CIKKADATBÁZIS',
        headerTitle: 'TELJES_TUDÁSTÁR'
      }}
    />
  );
};

export default KnowledgeBase;

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
        list: '/api/docs',
        search: '/api/docs/search',
        doc: (slug) => `/api/docs/${slug}`,
        related: (slug) => `/api/docs/related/${slug}`
      }}
      headerConfig={{
        badge: 'CYBER-ARCHITECT // KNOWLEDGE VAULT & MŰSZAKI TUDÁSTÁR',
        title: 'Iparági AI Automatizálás & Műszaki Tudástár.',
        description: 'Ez az archívum a mérnöki és gyártási folyamatautomatizáció, a zárt vállalati RAG tudásbázisok, valamint a C# .NET / Python szoftverintegrációk valós esettanulmányait és kódmintáit gyűjti egybe.',
        version: 'v2.0',
        statusBadge: '// KNOWLEDGE_RAG_ACTIVE',
        hubButtonLabel: 'TUDÁSTÁR_BEMUTATÓ_HUB',
        headerTitle: 'KNOWLEDGE_VAULT'
      }}
    />
  );
};

export default KnowledgeBase;

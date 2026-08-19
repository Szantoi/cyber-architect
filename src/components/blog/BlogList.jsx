import React from 'react';
import TacticalVaultExplorer from '../common/TacticalVaultExplorer.jsx';

/**
 * ============================================================================
 * BLOG ARCHÍVUM // UNIFIED TACTICAL MOTOR
 * ============================================================================
 * A BlogList vékony adapterként hívja meg az egységes TacticalVaultExplorer
 * motort, garantálva a 100%-ban megegyező viselkedést, fluid Framer Motion
 * animációkat és kódminőséget a Knowledge Base-zel.
 */
const BlogList = () => {
  return (
    <TacticalVaultExplorer
      vaultType="blog"
      baseRoute="/blog"
      apiEndpoints={{
        list: '/api/blog',
        search: '/api/blog/search',
        doc: (slug) => `/api/blog/${slug}`,
        related: (slug) => `/api/blog/related/${slug}`
      }}
      headerConfig={{
        badge: 'CYBER-ARCHITECT // SZAKMAI BLOG & ESETTANULMÁNYOK HUB',
        title: 'Mérnöki Blog & Esettanulmányok.',
        description: 'Gyakorlati tapasztalatok, technológiai mélyfúrások és mérhető esettanulmányok a zárt vállalati RAG AI rendszerekről, az egyedi folyamatautomatizálásról és a CAD integrációról.',
        version: 'v2.0',
        statusBadge: '// BLOG_RAG_SEARCH_ACTIVE',
        hubButtonLabel: 'BLOG_BEMUTATÓ_HUB',
        headerTitle: 'BLOG_ARCHÍVUM'
      }}
    />
  );
};

export default BlogList;

// server/tests/knowledge_verify.js
// Automated verification for Knowledge Projects, Hybrid Search & Privacy Boundaries

import { dbService } from '../services/dbService.js';

console.log('====================================================');
console.log('CYBER-ARCHITECT // KNOWLEDGE & HYBRID SEARCH SUITE');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`[PASS] ${description}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${description}`);
    failCount++;
  }
}

try {
  // Test 1: Public Knowledge Projects List
  const publicProjects = dbService.getKnowledgeProjects({ visibility: 'public' });
  assert('Public projects list should not include private workspaces', 
    publicProjects.length > 0 && !publicProjects.some(p => p.visibility === 'private')
  );

  // Test 2: Admin Knowledge Projects List
  const allProjects = dbService.getKnowledgeProjects({ visibility: 'all' });
  assert('Admin projects list should include both public and private workspaces',
    allProjects.some(p => p.visibility === 'private') && allProjects.some(p => p.visibility === 'public')
  );

  // Test 3: Public Knowledge Search Privacy Guard
  const publicSearchResults = dbService.searchKnowledge({ query: 'AutoCAD', visibility: 'public' });
  assert('Public search should NOT return private internal notes',
    !publicSearchResults.some(doc => doc.visibility === 'private')
  );

  // Test 4: Admin Knowledge Search (With Private Access)
  const adminSearchResults = dbService.searchKnowledge({ query: 'AutoCAD', visibility: 'all' });
  assert('Admin search should find private internal engineering notes',
    adminSearchResults.some(doc => doc.visibility === 'private')
  );

  // Test 5: Multi-Dimensional Faceted Search (Iparág & Tech)
  const filteredDocs = dbService.searchKnowledge({
    query: '',
    technologia: 'Python',
    visibility: 'public'
  });
  assert('Dimensional search should correctly filter documents by technology tag',
    filteredDocs.length > 0 && filteredDocs.every(d => d.dimensions?.technologia?.includes('Python'))
  );

  // Test 6: Dimensions Aggregation Matrix
  const dims = dbService.getKnowledgeDimensions({ visibility: 'public' });
  assert('Dimensions matrix contains iparag, technologia and celcsoport tags',
    Array.isArray(dims.iparag) && dims.iparag.length > 0 &&
    Array.isArray(dims.technologia) && dims.technologia.length > 0 &&
    Array.isArray(dims.celcsoport) && dims.celcsoport.length > 0
  );

  // Test 7: Project Scoped Search
  const ragDocs = dbService.searchKnowledge({
    projectId: 'prj_rag_enterprise',
    visibility: 'public'
  });
  assert('Project scoped search returns only documents belonging to specified workspace',
    ragDocs.length > 0 && ragDocs.every(d => d.project_id === 'prj_rag_enterprise')
  );

} catch (err) {
  console.error('Test execution error:', err);
  failCount++;
}

console.log('\n----------------------------------------------------');
console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log('----------------------------------------------------');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('[SUCCESS] All Knowledge Base & Hybrid Search assertions passed.');
  process.exit(0);
}

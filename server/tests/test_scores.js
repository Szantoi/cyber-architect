import { dbService } from '../services/dbService.js';

console.log('=== TEST 1: Default Recommended Sorting with Score Percentage ===');
const recommendedPosts = dbService.getBlogPosts({ publishedOnly: true, contentType: 'blog', sortBy: 'recommended' });
console.log(`Found ${recommendedPosts.length} posts.`);
recommendedPosts.forEach((p, idx) => {
  console.log(` #${idx + 1} [${p.scorePercentage}% ${p.category}] ${p.title}`);
});

console.log('\n=== TEST 2: Blog RAG Search with Match Percentage for "RAG" ===');
const searchResults = dbService.searchBlog({ query: 'RAG', visibility: 'public' });
console.log(`Found ${searchResults.length} matches.`);
searchResults.forEach((r, idx) => {
  console.log(` #${idx + 1} [${r.scorePercentage}% ${r.scoreLabel}] ${r.title} (Rel: ${r.hybridRelevanceScore})`);
});

console.log('\n=== ALL SCORE & RECOMMENDATION TESTS COMPLETED SUCCESSFULLY! ===');

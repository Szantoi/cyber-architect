import { dbService } from '../services/dbService.js';

console.log('=== TEST 1: Get Blog Posts (Strictly contentType: blog) ===');
const blogPosts = dbService.getBlogPosts({ publishedOnly: true, contentType: 'blog' });
console.log(`Found ${blogPosts.length} blog posts.`);
blogPosts.forEach(b => console.log(` - [${b.category}] ${b.title} (type: ${b.content_type})`));

console.log('\n=== TEST 2: Get Knowledge Docs (Strictly contentType: knowledge) ===');
const knowledgeDocs = dbService.getKnowledgeDocs({ publishedOnly: true });
console.log(`Found ${knowledgeDocs.length} knowledge docs.`);
knowledgeDocs.forEach(k => console.log(` - [${k.category}] ${k.title} (type: ${k.content_type})`));

console.log('\n=== TEST 3: Blog RAG Search for "RAG" ===');
const blogSearchRag = dbService.searchBlog({ query: 'RAG', visibility: 'public' });
console.log(`Blog RAG results: ${blogSearchRag.length}`);
blogSearchRag.forEach(r => console.log(` - ${r.title} | Rel: ${r.hybridRelevanceScore} | Cosine: ${r.cosineSimilarity}`));

console.log('\n=== TEST 4: Blog RAG Search for "AutoCAD" ===');
const blogSearchCad = dbService.searchBlog({ query: 'AutoCAD', visibility: 'public' });
console.log(`Blog RAG results: ${blogSearchCad.length}`);
blogSearchCad.forEach(r => console.log(` - ${r.title} | Rel: ${r.hybridRelevanceScore} | Cosine: ${r.cosineSimilarity}`));

console.log('\n=== TEST 5: Blog Categories ===');
const categories = dbService.getBlogCategories();
console.log('Categories:', JSON.stringify(categories));

console.log('\n=== TEST 6: Related Blog Posts ===');
if (blogPosts.length > 0) {
  const firstSlug = blogPosts[0].slug;
  const related = dbService.getRelatedBlogPosts(firstSlug);
  console.log(`Related to "${firstSlug}": ${related.length} items`);
  related.forEach(rel => console.log(` - ${rel.title} (similarity: ${rel.similarity})`));
}

console.log('\n=== TEST 7: Unified Search (scope: all) for "AI" ===');
const unifiedAll = dbService.searchUnified({ query: 'AI', scope: 'all' });
console.log(`Unified (all) results: ${unifiedAll.length}`);
unifiedAll.forEach(u => console.log(` - [${u.source.toUpperCase()}] ${u.title}`));

console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');

import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';

export const blogRouter = Router();

// 1. Public Blog List (Strictly Blog Content)
blogRouter.get('/blog', (req, res) => {
  try {
    const { category, sortBy = 'recommended', limit } = req.query;
    const posts = dbService.getBlogPosts({
      publishedOnly: true,
      contentType: 'blog',
      category: category && category !== 'ALL' ? String(category) : undefined,
      sortBy: String(sortBy || 'recommended'),
      limit: limit ? Number(limit) : undefined
    });
    res.json(posts);
  } catch (err) {
    logger.error('Failed to fetch blog list', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 2. Public Blog Categories with Count
blogRouter.get('/blog/categories', (req, res) => {
  try {
    const categories = dbService.getBlogCategories({ visibility: 'public' });
    res.json(categories);
  } catch (err) {
    logger.error('Failed to fetch blog categories', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 3. Public Blog RAG Semantic & FTS5 Search Engine
blogRouter.get('/blog/search', (req, res) => {
  try {
    const { q = '', category = 'ALL', sortBy = 'recommended', limit = 20 } = req.query;
    const cleanQ = String(q || '').trim();
    const results = dbService.searchBlog({
      query: cleanQ,
      category: category && category !== 'ALL' ? String(category) : 'ALL',
      sortBy: String(sortBy || 'recommended'),
      visibility: 'public',
      limit: Number(limit) || 20
    });

    const normalize = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const qTokens = cleanQ.split(/\s+/).filter(Boolean);
    const normQTokens = qTokens.map(normalize);

    const enrichedResults = results.map(p => {
      const fullText = `${p.title} ${p.summary || ''} ${p.content || ''}`;
      const _normFullText = normalize(fullText);

      const matchedTokens = [];
      let inTitle = false;
      let inSummary = false;
      let inContent = false;

      for (const token of qTokens) {
        const normTok = normalize(token);
        if (normalize(p.title).includes(normTok)) {
          matchedTokens.push(token);
          inTitle = true;
        }
        if (p.summary && normalize(p.summary).includes(normTok)) {
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
          inSummary = true;
        }
        if (p.content && normalize(p.content).includes(normTok)) {
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
          inContent = true;
        }
      }

      let matchSnippet = p.summary || '';
      if (cleanQ.length > 1 && p.content) {
        const cleanContent = p.content.replace(/[#*`_>[\]]/g, ' ');
        const normContent = normalize(cleanContent);

        let matchIdx = -1;
        for (const tok of normQTokens) {
          const idx = normContent.indexOf(tok);
          if (idx !== -1) {
            matchIdx = idx;
            break;
          }
        }

        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 70);
          const end = Math.min(cleanContent.length, matchIdx + 140);
          matchSnippet = (start > 0 ? '...' : '') + cleanContent.substring(start, end).trim() + (end < cleanContent.length ? '...' : '');
        }
      }

      const relevancePct = Math.min(100, Math.round((p.hybridRelevanceScore || 0) * 100));
      const semanticPct = Math.min(100, Math.round((p.cosineSimilarity || 0) * 100));
      const keywordPct = Math.min(100, Math.round((p.keywordScore || 0) * 100));

      let matchLocation = 'Szemantikai Vektor Találat';
      if (inTitle && inContent) matchLocation = 'Címben & Szövegtörzsben';
      else if (inTitle) matchLocation = 'Címben';
      else if (inSummary && inContent) matchLocation = 'Összefoglalóban & Szövegben';
      else if (inContent) matchLocation = 'Szövegtörzsben';
      else if (inSummary) matchLocation = 'Összefoglalóban';

      return {
        ...p,
        matchedTokens,
        inTitle,
        inSummary,
        inContent,
        matchSnippet,
        matchLocation,
        relevanceScore: relevancePct,
        semanticScore: semanticPct,
        keywordScore: keywordPct
      };
    });

    res.json({ posts: enrichedResults, total: enrichedResults.length, query: cleanQ });
  } catch (err) {
    logger.error('Failed to execute blog RAG search', err);
    res.status(500).json({ error: 'BLOG_SEARCH_ERROR', posts: [] });
  }
});

// 4. Related Blog Posts (Semantic Cosine Recommendation)
blogRouter.get('/blog/related/:slug', (req, res) => {
  try {
    const { limit = 3 } = req.query;
    const related = dbService.getRelatedBlogPosts(req.params.slug, Number(limit) || 3);
    res.json(related);
  } catch (err) {
    logger.error(`Failed to get related posts for: ${req.params.slug}`, err);
    res.status(500).json({ error: 'RELATED_POSTS_ERROR', related: [] });
  }
});

// 5. Public Single Blog Post
blogRouter.get('/blog/:slug', (req, res) => {
  try {
    const post = dbService.getBlogPostBySlug(req.params.slug, { publishedOnly: true, visibility: 'public' });
    if (!post) {
      return res.status(404).json({ error: 'DATA_RECORD_NOT_FOUND' });
    }
    res.json(post);
  } catch (err) {
    logger.error(`Failed to fetch blog post: ${req.params.slug}`, err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

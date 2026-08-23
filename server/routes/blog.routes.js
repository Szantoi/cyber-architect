import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';
import { adminPreviewMiddleware, getReadScope } from '../middleware/adminPreview.js';
import {
  contentTypeFromPresentationProfile,
  normalizePresentationProfile
} from '../services/presentationProfile.js';

export const blogRouter = Router();

blogRouter.use(adminPreviewMiddleware);

const MAX_PUBLIC_SEARCH_CANDIDATES = 250;

function readPublicProjectId(query = {}) {
  const raw = query.project_id ?? query.projectId;
  const projectId = String(raw ?? '').trim();
  return projectId && projectId.toUpperCase() !== 'ALL' ? projectId : null;
}

// `/blog` is intentionally retained as the legacy article presentation
// alias.  It accepts both names during the transition, but never turns the
// route into a second semantic document type.
function resolveBlogPresentationFilter(query = {}) {
  const rawContentType = String(query.content_type ?? '').trim().toLowerCase();
  const legacyContentType = (!rawContentType || rawContentType === 'all')
    ? 'blog'
    : rawContentType;
  if (!['knowledge', 'blog'].includes(legacyContentType)) {
    throw new Error('INVALID_CONTENT_TYPE');
  }

  const rawProfile = String(query.presentation_profile ?? '').trim().toLowerCase();
  const presentationProfile = (!rawProfile || rawProfile === 'all')
    ? null
    : normalizePresentationProfile(rawProfile);
  const projectedType = presentationProfile
    ? contentTypeFromPresentationProfile(presentationProfile)
    : legacyContentType;

  if (projectedType !== 'blog') {
    throw new Error('PRESENTATION_PROFILE_ROUTE_CONFLICT');
  }

  return {
    contentType: 'blog',
    presentationProfile: presentationProfile || 'article'
  };
}

function respondToPresentationFilterError(res, error) {
  if (/^(?:INVALID_CONTENT_TYPE|INVALID_PRESENTATION_PROFILE|PRESENTATION_PROFILE_ROUTE_CONFLICT)/.test(String(error?.code || error?.message || ''))) {
    return res.status(400).json({ error: error.code || error.message });
  }
  return null;
}

// 1. Public Blog List (Strictly Blog Content)
blogRouter.get('/blog', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { category, sortBy = 'recommended', limit } = req.query;
    const presentation = resolveBlogPresentationFilter(req.query);
    const projectId = readPublicProjectId(req.query);
    const posts = dbService.getBlogPosts({
      publishedOnly: readScope.publishedOnly,
      visibility: readScope.visibility,
      contentType: presentation.contentType,
      presentationProfile: presentation.presentationProfile,
      projectId,
      category: category && category !== 'ALL' ? String(category) : undefined,
      sortBy: String(sortBy || 'recommended'),
      limit: limit ? Number(limit) : undefined
    });
    res.json(posts);
  } catch (err) {
    logger.error('Failed to fetch blog list', err);
    if (respondToPresentationFilterError(res, err)) return;
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 2. Public Blog Categories with Count
blogRouter.get('/blog/categories', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const categories = dbService.getBlogCategories({
      visibility: readScope.visibility,
      publishedOnly: readScope.publishedOnly
    });
    res.json(categories);
  } catch (err) {
    logger.error('Failed to fetch blog categories', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 3. Public Blog RAG Semantic & FTS5 Search Engine
blogRouter.get('/blog/search', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { q = '', category = 'ALL', sortBy = 'recommended', limit = 20 } = req.query;
    const cleanQ = String(q || '').trim();
    const presentation = resolveBlogPresentationFilter(req.query);
    const projectId = readPublicProjectId(req.query);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const candidates = dbService.searchBlog({
      query: cleanQ,
      category: category && category !== 'ALL' ? String(category) : 'ALL',
      sortBy: String(sortBy || 'recommended'),
      visibility: readScope.visibility,
      publishedOnly: readScope.publishedOnly,
      presentationProfile: presentation.presentationProfile,
      // The service has no project predicate for article RAG yet. Read a
      // bounded candidate set before applying the same public project boundary
      // used by the Knowledge Vault endpoints.
      limit: projectId ? MAX_PUBLIC_SEARCH_CANDIDATES : safeLimit
    });
    const results = projectId
      ? candidates.filter(post => post.project_id === projectId).slice(0, safeLimit)
      : candidates;

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
    if (respondToPresentationFilterError(res, err)) return;
    res.status(500).json({ error: 'BLOG_SEARCH_ERROR', posts: [] });
  }
});

// 4. Related Blog Posts (Semantic Cosine Recommendation)
blogRouter.get('/blog/related/:slug', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { limit = 3 } = req.query;
    const related = dbService.getRelatedBlogPosts(req.params.slug, Number(limit) || 3, readScope);
    res.json(related);
  } catch (err) {
    logger.error(`Failed to get related posts for: ${req.params.slug}`, err);
    res.status(500).json({ error: 'RELATED_POSTS_ERROR', related: [] });
  }
});

// 5. Public Single Blog Post
blogRouter.get('/blog/:slug', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const post = dbService.getBlogPostBySlug(req.params.slug, {
      publishedOnly: readScope.publishedOnly,
      visibility: readScope.visibility
    });
    if (!post) {
      return res.status(404).json({ error: 'DATA_RECORD_NOT_FOUND' });
    }
    res.json(post);
  } catch (err) {
    logger.error(`Failed to fetch blog post: ${req.params.slug}`, err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

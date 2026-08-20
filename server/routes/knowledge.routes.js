import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';

export const knowledgeRouter = Router();

const isPublishedPublicKnowledgeDoc = post => Boolean(
  post
  && post.content_type === 'knowledge'
  && post.visibility === 'public'
  && Number(post.published) === 1
);

// 1. Unified Multi-Corpus RAG Search (Global Scope: all | blog | knowledge)
knowledgeRouter.get('/search/unified', (req, res) => {
  try {
    const { q = '', scope = 'all', limit = 30 } = req.query;
    const results = dbService.searchUnified({
      query: String(q || '').trim(),
      scope: String(scope || 'all'),
      limit: Number(limit) || 30,
      visibility: 'public'
    });
    res.json({ results, total: results.length, scope });
  } catch (err) {
    logger.error('Failed to execute unified RAG search', err);
    res.status(500).json({ error: 'UNIFIED_SEARCH_ERROR', results: [] });
  }
});

// 2. Public Knowledge Projects (Workspaces)
knowledgeRouter.get('/knowledge/projects', (req, res) => {
  try {
    const projects = dbService.getKnowledgeProjects({ visibility: 'public' });
    res.json(projects);
  } catch (err) {
    logger.error('Failed to get public knowledge projects', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 3. Public Hybrid Knowledge Search (FTS5 + Semantic + Dimensions)
knowledgeRouter.get('/knowledge/search', (req, res) => {
  try {
    const { q, projectId, iparag, technologia, celcsoport, limit } = req.query;
    const results = dbService.searchKnowledge({
      query: q || '',
      projectId: projectId || 'all',
      iparag,
      technologia,
      celcsoport,
      visibility: 'public',
      contentType: 'knowledge',
      limit: Number(limit) || 30
    });
    res.json(results);
  } catch (err) {
    logger.error('Failed to execute public knowledge search', err);
    res.status(500).json({ error: 'SEARCH_QUERY_ERROR' });
  }
});

// 4. Public Dimensions Matrix
knowledgeRouter.get('/knowledge/dimensions', (req, res) => {
  try {
    const dimensions = dbService.getKnowledgeDimensions({ visibility: 'public' });
    res.json(dimensions);
  } catch (err) {
    logger.error('Failed to get knowledge dimensions', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 5. Docs / Knowledge Base List
knowledgeRouter.get('/docs', (req, res) => {
  try {
    const posts = dbService.getKnowledgeDocs({ publishedOnly: true, visibility: 'public' });
    const docs = posts.filter(isPublishedPublicKnowledgeDoc).map(p => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      category: p.category || 'Tudástár',
      project_id: p.project_id,
      project_name: p.project_name || 'Általános Munkatér',
      dimensions: p.dimensions || {},
      read_time: p.read_time || '5 PERC',
      updated_at: p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      drive_path: p.drive_path || '',
      audio_url: p.audio_url,
      video_url: p.video_url || ''
    }));
    res.json({ docs });
  } catch (err) {
    logger.error('Failed to list knowledge docs', err);
    res.status(500).json({ error: 'KNOWLEDGE_DOCS_READ_ERROR', docs: [] });
  }
});

// 6. Intelligens Szemantikus & Full-Text RAG Kereső Végpont
knowledgeRouter.get('/docs/search', (req, res) => {
  try {
    const { q = '', iparag, technologia, celcsoport, project_id } = req.query;
    const cleanQ = String(q || '').trim();
    const results = dbService.searchKnowledge({
      query: cleanQ,
      iparag: iparag && iparag !== 'ALL' ? String(iparag) : undefined,
      technologia: technologia && technologia !== 'ALL' ? String(technologia) : undefined,
      celcsoport: celcsoport && celcsoport !== 'ALL' ? String(celcsoport) : undefined,
      projectId: project_id && project_id !== 'ALL' ? String(project_id) : 'all',
      visibility: 'public'
    });

    const normalize = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const qTokens = cleanQ.split(/\s+/).filter(Boolean);
    const normQTokens = qTokens.map(normalize);

    const docs = results.map(p => {
      const fullText = `${p.title} ${p.summary || ''} ${p.content || ''}`;
      const _normFullText = normalize(fullText);

      // Keresőszavak azonosítása és egyezések helye
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

      let matchLocation = 'Szemantikai Vektor Találat';
      if (inTitle && inContent) matchLocation = 'Címben & Szövegtörzsben';
      else if (inTitle) matchLocation = 'Címben';
      else if (inSummary && inContent) matchLocation = 'Összefoglalóban & Szövegben';
      else if (inContent) matchLocation = 'Szövegtörzsben';
      else if (inSummary) matchLocation = 'Összefoglalóban';

      // Releváns szövegrészlet (Snippet) keresése a tartalomból
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
          matchSnippet = (start > 0 ? '... ' : '') + cleanContent.substring(start, end).trim() + (end < cleanContent.length ? ' ...' : '');
        }
      }

      const relevancePct = Math.min(100, Math.round((p.hybridRelevanceScore || 0) * 100));
      const semanticPct = Math.min(100, Math.round((p.cosineSimilarity || 0) * 100));
      const keywordPct = Math.min(100, Math.round((p.keywordScore || 0) * 100));

      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        matchSnippet,
        matchLocation,
        matchedTokens,
        relevanceScore: relevancePct,
        semanticScore: semanticPct,
        keywordScore: keywordPct,
        category: p.category || 'Tudástár',
        project_id: p.project_id,
        project_name: p.project_name || 'Általános Munkatér',
        dimensions: p.dimensions || {},
        read_time: p.read_time || '5 PERC',
        updated_at: p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        drive_path: p.drive_path || '',
        audio_url: p.audio_url,
        video_url: p.video_url || ''
      };
    });

    res.json({ count: docs.length, docs });
  } catch (err) {
    logger.error('Failed to perform intelligent knowledge search', err);
    res.status(500).json({ error: 'SEARCH_FAILED', docs: [] });
  }
});

// 7. In-Article True Server RAG Chunk Retrieval Endpoint
knowledgeRouter.get('/rag/article-chunks', (req, res) => {
  try {
    const { slug, q } = req.query;
    if (!slug) {
      return res.status(400).json({ error: 'MISSING_SLUG', chunks: [] });
    }

    const result = dbService.getArticleRagChunks({
      slug: String(slug),
      query: String(q || ''),
      visibility: 'public'
    });

    res.json(result);
  } catch (err) {
    logger.error('Failed to retrieve article RAG chunks', err);
    res.status(500).json({ error: 'RAG_CHUNKS_FAILED', chunks: [] });
  }
});

// 8. Related Docs (Semantic Recommendation)
knowledgeRouter.get('/docs/related/:slug', (req, res) => {
  try {
    const { limit = 3 } = req.query;
    const related = dbService.getRelatedBlogPosts(req.params.slug, Number(limit) || 3);
    res.json(related);
  } catch (err) {
    logger.error(`Failed to get related docs for: ${req.params.slug}`, err);
    res.status(500).json({ error: 'RELATED_DOCS_ERROR', related: [] });
  }
});

// 9. Docs – egyedi dokumentum tartalom a Knowledge Vaultból
knowledgeRouter.get('/docs/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const post = dbService.getBlogPostBySlug(slug, {
      publishedOnly: true,
      visibility: 'public'
    });

    if (!isPublishedPublicKnowledgeDoc(post)) {
      return res.status(404).json({ error: 'DOC_NOT_FOUND', content: '# HIBA 404\n\nA kért dokumentum nem található a publikus tudástárban.' });
    }

    res.json({
      slug: post.slug,
      title: post.title,
      content: post.content,
      category: post.category,
      project_name: post.project_name || 'Általános',
      updated_at: post.created_at ? post.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      drive_path: post.drive_path || '',
      audio_url: post.audio_url,
      video_url: post.video_url || ''
    });
  } catch (err) {
    logger.error(`Failed to read doc: ${req.params.slug}`, err);
    res.status(500).json({ error: 'DOC_READ_ERROR' });
  }
});

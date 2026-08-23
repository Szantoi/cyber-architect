#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import crypto from 'node:crypto';
import { dbService } from '../services/dbService.js';
import {
  contentTypeFromPresentationProfile,
  normalizePresentationProfile,
  resolveDocumentPresentation
} from '../services/presentationProfile.js';

// Create MCP Server Instance
const server = new McpServer({
  name: 'cyber-architect-portfolio-mcp',
  version: '1.0.0',
  description: 'Cyber-Architect Portfolio & System Management Protocol Server'
});

/**
 * Constant-time string comparison to prevent timing-based side-channel attacks.
 */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Internal in-memory rate limiter for MCP tool calls (DoS & Resource Exhaustion Protection).
 */
const toolRateLimitMap = new Map();
const MAX_TOOL_CALLS_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkToolRateLimit(toolName) {
  const now = Date.now();
  const record = toolRateLimitMap.get(toolName) || { count: 0, windowStart: now };
  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count++;
  toolRateLimitMap.set(toolName, record);

  if (record.count > MAX_TOOL_CALLS_PER_MINUTE) {
    throw new Error(`MCP_RATE_LIMIT_EXCEEDED: Maximum ${MAX_TOOL_CALLS_PER_MINUTE} calls/min reached for tool [${toolName}]. Please throttle invocations.`);
  }
}

/**
 * Helper to check authorization for modifying operations.
 * Checks against environment variables (PORTFOLIO_API_KEY, MCP_AUTH_KEY, ADMIN_PIN)
 * or a key explicitly supplied in the tool arguments.
 * Strictly prevents empty/undefined key bypasses.
 */
function verifyOperationAuth(providedKey, toolName = 'UNKNOWN_TOOL') {
  if (!providedKey || typeof providedKey !== 'string' || providedKey.trim().length === 0) {
    // Record failed attempt audit log
    try {
      dbService.recordAuditLog({
        action: 'MCP_AUTH_FAILED',
        entity: 'security',
        entity_id: toolName,
        prev_state: null,
        new_state: { reason: 'MISSING_OR_EMPTY_KEY', tool: toolName },
        actor: 'UNAUTHORIZED_MCP_AGENT'
      });
    } catch (_err) {
      // ignore
    }

    return {
      authorized: false,
      error: 'SECURITY_AUTH_FAILED: Missing authorization key. Please supply a valid auth_key parameter (PORTFOLIO_API_KEY or Admin PIN).'
    };
  }

  const cleanKey = providedKey.trim();

  // 1. Check System Environment Keys (Constant-Time)
  const envKey = process.env.PORTFOLIO_API_KEY || process.env.MCP_AUTH_KEY;
  if (envKey && timingSafeCompare(cleanKey, envKey.trim())) {
    return { authorized: true };
  }

  // 2. Check Registered Agent API Keys & Master PIN in Database
  const isValid = dbService.verifyAuthTokenOrKey(cleanKey);
  if (isValid) {
    return { authorized: true };
  }

  // Record failed authorization attempt in audit log
  try {
    const keyPrefix = cleanKey.length > 8 ? `${cleanKey.slice(0, 8)}...` : 'REDACTED';
    dbService.recordAuditLog({
      action: 'MCP_AUTH_FAILED',
      entity: 'security',
      entity_id: toolName,
      prev_state: null,
      new_state: { reason: 'INVALID_CREDENTIALS', keyPrefix, tool: toolName },
      actor: 'UNAUTHORIZED_MCP_AGENT'
    });
  } catch (_err) {
    // ignore
  }

  return {
    authorized: false,
    error: 'SECURITY_AUTH_FAILED: Invalid auth_key or PIN. Access denied.'
  };
}

function localVaultAuthoritativeToolError() {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: 'LOCAL_VAULT_AUTHORITATIVE: Content mutation is disabled in MCP. Edit the canonical Content/<collection>/<slug>/index.md package through Obsidian or the authenticated Vault editor, then refresh its SQLite/RAG projection.'
    }]
  };
}

// The MCP name stays stable for existing agents, while the search itself is
// document-model first: `content_type` is a legacy portal projection and
// `presentation_profile` is the optional reader-view filter.
function resolveMcpDocumentFilter({ contentType = 'all', presentationProfile = null } = {}) {
  const normalizedContentType = String(contentType ?? 'all').trim().toLowerCase() || 'all';
  if (!['knowledge', 'blog', 'all'].includes(normalizedContentType)) {
    const error = new Error('INVALID_CONTENT_TYPE');
    error.code = 'INVALID_CONTENT_TYPE';
    throw error;
  }

  const rawProfile = String(presentationProfile ?? '').trim().toLowerCase();
  if (!rawProfile || rawProfile === 'all') {
    return { contentType: normalizedContentType, presentationProfile: null };
  }

  const canonicalProfile = normalizePresentationProfile(rawProfile);
  const projectedContentType = contentTypeFromPresentationProfile(canonicalProfile);
  if (normalizedContentType !== 'all' && normalizedContentType !== projectedContentType) {
    const error = new Error('PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT');
    error.code = 'PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT';
    throw error;
  }

  return {
    contentType: projectedContentType,
    presentationProfile: canonicalProfile
  };
}

// =========================================================================
// 1. SITE SETTINGS TOOLS & RESOURCES
// =========================================================================

server.tool(
  'get_site_settings',
  'Retrieve all website settings including hero title, subtitle, status badges, diagnostics and uplink copy.',
  {
    key: z.string().optional().describe('Optional specific setting key to look up')
  },
  async ({ key }) => {
    try {
      const allSettings = dbService.getPublicSettings();
      if (key) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ [key]: allSettings[key] || null }, null, 2)
            }
          ]
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(allSettings, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

server.tool(
  'update_site_settings',
  'Safely update global website settings (hero title, subtitle, status, contact copy, etc.) with key-value pairs.',
  {
    settings: z.record(z.string(), z.string()).describe('Key-value map of settings to update'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ settings, auth_key }) => {
    checkToolRateLimit('update_site_settings');
    const auth = verifyOperationAuth(auth_key, 'update_site_settings');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const updated = dbService.updateSettings(settings, 'MCP_AGENT');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'SETTINGS_SYNCHRONIZED', currentSettings: updated }, null, 2)
          }
        ]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'get_audit_trail',
  'Retrieve recent change logs and audit records of modifications made by agents and users (Requires Auth).',
  {
    limit: z.number().optional().default(20).describe('Max number of logs to return'),
    entity: z.string().optional().describe('Optional filter by entity type (settings, projects, skills, blog_posts)'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ limit, entity, auth_key }) => {
    checkToolRateLimit('get_audit_trail');
    const auth = verifyOperationAuth(auth_key, 'get_audit_trail');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }
    try {
      const logs = dbService.getAuditLogs({ limit, entity });
      return {
        content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

// =========================================================================
// 2. PROJECTS (THE GRID) TOOLS
// =========================================================================

server.tool(
  'list_projects',
  'List all projects from The Grid with tags, status, memory address and sort order.',
  {},
  async () => {
    checkToolRateLimit('list_projects');
    try {
      const projects = dbService.getProjects();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(projects, null, 2)
          }
        ]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'get_project',
  'Get details of a specific project by its ID.',
  {
    id: z.string().describe('The unique project ID (e.g. PRJ_01)')
  },
  async ({ id }) => {
    checkToolRateLimit('get_project');
    try {
      const project = dbService.getProjectById(id);
      if (!project) {
        return { isError: true, content: [{ type: 'text', text: `PROJECT_NOT_FOUND: ${id}` }] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'create_project',
  'Create a new tactical project entry in The Grid.',
  {
    id: z.string().optional().describe('Custom ID (e.g. PRJ_05), auto-generated if omitted'),
    title: z.string().describe('Project title (e.g. DOCCAPTURE // BELSŐ RAG)'),
    desc: z.string().describe('Detailed description of the project'),
    img: z.string().optional().describe('Banner image URL'),
    tags: z.array(z.string()).describe('Technology tags, e.g. ["PYTHON", "RAG", "LLM"]'),
    status: z.string().optional().default('ÉLES RENDSZER').describe('Operational status badge (e.g. ÉLES RENDSZER, BEVEZETVE, ARCHIVED)'),
    addr: z.string().optional().default('0xFA').describe('Hex memory address styling badge (e.g. 0x7F, 0x8E)'),
    sec_auth: z.string().optional().default('ZÁRT BELSŐ HÁLÓZAT').describe('Security authorization level badge'),
    sort_order: z.number().optional().default(0).describe('Display order'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async (args) => {
    checkToolRateLimit('create_project');
    const auth = verifyOperationAuth(args.auth_key, 'create_project');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const created = dbService.createProject(args, 'MCP_AGENT');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'PROJECT_INITIALIZED', project: created }, null, 2)
          }
        ]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'update_project',
  'Update an existing project in The Grid by ID.',
  {
    id: z.string().describe('Project ID to update (e.g. PRJ_01)'),
    title: z.string().describe('Updated project title'),
    desc: z.string().describe('Updated description'),
    img: z.string().describe('Updated banner image URL'),
    tags: z.array(z.string()).describe('Updated list of tags'),
    status: z.string().describe('Updated status badge'),
    addr: z.string().describe('Hex address'),
    sec_auth: z.string().describe('Security auth badge'),
    sort_order: z.number().optional().default(0).describe('Sort order'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async (args) => {
    checkToolRateLimit('update_project');
    const auth = verifyOperationAuth(args.auth_key, 'update_project');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const updated = dbService.updateProject(args.id, args, 'MCP_AGENT');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'PROJECT_UPDATED', project: updated }, null, 2)
          }
        ]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'delete_project',
  'Remove a project record from The Grid.',
  {
    id: z.string().describe('Project ID to remove (e.g. PRJ_01)'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ id, auth_key }) => {
    checkToolRateLimit('delete_project');
    const auth = verifyOperationAuth(auth_key, 'delete_project');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const _result = dbService.deleteProject(id, 'MCP_AGENT');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'PROJECT_PURGED', deletedId: id }, null, 2)
          }
        ]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

// =========================================================================
// 3. SKILLS (ARSENAL) TOOLS
// =========================================================================

server.tool(
  'list_skills',
  'List all technical skills and proficiencies in the Arsenal.',
  {},
  async () => {
    checkToolRateLimit('list_skills');
    try {
      const skills = dbService.getSkills();
      return {
        content: [{ type: 'text', text: JSON.stringify(skills, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'upsert_skill',
  'Add a new skill or update an existing skill in the Arsenal.',
  {
    id: z.number().optional().describe('Skill ID if updating, omit when creating'),
    name: z.string().describe('Skill title (e.g. AI & BELSŐ TUDÁSBÁZISOK (RAG))'),
    icon: z.string().optional().default('terminal').describe('Material icon name (e.g. psychology, terminal, query_stats, precision_manufacturing)'),
    color: z.string().optional().default('var(--neon-cyan)').describe('CSS color token (e.g. var(--neon-cyan), var(--neon-magenta), var(--plasma-green))'),
    level: z.string().optional().default('0.95').describe('Decimal level string between 0.00 and 1.00 (e.g. 0.95)'),
    desc: z.string().describe('Detailed technical capability description'),
    sort_order: z.number().optional().default(0).describe('Sort priority order'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async (args) => {
    checkToolRateLimit('upsert_skill');
    const auth = verifyOperationAuth(args.auth_key, 'upsert_skill');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      let result;
      if (args.id) {
        result = dbService.updateSkill(args.id, args, 'MCP_AGENT');
      } else {
        result = dbService.createSkill(args, 'MCP_AGENT');
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'SKILL_SYNCHRONIZED', skill: result }, null, 2)
          }
        ]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'delete_skill',
  'Delete a skill entry from the Arsenal by ID.',
  {
    id: z.number().describe('The numeric ID of the skill to delete'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ id, auth_key }) => {
    checkToolRateLimit('delete_skill');
    const auth = verifyOperationAuth(auth_key, 'delete_skill');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const result = dbService.deleteSkill(id, 'MCP_AGENT');
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

// =========================================================================
// 4. BLOG & SYSTEM LOGS TOOLS
// =========================================================================

server.tool(
  'list_blog_posts',
  'List all blog posts and system articles with summary, read time, date and publish state.',
  {
    published_only: z.boolean().optional().default(false).describe('If true, filters only published articles')
  },
  async ({ published_only }) => {
    checkToolRateLimit('list_blog_posts');
    try {
      const posts = dbService.getBlogPosts({ publishedOnly: published_only });
      return {
        content: [{ type: 'text', text: JSON.stringify(posts, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'get_blog_post',
  'Get full Markdown content and metadata for a single blog post by its URL slug.',
  {
    slug: z.string().describe('URL slug of the article (e.g. vallalati-ai-adatbiztonsag-rag)')
  },
  async ({ slug }) => {
    checkToolRateLimit('get_blog_post');
    try {
      const post = dbService.getBlogPostBySlug(slug, false);
      if (!post) {
        return { isError: true, content: [{ type: 'text', text: `POST_NOT_FOUND: ${slug}` }] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(post, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'publish_blog_post',
  'Disabled: author Markdown content in the canonical server-side Obsidian vault instead.',
  {
    title: z.string().describe('Title of the article'),
    summary: z.string().describe('Short 1-2 sentence preview summary'),
    content: z.string().describe('Full body content formatted in Markdown'),
    category: z.string().optional().default('ADATBIZTONSÁG').describe('Category label (e.g. ADATBIZTONSÁG, AUTOMATIZÁLÁS, AI MÓDSZERTAN)'),
    read_time: z.string().optional().default('4 PERC').describe('Estimated read time (e.g. 3 PERC, 5 PERC)'),
    slug: z.string().optional().describe('Custom URL slug (auto-generated from title if omitted)'),
    published: z.boolean().optional().default(true).describe('Publish immediately (true) or save as draft (false)'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async (args) => {
    checkToolRateLimit('publish_blog_post');
    const auth = verifyOperationAuth(args.auth_key, 'publish_blog_post');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    return localVaultAuthoritativeToolError();
  }
);

server.tool(
  'update_blog_post',
  'Disabled: edit the matching Markdown file in the canonical server-side Obsidian vault instead.',
  {
    id: z.number().describe('Numeric ID of the post to update'),
    title: z.string().describe('Updated article title'),
    summary: z.string().describe('Updated summary'),
    content: z.string().describe('Updated Markdown body content'),
    category: z.string().describe('Updated category badge'),
    read_time: z.string().describe('Updated read time'),
    slug: z.string().describe('Article slug'),
    published: z.boolean().describe('Published status (true/false)'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async (args) => {
    checkToolRateLimit('update_blog_post');
    const auth = verifyOperationAuth(args.auth_key, 'update_blog_post');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    return localVaultAuthoritativeToolError();
  }
);

server.tool(
  'delete_blog_post',
  'Disabled: archive or remove the Markdown file in the canonical server-side Obsidian vault instead.',
  {
    id: z.number().describe('Numeric ID of the article to delete'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ auth_key }) => {
    checkToolRateLimit('delete_blog_post');
    const auth = verifyOperationAuth(auth_key, 'delete_blog_post');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    return localVaultAuthoritativeToolError();
  }
);

// =========================================================================
// 4.5. KNOWLEDGE BASE & RAG TOOLS (Search, Read, Upload, Edit, Delete)
// =========================================================================

server.tool(
  'search_knowledge',
  'Search every canonical document profile using hybrid FTS5 full-text and 128-dimensional vector cosine similarity. `content_type` remains a legacy alias; use `presentation_profile` only when a reader-view filter is needed.',
  {
    query: z.string().describe('Search query, technical concept, or question'),
    content_type: z.enum(['knowledge', 'blog', 'all']).optional().default('all').describe('Legacy portal projection filter; default searches all documents'),
    presentation_profile: z.enum(['knowledge', 'article', 'blog', 'all']).optional().describe('Optional display-profile filter; `blog` is an alias for `article`'),
    project_id: z.string().optional().describe('Optional filter by knowledge project ID (e.g. prj_spaceos, prj_nexus)'),
    category: z.string().optional().describe('Optional category filter'),
    limit: z.number().optional().default(10).describe('Max results to return')
  },
  async ({ query, content_type, presentation_profile, project_id, category, limit }) => {
    checkToolRateLimit('search_knowledge');
    try {
      const filter = resolveMcpDocumentFilter({
        contentType: content_type,
        presentationProfile: presentation_profile
      });
      const requestedLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
      // `searchKnowledge` is the shared document retrieval engine. It is
      // deliberately used with `all` by default rather than performing two
      // independent Blog/Knowledge queries that can drift in score and scope.
      const candidates = dbService.searchKnowledge({
        query,
        contentType: filter.contentType,
        presentationProfile: filter.presentationProfile,
        projectId: project_id,
        limit: category ? Math.min(requestedLimit * 10, 250) : requestedLimit,
        publishedOnly: true,
        visibility: 'public'
      });
      const normalizedCategory = String(category ?? '').trim();
      const results = normalizedCategory
        ? candidates.filter(document => document.category === normalizedCategory).slice(0, requestedLimit)
        : candidates;
      return {
        content: [{ type: 'text', text: JSON.stringify({
          count: results.length,
          query,
          filters: {
            content_type: filter.contentType,
            presentation_profile: filter.presentationProfile || 'all',
            project_id: project_id || null,
            category: normalizedCategory || null
          },
          results
        }, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'get_knowledge_article',
  'Retrieve full Markdown content, frontmatter dimensions, and metadata of one canonical document by slug. The legacy tool name remains for agent compatibility.',
  {
    slug: z.string().describe('The URL slug of the canonical document'),
    presentation_profile: z.enum(['knowledge', 'article', 'blog', 'all']).optional().describe('Optional display-profile filter; `blog` is an alias for `article`')
  },
  async ({ slug, presentation_profile }) => {
    checkToolRateLimit('get_knowledge_article');
    try {
      const article = dbService.getBlogPostBySlug(slug, { publishedOnly: true, visibility: 'public' });
      const filter = resolveMcpDocumentFilter({ presentationProfile: presentation_profile });
      const actualPresentation = article
        ? resolveDocumentPresentation({
          presentationProfile: article.presentation_profile,
          contentType: article.content_type,
          fallbackProfile: 'article'
        })
        : null;
      if (!article || (filter.presentationProfile && actualPresentation.presentation_profile !== filter.presentationProfile)) {
        return { isError: true, content: [{ type: 'text', text: `ARTICLE_NOT_FOUND: ${slug}` }] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(article, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'publish_knowledge_article',
  'Disabled: author the knowledge Markdown and Obsidian frontmatter in the canonical server-side vault instead.',
  {
    title: z.string().describe('Title of the knowledge article'),
    summary: z.string().describe('Short 1-2 sentence preview summary'),
    content: z.string().describe('Full Markdown body content'),
    project_id: z.string().optional().default('prj_general').describe('Target project workspace ID (e.g. prj_nexus, prj_joinerytech)'),
    category: z.string().optional().default('ZÁRT VÁLLALATI RAG').describe('Category taxonomy label'),
    dimensions: z.object({
      iparag: z.array(z.string()).optional(),
      technologia: z.array(z.string()).optional(),
      celcsoport: z.array(z.string()).optional()
    }).optional().describe('Polihierarchical taxonomy dimensions'),
    read_time: z.string().optional().default('5 PERC').describe('Estimated read time'),
    slug: z.string().optional().describe('Custom slug (auto-generated if omitted)'),
    visibility: z.enum(['public', 'private']).optional().default('public').describe('Visibility level'),
    published: z.boolean().optional().default(true).describe('Publish immediately (true) or draft (false)'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async (args) => {
    checkToolRateLimit('publish_knowledge_article');
    const auth = verifyOperationAuth(args.auth_key, 'publish_knowledge_article');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    return localVaultAuthoritativeToolError();
  }
);

server.tool(
  'update_knowledge_article',
  'Disabled: edit and re-index the matching Markdown file in the canonical server-side vault instead.',
  {
    id: z.number().describe('Numeric ID of the article to update'),
    title: z.string().optional().describe('Updated title'),
    summary: z.string().optional().describe('Updated summary'),
    content: z.string().optional().describe('Updated Markdown content'),
    project_id: z.string().optional().describe('Updated project ID'),
    category: z.string().optional().describe('Updated category'),
    dimensions: z.object({
      iparag: z.array(z.string()).optional(),
      technologia: z.array(z.string()).optional(),
      celcsoport: z.array(z.string()).optional()
    }).optional().describe('Updated taxonomy dimensions'),
    read_time: z.string().optional().describe('Updated read time'),
    published: z.boolean().optional().describe('Published status'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async (args) => {
    checkToolRateLimit('update_knowledge_article');
    const auth = verifyOperationAuth(args.auth_key, 'update_knowledge_article');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    return localVaultAuthoritativeToolError();
  }
);

server.tool(
  'delete_knowledge_article',
  'Disabled: archive or remove the Markdown file in the canonical server-side vault instead.',
  {
    id: z.number().describe('Numeric ID of the knowledge article to delete'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ auth_key }) => {
    checkToolRateLimit('delete_knowledge_article');
    const auth = verifyOperationAuth(auth_key, 'delete_knowledge_article');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    return localVaultAuthoritativeToolError();
  }
);

server.tool(
  'list_knowledge_projects',
  'List all knowledge workspaces/projects (e.g. SpaceOS Nexus, DocCapture, JoineryTech, Cyber-Architect) with document counts.',
  {},
  async () => {
    checkToolRateLimit('list_knowledge_projects');
    try {
      const projects = dbService.getKnowledgeProjects({ visibility: 'public' });
      return {
        content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'get_architecture_blueprint',
  'Get the full technical architecture blueprint and 6-step RAG pipeline specifications of the Cyber-Architect system.',
  {},
  async () => {
    checkToolRateLimit('get_architecture_blueprint');
    try {
      const blueprint = {
        platform: 'SZANTOI.HU // CYBER-ARCHITECT KNOWLEDGE PLATFORM',
        principles: [
          'Air-gapped & Local RAG First (Zero Data Leakage)',
          'Zero Raw Query Policy (Strictly Parameterized SQLite Prepared Statements)',
          'Multi-Tier Memory (FTS5 BM25 + 128D Dense Vector Similarity)',
          'Clean Architecture & Modular Pod Separation',
          'Deterministic CLI and Agentic First MCP Gateway'
        ],
        rag_pipeline: {
          step_1: 'Ingestion & Normalization (Markdown Frontmatter parsing)',
          step_2: 'FTS5 Indexing & Tokenization (Trigram & Unicode61 tokenizers)',
          step_3: 'Semantic Dense Vector Generation (128-dimensional embedding)',
          step_4: 'Hybrid Query Matching (BM25 Lexical + Cosine Similarity scoring)',
          step_5: 'Context Re-ranking & Deduplication',
          step_6: 'Explainable XAI Highlight Generation & Citation Binding'
        },
        storage: 'SQLite 3 with Write-Ahead Logging (WAL) and synchronous=NORMAL'
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(blueprint, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'get_system_health',
  'Get real-time operational health, SQLite database metrics, WAL statistics and uptime.',
  {},
  async () => {
    checkToolRateLimit('get_system_health');
    try {
      const stats = dbService.getDbStats();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'HEALTHY',
            mode: 'WAL',
            timestamp: new Date().toISOString(),
            stats
          }, null, 2)
        }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'create_message_uplink',
  'Transmit a new contact or project inquiry to Szántói Gábor on behalf of an external AI agent or client.',
  {
    identity: z.string().describe('Agent or sender name / identity'),
    subject: z.string().describe('Subject or project topic'),
    message: z.string().describe('Detailed inquiry message')
  },
  async ({ identity, subject, message }) => {
    checkToolRateLimit('create_message_uplink');
    try {
      const result = dbService.createMessage({
        identity: `[AGENT] ${identity}`,
        subject,
        message
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'TRANSMISSION_DELIVERED', messageId: result.id }, null, 2)
          }
        ]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

// =========================================================================
// 5. INBOUND UPLINK MESSAGES TOOLS (Requires Auth)
// =========================================================================

server.tool(
  'get_inbound_messages',
  'Retrieve all received contact inquiries transmitted through the Uplink terminal (Requires Admin Authorization).',
  {
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ auth_key }) => {
    checkToolRateLimit('get_inbound_messages');
    const auth = verifyOperationAuth(auth_key, 'get_inbound_messages');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const messages = dbService.getMessages();
      return {
        content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

server.tool(
  'mark_message_read',
  'Mark an inbound Uplink message as read or unread.',
  {
    id: z.number().describe('Message ID'),
    read_status: z.number().optional().default(1).describe('1 for read, 0 for unread'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ id, read_status, auth_key }) => {
    checkToolRateLimit('mark_message_read');
    const auth = verifyOperationAuth(auth_key, 'mark_message_read');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const result = dbService.markMessageRead(id, read_status);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

// =========================================================================
// 6. ROLLBACK & CHANGE REVERSION TOOLS (Requires Auth)
// =========================================================================

server.tool(
  'rollback_change',
  'Revert a previous modification using its Audit Log ID (Requires Admin Auth).',
  {
    audit_id: z.number().describe('The numeric ID of the audit log record to revert'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ audit_id, auth_key }) => {
    checkToolRateLimit('rollback_change');
    const auth = verifyOperationAuth(auth_key, 'rollback_change');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const result = dbService.rollbackAuditEntry(audit_id, 'MCP_AGENT');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'ROLLBACK_EXECUTED', audit_id, result }, null, 2)
          }
        ]
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `ERROR: ${err.message}` }] };
    }
  }
);

// =========================================================================
// 7. MCP RESOURCES (Live Read-Only Endpoints)
// =========================================================================

server.resource(
  'settings',
  'site://settings',
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(dbService.getPublicSettings(), null, 2),
        mimeType: 'application/json'
      }
    ]
  })
);

server.resource(
  'projects',
  'site://projects',
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(dbService.getProjects(), null, 2),
        mimeType: 'application/json'
      }
    ]
  })
);

server.resource(
  'skills',
  'site://skills',
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(dbService.getSkills(), null, 2),
        mimeType: 'application/json'
      }
    ]
  })
);

server.resource(
  'blog_posts',
  'site://blog/posts',
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(dbService.getBlogPosts({ publishedOnly: true }), null, 2),
        mimeType: 'application/json'
      }
    ]
  })
);

// =========================================================================
// 8. MULTI-AGENT COMMUNICATION & AUDITED HANDOFF TOOLS
// =========================================================================

server.tool(
  'send_agent_message',
  'Send a fast, audited Markdown-formatted message or task handoff to another agent terminal or broadcast channel without polluting the filesystem with temp files.',
  {
    sender: z.string().describe('Sending agent terminal identity (e.g. root, conductor, frontend, backend, qa, antigravity, agentic, copywriter)'),
    recipient: z.string().describe('Target terminal identity or "all" for broadcast channel'),
    subject: z.string().describe('Subject or title of the handoff/message'),
    body: z.string().describe('Rich Markdown-formatted content, task instructions, code snippets, or acceptance criteria'),
    message_type: z.enum(['handoff', 'channel_post', 'status_alert', 'task_dispatch']).default('handoff').describe('Type of the message'),
    related_link: z.string().optional().describe('Optional relative path or reference URL to a related file/task'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ sender, recipient, subject, body, message_type, related_link, auth_key }) => {
    checkToolRateLimit('send_agent_message');
    const auth = verifyOperationAuth(auth_key, 'send_agent_message');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const msg = dbService.sendAgentMessage({
        sender,
        recipient,
        subject,
        body,
        message_type: message_type || 'handoff',
        related_link: related_link || ''
      }, `MCP_${sender.toUpperCase()}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'AGENT_MESSAGE_SENT', data: msg }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

server.tool(
  'get_agent_inbox',
  'Fetch messages and task handoffs from the SQLite inbox for a specific agent terminal.',
  {
    terminal: z.string().describe('Agent terminal identity (e.g. frontend, backend, conductor, antigravity)'),
    status: z.enum(['unread', 'read', 'archived', 'all']).default('all').describe('Filter by message status'),
    limit: z.number().default(50).describe('Max number of messages to return')
  },
  async ({ terminal, status, limit }) => {
    checkToolRateLimit('get_agent_inbox');
    try {
      const messages = dbService.getAgentInbox({ terminal, status: status || 'all', limit: limit || 50 });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: messages.length, terminal, status: status || 'all', messages }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

server.tool(
  'get_agent_channel',
  'Retrieve public broadcast messages and channel notices from the agent coordination board.',
  {
    limit: z.number().default(50).describe('Max number of channel messages to return')
  },
  async ({ limit }) => {
    checkToolRateLimit('get_agent_channel');
    try {
      const channel = dbService.getAgentChannel({ limit: limit || 50 });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: channel.length, channel }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

server.tool(
  'update_agent_message_status',
  'Mark an agent message as read or archived after processing.',
  {
    message_id: z.number().describe('ID of the agent message to update'),
    status: z.enum(['unread', 'read', 'archived']).describe('New status for the message'),
    terminal: z.string().optional().describe('Terminal identity performing the update'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ message_id, status, terminal, auth_key }) => {
    checkToolRateLimit('update_agent_message_status');
    const auth = verifyOperationAuth(auth_key, 'update_agent_message_status');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const updated = dbService.updateAgentMessageStatus({
        message_id,
        terminal: terminal || 'AGENT',
        status
      }, `MCP_${(terminal || 'AGENT').toUpperCase()}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: `MESSAGE_STATUS_${status.toUpperCase()}`, data: updated }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

server.tool(
  'get_agent_message_audit',
  'Inspect the immutable audit log trail of all agent communications and handoffs.',
  {
    agent: z.string().optional().describe('Optional specific agent name to filter audit logs'),
    limit: z.number().default(50).describe('Max number of audit records to return')
  },
  async ({ agent, limit }) => {
    checkToolRateLimit('get_agent_message_audit');
    try {
      const logs = dbService.getAgentMessageAudit({ agent, limit: limit || 50 });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: logs.length, agent: agent || 'ALL', logs }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

server.tool(
  'get_agent_message_stats',
  'Get aggregated inbox stats (unread, read, archived) across all terminals.',
  {},
  async () => {
    checkToolRateLimit('get_agent_message_stats');
    try {
      const stats = dbService.getAgentMessageStats();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ stats }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

// =========================================================================
// 9. ORGANIZATIONAL MATRIX & MULTI-AGENT ROUTING TOOLS
// =========================================================================

server.tool(
  'get_organization_chart',
  'Retrieve the complete multi-agent organizational structure, pod hierarchies, team leads and routing matrix.',
  {},
  async () => {
    checkToolRateLimit('get_organization_chart');
    try {
      const orgChart = dbService.getOrganizationChart();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(orgChart, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

server.tool(
  'register_terminal',
  'Register a new specialist agent terminal in the organizational matrix and initialize its physical workspace.',
  {
    id: z.string().describe('Unique terminal identifier (e.g. "seo", "security-auditor")'),
    name: z.string().describe('Human readable role name'),
    pod: z.enum(['Executive', 'Engineering', 'Marketing', 'AgentOps']).default('Engineering').describe('Organizational Pod/Team'),
    lead_id: z.string().optional().describe('ID of the team lead or superior terminal'),
    icon: z.string().optional().default('terminal').describe('Material symbol icon name'),
    color: z.string().optional().default('#00FFFF').describe('Hex or CSS color'),
    role_description: z.string().describe('Primary mission and boundaries of the terminal'),
    responsibilities: z.array(z.string()).optional().describe('List of key responsibilities'),
    delegates_to: z.array(z.string()).optional().describe('List of peer or subordinate terminal IDs this terminal can delegate to'),
    auth_key: z.string().optional().describe('Admin authorization PIN or API key')
  },
  async ({ id, name, pod, lead_id, icon, color, role_description, responsibilities, delegates_to, auth_key }) => {
    checkToolRateLimit('register_terminal');
    const auth = verifyOperationAuth(auth_key, 'register_terminal');
    if (!auth.authorized) {
      return { isError: true, content: [{ type: 'text', text: auth.error }] };
    }

    try {
      const created = dbService.createTerminal({
        id,
        name,
        pod,
        lead_id,
        icon,
        color,
        role_description,
        responsibilities: responsibilities || [],
        delegates_to: delegates_to || []
      }, 'MCP_AGENT');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, message: 'TERMINAL_REGISTERED', data: created }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `ERROR: ${err.message}` }]
      };
    }
  }
);

// =========================================================================
// SERVER STARTUP VIA STDIO TRANSPORT
// =========================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stdio transport connects to standard in/out for seamless integration with LLMs
}

main().catch((err) => {
  console.error('FATAL_MCP_SERVER_ERROR:', err);
  process.exit(1);
});

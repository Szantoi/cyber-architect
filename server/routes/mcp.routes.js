import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

export const mcpRouter = Router();

// 1. Agent Discovery Manifest
mcpRouter.get('/manifest', (req, res) => {
  const baseUrl = req.get('host') ? `${req.protocol}://${req.get('host')}` : config.siteUrl;
  
  res.json({
    name: 'cyber-architect-portfolio-mcp',
    version: '1.0.0',
    description: 'Szántói Gábor // Cyber-Architect Model Context Protocol (MCP) Server & Knowledge Engine',
    protocol_version: '2024-11-05',
    author: 'Szántói Gábor',
    website: config.siteUrl,
    server_transport: {
      stdio: {
        command: 'node',
        args: ['server/mcp/server.js']
      },
      sse: {
        endpoint: `${baseUrl}/api/sse`,
        messages_endpoint: `${baseUrl}/api/uplink`
      },
      http: {
        endpoint: `${baseUrl}/api`
      }
    },
    security: {
      public_access: 'READ_ONLY_SEARCH (No Authentication Required)',
      authenticated_agent: 'FULL_READ_WRITE (Requires PORTFOLIO_API_KEY / MCP_AUTH_KEY / ADMIN_PIN)'
    },
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
      logging: true
    },
    quick_start: {
      public_guest_agent: {
        description: "Public read-only search & knowledge retrieval (no credentials needed)",
        claude_desktop_config: {
          mcpServers: {
            "cyber-architect-public": {
              command: "node",
              args: ["server/mcp/server.js"]
            }
          }
        }
      },
      authenticated_admin_agent: {
        description: "Authenticated agent with publish, edit, and system management privileges",
        claude_desktop_config: {
          mcpServers: {
            "cyber-architect-admin": {
              command: "node",
              args: ["server/mcp/server.js"],
              env: {
                PORTFOLIO_API_KEY: "your_secret_admin_key"
              }
            }
          }
        }
      },
      agent_instruction: "You are connected to Szántói Gábor's Cyber-Architect Knowledge Platform. Use 'search_knowledge' to query engineering articles and 'list_projects' to inspect active systems."
    }
  });
});

// 2. Machine-readable Tool Registry
mcpRouter.get('/tools', (req, res) => {
  try {
    const tools = [
      // ── READ / QUERY TOOLS ──
      {
        name: 'search_knowledge',
        type: 'READ / RAG',
        description: 'Search the closed corporate Knowledge Base and Blog using hybrid FTS5 and vector cosine similarity.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term or technical concept' },
            content_type: { type: 'string', enum: ['knowledge', 'blog', 'all'], description: 'Content type filter' },
            project_id: { type: 'string', description: 'Optional project workspace filter' },
            category: { type: 'string', description: 'Optional category filter' },
            limit: { type: 'number', description: 'Max results to return (default: 10)' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_knowledge_article',
        type: 'READ / DOC',
        description: 'Fetch full markdown content, frontmatter dimensions and metadata of a knowledge article by slug.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'The unique slug identifier of the article' }
          },
          required: ['slug']
        }
      },
      {
        name: 'list_knowledge_projects',
        type: 'READ / WORKSPACE',
        description: 'List all knowledge workspaces/projects (SpaceOS, DocCapture, JoineryTech, Cyber-Architect).',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'list_projects',
        type: 'READ / PORTFOLIO',
        description: 'List all active engineering lab projects, GitHub repositories, and their production status.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'list_blog_posts',
        type: 'READ / BLOG',
        description: 'List all published blog posts, case studies, and managerial summaries.',
        inputSchema: {
          type: 'object',
          properties: {
            published_only: { type: 'boolean', description: 'Filter only published posts' }
          }
        }
      },
      {
        name: 'get_architecture_blueprint',
        type: 'READ / BLUEPRINT',
        description: 'Get full technical specification and 6-step RAG pipeline blueprint of the Cyber-Architect platform.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'get_system_health',
        type: 'READ / DIAGNOSTICS',
        description: 'Get health diagnostics, SQLite WAL statistics, database integrity status and uptime.',
        inputSchema: { type: 'object', properties: {} }
      },
      // ── COMMUNICATION INQUIRY ──
      {
        name: 'create_message_uplink',
        type: 'TRANSMIT / INQUIRY',
        description: 'Transmit a direct inquiry or collaboration request to Szántói Gábor on behalf of an external AI agent.',
        inputSchema: {
          type: 'object',
          properties: {
            identity: { type: 'string', description: 'Agent identity or company name' },
            subject: { type: 'string', description: 'Subject or inquiry topic' },
            message: { type: 'string', description: 'The message body' }
          },
          required: ['identity', 'message']
        }
      }
    ];

    res.json({ success: true, count: tools.length, tools });
  } catch (err) {
    logger.error('Error fetching MCP tools', err);
    res.status(500).json({ error: 'MCP_TOOLS_FETCH_FAILED' });
  }
});

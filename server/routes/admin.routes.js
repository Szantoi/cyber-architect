import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';
import { authMiddleware, generateAdminToken } from '../security/auth.js';
import { authLimiter } from '../security/rateLimiter.js';
import driveSyncService from '../services/driveSyncService.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, updatePinSchema } from '../schemas/auth.schema.js';
import { settingsSchema } from '../schemas/settings.schema.js';

export const adminRouter = Router();

// 1. Admin Authentication (Brute-Force Protected & Zod Validated)
adminRouter.post('/admin/login', authLimiter, validateBody(loginSchema), (req, res) => {
  const { pin } = req.body;

  if (pin && dbService.verifyPin(pin)) {
    const token = generateAdminToken({ role: 'OVERSEER_ADMIN', timestamp: Date.now() });
    logger.security('ADMIN_LOGIN_SUCCESS', { ip: req.ip });
    return res.json({ success: true, token, role: 'OVERSEER_ADMIN' });
  }

  logger.security('ADMIN_LOGIN_FAILED', { ip: req.ip });
  res.status(401).json({ error: 'SECURITY_AUTH_FAILED: ACCESS_DENIED' });
});

adminRouter.post('/admin/verify', authMiddleware, (req, res) => {
  res.json({ success: true, status: 'TOKEN_VALID', user: req.adminUser });
});

// 2. Global Settings
adminRouter.get('/admin/settings', authMiddleware, (req, res) => {
  try {
    const settings = dbService.getSettings();
    res.json(settings);
  } catch (err) {
    logger.error('Failed to fetch settings', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

adminRouter.put('/admin/settings', authMiddleware, validateBody(settingsSchema), (req, res) => {
  try {
    const settings = req.body;
    dbService.updateSettings(settings, 'ADMIN_DASHBOARD');
    logger.info('Global settings updated by admin');
    res.json({ success: true, message: 'SETTINGS_SYNCHRONIZED' });
  } catch (err) {
    logger.error('Failed to update settings', err);
    res.status(500).json({ error: 'UPDATE_FAILED' });
  }
});

// 3. Manage Skills (Arsenal)
adminRouter.post('/admin/skills', authMiddleware, (req, res) => {
  try {
    const { name, icon, color, level, desc, sort_order } = req.body;
    const skill = dbService.createSkill({ name, icon, color, level, desc, sort_order }, 'ADMIN_DASHBOARD');
    logger.info(`Skill created: ${name}`, { id: skill.id });
    res.json({ success: true, id: skill.id });
  } catch (err) {
    logger.error('Failed to insert skill', err);
    res.status(500).json({ error: 'INSERT_FAILED' });
  }
});

adminRouter.put('/admin/skills/:id', authMiddleware, (req, res) => {
  try {
    const { name, icon, color, level, desc, sort_order } = req.body;
    dbService.updateSkill(req.params.id, { name, icon, color, level, desc, sort_order }, 'ADMIN_DASHBOARD');
    logger.info(`Skill updated: #${req.params.id} (${name})`);
    res.json({ success: true, message: 'SKILL_RECORD_UPDATED' });
  } catch (err) {
    logger.error('Failed to update skill', err);
    res.status(500).json({ error: 'UPDATE_FAILED' });
  }
});

adminRouter.delete('/admin/skills/:id', authMiddleware, (req, res) => {
  try {
    dbService.deleteSkill(req.params.id, 'ADMIN_DASHBOARD');
    logger.info(`Skill deleted: #${req.params.id}`);
    res.json({ success: true, message: 'SKILL_RECORD_DELETED' });
  } catch (err) {
    logger.error('Failed to delete skill', err);
    res.status(500).json({ error: 'DELETE_FAILED' });
  }
});

// 4. Manage Projects (The Grid)
adminRouter.post('/admin/projects', authMiddleware, (req, res) => {
  try {
    const { id, title, desc, img, tags, status, addr, sec_auth, sort_order } = req.body;
    const proj = dbService.createProject({ id, title, desc, img, tags, status, addr, sec_auth, sort_order }, 'ADMIN_DASHBOARD');
    logger.info(`Project created: [${proj.id}] ${title}`);
    res.json({ success: true, id: proj.id });
  } catch (err) {
    logger.error('Failed to insert project', err);
    res.status(500).json({ error: 'INSERT_FAILED' });
  }
});

adminRouter.put('/admin/projects/:id', authMiddleware, (req, res) => {
  try {
    const { title, desc, img, tags, status, addr, sec_auth, sort_order } = req.body;
    dbService.updateProject(req.params.id, { title, desc, img, tags, status, addr, sec_auth, sort_order }, 'ADMIN_DASHBOARD');
    logger.info(`Project updated: [${req.params.id}] ${title}`);
    res.json({ success: true, message: 'PROJECT_RECORD_UPDATED' });
  } catch (err) {
    logger.error('Failed to update project', err);
    res.status(500).json({ error: 'UPDATE_FAILED' });
  }
});

adminRouter.delete('/admin/projects/:id', authMiddleware, (req, res) => {
  try {
    dbService.deleteProject(req.params.id, 'ADMIN_DASHBOARD');
    logger.info(`Project deleted: [${req.params.id}]`);
    res.json({ success: true, message: 'PROJECT_RECORD_DELETED' });
  } catch (err) {
    logger.error('Failed to delete project', err);
    res.status(500).json({ error: 'DELETE_FAILED' });
  }
});

// 5. Knowledge Projects Management (Admin View & CRUD)
adminRouter.get('/admin/knowledge/projects', authMiddleware, (req, res) => {
  try {
    const projects = dbService.getKnowledgeProjects({ visibility: 'all' });
    res.json(projects);
  } catch (err) {
    logger.error('Failed to fetch admin knowledge projects', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

adminRouter.post('/admin/knowledge/projects', authMiddleware, (req, res) => {
  try {
    const created = dbService.createKnowledgeProject(req.body, 'ADMIN_DASHBOARD');
    logger.info(`Knowledge project registered: [${created.id}] ${created.name}`);
    res.json({ success: true, project: created });
  } catch (err) {
    logger.error('Failed to create knowledge project', err);
    res.status(500).json({ error: err.message || 'CREATION_FAILED' });
  }
});

adminRouter.put('/admin/knowledge/projects/:id', authMiddleware, (req, res) => {
  try {
    const updated = dbService.updateKnowledgeProject(req.params.id, req.body, 'ADMIN_DASHBOARD');
    logger.info(`Knowledge project updated: [${req.params.id}] ${updated.name}`);
    res.json({ success: true, project: updated });
  } catch (err) {
    logger.error(`Failed to update knowledge project [${req.params.id}]`, err);
    res.status(500).json({ error: err.message || 'UPDATE_FAILED' });
  }
});

adminRouter.delete('/admin/knowledge/projects/:id', authMiddleware, (req, res) => {
  try {
    const result = dbService.deleteKnowledgeProject(req.params.id, 'ADMIN_DASHBOARD');
    logger.info(`Knowledge project deleted: [${req.params.id}]`);
    res.json({ success: true, result });
  } catch (err) {
    logger.error(`Failed to delete knowledge project [${req.params.id}]`, err);
    res.status(500).json({ error: err.message || 'DELETE_FAILED' });
  }
});

adminRouter.get('/admin/knowledge/search', authMiddleware, (req, res) => {
  try {
    const { q, projectId, iparag, technologia, celcsoport, limit } = req.query;
    const results = dbService.searchKnowledge({
      query: q || '',
      projectId: projectId || 'all',
      iparag,
      technologia,
      celcsoport,
      visibility: 'all',
      limit: Number(limit) || 50
    });
    res.json(results);
  } catch (err) {
    logger.error('Failed to execute admin knowledge search', err);
    res.status(500).json({ error: 'SEARCH_QUERY_ERROR' });
  }
});

// 6. Manage Blog Posts & Knowledge Items
adminRouter.get('/admin/blog', authMiddleware, (req, res) => {
  try {
    const { projectId, visibility } = req.query;
    const posts = dbService.getBlogPosts({
      publishedOnly: false,
      visibility: visibility || 'all',
      projectId: projectId || 'all'
    });
    res.json(posts);
  } catch (err) {
    logger.error('Failed to fetch admin blog posts', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

adminRouter.post('/admin/blog', authMiddleware, async (req, res) => {
  try {
    const { project_id, slug, title, summary, content, category, dimensions, visibility, audio_url, read_time, published } = req.body;
    const post = dbService.createBlogPost({
      project_id,
      slug,
      title,
      summary,
      content,
      category,
      dimensions,
      visibility,
      audio_url,
      read_time,
      published
    }, 'ADMIN_DASHBOARD');

    driveSyncService.exportPostToDrive(post).then(driveResult => {
      if (driveResult && driveResult.drive_file_id) {
        dbService.updateBlogPost(post.id, {
          drive_file_id: driveResult.drive_file_id,
          drive_modified_time: driveResult.drive_modified_time
        }, 'DRIVE_EXPORT_SYNC');
      }
    }).catch(err => logger.error('[DRIVE_EXPORT_BACKGROUND_ERROR]', err));

    logger.info(`Blog post created & queued for Drive sync: "${title}" (/${post.slug})`);
    res.json({ success: true, id: post.id, slug: post.slug });
  } catch (err) {
    logger.error('Error inserting blog post', err);
    res.status(500).json({ error: 'INSERT_FAILED' });
  }
});

adminRouter.put('/admin/blog/:id', authMiddleware, async (req, res) => {
  try {
    const { project_id, title, summary, content, category, dimensions, visibility, audio_url, read_time, published, slug } = req.body;
    const updated = dbService.updateBlogPost(req.params.id, {
      project_id,
      title,
      summary,
      content,
      category,
      dimensions,
      visibility,
      audio_url,
      read_time,
      published,
      slug
    }, 'ADMIN_DASHBOARD');

    driveSyncService.exportPostToDrive(updated).then(driveResult => {
      if (driveResult && driveResult.drive_file_id) {
        dbService.updateBlogPost(updated.id, {
          drive_file_id: driveResult.drive_file_id,
          drive_modified_time: driveResult.drive_modified_time
        }, 'DRIVE_EXPORT_SYNC');
      }
    }).catch(err => logger.error('[DRIVE_EXPORT_BACKGROUND_ERROR]', err));

    logger.info(`Blog post updated & synced to Drive: #${req.params.id} ("${title}")`);
    res.json({ success: true, message: 'BLOG_POST_UPDATED' });
  } catch (err) {
    logger.error('Failed to update blog post', err);
    res.status(500).json({ error: 'UPDATE_FAILED' });
  }
});

adminRouter.delete('/admin/blog/:id', authMiddleware, (req, res) => {
  try {
    dbService.deleteBlogPost(req.params.id, 'ADMIN_DASHBOARD');
    logger.info(`Blog post deleted: #${req.params.id}`);
    res.json({ success: true, message: 'BLOG_POST_DELETED' });
  } catch (err) {
    logger.error('Failed to delete blog post', err);
    res.status(500).json({ error: 'DELETE_FAILED' });
  }
});

// 7. Manage Messages
adminRouter.get('/admin/messages', authMiddleware, (req, res) => {
  try {
    const messages = dbService.getMessages();
    res.json(messages);
  } catch (err) {
    logger.error('Failed to fetch messages', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

adminRouter.put('/admin/messages/:id/read', authMiddleware, (req, res) => {
  try {
    dbService.markMessageRead(req.params.id, 1);
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to mark message as read', err);
    res.status(500).json({ error: 'UPDATE_FAILED' });
  }
});

adminRouter.delete('/admin/messages/:id', authMiddleware, (req, res) => {
  try {
    dbService.deleteMessage(req.params.id);
    logger.info(`Message purged: #${req.params.id}`);
    res.json({ success: true, message: 'MESSAGE_DELETED' });
  } catch (err) {
    logger.error('Failed to delete message', err);
    res.status(500).json({ error: 'DELETE_FAILED' });
  }
});

// 8. Update PIN
adminRouter.put('/admin/pin', authMiddleware, validateBody(updatePinSchema), (req, res) => {
  try {
    const { pin } = req.body;
    dbService.updatePin(pin, 'ADMIN_DASHBOARD');
    logger.security('ADMIN_PIN_UPDATED', { ip: req.ip });
    res.json({ success: true, message: 'SECURITY_PIN_UPDATED' });
  } catch (err) {
    logger.error('Failed to update PIN', err);
    res.status(500).json({ error: err.message || 'UPDATE_FAILED' });
  }
});

// 9. Audit Trail Logs & Rollback
adminRouter.get('/admin/audit', authMiddleware, (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const entity = req.query.entity || null;
    const action = req.query.action || null;
    const logs = dbService.getAuditLogs({ limit, entity, action });
    res.json(logs);
  } catch (err) {
    logger.error('Failed to fetch audit logs', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

adminRouter.post('/admin/audit/:id/rollback', authMiddleware, (req, res) => {
  try {
    const result = dbService.rollbackAuditEntry(req.params.id, 'ADMIN_DASHBOARD');
    logger.info(`Rollback executed for audit log #${req.params.id}`);
    res.json({ success: true, message: 'ROLLBACK_EXECUTED', result });
  } catch (err) {
    logger.error(`Rollback failed for audit #${req.params.id}`, err);
    res.status(500).json({ error: err.message || 'ROLLBACK_FAILED' });
  }
});

// 10. Agent API Key & Token Registration
adminRouter.get('/admin/agent-keys', authMiddleware, (req, res) => {
  try {
    const keys = dbService.getAgentApiKeys();
    res.json({ success: true, count: keys.length, keys });
  } catch (err) {
    logger.error('Failed to fetch agent API keys', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

adminRouter.post('/admin/agent-keys', authMiddleware, (req, res) => {
  try {
    const { agent_name, role, permissions } = req.body;
    if (!agent_name) return res.status(400).json({ error: 'MISSING_AGENT_NAME' });

    const newKey = dbService.generateAgentApiKey({ agent_name, role, permissions }, 'ADMIN_DASHBOARD');
    logger.security(`AGENT_KEY_ISSUED: ${agent_name}`, { id: newKey.id, role });
    res.json({ success: true, message: 'AGENT_API_KEY_GENERATED', key: newKey });
  } catch (err) {
    logger.error('Failed to generate agent key', err);
    res.status(500).json({ error: err.message || 'KEY_GENERATION_FAILED' });
  }
});

adminRouter.post('/admin/agent-keys/:id/revoke', authMiddleware, (req, res) => {
  try {
    const result = dbService.revokeAgentApiKey(req.params.id, 'ADMIN_DASHBOARD');
    logger.security(`AGENT_KEY_REVOKED: #${req.params.id}`);
    res.json(result);
  } catch (err) {
    logger.error('Failed to revoke agent key', err);
    res.status(500).json({ error: err.message || 'KEY_REVOCATION_FAILED' });
  }
});


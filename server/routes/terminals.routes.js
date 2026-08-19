import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';
import { authMiddleware } from '../security/auth.js';
import { validateBody } from '../middleware/validate.js';
import { terminalSchema } from '../schemas/terminal.schema.js';

export const terminalsRouter = Router();

// 1. Agent Messages & Handoff Communication
terminalsRouter.get('/admin/agent-messages', authMiddleware, (req, res) => {
  try {
    const { terminal, status, limit } = req.query;
    let messages;
    if (terminal && terminal !== 'all') {
      messages = dbService.getAgentInbox({ terminal, status: status || 'all', limit: Number(limit) || 100 });
    } else if (status === 'channel') {
      messages = dbService.getAgentChannel({ limit: Number(limit) || 100 });
    } else {
      messages = dbService.getAllAgentMessages({ status: status || 'all', limit: Number(limit) || 100 });
    }
    const stats = dbService.getAgentMessageStats();
    res.json({ messages, stats });
  } catch (err) {
    logger.error('Failed to fetch agent messages', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

terminalsRouter.post('/admin/agent-messages', authMiddleware, (req, res) => {
  try {
    const { sender, recipient, subject, body, message_type, related_link } = req.body;
    const msg = dbService.sendAgentMessage({
      sender,
      recipient,
      subject,
      body,
      message_type,
      related_link
    }, 'ADMIN_DASHBOARD');
    logger.info(`Agent message transmitted: #${msg.id} (@${sender} -> @${recipient})`);
    res.json({ success: true, message: 'AGENT_MESSAGE_SENT', data: msg });
  } catch (err) {
    logger.error('Failed to send agent message', err);
    res.status(500).json({ error: err.message || 'TRANSMISSION_FAILED' });
  }
});

terminalsRouter.put('/admin/agent-messages/:id/status', authMiddleware, (req, res) => {
  try {
    const { status, terminal } = req.body;
    const updated = dbService.updateAgentMessageStatus({
      message_id: req.params.id,
      terminal: terminal || 'ADMIN',
      status
    }, 'ADMIN_DASHBOARD');
    logger.info(`Agent message #${req.params.id} status updated to ${status}`);
    res.json({ success: true, message: 'STATUS_UPDATED', data: updated });
  } catch (err) {
    logger.error(`Failed to update agent message #${req.params.id}`, err);
    res.status(500).json({ error: err.message || 'UPDATE_FAILED' });
  }
});

terminalsRouter.delete('/admin/agent-messages/:id', authMiddleware, (req, res) => {
  try {
    const deleted = dbService.deleteAgentMessage(req.params.id, 'ADMIN_DASHBOARD');
    if (!deleted) {
      return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
    }
    logger.info(`Agent message #${req.params.id} deleted from inbox`);
    res.json({ success: true, message: 'MESSAGE_DELETED', data: deleted });
  } catch (err) {
    logger.error(`Failed to delete agent message #${req.params.id}`, err);
    res.status(500).json({ error: err.message || 'DELETE_FAILED' });
  }
});

// 2. Organizational Matrix & Terminal Management
terminalsRouter.get('/admin/terminals', authMiddleware, (req, res) => {
  try {
    const { pod, status } = req.query;
    const terminals = dbService.getTerminals({ pod, status });
    const orgChart = dbService.getOrganizationChart();
    res.json({ terminals, orgChart });
  } catch (err) {
    logger.error('Failed to fetch terminals', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

terminalsRouter.post('/admin/terminals', authMiddleware, validateBody(terminalSchema), (req, res) => {
  try {
    const created = dbService.createTerminal(req.body, 'ADMIN_DASHBOARD');
    logger.info(`New terminal registered in matrix: @${created.id} ("${created.name}")`);
    res.json({ success: true, message: 'TERMINAL_CREATED', terminal: created });
  } catch (err) {
    logger.error('Failed to create terminal', err);
    res.status(500).json({ error: err.message || 'CREATION_FAILED' });
  }
});

terminalsRouter.put('/admin/terminals/:id', authMiddleware, validateBody(terminalSchema), (req, res) => {
  try {
    const updated = dbService.updateTerminal(req.params.id, req.body, 'ADMIN_DASHBOARD');
    logger.info(`Terminal configuration updated: @${req.params.id}`);
    res.json({ success: true, message: 'TERMINAL_UPDATED', terminal: updated });
  } catch (err) {
    logger.error(`Failed to update terminal @${req.params.id}`, err);
    res.status(500).json({ error: err.message || 'UPDATE_FAILED' });
  }
});

terminalsRouter.delete('/admin/terminals/:id', authMiddleware, (req, res) => {
  try {
    const result = dbService.deleteTerminal(req.params.id, 'ADMIN_DASHBOARD');
    logger.info(`Terminal purged from matrix: @${req.params.id}`);
    res.json({ success: true, message: 'TERMINAL_DELETED', result });
  } catch (err) {
    logger.error(`Failed to delete terminal @${req.params.id}`, err);
    res.status(500).json({ error: err.message || 'DELETE_FAILED' });
  }
});

// 3. Terminal Workspace Files & Markdown Inspector
terminalsRouter.get('/admin/terminals/:id/files', authMiddleware, (req, res) => {
  try {
    const files = dbService.getTerminalFiles(req.params.id);
    res.json(files);
  } catch (err) {
    logger.error(`Failed to list workspace files for @${req.params.id}`, err);
    res.status(500).json({ error: err.message || 'FILE_SCAN_ERROR' });
  }
});

terminalsRouter.get('/admin/terminals/:id/file', authMiddleware, (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'MISSING_FILE_PATH' });
    }
    const fileData = dbService.getTerminalFileContent(req.params.id, filePath);
    res.json(fileData);
  } catch (err) {
    logger.error(`Failed to read file for @${req.params.id}`, err);
    res.status(500).json({ error: err.message || 'FILE_READ_ERROR' });
  }
});

terminalsRouter.put('/admin/terminals/:id/file', authMiddleware, (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'MISSING_PARAMETERS' });
    }
    const saved = dbService.saveTerminalFileContent(req.params.id, filePath, content, 'ADMIN_DASHBOARD');
    logger.info(`Workspace file saved: @${req.params.id}/${filePath}`);
    res.json({ success: true, message: 'FILE_SAVED', file: saved });
  } catch (err) {
    logger.error(`Failed to write file for @${req.params.id}`, err);
    res.status(500).json({ error: err.message || 'FILE_SAVE_ERROR' });
  }
});

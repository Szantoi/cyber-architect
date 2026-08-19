import { Router } from 'express';
import { sseService } from '../services/sseService.js';

export const sseRouter = Router();

/**
 * GET /api/stream/events
 * Establishes a persistent Server-Sent Events (SSE) stream.
 */
sseRouter.get('/stream/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx)

  res.flushHeaders?.();

  sseService.addClient(res);

  req.on('close', () => {
    sseService.removeClient(res);
  });
});

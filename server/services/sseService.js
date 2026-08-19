import { logger } from '../logger.js';

class SseService {
  constructor() {
    this.clients = new Set();
    this.heartbeatInterval = null;
  }

  addClient(res) {
    this.clients.add(res);
    logger.info(`[SSE] Client connected. Total active streams: ${this.clients.size}`);

    // Send initial connected handshake
    this.sendToClient(res, 'SYSTEM_CONNECTED', {
      message: 'Real-time telemetry stream active',
      timestamp: new Date().toISOString()
    });

    if (!this.heartbeatInterval && this.clients.size > 0) {
      this.startHeartbeat();
    }
  }

  removeClient(res) {
    this.clients.delete(res);
    logger.info(`[SSE] Client disconnected. Total active streams: ${this.clients.size}`);

    if (this.clients.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  sendToClient(res, eventType, data) {
    try {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      logger.warn('[SSE] Error sending data to single client:', err);
    }
  }

  broadcast(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast('HEARTBEAT', { timestamp: new Date().toISOString() });
    }, 15000);

    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }
}

export const sseService = new SseService();

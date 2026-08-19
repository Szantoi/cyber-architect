import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';
import { uplinkLimiter } from '../security/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import { uplinkSchema } from '../schemas/uplink.schema.js';
import { sanitizeText } from '../security/sanitizer.js';

export const uplinkRouter = Router();

// Public Uplink Transmission (Save message with Rate Limiting, Zod Schema & Honeypot Trap)
uplinkRouter.post('/uplink', uplinkLimiter, validateBody(uplinkSchema), (req, res) => {
  try {
    const { identity, subject, message, website } = req.body;

    // Honeypot bot trap: silently acknowledge without persisting if website field is filled
    if (website && typeof website === 'string' && website.trim().length > 0) {
      logger.security('HONEYPOT_BOT_TRAPPED', { ip: req.ip, payload: req.body });
      return res.json({
        success: true,
        message: 'ÜZENET SIKERESEN TOVÁBBÍTVA. HAMAROSAN VÁLASZOLOK!'
      });
    }

    const cleanIdentity = sanitizeText(identity, 100);
    const cleanSubject = sanitizeText(subject, 200);
    const cleanMessage = sanitizeText(message, 5000);

    const result = dbService.createMessage({
      identity: cleanIdentity,
      subject: cleanSubject,
      message: cleanMessage
    });

    logger.info('Uplink message saved to archive', { id: result.id, identity: cleanIdentity, subject: cleanSubject });

    res.json({
      success: true,
      message: 'ÜZENET SIKERESEN TOVÁBBÍTVA. HAMAROSAN VÁLASZOLOK!',
      id: result.id
    });
  } catch (err) {
    logger.error('Error saving uplink message', err);
    res.status(500).json({ error: 'TRANSMISSION_FAILED' });
  }
});

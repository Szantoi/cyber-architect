import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_dev_jwt_secret_cyber_2026',
    expiresIn: '24h',
  },

  admin: {
    defaultPin: process.env.ADMIN_DEFAULT_PIN || '1337',
    saltRounds: 10,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 mins
    maxAuth: parseInt(process.env.RATE_LIMIT_MAX_AUTH || '5', 10),
    maxUplink: parseInt(process.env.RATE_LIMIT_MAX_UPLINK || '5', 10),
  },

  siteUrl: process.env.SITE_URL || 'https://www.ai.szantoi.hu',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://www.ai.szantoi.hu,https://ai.szantoi.hu,https://szantoi.hu,https://www.szantoi.hu,http://localhost:5173,http://localhost:3000,http://localhost:3001,http://127.0.0.1:5173,http://127.0.0.1:3000')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
};

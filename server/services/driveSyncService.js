// server/services/driveSyncService.js
// Google Drive as Single Source of Truth: Bidirectional Sync, Recursive Crawler & Auto-Versioning

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbService from './dbService.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../../../');
const CONFIG_DIR = path.resolve(__dirname, '../config');
const CYBER_ARCHITECT_DIR = path.resolve(ROOT_DIR, 'CyberArchitect');
const DEFAULT_DRIVE_DIR = path.resolve(CYBER_ARCHITECT_DIR, 'KnowledgeBase');
const DEFAULT_BLOG_DIR = path.resolve(CYBER_ARCHITECT_DIR, 'Blog');
const OAUTH_CLIENT_PATH = path.resolve(CONFIG_DIR, 'google-oauth-client.json');
const OAUTH_TOKENS_PATH = path.resolve(CONFIG_DIR, 'drive-tokens.json');


// Security Denylist: Never ever scan or write into internal development / architecture folders
const FORBIDDEN_DIRS = ['docs', 'server', 'src', '.git', '.agents', '.gemini', 'node_modules', 'dist', 'terminals'];

function _isPathForbidden(targetPath) {
  if (!targetPath) return false;
  const norm = path.resolve(targetPath).toLowerCase();
  for (const forbidden of FORBIDDEN_DIRS) {
    const forbiddenFull = path.resolve(ROOT_DIR, forbidden).toLowerCase();
    if (norm === forbiddenFull || norm.startsWith(forbiddenFull + path.sep)) {
      return true;
    }
  }
  return false;
}

/**
 * Robust YAML / Frontmatter Parser
 */
function parseFrontmatter(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { metadata: {}, content: '' };
  }

  const trimmed = rawContent.trim();
  if (!trimmed.startsWith('---')) {
    return { metadata: {}, content: trimmed };
  }

  const endIndex = trimmed.indexOf('---', 3);
  if (endIndex === -1) {
    return { metadata: {}, content: trimmed };
  }

  const yamlBlock = trimmed.substring(3, endIndex).trim();
  const bodyContent = trimmed.substring(endIndex + 3).trim();

  const metadata = {};
  const lines = yamlBlock.split('\n');
  let currentKey = null;
  let currentArray = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('- ') && currentKey && currentArray) {
      currentArray.push(line.substring(2).trim().replace(/^["']|["']$/g, ''));
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      if (!value) {
        currentKey = key;
        currentArray = [];
        metadata[key] = currentArray;
      } else {
        value = value.replace(/^["']|["']$/g, '');
        if (value.startsWith('[') && value.endsWith(']')) {
          try {
            metadata[key] = JSON.parse(value);
          } catch {
            metadata[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
          }
        } else if (value.toLowerCase() === 'true') {
          metadata[key] = true;
        } else if (value.toLowerCase() === 'false') {
          metadata[key] = false;
        } else if (!isNaN(Number(value)) && value !== '') {
          metadata[key] = Number(value);
        } else {
          metadata[key] = value;
        }
        currentKey = null;
        currentArray = null;
      }
    }
  }

  if (!metadata.title) {
    const titleMatch = bodyContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }
  }

  return { metadata, content: bodyContent };
}

/**
 * Format a post into complete Markdown with YAML Frontmatter
 */
function formatPostToMarkdown(post) {
  const dims = typeof post.dimensions === 'string' ? JSON.parse(post.dimensions || '{}') : (post.dimensions || {});
  
  let yaml = '---\n';
  yaml += `title: "${(post.title || '').replace(/"/g, '\\"')}"\n`;
  yaml += `slug: "${post.slug || ''}"\n`;
  yaml += `project_id: "${post.project_id || 'prj_rag_enterprise'}"\n`;
  yaml += `category: "${post.category || 'TUDÁSTÁR'}"\n`;
  yaml += `visibility: "${post.visibility === 'private' ? 'private' : 'public'}"\n`;
  yaml += `published: ${post.published ? 'true' : 'false'}\n`;
  yaml += `read_time: "${post.read_time || '4 PERC'}"\n`;
  if (post.audio_url) {
    yaml += `audio_url: "${post.audio_url}"\n`;
  }
  yaml += 'dimensions:\n';
  yaml += '  iparag:\n';
  (dims.iparag || ['Gyártás']).forEach(i => { yaml += `    - "${i}"\n`; });
  yaml += '  technologia:\n';
  (dims.technologia || ['Python']).forEach(t => { yaml += `    - "${t}"\n`; });
  yaml += '  celcsoport:\n';
  (dims.celcsoport || ['COO / Operatív Vezető']).forEach(c => { yaml += `    - "${c}"\n`; });
  yaml += '---\n\n';

  return yaml + (post.content || '');
}

/**
 * Extract Google Drive Folder ID from full URL or return plain ID
 */
function cleanFolderId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return trimmed;
}

/**
 * Determine the appropriate subfolder name based on project_id and visibility
 */
function getTargetSubfolder(projectId, visibility) {
  if (visibility === 'private') {
    return '03_Belso_Kutatasok_Privat';
  }
  if (projectId === 'prj_cad_auto') {
    return '02_CAD_Automatizacio';
  }
  return '01_Zart_Vallalati_RAG';
}

export const driveSyncService = {
  getOAuthClient() {
    if (fs.existsSync(OAUTH_CLIENT_PATH)) {
      try {
        const raw = JSON.parse(fs.readFileSync(OAUTH_CLIENT_PATH, 'utf8'));
        const clientData = raw.web || raw.installed || {};
        return {
          client_id: clientData.client_id,
          client_secret: clientData.client_secret,
          redirect_uri: 'http://localhost:3001/api/admin/drive/oauth2callback'
        };
      } catch (err) {
        logger.error('[DRIVE_OAUTH] Failed to read google-oauth-client.json', err);
      }
    }
    return null;
  },

  getTokens() {
    if (fs.existsSync(OAUTH_TOKENS_PATH)) {
      try {
        return JSON.parse(fs.readFileSync(OAUTH_TOKENS_PATH, 'utf8'));
      } catch (_err) {
        // ignore invalid token file
      }
    }
    return null;
  },

  saveTokens(tokens) {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(OAUTH_TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf8');
    logger.success('[DRIVE_OAUTH] Google Drive OAuth tokens saved successfully');
  },

  getAuthUrl() {
    const client = this.getOAuthClient();
    if (!client || !client.client_id) {
      throw new Error('MISSING_OAUTH_CLIENT_CONFIG: google-oauth-client.json not found');
    }

    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive');
    const redirectUri = encodeURIComponent(client.redirect_uri);
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${client.client_id}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
  },

  async exchangeCodeForTokens(code) {
    const client = this.getOAuthClient();
    if (!client) throw new Error('MISSING_OAUTH_CLIENT_CONFIG');

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: client.redirect_uri,
        grant_type: 'authorization_code'
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`TOKEN_EXCHANGE_FAILED: ${data.error_description || data.error}`);
    }

    const tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || this.getTokens()?.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      token_type: data.token_type
    };

    this.saveTokens(tokens);
    return tokens;
  },

  async getServiceAccountAccessToken() {
    const credsEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credsPath = credsEnv ? path.resolve(ROOT_DIR, 'CyberArchitectReact', credsEnv) : path.resolve(CONFIG_DIR, 'cyberarchitect-98c3d739cc1d.json');
    const fallbackPath = path.resolve(CONFIG_DIR, 'cyberarchitect-98c3d739cc1d.json');

    const finalPath = fs.existsSync(credsPath) ? credsPath : (fs.existsSync(fallbackPath) ? fallbackPath : null);
    if (!finalPath) return null;

    try {
      const creds = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
      if (!creds.client_email || !creds.private_key) return null;

      const crypto = await import('crypto');
      const now = Math.floor(Date.now() / 1000);
      const header = { alg: 'RS256', typ: 'JWT' };
      const payload = {
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };

      const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
      const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signInput = b64Header + '.' + b64Payload;

      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signInput);
      const signature = signer.sign(creds.private_key, 'base64url');
      const jwt = signInput + '.' + signature;

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });

      const data = await res.json();
      if (data.access_token) {
        return data.access_token;
      }
    } catch (saErr) {
      logger.error('[SERVICE_ACCOUNT_AUTH_ERROR]', saErr);
    }
    return null;
  },

  async getValidAccessToken() {
    // 1. Prioritize Google Service Account (Enterprise 100% Full Access, Zero Expiration issues)
    const saToken = await this.getServiceAccountAccessToken();
    if (saToken) {
      return saToken;
    }

    // 2. Fallback to OAuth 2.0 User Tokens
    const tokens = this.getTokens();
    if (!tokens) return null;

    if (tokens.access_token && tokens.expires_at && tokens.expires_at > Date.now() + 60000) {
      return tokens.access_token;
    }

    if (!tokens.refresh_token) {
      logger.warn('[DRIVE_OAUTH] No refresh token available, re-authentication needed');
      return null;
    }

    const client = this.getOAuthClient();
    if (!client) return null;

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: client.client_id,
          client_secret: client.client_secret,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token'
        })
      });

      const data = await res.json();
      if (res.ok && data.access_token) {
        tokens.access_token = data.access_token;
        tokens.expires_at = Date.now() + (data.expires_in * 1000);
        this.saveTokens(tokens);
        return tokens.access_token;
      }
    } catch (err) {
      logger.error('[DRIVE_OAUTH] Token refresh failed', err);
    }
    return null;
  },

  getStatus() {
    const rawFolderInput = process.env.GOOGLE_DRIVE_FOLDER_ID || null;
    const driveFolderId = cleanFolderId(rawFolderInput);
    const driveKnowledgeFolderId = cleanFolderId(process.env.DRIVE_KNOWLEDGE_FOLDER_ID || rawFolderInput);
    const driveBlogFolderId = cleanFolderId(process.env.DRIVE_BLOG_FOLDER_ID || null);

    const credsEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credsPath = credsEnv ? path.resolve(ROOT_DIR, 'CyberArchitectReact', credsEnv) : path.resolve(CONFIG_DIR, 'cyberarchitect-98c3d739cc1d.json');
    const localKnowledgeDir = DEFAULT_DRIVE_DIR;
    const localBlogDir = DEFAULT_BLOG_DIR;

    const hasCloudCreds = !!(credsPath && fs.existsSync(credsPath));
    const oauthClient = this.getOAuthClient();
    const tokens = this.getTokens();
    const isOAuthConnected = !!(tokens && tokens.refresh_token);

    const countFiles = (dir) => {
      if (!fs.existsSync(dir)) return 0;
      let count = 0;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isDirectory()) count += countFiles(path.join(dir, item.name));
        else if (item.name.endsWith('.md') || item.name.endsWith('.txt')) count++;
      }
      return count;
    };

    const knowledgeFileCount = countFiles(localKnowledgeDir);
    const blogFileCount = countFiles(localBlogDir);

    let mode = 'LOCAL_DRIVE_MIRROR';
    if (hasCloudCreds && (driveKnowledgeFolderId || driveFolderId)) {
      mode = 'GOOGLE_SERVICE_ACCOUNT';
    } else if (isOAuthConnected && (driveKnowledgeFolderId || driveFolderId)) {
      mode = 'GOOGLE_OAUTH_API';
    }

    return {
      mode,
      source_of_truth: 'GOOGLE_DRIVE_CLOUD',
      drive_folder_id: driveFolderId,
      drive_knowledge_folder_id: driveKnowledgeFolderId,
      drive_blog_folder_id: driveBlogFolderId,
      has_oauth_client: !!oauthClient,
      is_oauth_connected: isOAuthConnected,
      has_cloud_credentials: hasCloudCreds,
      knowledge_vault_dir: localKnowledgeDir,
      blog_vault_dir: localBlogDir,
      knowledge_files_count: knowledgeFileCount,
      blog_files_count: blogFileCount,
      local_files_detected: knowledgeFileCount + blogFileCount,
      last_sync_time: new Date().toISOString()
    };
  },

  /**
   * Upload / Push a local folder recursively to Google Drive
   */
  async uploadLocalFolderRecursive(localFolderPath, parentDriveFolderId, accessToken) {
    if (!fs.existsSync(localFolderPath) || !parentDriveFolderId || !accessToken) return;
    const items = fs.readdirSync(localFolderPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(localFolderPath, item.name);

      if (item.isDirectory()) {
        const subFolderId = await this.getOrCreateCloudFolder(parentDriveFolderId, item.name, accessToken);
        await this.uploadLocalFolderRecursive(itemPath, subFolderId, accessToken);
      } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.txt'))) {
        const content = fs.readFileSync(itemPath, 'utf-8');
        const fileName = item.name;

        const q = `'${parentDriveFolderId}' in parents and name = '${fileName}' and trashed = false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
        
        try {
          const res = await fetch(searchUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          const data = res.ok ? await res.json() : { files: [] };

          if (data.files && data.files.length > 0) {
            const fileId = data.files[0].id;
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'text/markdown'
              },
              body: content
            });
            logger.info(`[DRIVE_UPLOAD] Updated on Drive: ${fileName}`);
          } else {
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: fileName,
                parents: [parentDriveFolderId],
                mimeType: 'text/markdown'
              })
            });
            if (createRes.ok) {
              const created = await createRes.json();
              await fetch(`https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'text/markdown'
                },
                body: content
              });
              logger.success(`[DRIVE_UPLOAD] Created on Drive: ${fileName} (ID: ${created.id})`);
            }
          }
        } catch (upErr) {
          logger.error(`[DRIVE_UPLOAD_ERROR] Failed to upload ${fileName}`, upErr);
        }
      }
    }
  },

  /**
   * Push all local knowledge and blog files up to Google Drive
   */
  async pushLocalToDrive() {
    const status = this.getStatus();
    if (status.mode !== 'GOOGLE_SERVICE_ACCOUNT' && !status.is_oauth_connected) {
      logger.warn('[DRIVE_PUSH] Skipping cloud push: No Google Drive credentials available');
      return false;
    }

    try {
      const accessToken = await this.getValidAccessToken();
      if (!accessToken) return false;

      if (status.drive_knowledge_folder_id && fs.existsSync(DEFAULT_DRIVE_DIR)) {
        logger.info(`[DRIVE_PUSH] Pushing local knowledge base to Google Drive folder: ${status.drive_knowledge_folder_id}`);
        await this.uploadLocalFolderRecursive(DEFAULT_DRIVE_DIR, status.drive_knowledge_folder_id, accessToken);
      }

      if (status.drive_blog_folder_id && fs.existsSync(DEFAULT_BLOG_DIR)) {
        logger.info(`[DRIVE_PUSH] Pushing local blog to Google Drive folder: ${status.drive_blog_folder_id}`);
        await this.uploadLocalFolderRecursive(DEFAULT_BLOG_DIR, status.drive_blog_folder_id, accessToken);
      }
      return true;
    } catch (err) {
      logger.error('[DRIVE_PUSH_ERROR]', err);
      return false;
    }
  },

  /**
   * Helper: Get or Create Google Drive Cloud Folder (Recursive Hierarchical Support)
   */
  async getOrCreateCloudFolder(parentFolderId, folderName, accessToken) {
    if (!parentFolderId || !folderName || !accessToken) return parentFolderId;
    const cleanName = folderName.replace(/['\\]/g, '');
    const query = `'${parentFolderId}' in parents and name = '${cleanName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

    try {
      const res = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          return data.files[0].id;
        }
      }

      // Create new folder on Google Drive
      const createUrl = 'https://www.googleapis.com/drive/v3/files';
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: cleanName,
          parents: [parentFolderId],
          mimeType: 'application/vnd.google-apps.folder'
        })
      });

      if (createRes.ok) {
        const created = await createRes.json();
        logger.success(`[DRIVE_FOLDER_CREATED] Created Google Drive folder: "${cleanName}" (ID: ${created.id})`);
        return created.id;
      }
    } catch (err) {
      logger.error(`[DRIVE_FOLDER_ERROR] Failed to get or create folder: "${folderName}"`, err);
    }
    return parentFolderId;
  },

  /**
   * REVERSE SYNC (Web/Admin ➔ Google Drive & Local Vault):
   * Writes Markdown file back to Google Drive (with auto-versioning and dedicated subfolders) and Local Vault
   */
  async exportPostToDrive(post) {
    if (!post || !post.slug) return null;

    const isBlog = post.content_type === 'blog';
    const fileName = `${post.slug}.md`;
    const markdownContent = formatPostToMarkdown(post);

    const subfolderName = isBlog 
      ? (post.category ? post.category.replace(/[^a-zA-Z0-9_-]/g, '_') : '01_Altalanos')
      : getTargetSubfolder(post.project_id, post.visibility);

    // 1. Write to local vault mirror (CyberArchitect/KnowledgeBase or CyberArchitect/Blog) in dedicated article folder
    try {
      const targetBaseDir = isBlog ? DEFAULT_BLOG_DIR : DEFAULT_DRIVE_DIR;
      const articleDir = path.join(targetBaseDir, subfolderName, post.slug);

      if (!fs.existsSync(articleDir)) {
        fs.mkdirSync(articleDir, { recursive: true });
      }
      const localFilePath = path.join(articleDir, `${post.slug}.md`);
      fs.writeFileSync(localFilePath, markdownContent, 'utf-8');
      logger.info(`[DRIVE_EXPORT] Written to local dedicated folder ${articleDir}: ${fileName}`);
    } catch (locErr) {
      logger.error('[DRIVE_EXPORT_LOCAL_ERROR]', locErr);
    }


    // 2. Write / Update directly on Google Drive Cloud (with Native Versioning & Hierarchical Folders)
    const status = this.getStatus();
    const targetDriveRootId = isBlog
      ? (status.drive_blog_folder_id || status.drive_folder_id)
      : (status.drive_knowledge_folder_id || status.drive_folder_id);

    if ((status.mode === 'GOOGLE_SERVICE_ACCOUNT' || status.is_oauth_connected || status.has_cloud_credentials) && targetDriveRootId) {
      try {
        const accessToken = await this.getValidAccessToken();
        if (!accessToken) return null;

        // Ensure Hierarchical Folders exist on Google Drive: [Root] ➔ [Category] ➔ [Article Folder]
        const categoryFolderId = await this.getOrCreateCloudFolder(targetDriveRootId, subfolderName, accessToken);
        const articleFolderId = await this.getOrCreateCloudFolder(categoryFolderId, post.slug, accessToken);

        let cloudFileId = post.drive_file_id ? post.drive_file_id.replace(/^gdrive_/, '') : null;

        // A. If file already exists on Drive ➔ Update content (Drive natively saves previous version)
        if (cloudFileId && !cloudFileId.startsWith('drive_file_')) {
          const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${cloudFileId}?uploadType=media`;
          const upRes = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'text/markdown'
            },
            body: markdownContent
          });

          if (upRes.ok) {
            const data = await upRes.json();
            logger.success(`[DRIVE_CLOUD_EXPORT] Updated file on Google Drive: ${fileName} in folder ${subfolderName}/${post.slug} (Rev #${data.id})`);
            return {
              drive_file_id: `gdrive_${data.id}`,
              drive_modified_time: new Date().toISOString()
            };
          }
        }

        // B. If new file ➔ Create file on Google Drive inside dedicated article folder
        const metaUrl = 'https://www.googleapis.com/drive/v3/files';
        const createRes = await fetch(metaUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: fileName,
            parents: [articleFolderId],
            mimeType: 'text/markdown'
          })
        });

        if (createRes.ok) {
          const createdMeta = await createRes.json();
          const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${createdMeta.id}?uploadType=media`;
          await fetch(uploadUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'text/markdown'
            },
            body: markdownContent
          });

          logger.success(`[DRIVE_CLOUD_EXPORT] Created new file on Google Drive: ${subfolderName}/${post.slug}/${fileName} (ID: ${createdMeta.id})`);
          return {
            drive_file_id: `gdrive_${createdMeta.id}`,
            drive_modified_time: new Date().toISOString()
          };
        }
      } catch (cloudErr) {
        logger.error('[DRIVE_CLOUD_EXPORT_ERROR]', cloudErr);
      }
    }

    return null;
  },


  /**
   * Recursive Google Cloud Drive Crawler (Traverses Subfolders)
   */
  async crawlCloudFolder(folderId, folderPath, accessToken) {
    const query = `'${folderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size)`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });


    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`DRIVE_API_ERROR: ${errData.error?.message || res.statusText}`);
    }

    const data = await res.json();
    let documents = [];

    for (const item of (data.files || [])) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        const subPath = folderPath ? `${folderPath}/${item.name}` : item.name;
        const subDocs = await this.crawlCloudFolder(item.id, subPath, accessToken);
        documents = documents.concat(subDocs);
      } else if (
        item.mimeType === 'text/markdown' || 
        item.mimeType === 'text/plain' || 
        item.mimeType === 'application/vnd.google-apps.document'
      ) {
        let content = '';
        if (item.mimeType === 'application/vnd.google-apps.document') {
          const exportUrl = `https://www.googleapis.com/drive/v3/files/${item.id}/export?mimeType=text/plain`;
          const expRes = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (expRes.ok) content = await expRes.text();
        } else {
          const downUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`;
          const downRes = await fetch(downUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (downRes.ok) content = await downRes.text();
        }

        if (content) {
          documents.push({
            fileName: item.name,
            folderPath: folderPath || '',
            rawContent: content,
            modifiedTime: item.modifiedTime || new Date().toISOString(),
            fileId: `gdrive_${item.id}`
          });
        }
      }
    }

    return documents;
  },

  /**
   * Recursive Local Directory Crawler
   */
  crawlLocalFolder(dirPath, relativePrefix = '') {
    let documents = [];
    if (!fs.existsSync(dirPath)) return documents;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subPrefix = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        documents = documents.concat(this.crawlLocalFolder(fullPath, subPrefix));
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
        const rawContent = fs.readFileSync(fullPath, 'utf-8');
        const fileStat = fs.statSync(fullPath);
        documents.push({
          fileName: entry.name,
          folderPath: relativePrefix || '',
          rawContent,
          modifiedTime: fileStat.mtime.toISOString(),
          fileId: `drive_file_${(relativePrefix ? relativePrefix + '_' : '') + entry.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`
        });
      }
    }
    return documents;
  },

  /**
   * Sync All Documents from Google Cloud or Local Folder into Database Cache (Bidirectional)
   */
  async syncAll(actor = 'DRIVE_SYNC_OPERATOR', { pushFirst = true } = {}) {
    const status = this.getStatus();
    logger.info(`[DRIVE_SYNC] Initiating synchronization mode: ${status.mode} (Single Source of Truth: Google Drive)`);

    // 0. Bidirectional Sync: Push local new / modified files to Google Drive first
    if (pushFirst && (status.mode === 'GOOGLE_SERVICE_ACCOUNT' || status.is_oauth_connected)) {
      try {
        logger.info('[DRIVE_SYNC] Pushing local changes to Google Drive prior to pull...');
        await this.pushLocalToDrive();
      } catch (pushErr) {
        logger.warn('[DRIVE_SYNC] Push local to drive failed, continuing with pull', pushErr);
      }
    }

    const results = {
      mode: status.mode,
      source_of_truth: 'GOOGLE_DRIVE_CLOUD',
      synced: 0,
      updated: 0,
      created: 0,
      errors: [],
      files: []
    };

    let documentsToProcess = [];

    // Mode A: Cloud Google Drive API (Recursive OAuth / Service Account Crawler)
    if (status.mode === 'GOOGLE_SERVICE_ACCOUNT' || status.is_oauth_connected) {
      try {
        const accessToken = await this.getValidAccessToken();
        if (accessToken) {
          // 1. Crawl Knowledge Vault Google Drive Folder
          if (status.drive_knowledge_folder_id) {
            logger.info(`[DRIVE_SYNC] Crawling Knowledge Drive Folder: ${status.drive_knowledge_folder_id}`);
            const kDocs = await this.crawlCloudFolder(status.drive_knowledge_folder_id, 'knowledge', accessToken);
            documentsToProcess.push(...kDocs);
          } else if (status.drive_folder_id) {
            const kDocs = await this.crawlCloudFolder(status.drive_folder_id, 'knowledge', accessToken);
            documentsToProcess.push(...kDocs);
          }

          // 2. Crawl Dedicated Blog Google Drive Folder (if specified)
          if (status.drive_blog_folder_id) {
            logger.info(`[DRIVE_SYNC] Crawling Blog Drive Folder: ${status.drive_blog_folder_id}`);
            const bDocs = await this.crawlCloudFolder(status.drive_blog_folder_id, 'blog', accessToken);
            documentsToProcess.push(...bDocs);
          }
        }
      } catch (cloudErr) {
        logger.error('[DRIVE_SYNC] Cloud fetch error, falling back to local vaults', cloudErr);
        results.errors.push({ file: 'GOOGLE_CLOUD_API', error: cloudErr.message });
      }
    }


    // Mode B: Local Knowledge & Blog Directories
    const primaryKnowledgeDir = DEFAULT_DRIVE_DIR;
    const primaryBlogDir = DEFAULT_BLOG_DIR;
    const fallbackKnowledgeDir = path.resolve(ROOT_DIR, 'knowledge_vault');
    const fallbackBlogDir = path.resolve(ROOT_DIR, 'blog_vault');

    if (documentsToProcess.length === 0) {
      try {
        const kDir = fs.existsSync(primaryKnowledgeDir) ? primaryKnowledgeDir : fallbackKnowledgeDir;
        const bDir = fs.existsSync(primaryBlogDir) ? primaryBlogDir : fallbackBlogDir;
        const knowledgeDocs = this.crawlLocalFolder(kDir, 'knowledge');
        const blogDocs = this.crawlLocalFolder(bDir, 'blog');
        documentsToProcess = [...knowledgeDocs, ...blogDocs];
      } catch (dirErr) {
        logger.error('[DRIVE_SYNC_ERROR] Directory scan failed', dirErr);
      }
    }

    // Process & Upsert All Documents
    for (const doc of documentsToProcess) {
      try {
        const { metadata, content } = parseFrontmatter(doc.rawContent);

        // Automatikus content_type detektálás: frontmatter > folderPath > alapértelmezett
        let defaultContentType = 'knowledge';
        if (doc.folderPath && doc.folderPath.toLowerCase().includes('blog')) {
          defaultContentType = 'blog';
        }
        const content_type = metadata.content_type || defaultContentType;

        // Automatikus kategória és cikk-almappa felismerés a Drive mappa útvonalából
        let folderCategory = '';
        let articleFolder = '';
        if (doc.folderPath) {
          const parts = doc.folderPath.split(/[/\\]/).filter(p => p && p !== 'blog' && p !== 'knowledge');
          if (parts.length >= 2) {
            folderCategory = parts[0];
            articleFolder = parts[1];
          } else if (parts.length === 1) {
            folderCategory = parts[0];
          }
        }

        const baseFileName = doc.fileName.replace(/\.(md|txt)$/, '');
        const isGenericName = ['index', 'readme', 'content', 'cikk', 'post'].includes(baseFileName.toLowerCase());

        const slug = metadata.slug || (isGenericName && articleFolder ? articleFolder : baseFileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
        const title = metadata.title || (isGenericName && articleFolder ? articleFolder.replace(/[-_]/g, ' ') : baseFileName.replace(/[-_]/g, ' '));
        const summary = metadata.summary || content.slice(0, 200).replace(/^[#\s*`>]+/, '').trim() + '...';
        const category = metadata.category || folderCategory || (content_type === 'blog' ? 'BLOG' : 'TUDÁSTÁR');

        const project_id = metadata.project_id || 'prj_rag_enterprise';
        const visibility = metadata.visibility === 'private' ? 'private' : 'public';
        const audio_url = metadata.audio_url || '';
        const video_url = metadata.video_url || '';
        const read_time = metadata.read_time || '4 PERC';
        const dimensions = metadata.dimensions || {
          iparag: Array.isArray(metadata.iparag) ? metadata.iparag : ['Gyártás'],
          technologia: Array.isArray(metadata.technologia) ? metadata.technologia : ['Python'],
          celcsoport: Array.isArray(metadata.celcsoport) ? metadata.celcsoport : ['COO / Operatív Vezető']
        };

        const existingPost = dbService.getBlogPostBySlug(slug, { publishedOnly: false });
        let isPublished = 0; // Safe default DRAFT

        if (metadata.published !== undefined) {
          isPublished = metadata.published === true || metadata.published === 1 ? 1 : 0;
        } else if (metadata.status === 'published' || metadata.status === 'ACTIVE') {
          isPublished = 1;
        } else if (existingPost) {
          isPublished = existingPost.published;
        }

        if (existingPost) {
          dbService.updateBlogPost(existingPost.id, {
            project_id,
            content_type,
            slug,
            title,
            summary,
            content,
            category,
            dimensions,
            visibility,
            audio_url,
            video_url,
            drive_file_id: doc.fileId,
            drive_modified_time: doc.modifiedTime,
            read_time,
            published: isPublished
          }, actor);

          results.updated++;
          results.files.push({ file: doc.fileName, folder: doc.folderPath, slug, published: !!isPublished, status: 'UPDATED' });
        } else {
          dbService.createBlogPost({
            project_id,
            content_type,
            slug,
            title,
            summary,
            content,
            category,
            dimensions,
            visibility,
            audio_url,
            video_url,
            drive_file_id: doc.fileId,
            drive_modified_time: doc.modifiedTime,
            read_time,
            published: isPublished
          }, actor);

          results.created++;
          results.files.push({ file: doc.fileName, folder: doc.folderPath, slug, published: !!isPublished, status: 'CREATED' });
        }

        results.synced++;
      } catch (fileErr) {
        logger.error(`[DRIVE_SYNC_ERROR] Error syncing file: ${doc.fileName}`, fileErr);
        results.errors.push({ file: doc.fileName, error: fileErr.message });
      }
    }

    logger.success(`[DRIVE_SYNC_SUCCESS] Synchronized ${results.synced} documents (${results.created} new, ${results.updated} updated)`);
    return results;
  }
};

export default driveSyncService;

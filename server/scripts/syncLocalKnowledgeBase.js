import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_BASE_DIR = path.resolve(__dirname, '../../../CyberArchitect/KnowledgeBase');

const parseMarkdownFile = (filePath) => {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    logger.warn(`No frontmatter found in ${filePath}`);
    return null;
  }

  const frontmatterRaw = match[1];
  const markdownBody = match[2].trim();

  let metadata = {};
  try {
    metadata = yaml.load(frontmatterRaw) || {};
  } catch (err) {
    logger.error(`Error parsing YAML in ${filePath}:`, err);
    return null;
  }

  return {
    metadata,
    content: markdownBody
  };
};

const findMarkdownFiles = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findMarkdownFiles(filePath));
    } else if (file.endsWith('.md') && !file.includes('FRONTMATTER') && !file.includes('README')) {
      results.push(filePath);
    }
  }
  return results;
};

export const syncKnowledgeBase = async () => {
  logger.info(`Scanning knowledge base in: ${KNOWLEDGE_BASE_DIR}`);
  if (!fs.existsSync(KNOWLEDGE_BASE_DIR)) {
    logger.error(`Directory not found: ${KNOWLEDGE_BASE_DIR}`);
    return;
  }

  const files = findMarkdownFiles(KNOWLEDGE_BASE_DIR);
  logger.info(`Found ${files.length} markdown articles.`);

  for (const file of files) {
    const parsed = parseMarkdownFile(file);
    if (!parsed) continue;

    const { metadata, content } = parsed;
    const slug = metadata.slug || path.basename(file, '.md');
    const title = metadata.title || slug;
    const summary = metadata.summary || content.slice(0, 200).replace(/[#*`_]/g, '').trim() + '...';
    const category = metadata.category || 'ÁLTALÁNOS';
    const dimensions = metadata.dimensions || {};
    const visibility = metadata.visibility || 'public';
    const read_time = metadata.read_time || '5 PERC';
    const audio_url = metadata.audio_url || '';
    const video_url = metadata.video_url || '';
    const project_id = metadata.project_id || 'prj_rag_enterprise';
    const published = metadata.published !== false ? 1 : 0;

    const existing = dbService.getBlogPostBySlug(slug, { visibility: 'all' });

    if (existing) {
      dbService.updateBlogPost(existing.id, {
        project_id,
        content_type: 'knowledge',
        slug,
        title,
        summary,
        content,
        category,
        dimensions,
        visibility,
        audio_url,
        video_url,
        read_time,
        published
      }, 'SYNC_SCRIPT');
      logger.success(`Updated knowledge article: [${slug}] ${title}`);
    } else {
      dbService.createBlogPost({
        project_id,
        content_type: 'knowledge',
        slug,
        title,
        summary,
        content,
        category,
        dimensions,
        visibility,
        audio_url,
        video_url,
        read_time,
        published
      }, 'SYNC_SCRIPT');
      logger.success(`Created knowledge article: [${slug}] ${title}`);
    }
  }

  logger.success(`Sync completed! ${files.length} articles processed.`);
};

// If run directly via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncKnowledgeBase()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Sync failed', err);
      process.exit(1);
    });
}

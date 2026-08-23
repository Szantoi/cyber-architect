import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';
import { adminPreviewMiddleware, getReadScope } from '../middleware/adminPreview.js';

export const contentRouter = Router();

contentRouter.use(adminPreviewMiddleware);

// 1. Get All Public Content (Hero, Settings, Skills, Projects, Recent Blogs)
contentRouter.get('/content', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const settings = dbService.getPublicSettings();
    const skills = dbService.getSkills();
    const projects = dbService.getProjects();
    const recentBlogs = dbService.getBlogPosts({
      publishedOnly: readScope.publishedOnly,
      visibility: readScope.visibility,
      limit: 3
    });

    res.json({
      settings,
      skills,
      projects,
      recentBlogs
    });
  } catch (err) {
    logger.error('Failed to fetch public content', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 2. Direct public skills endpoint
contentRouter.get('/skills', (req, res) => {
  try {
    const skills = dbService.getSkills();
    res.json(skills);
  } catch (err) {
    logger.error('Failed to fetch skills', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 3. Direct public projects endpoint
contentRouter.get('/projects', (req, res) => {
  try {
    const projects = dbService.getProjects();
    res.json(projects);
  } catch (err) {
    logger.error('Failed to fetch projects', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

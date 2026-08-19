import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { logger } from '../logger.js';

export const contentRouter = Router();

// 1. Get All Public Content (Hero, Settings, Skills, Projects, Recent Blogs)
contentRouter.get('/content', (req, res) => {
  try {
    const settings = dbService.getSettings();
    const skills = dbService.getSkills();
    const projects = dbService.getProjects();
    const recentBlogs = dbService.getBlogPosts({ publishedOnly: true, limit: 3 });

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

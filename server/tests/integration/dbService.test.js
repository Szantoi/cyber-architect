import { describe, it, expect } from 'vitest';
import { dbService } from '../../services/dbService.js';

describe('dbService Database Integration Tests', () => {
  describe('Settings Operations', () => {
    it('retrieves system settings object', () => {
      const settings = dbService.getSettings();
      expect(settings).toBeDefined();
      expect(typeof settings).toBe('object');
      expect(settings.hero_title).toBeDefined();
    });

    it('updates system settings and creates audit trail', () => {
      const original = dbService.getSettings();
      const newTitle = `Test Cyber Architect ${Date.now()}`;
      
      const updated = dbService.updateSettings({ ...original, hero_title: newTitle }, 'TEST_AGENT');
      expect(updated.hero_title).toBe(newTitle);

      // Verify audit trail logged the change
      const auditLogs = dbService.getAuditLogs({ limit: 5, entity: 'settings' });
      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].actor).toBe('TEST_AGENT');
      expect(auditLogs[0].action).toContain('UPDATE');

      // Revert back
      dbService.updateSettings(original, 'TEST_CLEANUP');
    });
  });

  describe('Skills CRUD Operations', () => {
    let testSkillId = null;

    it('creates a new tactical skill', () => {
      const created = dbService.createSkill({
        name: 'Quantum AI Integration',
        desc: 'Testing automated workflow verification.',
        level: '0.99',
        icon: 'psychology',
        color: '#00FFFF'
      }, 'TEST_AGENT');

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Quantum AI Integration');
      testSkillId = created.id;
    });

    it('retrieves all skills including the newly created one', () => {
      const skills = dbService.getSkills();
      expect(Array.isArray(skills)).toBe(true);
      const found = skills.find(s => s.id === testSkillId);
      expect(found).toBeDefined();
      expect(found.name).toBe('Quantum AI Integration');
    });

    it('updates the skill', () => {
      const updated = dbService.updateSkill(testSkillId, {
        name: 'Quantum AI Integration v2',
        level: '1.00'
      }, 'TEST_AGENT');

      expect(updated.name).toBe('Quantum AI Integration v2');
      expect(updated.level).toBe('1.00');
    });

    it('deletes the test skill', () => {
      const result = dbService.deleteSkill(testSkillId, 'TEST_AGENT');
      expect(result.success).toBe(true);

      const skills = dbService.getSkills();
      const found = skills.find(s => s.id === testSkillId);
      expect(found).toBeUndefined();
    });
  });

  describe('Projects CRUD Operations', () => {
    let testProjectId = null;

    it('creates a new tactical project record', () => {
      const project = dbService.createProject({
        title: 'Project Cyber Test 9000',
        desc: 'Automated integration testing for architecture verification.',
        tags: 'AI,RAG,AUTOMATION',
        status: 'PROD READY',
        img: '/assets/test.png',
        addr: '0xTESTADDR',
        sec_auth: 'TEST_SECURED'
      }, 'TEST_AGENT');

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.title).toBe('Project Cyber Test 9000');
      testProjectId = project.id;
    });

    it('reads projects list', () => {
      const projects = dbService.getProjects();
      expect(Array.isArray(projects)).toBe(true);
      const found = projects.find(p => p.id === testProjectId);
      expect(found).toBeDefined();
    });

    it('deletes the test project', () => {
      const result = dbService.deleteProject(testProjectId, 'TEST_AGENT');
      expect(result.success).toBe(true);
    });
  });

  describe('Content identity validation', () => {
    it('generates canonical slugs and rejects unsafe source identity metadata', () => {
      const basePost = {
        title: 'Árvíztűrő tudástári dokumentum',
        summary: 'Canonical content identity regression test.',
        content: '# Biztonságos tartalom',
        content_type: 'knowledge'
      };

      expect(() => dbService.createBlogPost({
        ...basePost,
        slug: '../../server/config/token'
      }, 'TEST_AGENT')).toThrow('INVALID_SLUG');
      expect(() => dbService.createBlogPost({
        ...basePost,
        content_type: 'article'
      }, 'TEST_AGENT')).toThrow('INVALID_CONTENT_TYPE');

      const created = dbService.createBlogPost(basePost, 'TEST_AGENT');
      try {
        expect(created.slug).toMatch(/^arvizturo-tudastari-dokumentum-[a-z0-9]{5}$/);
        expect(created.content_type).toBe('knowledge');

        expect(() => dbService.updateBlogPost(created.id, {
          slug: '../escape'
        }, 'TEST_AGENT')).toThrow('INVALID_SLUG');
        expect(() => dbService.updateBlogPost(created.id, {
          content_type: 'page'
        }, 'TEST_AGENT')).toThrow('INVALID_CONTENT_TYPE');
        expect(dbService.getBlogPostById(created.id)).toMatchObject({
          slug: created.slug,
          content_type: 'knowledge'
        });
      } finally {
        dbService.deleteBlogPost(created.id, 'TEST_CLEANUP');
      }
    });

    it('enforces non-empty Drive source identity uniqueness in SQLite', () => {
      const uniqueMarker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `gdrive_${uniqueMarker}`;
      const first = dbService.createBlogPost({
        slug: `drive-source-first-${uniqueMarker}`,
        title: 'First Drive source owner',
        summary: 'The source ID belongs to exactly one row.',
        content: '# First source owner',
        drive_file_id: driveFileId
      }, 'TEST_AGENT');

      try {
        expect(() => dbService.createBlogPost({
          slug: `drive-source-second-${uniqueMarker}`,
          title: 'Duplicate Drive source owner',
          summary: 'This insert must fail at the database boundary.',
          content: '# Duplicate source owner',
          drive_file_id: `  ${driveFileId}  `
        }, 'TEST_AGENT')).toThrow(/UNIQUE constraint failed/);
        expect(dbService.getBlogPostByDriveFileId(driveFileId)).toMatchObject({ id: first.id });
      } finally {
        dbService.deleteBlogPost(first.id, 'TEST_CLEANUP');
      }
    });
  });

  describe('Central admin PIN policy', () => {
    it.each(['1234', 'aaaaaaaaaaaa', 'replace_with_a_pin'])(
      'rejects weak PIN rotation through dbService: %s',
      (weakPin) => {
        expect(() => dbService.updatePin(weakPin, 'TEST_AGENT'))
          .toThrow('PIN_POLICY_VIOLATION');
      }
    );
  });

  describe('Agent Messaging & Audit Trail', () => {
    let testMsgId = null;

    it('sends an agent communication message', () => {
      const msg = dbService.sendAgentMessage({
        sender: 'qa-tester',
        recipient: 'conductor',
        subject: 'Automated Test Verification Passed',
        body: 'All test assertions were verified successfully.',
        message_type: 'handoff'
      }, 'TEST_AGENT');

      expect(msg).toBeDefined();
      expect(msg.id).toBeDefined();
      expect(msg.status).toBe('unread');
      testMsgId = msg.id;
    });

    it('retrieves agent inbox for conductor', () => {
      const inbox = dbService.getAgentInbox({ terminal: 'conductor' });
      expect(Array.isArray(inbox)).toBe(true);
      const found = inbox.find(m => m.id === testMsgId);
      expect(found).toBeDefined();
    });

    it('marks agent message as read and archived', () => {
      const readMsg = dbService.updateAgentMessageStatus({
        message_id: testMsgId,
        terminal: 'conductor',
        status: 'read'
      }, 'TEST_AGENT');
      expect(readMsg.status).toBe('read');

      const archivedMsg = dbService.updateAgentMessageStatus({
        message_id: testMsgId,
        terminal: 'conductor',
        status: 'archived'
      }, 'TEST_AGENT');
      expect(archivedMsg.status).toBe('archived');
    });
  });
});

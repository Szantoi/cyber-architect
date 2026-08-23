import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { db } from '../../db.js';
import { adminRouter } from '../../routes/admin.routes.js';
import { generateAdminToken } from '../../security/auth.js';
import { graphService } from '../../services/graphService.js';
import { workflowService } from '../../services/workflowService.js';

const app = express();
app.use(express.json());
app.use('/api', adminRouter);

const actors = [];

function suffix() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function createActor() {
  const actor = `WORKFLOW_TEST_${suffix()}`;
  actors.push(actor);
  return actor;
}

function workflowActor(id) {
  return { type: 'human', id, label: 'Workflow tesztelő' };
}

function createGraphFixture(actor) {
  const id = suffix();
  return graphService.createGraph({
    id: `workflow/graph-${id}`,
    slug: `workflow-graph-${id}`,
    name: 'Workflow teszt gráf',
    visibility: 'private'
  }, actor);
}

function versionPayload({ includeLoop = false, loopMaxIterations = null } = {}) {
  const transitions = [
    {
      source_step_key: 'start',
      target_step_key: 'review',
      label: 'Felülvizsgálat indítása',
      allowed_actor_types: ['human']
    },
    {
      source_step_key: 'review',
      target_step_key: 'approval_wait',
      label: 'Jóváhagyásra küldés',
      allowed_actor_types: ['human'],
      guard: { op: 'equals', path: ['approved'], value: true },
      evidence_required: true
    },
    {
      source_step_key: 'approval_wait',
      target_step_key: 'end',
      label: 'Lezárás',
      allowed_actor_types: ['human', 'agent']
    }
  ];
  if (includeLoop) {
    transitions.splice(1, 0, {
      source_step_key: 'review',
      target_step_key: 'review',
      label: 'Javítási kör',
      allowed_actor_types: ['human'],
      max_iterations: loopMaxIterations
    });
  }
  return {
    label: 'V1',
    max_total_steps: 20,
    steps: [
      { key: 'start', type: 'start', label: 'Indítás' },
      { key: 'review', type: 'task', label: 'Műszaki felülvizsgálat' },
      { key: 'approval_wait', type: 'wait', label: 'Ügyfél-jóváhagyás' },
      { key: 'end', type: 'end', label: 'Lezárás' }
    ],
    transitions
  };
}

function createWorkflowFixture(actor, options = {}) {
  const graph = createGraphFixture(actor);
  const id = suffix();
  const workflow = workflowService.createWorkflow({
    graph_id: graph.id,
    slug: `workflow-${id}`,
    name: 'Jóváhagyási workflow',
    ...versionPayload(options)
  }, workflowActor(actor));
  return { graph, workflow };
}

afterEach(() => {
  for (const actor of actors.splice(0)) {
    db.prepare(`
      DELETE FROM workflow_instance_events
      WHERE instance_id IN (
        SELECT id FROM workflow_instances
        WHERE workflow_definition_id IN (
          SELECT id FROM workflow_definitions WHERE created_by = ?
        )
      )
    `).run(`human:${actor}`);
    db.prepare(`
      DELETE FROM workflow_instances
      WHERE workflow_definition_id IN (
        SELECT id FROM workflow_definitions WHERE created_by = ?
      )
    `).run(`human:${actor}`);
    db.prepare(`
      DELETE FROM workflow_transitions
      WHERE workflow_version_id IN (
        SELECT id FROM workflow_versions
        WHERE workflow_id IN (SELECT id FROM workflow_definitions WHERE created_by = ?)
      )
    `).run(`human:${actor}`);
    db.prepare(`
      DELETE FROM workflow_steps
      WHERE workflow_version_id IN (
        SELECT id FROM workflow_versions
        WHERE workflow_id IN (SELECT id FROM workflow_definitions WHERE created_by = ?)
      )
    `).run(`human:${actor}`);
    db.prepare(`
      DELETE FROM workflow_versions
      WHERE workflow_id IN (SELECT id FROM workflow_definitions WHERE created_by = ?)
    `).run(`human:${actor}`);
    db.prepare('DELETE FROM workflow_definitions WHERE created_by = ?').run(`human:${actor}`);
    db.prepare('DELETE FROM graph_definitions WHERE created_by = ?').run(actor);
    db.prepare('DELETE FROM audit_logs WHERE actor IN (?, ?)').run(actor, `human:${actor}`);
  }
});

describe('native Workflow v1 API and runtime', () => {
  it('rejects an unbounded cycle before it can become executable', () => {
    const actor = createActor();
    const graph = createGraphFixture(actor);
    const id = suffix();

    expect(() => workflowService.createWorkflow({
      graph_id: graph.id,
      slug: `unbounded-loop-${id}`,
      name: 'Végtelen ciklus teszt',
      ...versionPayload({ includeLoop: true, loopMaxIterations: null })
    }, workflowActor(actor))).toThrow('WORKFLOW_LOOP_MAX_ITERATIONS_REQUIRED');

    expect(db.prepare('SELECT COUNT(*) AS count FROM workflow_definitions WHERE slug = ?')
      .get(`unbounded-loop-${id}`).count).toBe(0);

    const invalidTarget = versionPayload();
    invalidTarget.transitions[0].target_step_key = 'does-not-exist';
    expect(() => workflowService.createWorkflow({
      graph_id: graph.id,
      slug: `invalid-target-${id}`,
      name: 'Érvénytelen cél teszt',
      ...invalidTarget
    }, workflowActor(actor))).toThrow('WORKFLOW_TRANSITION_STEP_NOT_FOUND');
  });

  it('publishes an immutable revision, enforces guard/evidence/actor rules, and writes lifecycle events', () => {
    const actor = createActor();
    const { workflow } = createWorkflowFixture(actor, { includeLoop: true, loopMaxIterations: 2 });
    const actorRecord = workflowActor(actor);

    expect(() => workflowService.startWorkflowInstance(workflow.id, {}, actorRecord))
      .toThrow('WORKFLOW_NOT_PUBLISHED');

    const published = workflowService.publishWorkflowVersion(workflow.id, 1, actorRecord);
    expect(published.published_version).toMatchObject({ version_number: 1, status: 'published' });

    const instance = workflowService.startWorkflowInstance(workflow.id, { context: {} }, actorRecord);
    const transitions = new Map(published.published_version.transitions.map(transition => [
      `${transition.source_step_key}->${transition.target_step_key}`,
      transition
    ]));
    const startToReview = transitions.get('start->review');
    const reviewLoop = transitions.get('review->review');
    const reviewToWait = transitions.get('review->approval_wait');
    const waitToEnd = transitions.get('approval_wait->end');

    workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: startToReview.id,
      actor: actorRecord
    }, actorRecord);

    expect(() => workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: reviewToWait.id,
      actor: actorRecord,
      evidence: 'EV-REVIEW'
    }, actorRecord)).toThrow('WORKFLOW_GUARD_NOT_SATISFIED');

    expect(() => workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: reviewToWait.id,
      actor: actorRecord,
      context_patch: { approved: true }
    }, actorRecord)).toThrow('WORKFLOW_EVIDENCE_REQUIRED');

    expect(() => workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: reviewToWait.id,
      actor: { type: 'agent', id: 'review-agent', label: 'Nem engedélyezett agent' },
      evidence: 'EV-REVIEW',
      context_patch: { approved: true }
    }, actorRecord)).toThrow('WORKFLOW_ACTOR_NOT_ALLOWED');

    workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: reviewLoop.id,
      actor: actorRecord
    }, actorRecord);
    workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: reviewLoop.id,
      actor: actorRecord
    }, actorRecord);
    expect(() => workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: reviewLoop.id,
      actor: actorRecord
    }, actorRecord)).toThrow('WORKFLOW_TRANSITION_ITERATION_LIMIT');

    const paused = workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: reviewToWait.id,
      actor: actorRecord,
      evidence: { id: 'EV-APPROVAL', kind: 'record', uri: 'https://example.test/evidence' },
      context_patch: { approved: true }
    }, actorRecord);
    expect(paused.status).toBe('paused');
    expect(paused.events.map(event => event.event_type)).toEqual([
      'start', 'transition', 'transition', 'transition', 'transition', 'pause'
    ]);

    // A newly authored v2 is a separate immutable topology. The running v1
    // instance must offer only its own wait → end transition, never a draft
    // transition with the same human-facing step keys.
    const revision = workflowService.createWorkflowVersion(workflow.id, {
      ...versionPayload({ includeLoop: true, loopMaxIterations: 1 }),
      label: 'V2'
    }, actorRecord);
    const v2WaitToEnd = revision.version.transitions.find(transition => (
      transition.source_step_key === 'approval_wait' && transition.target_step_key === 'end'
    ));
    expect(paused.available_transitions).toEqual([
      expect.objectContaining({ id: waitToEnd.id, target_step: expect.objectContaining({ key: 'end' }) })
    ]);
    expect(paused.available_transitions.map(transition => transition.id)).not.toContain(v2WaitToEnd.id);

    const resumed = workflowService.resumeWorkflowInstance(instance.id, {}, actorRecord);
    const completed = workflowService.transitionWorkflowInstance(instance.id, {
      transition_id: waitToEnd.id,
      actor: actorRecord
    }, actorRecord);
    expect(resumed.status).toBe('running');
    expect(completed.status).toBe('completed');
    expect(completed.events.map(event => event.event_type)).toEqual([
      'start', 'transition', 'transition', 'transition', 'transition', 'pause', 'resume', 'transition', 'complete'
    ]);

    const secondInstance = workflowService.startWorkflowInstance(workflow.id, {}, actorRecord);
    const failed = workflowService.failWorkflowInstance(secondInstance.id, {
      reason: 'Külső rendszer leállt'
    }, actorRecord);
    expect(failed.status).toBe('failed');
    expect(failed.events.map(event => event.event_type)).toEqual(['start', 'fail']);

    const republished = workflowService.publishWorkflowVersion(workflow.id, revision.version.version_number, actorRecord);
    expect(republished.published_version).toMatchObject({ version_number: 2, status: 'published' });
    expect(workflowService.getWorkflowInstance(instance.id).workflow_version.version_number).toBe(1);
  });

  it('protects all routes and serves a strict versioned API contract', async () => {
    const actor = createActor();
    const graph = createGraphFixture(actor);
    const id = suffix();
    const payload = {
      graph_id: graph.id,
      slug: `route-workflow-${id}`,
      name: 'Route workflow',
      ...versionPayload()
    };
    const adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: actor });
    const viewerToken = generateAdminToken({ role: 'VIEWER', sub: actor });
    const authenticated = (method, url) => request(app)[method](url).set('x-admin-token', adminToken);

    expect((await request(app).get('/api/admin/workflows')).status).toBe(401);
    expect((await request(app)
      .post('/api/admin/workflows')
      .set('x-admin-token', viewerToken)
      .send(payload)).status).toBe(403);

    const unsafeGuard = structuredClone(payload);
    unsafeGuard.transitions[1].guard = { op: 'raw', expression: 'DROP TABLE workflow_instances' };
    const invalid = await authenticated('post', '/api/admin/workflows').send(unsafeGuard);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('VALIDATION_ERROR');

    const created = await authenticated('post', '/api/admin/workflows').send(payload);
    expect(created.status).toBe(201);
    expect(created.body.workflow).toMatchObject({ graph_id: graph.id, latest_version: 1 });

    const workflowId = created.body.workflow.id;
    const detail = await authenticated('get', `/api/admin/workflows/${encodeURIComponent(workflowId)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.workflow.current_version).toMatchObject({
      version_number: 1,
      steps: expect.any(Array),
      transitions: expect.any(Array)
    });

    const unpublishedStart = await authenticated('post', `/api/admin/workflows/${encodeURIComponent(workflowId)}/instances`).send({});
    expect(unpublishedStart.status).toBe(409);
    expect(unpublishedStart.body.error).toBe('WORKFLOW_NOT_PUBLISHED');

    const publish = await authenticated('post', `/api/admin/workflows/${encodeURIComponent(workflowId)}/versions/1/publish`).send({});
    expect(publish.status).toBe(200);
    const started = await authenticated('post', `/api/admin/workflows/${encodeURIComponent(workflowId)}/instances`).send({
      context: {}
    });
    expect(started.status).toBe(201);
    expect(started.body.instance).toMatchObject({ status: 'running', current_step: { key: 'start' } });

    const list = await authenticated('get', `/api/admin/workflow-instances?workflow_id=${encodeURIComponent(workflowId)}`);
    expect(list.status).toBe(200);
    expect(list.body.instances).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: started.body.instance.id, workflow: expect.objectContaining({ id: workflowId }) })
    ]));
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateSqlProjectIndex,
  markdownBodyFromVaultTemplate,
  renderManagedProjectTemplateBody
} from '../../services/sqlMarkdownGenerationService.js';

let vaultRoot;
let previousVaultRoot;

function gatewayResponse(snapshot, responseProjectId = 'PRJ-2026-884', source = 'erp-project-service') {
  return vi.fn(async () => new Response(JSON.stringify({
    project_id: responseProjectId,
    source,
    as_of: '2026-08-21T08:00:00.000Z',
    facts: { project_snapshot: snapshot }
  }), { status: 200 }));
}

function gatewayEnvironment() {
  return {
    NODE_ENV: 'test',
    HYBRID_SQL_FACT_GATEWAY_URL: 'https://erp.example.internal/facts',
    HYBRID_SQL_FACT_GATEWAY_TOKEN: 'test-token'
  };
}

function projectSnapshot(overrides = {}) {
  return {
    project_id: 'PRJ-2026-884',
    name: 'CNC gyártás-előkészítési pilot',
    created_at: '2026-08-21T07:30:00.000Z',
    status: 'active',
    ...overrides
  };
}

beforeEach(() => {
  previousVaultRoot = process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-sql-markdown-'));
  process.env.CYBER_ARCHITECT_CONTENT_ROOT = vaultRoot;
});

afterEach(() => {
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  if (previousVaultRoot === undefined) delete process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  else process.env.CYBER_ARCHITECT_CONTENT_ROOT = previousVaultRoot;
});

describe('SQL-driven Markdown project generator', () => {
  it('uses only the Markdown body and the explicit SQL placeholders from a managed Vault template', () => {
    const source = [
      '---',
      'title: example-only',
      'nested:',
      '  not: imported',
      '---',
      '',
      '# {{project_name}}',
      '`{{sql_project_id}}` · {{sql_created_at}} · {{sql_project_status}}',
      'An untouched {{not_supported}} token remains literal.'
    ].join('\n');
    const project = {
      id: 'PRJ-2026-884',
      name: 'CNC gyártás-előkészítési pilot',
      createdAt: '2026-08-21T07:30:00.000Z',
      status: 'active'
    };

    expect(markdownBodyFromVaultTemplate(source)).toMatch(/^# \{\{project_name\}\}/);
    expect(renderManagedProjectTemplateBody({ source, project })).toBe([
      '# CNC gyártás-előkészítési pilot',
      '`PRJ-2026-884` · 2026-08-21T07:30:00.000Z · active',
      'An untouched {{not_supported}} token remains literal.'
    ].join('\n'));
  });

  it('creates a private project index from the allowlisted SQL snapshot without manual YAML', async () => {
    const snapshot = projectSnapshot();
    const fetchImpl = gatewayResponse(snapshot);

    const result = await generateSqlProjectIndex({
      sqlProjectId: snapshot.project_id,
      env: gatewayEnvironment(),
      fetchImpl,
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      project_id: 'PRJ-2026-884',
      fact_profiles: ['project_snapshot']
    });
    expect(result).toMatchObject({
      status: 'created_and_indexed',
      created: true,
      document_id: 'kb:project:PRJ-2026-884:index',
      target_path: 'Content/02_SQL_Projects/project-prj-2026-884/index.md',
      sync: { status: 'completed' }
    });

    const generatedPath = path.join(vaultRoot, ...result.target_path.split('/'));
    const markdown = fs.readFileSync(generatedPath, 'utf8');
    expect(markdown).toContain('sql_project_id: "PRJ-2026-884"');
    expect(markdown).toContain('sql_project_name: "CNC gyártás-előkészítési pilot"');
    expect(markdown).toContain('sql_created_at: "2026-08-21T07:30:00.000Z"');
    expect(markdown).toContain('generated_at: "2026-08-21T09:00:00.000Z"');
    expect(markdown).toContain('taxonomy_schema: 2');
    expect(markdown).toContain('presentation_profile: "knowledge"');
    expect(markdown).not.toContain('content_type:');
    expect(markdown).toContain('tax_industry: []');
    expect(markdown).toContain('sql_fact_profiles:');
    expect(markdown).not.toContain('sql_bindings:');
    expect(markdown).not.toContain('generated:');
    expect(markdown).toContain('# CNC gyártás-előkészítési pilot');
    expect(markdown).toContain('## Műszaki döntések és bizonyítékok');
  });

  it('previews without creating a folder or Markdown file', async () => {
    const snapshot = projectSnapshot();
    const result = await generateSqlProjectIndex({
      sqlProjectId: snapshot.project_id,
      env: gatewayEnvironment(),
      fetchImpl: gatewayResponse(snapshot),
      dryRun: true
    });

    expect(result).toMatchObject({ status: 'would_create', created: false });
    expect(fs.existsSync(path.join(vaultRoot, 'Content'))).toBe(false);
  });

  it('never overwrites an existing human-edited index file', async () => {
    const snapshot = projectSnapshot();
    const first = await generateSqlProjectIndex({
      sqlProjectId: snapshot.project_id,
      env: gatewayEnvironment(),
      fetchImpl: gatewayResponse(snapshot),
      syncVault: false
    });
    const generatedPath = path.join(vaultRoot, ...first.target_path.split('/'));
    fs.appendFileSync(generatedPath, '\n## Emberi megjegyzés\n\nEzt nem írhatja felül a generátor.\n', 'utf8');

    const second = await generateSqlProjectIndex({
      sqlProjectId: snapshot.project_id,
      env: gatewayEnvironment(),
      fetchImpl: gatewayResponse(projectSnapshot({ name: 'Megváltozott SQL név' })),
      syncVault: false
    });

    expect(second).toMatchObject({ status: 'skipped_existing', created: false });
    expect(fs.readFileSync(generatedPath, 'utf8')).toContain('Ezt nem írhatja felül a generátor.');
    expect(fs.readFileSync(generatedPath, 'utf8')).not.toContain('Megváltozott SQL név');
  });

  it('fails closed when the operational snapshot does not prove the requested project identity', async () => {
    await expect(generateSqlProjectIndex({
      sqlProjectId: 'PRJ-2026-884',
      env: gatewayEnvironment(),
      fetchImpl: gatewayResponse(projectSnapshot({ project_id: 'PRJ-2026-885' }), 'PRJ-2026-884'),
      syncVault: false
    })).rejects.toThrow('SQL_PROJECT_SNAPSHOT_ID_MISMATCH');

    expect(fs.existsSync(path.join(vaultRoot, 'Content'))).toBe(false);
  });

  it('does not treat a local pilot snapshot as the SQL authority for generation', async () => {
    const snapshot = projectSnapshot();

    await expect(generateSqlProjectIndex({
      sqlProjectId: snapshot.project_id,
      env: gatewayEnvironment(),
      fetchImpl: gatewayResponse(snapshot, snapshot.project_id, 'local_snapshot'),
      syncVault: false
    })).rejects.toThrow('SQL_PROJECT_SOURCE_NOT_AUTHORITATIVE');

    expect(fs.existsSync(path.join(vaultRoot, 'Content'))).toBe(false);
  });

  it('requires a configured operational gateway instead of silently using a local fallback', async () => {
    await expect(generateSqlProjectIndex({
      sqlProjectId: 'PRJ-2026-884',
      env: { NODE_ENV: 'test' },
      syncVault: false
    })).rejects.toThrow('SQL_PROJECT_SOURCE_NOT_AUTHORITATIVE');
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { planVaultGraphProjection, writeVaultGraphProjection } from '../../services/vaultGraphProjectionWriter.js';

const tempRoots = [];

function createNote(root, name = 'note.md') {
  const filePath = path.join(root, 'KnowledgeBase', '01_Test', name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\ntitle: "Teszt"\nslug: "teszt"\ncontent_type: knowledge\ndocument_id: "kb:test:one"\n---\n\n# Emberi rész\n\nSaját [[kapcsolat]].\n`, 'utf8');
  return filePath;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('vaultGraphProjectionWriter', () => {
  it('atomically projects database relations and creates a recoverable backup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-graph-projection-'));
    tempRoots.push(root);
    const filePath = createNote(root);

    const result = writeVaultGraphProjection({
      filePath,
      vaultRoot: root,
      now: new Date('2026-08-21T12:00:00.000Z'),
      relations: [{ edge_type: 'depends_on', target_reference: 'TASK-004', graph_ref: 'project/prj-2026-884' }]
    });
    const updated = fs.readFileSync(filePath, 'utf8');

    expect(result.status).toBe('UPDATED');
    expect(fs.existsSync(result.backup_path)).toBe(true);
    expect(fs.readFileSync(result.backup_path, 'utf8')).toContain('Saját [[kapcsolat]].');
    expect(updated).toContain('Saját [[kapcsolat]].');
    expect(updated).toContain('- depends_on → [[TASK-004]] · graph: project/prj-2026-884');
  });

  it('does not alter a note when the generated projection is unchanged', () => {
    const source = `---\ntitle: "Teszt"\nslug: "teszt"\ncontent_type: knowledge\ndocument_id: "kb:test:one"\n---\n\n# Emberi rész\n`;
    const first = planVaultGraphProjection({ markdown: source, relations: [] });
    const second = planVaultGraphProjection({ markdown: first.markdown, relations: [] });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
  });

  it('rejects a concurrent content change before creating a projection', () => {
    const source = `---\ntitle: "Teszt"\nslug: "teszt"\ncontent_type: knowledge\ndocument_id: "kb:test:one"\n---\n`;
    expect(() => planVaultGraphProjection({ markdown: source, sourceHash: 'wrong' })).toThrow(expect.objectContaining({ code: 'CA_PROJECTION_SOURCE_CHANGED' }));
  });
});

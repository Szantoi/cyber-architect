import { describe, expect, it } from 'vitest';
import {
  GraphMarkdownProjectionError,
  normalizeGraphFrontmatter,
  parseGraphAuthoringBlock,
  parseGraphSystemBlock,
  renderGraphSystemBlock,
  upsertGraphSystemBlock
} from '../../services/graphMarkdownProjectionService.js';

describe('graphMarkdownProjectionService', () => {
  const relations = [
    { edge_type: 'depends_on', target_reference: 'TASK-004', graph_ref: 'project/prj-2026-884' },
    { edge_type: 'blocks', target_reference: 'TASK-018' }
  ];

  it('renders normal Markdown wikilinks inside a checksummed system-owned block', () => {
    const block = renderGraphSystemBlock({ relations });
    const parsed = parseGraphSystemBlock(block);

    expect(block).toContain('<!-- CA:SYSTEM:BEGIN v1 checksum="sha256:');
    expect(block).toContain('- depends_on → [[TASK-004]] · graph: project/prj-2026-884');
    expect(parsed).toMatchObject({
      present: true,
      version: 1,
      checksum_valid: true,
      relations: [
        expect.objectContaining({ edge_type: 'depends_on', target_slug: 'task-004', graph_ref: 'project/prj-2026-884' }),
        expect.objectContaining({ edge_type: 'blocks', target_slug: 'task-018', graph_ref: null })
      ]
    });
  });

  it('changes only the marked system block when refreshing a document', () => {
    const source = '# Emberi szöveg\n\nSaját [[wikilink]].\n';
    const first = upsertGraphSystemBlock(source, { relations });
    const second = upsertGraphSystemBlock(first, { relations: [{ edge_type: 'documents', target_reference: 'Projekt terv' }] });

    expect(first).toContain('# Emberi szöveg\n\nSaját [[wikilink]].');
    expect(second).toContain('# Emberi szöveg\n\nSaját [[wikilink]].');
    expect(second).toContain('- documents → [[Projekt terv]]');
    expect(second).not.toContain('depends_on → [[TASK-004]]');
  });

  it('fails closed instead of overwriting a manually changed system block', () => {
    const rendered = renderGraphSystemBlock({ relations });
    const edited = rendered.replace('depends_on', 'implements');

    expect(() => upsertGraphSystemBlock(edited, { relations })).toThrow(expect.objectContaining({
      code: 'CA_SYSTEM_BLOCK_DRIFT'
    }));
  });

  it('rejects malformed or duplicate relationship declarations', () => {
    const malformed = '<!-- CA:SYSTEM:BEGIN v1 checksum="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -->\n- depends_on TASK-004\n<!-- CA:SYSTEM:END -->';
    expect(() => parseGraphSystemBlock(malformed)).toThrow(expect.objectContaining({ code: 'CA_SYSTEM_RELATION_INVALID' }));
    expect(() => renderGraphSystemBlock({ relations: [relations[0], relations[0]] })).toThrow(expect.objectContaining({ code: 'CA_SYSTEM_RELATION_DUPLICATE' }));
  });

  it('keeps graph frontmatter flat and rejects obsolete ca_relations', () => {
    expect(normalizeGraphFrontmatter({
      document_id: 'task:TASK-012',
      ca_document_id: 'task:TASK-012',
      ca_graph_refs: ['project/prj-2026-884'],
      ca_sync_version: 1
    })).toEqual({
      document_id: 'task:TASK-012',
      graph_refs: ['project/prj-2026-884'],
      sync_version: 1
    });

    expect(() => normalizeGraphFrontmatter({ ca_graph_refs: { id: 'not-a-list' } })).toThrow(expect.objectContaining({ code: 'CA_GRAPH_REFS_INVALID' }));
    expect(() => normalizeGraphFrontmatter({ ca_relations: ['depends_on:: [[TASK-004]]'] })).toThrow(expect.objectContaining({ code: 'CA_RELATIONS_DEPRECATED' }));
  });

  it('accepts typed wikilinks from a human-owned CA:RELATIONS authoring block', () => {
    const authored = `# Emberi jegyzet

<!-- CA:RELATIONS:BEGIN v1 -->
## Saját típusos kapcsolatok

- blocks → [[TASK-018]] · graphs: project/prj-2026-884, impact/production
<!-- CA:RELATIONS:END -->`;

    expect(parseGraphAuthoringBlock(authored)).toMatchObject({
      present: true,
      version: 1,
      relations: [expect.objectContaining({ edge_type: 'blocks', target_slug: 'task-018', graph_refs: ['project/prj-2026-884', 'impact/production'] })]
    });
  });

  it('keeps author-declared inbound and paired directions as explicit facts', () => {
    const authored = `<!-- CA:RELATIONS:BEGIN v1 -->
- blocks ← [[TASK-018]] · graph: project/prj-2026-884
- related_to ↔ [[EPIC-002]] · graphs: project/prj-2026-884, impact/production
<!-- CA:RELATIONS:END -->`;

    const parsed = parseGraphAuthoringBlock(authored);
    expect(parsed.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ edge_type: 'blocks', direction: 'inbound', graph_refs: ['project/prj-2026-884'] }),
      expect.objectContaining({ edge_type: 'related_to', direction: 'both', graph_refs: ['project/prj-2026-884', 'impact/production'] })
    ]));

    const rendered = renderGraphSystemBlock({ relations: parsed.relations });
    expect(rendered).toContain('- blocks ← [[TASK-018]] · graph: project/prj-2026-884');
    expect(rendered).toContain('- related_to ↔ [[EPIC-002]] · graphs: project/prj-2026-884, impact/production');
    expect(parseGraphSystemBlock(rendered).checksum_valid).toBe(true);
  });
});

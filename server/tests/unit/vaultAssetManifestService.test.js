import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readDocumentAssetManifest,
  resolveLocalVaultAsset
} from '../../services/vaultAssetManifestService.js';

const temporaryRoots = [];

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-asset-manifest-'));
  temporaryRoots.push(root);
  const noteDirectory = path.join(root, 'KnowledgeBase', '01_Test', 'asset-note');
  fs.mkdirSync(path.join(noteDirectory, 'assets', 'cad'), { recursive: true });
  fs.writeFileSync(path.join(noteDirectory, 'index.md'), '# Asset note\n', 'utf8');
  fs.writeFileSync(path.join(noteDirectory, 'assets', 'cad', 'layout.dwg'), 'DWG placeholder', 'utf8');
  return { root, noteDirectory, documentPath: path.join(noteDirectory, 'index.md') };
}

afterEach(() => {
  while (temporaryRoots.length) {
    const root = temporaryRoots.pop();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

describe('vault asset manifest', () => {
  it('keeps a document-folder DWG and GitHub/YouTube links in one safe sidecar', () => {
    const fixture = makeFixture();
    fs.writeFileSync(path.join(fixture.noteDirectory, '.ca-assets.json'), JSON.stringify({
      schema_version: 1,
      assets: [
        {
          id: 'layout-dwg',
          title: 'Cell Layout',
          kind: 'cad',
          source: 'local',
          path: 'assets/cad/layout.dwg',
          visibility: 'private',
          depends_on: ['automation-repo']
        },
        {
          id: 'automation-repo',
          title: 'Automation source',
          kind: 'repository',
          source: 'external',
          uri: 'https://github.com/example/cad-automation',
          visibility: 'private'
        },
        {
          id: 'demo-video',
          title: 'Demo',
          kind: 'video',
          source: 'external',
          uri: 'https://www.youtube.com/watch?v=abc123',
          visibility: 'public'
        }
      ]
    }, null, 2), 'utf8');

    const manifest = readDocumentAssetManifest({ documentFilePath: fixture.documentPath });
    expect(manifest.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ file_id: 'layout-dwg', source_kind: 'local', availability: 'available', uri: 'ca-asset://layout-dwg' }),
      expect.objectContaining({ file_id: 'automation-repo', provider: 'github', source_kind: 'external' }),
      expect.objectContaining({ file_id: 'demo-video', provider: 'youtube', visibility: 'public' })
    ]));
    const localAsset = manifest.assets.find(asset => asset.file_id === 'layout-dwg');
    expect(resolveLocalVaultAsset({
      vaultRoot: fixture.root,
      sourcePath: 'KnowledgeBase/01_Test/asset-note/index.md',
      asset: localAsset
    })).toMatchObject({ relativePath: 'assets/cad/layout.dwg' });
  });

  it('rejects a local asset that attempts to leave the document folder', () => {
    const fixture = makeFixture();
    fs.writeFileSync(path.join(fixture.noteDirectory, '.ca-assets.json'), JSON.stringify({
      schema_version: 1,
      assets: [{ id: 'escape', kind: 'cad', source: 'local', path: '../outside.dwg' }]
    }), 'utf8');
    expect(() => readDocumentAssetManifest({ documentFilePath: fixture.documentPath }))
      .toThrow('VAULT_ASSET_RELATIVE_PATH_INVALID');
  });
});

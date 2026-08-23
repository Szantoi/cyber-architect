import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resolveVaultTemplatePaths,
  vaultTemplateService
} from '../../services/vaultTemplateService.js';

let vaultRoot;
let previousVaultRoot;
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

function writeTemplateCatalog(root, templates, schemaVersion = 1) {
  const templateRoot = path.join(root, 'ObsidianTemplates');
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(path.join(templateRoot, '.ca-template-catalog.json'), JSON.stringify({
    schema_version: schemaVersion,
    templates
  }, null, 2));
  for (const template of templates) {
    fs.writeFileSync(path.join(templateRoot, `${template.id}.md`), `# ${template.title}\n`);
  }
}

beforeEach(() => {
  previousVaultRoot = process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-template-vault-'));
  process.env.CYBER_ARCHITECT_CONTENT_ROOT = vaultRoot;
});

afterEach(() => {
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  if (previousVaultRoot === undefined) delete process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  else process.env.CYBER_ARCHITECT_CONTENT_ROOT = previousVaultRoot;
});

describe('vault template catalog placement', () => {
  it('reads the catalog from the active canonical Vault rather than the repository fallback', () => {
    const templates = [{
      id: 'custom_project_index',
      title: 'CUSTOM PROJECT INDEX',
      description: 'Only in the active Vault.',
      icon_key: 'folder',
      color: '#00FBFB',
      content_type: 'project',
      project_id: ''
    }];
    writeTemplateCatalog(vaultRoot, templates);

    const expectedRoot = path.join(vaultRoot, 'ObsidianTemplates');
    expect(vaultTemplateService.TEMPLATE_ROOT).toBe(expectedRoot);
    expect(vaultTemplateService.CATALOG_PATH).toBe(path.join(expectedRoot, '.ca-template-catalog.json'));
    expect(vaultTemplateService.listTemplates()).toEqual([
      expect.objectContaining({
        id: 'custom_project_index',
        title: 'CUSTOM PROJECT INDEX',
        presentation_profile: 'knowledge',
        document_role: 'project',
        content_type: 'knowledge'
      })
    ]);
    expect(vaultTemplateService.getTemplate('custom_project_index')).toMatchObject({
      id: 'custom_project_index',
      body: '# CUSTOM PROJECT INDEX\n'
    });
  });

  it('fails closed instead of falling through to another Vault catalog', () => {
    expect(() => vaultTemplateService.listTemplates()).toThrow('VAULT_TEMPLATE_CATALOG_MISSING');
  });

  it('keeps the historical repository Vault as the resolver fallback when no content root is configured', () => {
    const paths = resolveVaultTemplatePaths({});
    expect(paths.templateRoot).toBe(path.resolve(
      TEST_DIRECTORY,
      '../../../..',
      'CyberArchitect',
      'ObsidianTemplates'
    ));
  });

  it('writes the explicit v2 presentation profile separately from the document role', () => {
    writeTemplateCatalog(vaultRoot, [], 2);

    const template = vaultTemplateService.createTemplate({
      id: 'customer-story',
      title: 'CUSTOMER STORY',
      description: 'One unified document, rendered as an article.',
      icon_key: 'book-open',
      color: '#FF00FF',
      presentation_profile: 'article',
      document_role: 'case_study',
      project_id: '',
      body: '# Customer story\n'
    });

    expect(template).toMatchObject({
      presentation_profile: 'article',
      document_role: 'case_study',
      content_type: 'blog'
    });
    const catalog = JSON.parse(fs.readFileSync(path.join(vaultRoot, 'ObsidianTemplates', '.ca-template-catalog.json'), 'utf8'));
    expect(catalog).toMatchObject({
      schema_version: 2,
      templates: [expect.objectContaining({
        id: 'customer-story',
        presentation_profile: 'article',
        document_role: 'case_study'
      })]
    });
  });
});

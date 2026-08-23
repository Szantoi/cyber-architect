import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BlogPostsTab from '../components/admin/tabs/BlogPostsTab.jsx';
import AdminDashboard from '../components/admin/AdminDashboard.jsx';

const dashboardContexts = vi.hoisted(() => ({
  auth: null,
  content: null
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => dashboardContexts.auth
}));

vi.mock('../context/ContentContext.jsx', () => ({
  useContent: () => dashboardContexts.content
}));

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body)
  };
}

function createAdminFetch(
  authResponse,
  vaultSyncResponse = jsonResponse({ report: { processed: 0, errors: [] } })
) {
  return vi.fn(async (url) => {
    if (url === '/api/admin/drive/auth-url') return authResponse;
    if (url === '/api/admin/vault/sync') return vaultSyncResponse;
    if (url === '/api/admin/blog') return jsonResponse([]);
    if (url === '/api/admin/messages') return jsonResponse([]);
    if (url === '/api/admin/audit') return jsonResponse([]);
    if (url === '/api/admin/agent-messages') return jsonResponse({ messages: [], stats: {} });
    if (url === '/api/admin/terminals') return jsonResponse({ terminals: [] });
    throw new Error(`Unexpected admin URL: ${url}`);
  });
}

beforeEach(() => {
  dashboardContexts.content = {
    settings: {},
    skills: [],
    projects: [],
    refreshContent: vi.fn()
  };
  dashboardContexts.auth = {
    adminToken: 'test-admin-token',
    loginAdmin: vi.fn(),
    logoutAdmin: vi.fn(),
    adminFetch: createAdminFetch(jsonResponse({ auth_url: '#drive-auth' }))
  };
  window.location.hash = '';
});

afterEach(() => {
  window.location.hash = '';
});

function renderTab(overrides = {}) {
  const props = {
    blogsList: [],
    showMarkdownCheatSheet: false,
    setShowMarkdownCheatSheet: vi.fn(),
    onVaultSync: vi.fn(),
    onEmptyDriveRepair: vi.fn(),
    onDriveReconnect: vi.fn(),
    isSyncing: false,
    syncResult: null,
    setSyncResult: vi.fn(),
    ...overrides
  };

  render(
    <MemoryRouter>
      <BlogPostsTab {...props} />
    </MemoryRouter>
  );

  return props;
}

function renderDashboard() {
  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );
}

describe('BlogPostsTab local-vault and cloud-recovery controls', () => {
  it('keeps the Obsidian Vault preview and apply actions explicit and separate', () => {
    const props = renderTab();

    expect(screen.getByRole('group', { name: /elsődleges obsidian vault szinkronizálás/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /vault előnézet/i }));
    fireEvent.click(screen.getByRole('button', { name: /vault → sqlite\/rag alkalmazás/i }));

    expect(props.onVaultSync).toHaveBeenNthCalledWith(1, true);
    expect(props.onVaultSync).toHaveBeenNthCalledWith(2, false);
  });

  it('keeps Drive reconnect in a distinct cloud-recovery group and disables it during sync work', () => {
    const props = renderTab();
    expect(screen.getByRole('group', { name: /különálló felhő-helyreállító eszközök/i })).toBeInTheDocument();
    const reconnectButton = screen.getByRole('button', { name: /google drive újracsatlakoztatása/i });

    fireEvent.click(reconnectButton);

    expect(props.onDriveReconnect).toHaveBeenCalledTimes(1);
    expect(reconnectButton).toBeEnabled();

    renderTab({ isSyncing: true });
    expect(screen.getAllByRole('button', { name: /google drive újracsatlakoztatása/i })[1]).toBeDisabled();
  });

  it('labels an Obsidian Vault dry-run report and exposes conflicts without promising automatic renames', () => {
    renderTab({
      syncResult: {
        dry_run: true,
        mode: 'LOCAL_OBSIDIAN_VAULT',
        discovered: 3,
        processed: 2,
        created: 1,
        updated: 1,
        skipped: 1,
        collisions: [{ requested_slug: 'duplicate' }],
        files: [{ file: 'article.md', status: 'WOULD_CREATE', slug: 'article' }],
        errors: [{ source: 'knowledge', error: 'ONE_FILE_SKIPPED' }]
      }
    });

    expect(screen.getByText(/obsidian vault előnézet — nincs írás/i)).toBeInTheDocument();
    expect(screen.getByText(/azonosító ütközések: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/nincs automatikus átnevezés/i)).toBeInTheDocument();
    expect(screen.getByText(/knowledge: ONE_FILE_SKIPPED/i)).toBeInTheDocument();
    expect(screen.getByText('/article')).toBeInTheDocument();
  });

  it('shows the exact vault paths for a duplicate-slug refusal', () => {
    renderTab({
      syncResult: {
        dry_run: true,
        errors: [{
          code: 'VAULT_DUPLICATE_SLUG',
          slug: 'same-slug',
          details: {
            source_paths: ['KnowledgeBase/one.md', 'Blog/two.md']
          }
        }]
      }
    });

    expect(screen.getByText(/obsidian vault: VAULT_DUPLICATE_SLUG \[\/same-slug\]/i)).toBeInTheDocument();
    expect(screen.getByText(/KnowledgeBase\/one\.md ↔ Blog\/two\.md/i)).toBeInTheDocument();
  });

  it('keeps the CMS document list read-only and directs authoring to Obsidian', () => {
    renderTab({
      blogsList: [{
        id: 'vault-doc',
        title: 'Vault document',
        slug: 'vault-document',
        content_type: 'knowledge',
        category: 'RAG',
        created_at: '2026-08-20',
        summary: 'Read-only projection',
        published: 1
      }]
    });

    expect(screen.getByText(/cms csak olvasható.*szerkesztés: obsidian vault/i)).toBeInTheDocument();
    expect(screen.getByText(/^csak olvasható \/\/ obsidian$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^\+ új_dokumentum$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /szerkesztés/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /törlés/i })).not.toBeInTheDocument();
  });

  it('keeps empty-cloud repair preview and apply as separate explicit actions', () => {
    const props = renderTab();

    fireEvent.click(screen.getByRole('button', { name: /üres drive javítás előnézet/i }));
    fireEvent.click(screen.getByRole('button', { name: /üres drive fájlok javítása/i }));

    expect(props.onEmptyDriveRepair).toHaveBeenNthCalledWith(1, true);
    expect(props.onEmptyDriveRepair).toHaveBeenNthCalledWith(2, false);
  });

  it('renders empty-cloud repair counts without presenting them as a normal pull', () => {
    renderTab({
      syncResult: {
        operation: 'EMPTY_DRIVE_REPAIR',
        dry_run: true,
        mode: 'GOOGLE_SERVICE_ACCOUNT_API',
        would_repair: 25,
        repaired: 0,
        errors: []
      }
    });

    expect(screen.getByText(/üres drive javítás előnézet — nincs írás/i)).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText(/javítható/i)).toBeInTheDocument();
    expect(screen.queryByText(/felderítve/i)).not.toBeInTheDocument();
  });

  it('shows structured repair refusal and error codes', () => {
    renderTab({
      syncResult: {
        operation: 'EMPTY_DRIVE_REPAIR',
        dry_run: true,
        would_repair: 0,
        repaired: 0,
        errors: [{ fileName: 'changed.md', code: 'CLOUD_CHANGED_SINCE_PREVIEW' }],
        refused: [{ fileName: 'ambiguous.md', code: 'REPAIR_PATH_AMBIGUOUS' }]
      }
    });

    expect(screen.getByText(/changed\.md: CLOUD_CHANGED_SINCE_PREVIEW/i)).toBeInTheDocument();
    expect(screen.getByText(/ambiguous\.md: REPAIR_PATH_AMBIGUOUS/i)).toBeInTheDocument();
  });
});

describe('AdminDashboard unified content-control contract', () => {
  it('does not reintroduce the retired BLOG_LOGS authoring tab', () => {
    renderDashboard();

    expect(screen.queryByRole('button', { name: /blog_logs/i })).not.toBeInTheDocument();
  });

  it('exposes taxonomy as the canonical classification and collection control', () => {
    renderDashboard();

    expect(screen.getByRole('button', { name: /taxonomy_matrix/i })).toBeInTheDocument();
  });

  it('exposes central Vault templates for unified Markdown document creation', () => {
    renderDashboard();

    expect(screen.getByRole('button', { name: /vault_templates/i })).toBeInTheDocument();
  });

  it('exposes graph control independently of a presentation profile', () => {
    renderDashboard();

    expect(screen.getByRole('button', { name: /graph_control/i })).toBeInTheDocument();
  });

  it('exposes the workflow studio alongside the unified graph controls', () => {
    renderDashboard();

    expect(screen.getByRole('button', { name: /workflow_studio/i })).toBeInTheDocument();
  });
});

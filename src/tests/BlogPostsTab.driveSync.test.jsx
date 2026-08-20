import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function createAdminFetch(authResponse) {
  return vi.fn(async (url) => {
    if (url === '/api/admin/drive/auth-url') return authResponse;
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
    editingBlog: null,
    setEditingBlog: vi.fn(),
    onSaveBlog: vi.fn(),
    onDeleteBlog: vi.fn(),
    showMarkdownCheatSheet: false,
    setShowMarkdownCheatSheet: vi.fn(),
    onDriveSync: vi.fn(),
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

describe('BlogPostsTab Drive reconciliation controls', () => {
  it('keeps preview and pull-apply as explicit separate actions', () => {
    const props = renderTab();

    fireEvent.click(screen.getByRole('button', { name: /drive előnézet/i }));
    fireEvent.click(screen.getByRole('button', { name: /drive → db alkalmazás/i }));

    expect(props.onDriveSync).toHaveBeenNthCalledWith(1, true);
    expect(props.onDriveSync).toHaveBeenNthCalledWith(2, false);
  });

  it('exposes an accessible reconnect action and disables it during Drive work', () => {
    const props = renderTab();
    const reconnectButton = screen.getByRole('button', { name: /google drive újracsatlakoztatása/i });

    fireEvent.click(reconnectButton);

    expect(props.onDriveReconnect).toHaveBeenCalledTimes(1);
    expect(reconnectButton).toBeEnabled();

    renderTab({ isSyncing: true });
    expect(screen.getAllByRole('button', { name: /google drive újracsatlakoztatása/i })[1]).toBeDisabled();
  });

  it('labels a dry-run report and exposes collisions and partial errors', () => {
    renderTab({
      syncResult: {
        dry_run: true,
        mode: 'GOOGLE_OAUTH_API',
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

    expect(screen.getByText(/drive előnézet — nincs írás/i)).toBeInTheDocument();
    expect(screen.getByText(/slug ütközések: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/knowledge: ONE_FILE_SKIPPED/i)).toBeInTheDocument();
    expect(screen.getByText('/article')).toBeInTheDocument();
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

describe('AdminDashboard Google Drive reconnect handler', () => {
  async function openBlogTab() {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /blog_logs/i }));
    return screen.findByRole('button', { name: /google drive újracsatlakoztatása/i });
  }

  it.each(['auth_url', 'authUrl'])('uses the %s response URL for same-window navigation', async (urlKey) => {
    const targetHash = `#drive-auth-${urlKey}`;
    dashboardContexts.auth.adminFetch = createAdminFetch(jsonResponse({ [urlKey]: targetHash }));
    const reconnectButton = await openBlogTab();

    fireEvent.click(reconnectButton);

    await waitFor(() => expect(window.location.hash).toBe(targetHash));
    expect(dashboardContexts.auth.adminFetch).toHaveBeenCalledWith('/api/admin/drive/auth-url');
  });

  it('reports a failed authorization request without navigating', async () => {
    window.location.hash = '#before-reconnect';
    dashboardContexts.auth.adminFetch = createAdminFetch(
      jsonResponse({ error: 'DRIVE_AUTH_DENIED' }, { ok: false, status: 403 })
    );
    const reconnectButton = await openBlogTab();

    fireEvent.click(reconnectButton);

    expect(await screen.findByText(/\[ERROR\].*DRIVE_AUTH_DENIED/i)).toBeInTheDocument();
    expect(window.location.hash).toBe('#before-reconnect');
  });

  it('reports a successful response that omits both supported URL fields', async () => {
    dashboardContexts.auth.adminFetch = createAdminFetch(jsonResponse({ success: true }));
    const reconnectButton = await openBlogTab();

    fireEvent.click(reconnectButton);

    expect(await screen.findByText(/\[ERROR\].*HIÁNYZÓ_GOOGLE_DRIVE_AUTH_URL/i)).toBeInTheDocument();
  });
});

# 💾 Cyber-Architect Database Storage (`/data`)

This directory is the legacy default for local SQLite database instances, WAL
journals, and snapshot backups. A portable Vault can instead use its own
`<Vault>/.cyberarchitect/` directory through
`CYBER_ARCHITECT_WORKSPACE_DATA_DIR`; see
[Workspace storage](../docs/WORKSPACE_STORAGE.md).

---

## 🔒 Security & Privacy Policy
* **Zero Commit Rule:** All `.sqlite`, `.db`, `-wal`, and `-shm` database files in this folder are **strictly ignored by `.gitignore`** and will NEVER be committed or pushed to public repositories.
* **Auto-Initialization:** The server automatically provisions and migrates the database schema on first startup if no database file is present.
* **Point-in-Time Backups:** Snapshots created via `node server/scripts/backupDatabase.js` use SQLite's native `VACUUM INTO` command for zero-downtime backups.
* **DB-first document assets:** Container deployments keep the canonical SQLite data and default `content-assets/` root under persistent `/app/data`. `CYBER_ARCHITECT_CONTENT_ROOT` is only an optional, read-only legacy Obsidian import/archive path; it is never the active content source of truth.
* **No live file sync:** Do not place live `portfolio.sqlite`, `-wal` or `-shm` files into a multi-device cloud sync. Use verified snapshot backups instead.

---

## 🗄️ Standard Database Files
* `portfolio.sqlite`: Main operational database (settings, projects, skills, articles, audit logs, agent messages).
* `portfolio.sqlite-wal`: Write-Ahead Log journal (for high-concurrency read/write operations).
* `portfolio.sqlite-shm`: Shared-memory index for WAL mode.

---

## 🛠️ CLI Operations
To inspect database health, run maintenance, or manage content from the command line:

```bash
# View database status and telemetry
node server/cli/portfolio-cli.js status

# Perform a zero-downtime database backup
node server/cli/portfolio-cli.js backup
```

### Legacy database reconciliation

The application previously used `server/portfolio.db`. Reconcile its Markdown
content into the current database with an explicit, read-only preview first:

```bash
npm run db:migrate-legacy -- --source server/portfolio.db --target data/portfolio.sqlite --source-id legacy-server-portfolio-v1 --dry-run
```

After reviewing the JSON collision/error report, add `--apply` instead of
`--dry-run`. Apply mode creates a verified timestamped backup under
`data/backups/` and performs all target changes in one SQLite transaction.

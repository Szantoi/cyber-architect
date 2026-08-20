# 💾 Cyber-Architect Database Storage (`/data`)

This directory is reserved for all local SQLite database instances, WAL journals, and snapshot backups.

---

## 🔒 Security & Privacy Policy
* **Zero Commit Rule:** All `.sqlite`, `.db`, `-wal`, and `-shm` database files in this folder are **strictly ignored by `.gitignore`** and will NEVER be committed or pushed to public repositories.
* **Auto-Initialization:** The server automatically provisions and migrates the database schema on first startup if no database file is present.
* **Point-in-Time Backups:** Snapshots created via `node server/scripts/backupDatabase.js` use SQLite's native `VACUUM INTO` command for zero-downtime backups.
* **Local Markdown mirror:** Container deployments resolve `CYBER_ARCHITECT_CONTENT_ROOT` to `/app/data/content` by default in Compose. This directory is writable and persistent because `/app/data` is a named volume. Bind-mount an existing `CyberArchitect` directory there when the container must repair or export canonical Markdown files.

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

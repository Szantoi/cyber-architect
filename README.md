# ⚡ Cyber-Architect Knowledge Platform & MCP Gateway

A modern, high-performance web platform and Model Context Protocol (MCP) server engineered with React 19, Tailwind CSS, Express, and SQLite WAL. Features an 80s neon-noir tactical interface, dual-tier role-based access control (RBAC), and local air-gapped Retrieval-Augmented Generation (RAG).

![License](https://img.shields.io/badge/license-MIT-cyan.svg)
![React](https://img.shields.io/badge/React-19-00FFFF.svg)
![Tailwind](https://img.shields.io/badge/TailwindCSS-v4-FF00FF.svg)
![MCP](https://img.shields.io/badge/MCP-Protocol_1.0-80FF00.svg)
![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-blue.svg)

---

## 🌟 Key Capabilities

- **Model Context Protocol (MCP) Integration:** Native support for Claude Desktop, Cursor, Claude Code, Windsurf, and custom AI agents via JSON-RPC.
- **Dual-Tier Access Control (RBAC):**
  - **Tier 1 (Guest / Public Agents):** 100% Read-Only RAG search, portfolio inspection, and system health queries. Zero write access.
  - **Tier 2 (Authenticated Owner Agents):** Cryptographic SHA-256 API token auth for publishing and updating technical documentation.
- **Local RAG Search Engine:** Multi-tier search combining SQLite FTS5 (BM25 full-text) and 128-dimensional dense vector cosine similarity.
- **Cyber-Architect Design System:** Strict 0px sharp corners (`rounded-none`), dual cyan/magenta neon drop-shadows, and tactical terminal aesthetic.
- **Zero Raw Query Security:** Parameterized prepared statements, in-memory DoS rate limiting, and immutable audit trail.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20+ or v22 LTS
- **npm** or **pnpm**

### 2. Installation & Setup
```bash
# Clone the repository
git clone https://github.com/your-username/cyber-architect.git
cd cyber-architect

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

### 3. Running Locally
```bash
# Run backend API server (Port 3001)
node server/index.js

# Run frontend development server (Port 5173) in a separate terminal
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🔌 Connecting AI Agents via MCP (Model Context Protocol)

Add the server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cyber-architect": {
      "command": "node",
      "args": ["server/mcp/server.js"]
    }
  }
}
```

### Available MCP Tools (Public Read-Only)
- `search_knowledge`: Hybrid full-text and semantic vector search across documentation.
- `get_knowledge_article`: Retrieve full Markdown content and taxonomy by slug.
- `list_projects`: Inspect engineering lab projects and repository status.
- `get_architecture_blueprint`: Query technical specifications and RAG pipeline blueprint.
- `get_system_health`: Real-time operational diagnostics and database telemetry.

---

## 🧪 Testing & Quality Assurance

```bash
# Run Vitest unit & integration test suite (77+ tests)
npm test

# Run production build check
npm run build
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

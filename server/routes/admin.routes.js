import express, { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { dbService } from "../services/dbService.js";
import { logger } from "../logger.js";
import {
  authMiddleware,
  generateAdminToken,
  requireOverseerAdmin,
} from "../security/auth.js";
import { authLimiter } from "../security/rateLimiter.js";
import { validate, validateBody } from "../middleware/validate.js";
import { loginSchema, updatePinSchema } from "../schemas/auth.schema.js";
import { settingsSchema } from "../schemas/settings.schema.js";
import { ragSettingsSchema } from "../schemas/ragSettings.schema.js";
import {
  createVaultTemplateSchema,
  updateVaultTemplateSchema,
} from "../schemas/vaultTemplate.schema.js";
import {
  createGraphEdgeSchema,
  createGraphEdgeTypeSchema,
  createGraphNodeSchema,
  createGraphSchema,
  graphMembershipSchema,
  graphProjectionRetrySchema,
  graphTraversalSchema,
  updateGraphEdgeSchema,
  updateGraphEdgeTypeSchema,
  updateGraphNodeSchema,
  updateGraphSchema,
} from "../schemas/graph.schema.js";
import {
  createWorkflowDefinitionSchema,
  createWorkflowVersionSchema,
  lifecycleWorkflowInstanceSchema,
  publishWorkflowVersionParamsSchema,
  startWorkflowInstanceSchema,
  transitionWorkflowInstanceSchema,
  workflowInstanceListQuerySchema,
  workflowListQuerySchema,
} from "../schemas/workflow.schema.js";
import {
  createSmartCollectionSchema,
  createTaxonomyAliasSchema,
  createTaxonomyDimensionSchema,
  createTaxonomyRelationSchema,
  createTaxonomyTermSchema,
  smartCollectionOverrideSchema,
  taxonomySeedSchema,
  updateSmartCollectionSchema,
  updateTaxonomyDimensionSchema,
  updateTaxonomyRelationSchema,
  updateTaxonomyTermSchema,
} from "../schemas/taxonomy.schema.js";
import { taxonomyService } from "../services/taxonomyService.js";
import { graphService } from "../services/graphService.js";
import { workflowService } from "../services/workflowService.js";
import { graphMarkdownProjectionCoordinator } from "../services/graphMarkdownProjectionCoordinator.js";
import { vaultTemplateService } from "../services/vaultTemplateService.js";
import { projectGraphBindingService } from "../services/projectGraphBindingService.js";
import { contentFolderService } from "../services/contentFolderService.js";
import { contentDocumentStorageService } from "../services/contentDocumentStorageService.js";
import {
  contentDocumentAssetService,
  MAX_CONTENT_DOCUMENT_ASSET_BYTES,
} from "../services/contentDocumentAssetService.js";
import {
  createContentDocumentSchema,
  createContentFolderSchema,
  updateContentDocumentSchema,
  updateContentFolderSchema,
} from "../schemas/contentDocument.schema.js";

export const adminRouter = Router();

const contentTypeSchema = z.enum(["blog", "knowledge"]);
const contentTypeFilterSchema = z.enum(["all", "blog", "knowledge"]);
const visibilityFilterSchema = z.enum(["all", "public", "private"]);

const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2048, "A videó URL legfeljebb 2048 karakter lehet.")
  .refine((value) => {
    if (!value) return true;

    try {
      const parsedUrl = new URL(value);
      return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
    } catch {
      return false;
    }
  }, "A videó URL érvényes HTTP vagy HTTPS cím legyen.");

const canonicalSlugSchema = z
  .string()
  .trim()
  .max(160, "A slug legfeljebb 160 karakter lehet.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "A slug csak kisbetűt, számot és egyszeres kötőjelet tartalmazhat.",
  );
const createSlugSchema = z.union([z.literal(""), canonicalSlugSchema]);

const adminContentListQuerySchema = z
  .object({
    projectId: z.string().trim().min(1).max(128).optional().default("all"),
    visibility: visibilityFilterSchema.optional().default("all"),
    content_type: contentTypeFilterSchema.optional().default("all"),
  })
  .passthrough();

const createAdminContentSchema = z
  .object({
    content_type: contentTypeSchema.optional().default("blog"),
    slug: createSlugSchema.optional(),
    video_url: optionalHttpUrlSchema.optional().default(""),
  })
  .passthrough();

const updateAdminContentSchema = z
  .object({
    content_type: contentTypeSchema.optional(),
    slug: canonicalSlugSchema.optional(),
    video_url: optionalHttpUrlSchema.optional(),
  })
  .passthrough();

function sendQueryValidationError(req, res, result) {
  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));

  logger.warn(`[VALIDATION_FAILED] ${req.method} ${req.originalUrl}`, {
    source: "query",
    errors,
    ip: req.ip,
  });

  return res.status(400).json({
    success: false,
    error: "VALIDATION_ERROR",
    message: "Érvénytelen bemeneti adatok.",
    details: errors,
    timestamp: new Date().toISOString(),
  });
}

function taxonomyActor(req) {
  return String(
    req.adminUser?.sub || req.adminUser?.role || "OVERSEER_ADMIN",
  ).slice(0, 160);
}

function graphActor(req) {
  return String(
    req.adminUser?.sub || req.adminUser?.role || "OVERSEER_ADMIN",
  ).slice(0, 160);
}

function workflowActor(req) {
  return {
    type: "human",
    id: String(
      req.adminUser?.sub || req.adminUser?.role || "OVERSEER_ADMIN",
    ).slice(0, 160),
    label: "",
  };
}

function vaultTemplateActor(req) {
  return String(
    req.adminUser?.sub || req.adminUser?.role || "OVERSEER_ADMIN",
  ).slice(0, 160);
}

function sendVaultTemplateError(res, error) {
  const code = String(
    error?.code || error?.message || "VAULT_TEMPLATE_OPERATION_FAILED",
  );
  const status = /(?:NOT_FOUND|FILE_MISSING)$/.test(code)
    ? 404
    : /(?:ALREADY_EXISTS|FILE_ALREADY_EXISTS)$/.test(code)
      ? 409
      : 400;
  return res.status(status).json({
    success: false,
    error: code,
    ...(error?.details ? { details: error.details } : {}),
  });
}

function sendTaxonomyError(res, error) {
  const code = String(error?.message || "TAXONOMY_OPERATION_FAILED");
  const status = /(?:NOT_FOUND)$/.test(code)
    ? 404
    : /(?:ALREADY_EXISTS|CONFLICT|IN_USE|PROTECTED|HAS_TERMS|SLUG_ALREADY_EXISTS)$/.test(
          code,
        )
      ? 409
      : 400;
  return res.status(status).json({
    success: false,
    error: code,
    ...(Array.isArray(error?.issues) ? { details: error.issues } : {}),
    ...(error?.details ? { details: error.details } : {}),
  });
}

function sendGraphError(res, error) {
  const code = String(error?.message || "GRAPH_OPERATION_FAILED");
  const status = /(?:NOT_FOUND)$/.test(code)
    ? 404
    : /(?:ALREADY_EXISTS|SLUG_ALREADY_EXISTS|CONFLICT|IN_USE|HAS_EDGES|NOT_IN_GRAPH|MEMBERSHIP_NOT_FOUND)$/.test(
          code,
        )
      ? 409
      : 400;
  return res.status(status).json({
    success: false,
    error: code,
    ...(error?.details ? { details: error.details } : {}),
  });
}

function sendWorkflowError(res, error) {
  const code = String(error?.message || "WORKFLOW_OPERATION_FAILED");
  const status = /(?:NOT_FOUND)$/.test(code)
    ? 404
    : /(?:ALREADY_EXISTS|SLUG_ALREADY_EXISTS|NOT_LATEST|SUPERSEDED|NOT_DRAFT|NOT_PUBLISHED|INACTIVE|NOT_RUNNING|SOURCE_MISMATCH|ACTOR_NOT_ALLOWED|EVIDENCE_REQUIRED|GUARD_NOT_SATISFIED|ITERATION_LIMIT|MAX_TOTAL_STEPS_REACHED|LIFECYCLE_STATE_INVALID)$/.test(
          code,
        )
      ? 409
      : 400;
  return res.status(status).json({
    success: false,
    error: code,
    ...(error?.details ? { details: error.details } : {}),
  });
}

// Filesystem projection is intentionally post-commit and best-effort. A
// Markdown drift/IO failure must never roll back the canonical graph mutation;
// the response carries retry_node_ids for the protected retry endpoint.
function projectCommittedGraphEdges(edges) {
  try {
    return graphMarkdownProjectionCoordinator.projectCommittedEdges({ edges });
  } catch (error) {
    logger.error(
      "Failed to coordinate committed graph Markdown projection",
      error,
    );
    return {
      attempted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 1,
      retry_node_ids: [],
      results: [
        {
          status: "FAILED",
          error: String(error?.message || "CA_SYSTEM_PROJECTION_FAILED"),
        },
      ],
    };
  }
}

function stableContentJson(value) {
  if (Array.isArray(value))
    return `[${value.map(stableContentJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableContentJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function documentRevision(document) {
  const canonical = {
    id: Number(document.id),
    slug: document.slug,
    title: document.title,
    summary: document.summary,
    content: document.content,
    content_type: document.content_type,
    presentation_profile: document.presentation_profile,
    category: document.category,
    dimensions: document.dimensions || {},
    visibility: document.visibility,
    published: Number(document.published),
    folder_id: document.folder_id || null,
    updated_at: document.updated_at || "",
  };
  return crypto
    .createHash("sha256")
    .update(stableContentJson(canonical))
    .digest("hex");
}

function folderFlatList(tree, parents = []) {
  return (tree || []).flatMap((folder) => {
    const path = [...parents, folder.name];
    const current = {
      id: folder.id,
      parent_id: folder.parent_id || null,
      name: folder.name,
      slug: folder.slug,
      sort_order: Number(folder.sort_order || 0),
      path: path.join(" / "),
      depth: parents.length,
      document_count: Number(folder.document_count || 0),
    };
    return [current, ...folderFlatList(folder.children, path)];
  });
}

function sendContentFolderError(res, error) {
  const code = String(
    error?.code || error?.message || "CONTENT_FOLDER_OPERATION_FAILED",
  );
  const status = /(?:NOT_FOUND)$/.test(code)
    ? 404
    : /(?:CONFLICT|HAS_CHILDREN|HAS_DOCUMENTS|CYCLE)$/.test(code)
      ? 409
      : 400;
  return res.status(status).json({
    success: false,
    error: code,
    ...(error?.details ? { details: error.details } : {}),
  });
}

function readContentDocumentId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error("INVALID_CONTENT_DOCUMENT_ID");
    error.code = "INVALID_CONTENT_DOCUMENT_ID";
    throw error;
  }
  return id;
}

function sendContentDocumentError(res, error) {
  const code = String(
    error?.code || error?.message || "CONTENT_DOCUMENT_OPERATION_FAILED",
  );
  const status = /(?:NOT_FOUND)$/.test(code)
    ? 404
    : /(?:CONFLICT|SQLITE_CONSTRAINT_UNIQUE)$/.test(code)
      ? 409
      : code === "CONTENT_DOCUMENT_TOO_LARGE"
        ? 413
        : 400;
  return res.status(status).json({
    success: false,
    error: code,
    ...(error?.details ? { details: error.details } : {}),
  });
}

// The Content/ Markdown package is canonical. Legacy database projections may
// remain readable for diagnostics, but no route may mutate document placement,
// body, metadata, or assets independently of its vault package.
const rejectVaultAuthoritativeMutation = (_req, res) =>
  res.status(409).json({
    success: false,
    error: "VAULT_AUTHORITATIVE",
    message:
      "A dokumentum, a csomagelhelyezés és a csatolmányok kanonikus helye a Content/ Vault-csomag. Szerkeszd az index.md-t és a dokumentum saját assets/ könyvtárát, majd futtasd a Vault szinkront.",
    source_of_truth: "LOCAL_VAULT",
    vault_sync_endpoint: "/api/admin/vault/sync",
  });

function sendContentDocumentAssetError(res, error) {
  const code = String(
    error?.code || error?.message || "CONTENT_DOCUMENT_ASSET_OPERATION_FAILED",
  );
  const status = /(?:NOT_FOUND)$/.test(code)
    ? 404
    : /(?:ALREADY_EXISTS)$/.test(code)
      ? 409
      : /(?:TOO_LARGE)$/.test(code)
        ? 413
        : /(?:BINARY_BODY_REQUIRED|UNSUPPORTED_MEDIA_TYPE)$/.test(code)
          ? 415
          : 400;
  return res.status(status).json({
    success: false,
    error: code,
    ...(error?.details ? { details: error.details } : {}),
  });
}

function documentAssetUrl(document, asset) {
  return `/api/documents/${encodeURIComponent(document.slug)}/assets/${encodeURIComponent(asset.id)}`;
}

function serializeContentDocumentAsset(document, asset) {
  const url = documentAssetUrl(document, asset);
  return {
    id: asset.id,
    document_id: Number(asset.document_id),
    relative_path: asset.relative_path,
    original_name: asset.original_name,
    mime_type: asset.mime_type,
    byte_size: Number(asset.byte_size),
    sha256: asset.sha256,
    asset_kind: asset.asset_kind,
    visibility: asset.visibility,
    availability: asset.availability,
    url,
    markdown_url: url,
    markdown_link: `[${asset.original_name}](${url})`,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
  };
}

const contentDocumentAssetRawBody = express.raw({
  type: "application/octet-stream",
  limit: MAX_CONTENT_DOCUMENT_ASSET_BYTES,
});

function parseContentDocumentAssetRawBody(req, res, next) {
  return contentDocumentAssetRawBody(req, res, (error) => {
    if (error?.type === "entity.too.large" || error?.status === 413) {
      return res.status(413).json({
        success: false,
        error: "CONTENT_DOCUMENT_ASSET_TOO_LARGE",
        details: { max_bytes: MAX_CONTENT_DOCUMENT_ASSET_BYTES },
      });
    }
    return next(error);
  });
}

function storageForDocument(document, actor) {
  try {
    return {
      storage: contentDocumentStorageService.ensureDocumentStorage(
        document.id,
        actor,
      ),
      storage_error: null,
    };
  } catch (error) {
    logger.error(
      "[CONTENT_STORAGE] Cannot provision document asset directory",
      {
        post_id: document.id,
        code: error?.code || error?.message,
      },
    );
    return {
      storage: contentDocumentStorageService.getDocumentStorage(document.id),
      storage_error: String(
        error?.code || error?.message || "CONTENT_DOCUMENT_STORAGE_UNAVAILABLE",
      ),
    };
  }
}

function serializeEditableDocument(document, actor = "SYSTEM") {
  const { storage, storage_error: storageError } = storageForDocument(
    document,
    actor,
  );
  return {
    id: Number(document.id),
    slug: document.slug,
    title: document.title,
    summary: document.summary,
    content: document.content,
    content_type: document.content_type,
    presentation_profile: document.presentation_profile,
    folder_id: document.folder_id || null,
    folder_name: document.folder_name || "",
    folder_path: document.folder_path || "",
    asset_directory: storage?.asset_directory || "",
    asset_storage_state: storage?.state || "missing",
    ...(storageError ? { asset_storage_error: storageError } : {}),
    visibility: document.visibility,
    published: Number(document.published),
    revision: documentRevision(document),
    updated_at: document.updated_at || "",
  };
}

// 1. Admin Authentication (Brute-Force Protected & Zod Validated)
adminRouter.post(
  "/admin/login",
  authLimiter,
  validateBody(loginSchema),
  (req, res) => {
    const { pin } = req.body;

    if (pin && dbService.verifyPin(pin)) {
      const token = generateAdminToken({
        role: "OVERSEER_ADMIN",
        timestamp: Date.now(),
      });
      logger.security("ADMIN_LOGIN_SUCCESS", { ip: req.ip });
      return res.json({ success: true, token, role: "OVERSEER_ADMIN" });
    }

    logger.security("ADMIN_LOGIN_FAILED", { ip: req.ip });
    res.status(401).json({ error: "SECURITY_AUTH_FAILED: ACCESS_DENIED" });
  },
);

adminRouter.post("/admin/verify", authMiddleware, (req, res) => {
  res.json({ success: true, status: "TOKEN_VALID", user: req.adminUser });
});

// A small, no-side-effect bootstrap check for the persisted browser session.
// It intentionally returns only the claims the UI needs, not the JWT itself.
adminRouter.get(
  "/admin/session",
  authMiddleware,
  requireOverseerAdmin,
  (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({
      authenticated: true,
      role: req.adminUser?.role || null,
      expires_at: Number.isFinite(Number(req.adminUser?.exp))
        ? new Date(Number(req.adminUser.exp) * 1000).toISOString()
        : null,
      preview: {
        header: "X-CA-Preview",
        value: "admin",
      },
    });
  },
);

// 2. Global Settings
adminRouter.get("/admin/settings", authMiddleware, (req, res) => {
  try {
    const settings = dbService.getSettings();
    res.json(settings);
  } catch (err) {
    logger.error("Failed to fetch settings", err);
    res.status(500).json({ error: "DATABASE_QUERY_ERROR" });
  }
});

adminRouter.put(
  "/admin/settings",
  authMiddleware,
  validateBody(settingsSchema),
  (req, res) => {
    try {
      const settings = req.body;
      dbService.updateSettings(settings, "ADMIN_DASHBOARD");
      logger.info("Global settings updated by admin");
      res.json({ success: true, message: "SETTINGS_SYNCHRONIZED" });
    } catch (err) {
      logger.error("Failed to update settings", err);
      res.status(500).json({ error: "UPDATE_FAILED" });
    }
  },
);

// 2b. Private RAG Tuning Console
adminRouter.get("/admin/rag-settings", authMiddleware, (req, res) => {
  try {
    res.json({ config: dbService.getRagSettings() });
  } catch (err) {
    logger.error("Failed to fetch RAG settings", err);
    res.status(500).json({ error: "RAG_SETTINGS_QUERY_FAILED" });
  }
});

adminRouter.put(
  "/admin/rag-settings",
  authMiddleware,
  validateBody(ragSettingsSchema),
  (req, res) => {
    try {
      const config = dbService.updateRagSettings(req.body, "ADMIN_DASHBOARD");
      logger.info("RAG tuning updated by admin");
      res.json({ success: true, config });
    } catch (err) {
      logger.error("Failed to update RAG settings", err);
      res.status(500).json({ error: "RAG_SETTINGS_UPDATE_FAILED" });
    }
  },
);

adminRouter.post("/admin/rag-settings/reindex", authMiddleware, (req, res) => {
  try {
    const result = dbService.reindexRagEmbeddings("ADMIN_DASHBOARD");
    logger.info(`RAG embeddings reindexed: ${result.reindexed}`);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error("Failed to reindex RAG embeddings", err);
    res.status(500).json({ error: "RAG_REINDEX_FAILED" });
  }
});

// 2c. Central, versioned Obsidian template catalog. The catalog controls only
// template files; canonical document content is still authored in the Vault.
adminRouter.get("/admin/vault/templates", authMiddleware, (_req, res) => {
  try {
    return res.json({ templates: vaultTemplateService.listTemplates() });
  } catch (error) {
    logger.error("Failed to list central Vault templates", error);
    return sendVaultTemplateError(res, error);
  }
});

adminRouter.get("/admin/vault/templates/:id", authMiddleware, (req, res) => {
  try {
    return res.json({
      template: vaultTemplateService.getTemplate(req.params.id),
    });
  } catch (error) {
    logger.error(
      `Failed to read central Vault template [${req.params.id}]`,
      error,
    );
    return sendVaultTemplateError(res, error);
  }
});

adminRouter.post(
  "/admin/vault/templates",
  authMiddleware,
  validateBody(createVaultTemplateSchema),
  (req, res) => {
    try {
      const template = vaultTemplateService.createTemplate(req.body);
      dbService.recordAuditLog({
        action: "CREATE_VAULT_TEMPLATE",
        entity: "vault_templates",
        entity_id: template.id,
        prev_state: null,
        new_state: { ...template, body: undefined },
        actor: vaultTemplateActor(req),
      });
      return res.status(201).json({ success: true, template });
    } catch (error) {
      logger.error("Failed to create central Vault template", error);
      return sendVaultTemplateError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/vault/templates/:id",
  authMiddleware,
  validateBody(updateVaultTemplateSchema),
  (req, res) => {
    try {
      const previous = vaultTemplateService.getTemplate(req.params.id);
      const template = vaultTemplateService.updateTemplate(
        req.params.id,
        req.body,
      );
      dbService.recordAuditLog({
        action: "UPDATE_VAULT_TEMPLATE",
        entity: "vault_templates",
        entity_id: template.id,
        prev_state: { ...previous, body: undefined },
        new_state: { ...template, body: undefined },
        actor: vaultTemplateActor(req),
      });
      return res.json({ success: true, template });
    } catch (error) {
      logger.error(
        `Failed to update central Vault template [${req.params.id}]`,
        error,
      );
      return sendVaultTemplateError(res, error);
    }
  },
);

adminRouter.delete("/admin/vault/templates/:id", authMiddleware, (req, res) => {
  try {
    const previous = vaultTemplateService.getTemplate(req.params.id);
    const result = vaultTemplateService.deleteTemplate(req.params.id);
    dbService.recordAuditLog({
      action: "DELETE_VAULT_TEMPLATE",
      entity: "vault_templates",
      entity_id: result.id,
      prev_state: { ...previous, body: undefined },
      new_state: null,
      actor: vaultTemplateActor(req),
    });
    return res.json({ success: true, result });
  } catch (error) {
    logger.error(
      `Failed to delete central Vault template [${req.params.id}]`,
      error,
    );
    return sendVaultTemplateError(res, error);
  }
});

// 3. Manage Skills (Arsenal)
adminRouter.post("/admin/skills", authMiddleware, (req, res) => {
  try {
    const { name, icon, color, level, desc, sort_order } = req.body;
    const skill = dbService.createSkill(
      { name, icon, color, level, desc, sort_order },
      "ADMIN_DASHBOARD",
    );
    logger.info(`Skill created: ${name}`, { id: skill.id });
    res.json({ success: true, id: skill.id });
  } catch (err) {
    logger.error("Failed to insert skill", err);
    res.status(500).json({ error: "INSERT_FAILED" });
  }
});

adminRouter.put("/admin/skills/:id", authMiddleware, (req, res) => {
  try {
    const { name, icon, color, level, desc, sort_order } = req.body;
    dbService.updateSkill(
      req.params.id,
      { name, icon, color, level, desc, sort_order },
      "ADMIN_DASHBOARD",
    );
    logger.info(`Skill updated: #${req.params.id} (${name})`);
    res.json({ success: true, message: "SKILL_RECORD_UPDATED" });
  } catch (err) {
    logger.error("Failed to update skill", err);
    res.status(500).json({ error: "UPDATE_FAILED" });
  }
});

adminRouter.delete("/admin/skills/:id", authMiddleware, (req, res) => {
  try {
    dbService.deleteSkill(req.params.id, "ADMIN_DASHBOARD");
    logger.info(`Skill deleted: #${req.params.id}`);
    res.json({ success: true, message: "SKILL_RECORD_DELETED" });
  } catch (err) {
    logger.error("Failed to delete skill", err);
    res.status(500).json({ error: "DELETE_FAILED" });
  }
});

// 4. Manage Projects (The Grid)
adminRouter.post("/admin/projects", authMiddleware, (req, res) => {
  try {
    const { id, title, desc, img, tags, status, addr, sec_auth, sort_order } =
      req.body;
    const proj = dbService.createProject(
      { id, title, desc, img, tags, status, addr, sec_auth, sort_order },
      "ADMIN_DASHBOARD",
    );
    logger.info(`Project created: [${proj.id}] ${title}`);
    res.json({ success: true, id: proj.id });
  } catch (err) {
    logger.error("Failed to insert project", err);
    res.status(500).json({ error: "INSERT_FAILED" });
  }
});

adminRouter.put("/admin/projects/:id", authMiddleware, (req, res) => {
  try {
    const { title, desc, img, tags, status, addr, sec_auth, sort_order } =
      req.body;
    dbService.updateProject(
      req.params.id,
      { title, desc, img, tags, status, addr, sec_auth, sort_order },
      "ADMIN_DASHBOARD",
    );
    logger.info(`Project updated: [${req.params.id}] ${title}`);
    res.json({ success: true, message: "PROJECT_RECORD_UPDATED" });
  } catch (err) {
    logger.error("Failed to update project", err);
    res.status(500).json({ error: "UPDATE_FAILED" });
  }
});

adminRouter.delete("/admin/projects/:id", authMiddleware, (req, res) => {
  try {
    dbService.deleteProject(req.params.id, "ADMIN_DASHBOARD");
    logger.info(`Project deleted: [${req.params.id}]`);
    res.json({ success: true, message: "PROJECT_RECORD_DELETED" });
  } catch (err) {
    logger.error("Failed to delete project", err);
    res.status(500).json({ error: "DELETE_FAILED" });
  }
});

// 5. Knowledge Projects Management (Admin View & CRUD)
adminRouter.get("/admin/knowledge/projects", authMiddleware, (req, res) => {
  try {
    const projects = dbService.getKnowledgeProjects({ visibility: "all" });
    res.json(
      projects.map((project) => ({
        ...project,
        graph_id: projectGraphBindingService.projectGraphId(project.id),
      })),
    );
  } catch (err) {
    logger.error("Failed to fetch admin knowledge projects", err);
    res.status(500).json({ error: "DATABASE_QUERY_ERROR" });
  }
});

adminRouter.post("/admin/knowledge/projects", authMiddleware, (req, res) => {
  try {
    const created = dbService.createKnowledgeProject(
      req.body,
      "ADMIN_DASHBOARD",
    );
    const binding = projectGraphBindingService.ensureProjectGraph({
      project: created,
      actor: graphActor(req),
    });
    logger.info(
      `Knowledge project registered: [${created.id}] ${created.name}`,
    );
    res.json({ success: true, project: created, graph: binding.graph });
  } catch (err) {
    logger.error("Failed to create knowledge project", err);
    res.status(500).json({ error: err.message || "CREATION_FAILED" });
  }
});

adminRouter.put("/admin/knowledge/projects/:id", authMiddleware, (req, res) => {
  try {
    const updated = dbService.updateKnowledgeProject(
      req.params.id,
      req.body,
      "ADMIN_DASHBOARD",
    );
    const binding = projectGraphBindingService.ensureProjectGraph({
      project: updated,
      actor: graphActor(req),
    });
    logger.info(
      `Knowledge project updated: [${req.params.id}] ${updated.name}`,
    );
    res.json({ success: true, project: updated, graph: binding.graph });
  } catch (err) {
    logger.error(`Failed to update knowledge project [${req.params.id}]`, err);
    res.status(500).json({ error: err.message || "UPDATE_FAILED" });
  }
});

adminRouter.delete(
  "/admin/knowledge/projects/:id",
  authMiddleware,
  (req, res) => {
    try {
      const result = dbService.deleteKnowledgeProject(
        req.params.id,
        "ADMIN_DASHBOARD",
      );
      logger.info(`Knowledge project deleted: [${req.params.id}]`);
      res.json({ success: true, result });
    } catch (err) {
      logger.error(
        `Failed to delete knowledge project [${req.params.id}]`,
        err,
      );
      res.status(500).json({ error: err.message || "DELETE_FAILED" });
    }
  },
);

adminRouter.get("/admin/knowledge/search", authMiddleware, (req, res) => {
  try {
    const { q, projectId, iparag, technologia, celcsoport, limit } = req.query;
    const results = dbService.searchKnowledge({
      query: q || "",
      projectId: projectId || "all",
      iparag,
      technologia,
      celcsoport,
      visibility: "all",
      limit: Number(limit) || 50,
    });
    res.json(results);
  } catch (err) {
    logger.error("Failed to execute admin knowledge search", err);
    res.status(500).json({ error: "SEARCH_QUERY_ERROR" });
  }
});

// 5b. Taxonomy registry. The registry is admin-owned. The contextual
// document editor deliberately preserves existing taxonomy assignments; a
// dedicated membership workflow can evolve independently of document bodies.
adminRouter.get("/admin/knowledge/taxonomy", authMiddleware, (_req, res) => {
  try {
    return res.json(
      taxonomyService.getRegistry({
        visibility: "all",
        includeInactive: true,
        includeAliases: true,
        includeRelations: true,
        includeSmartCollections: true,
      }),
    );
  } catch (error) {
    logger.error("Failed to read admin taxonomy registry", error);
    return sendTaxonomyError(res, error);
  }
});

adminRouter.post(
  "/admin/taxonomy/seed",
  authMiddleware,
  validateBody(taxonomySeedSchema),
  (req, res) => {
    try {
      const report = taxonomyService.seedLegacyTerms({
        includeInactivePosts: req.body.include_inactive_posts,
        actor: taxonomyActor(req),
      });
      return res.json({ success: true, report });
    } catch (error) {
      logger.error("Failed to seed taxonomy from legacy dimensions", error);
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/taxonomy/dimensions",
  authMiddleware,
  validateBody(createTaxonomyDimensionSchema),
  (req, res) => {
    try {
      const dimension = taxonomyService.createDimension(
        req.body,
        taxonomyActor(req),
      );
      return res.status(201).json({ success: true, dimension });
    } catch (error) {
      logger.error("Failed to create taxonomy dimension", error);
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/taxonomy/dimensions/:id",
  authMiddleware,
  validateBody(updateTaxonomyDimensionSchema),
  (req, res) => {
    try {
      const dimension = taxonomyService.updateDimension(
        req.params.id,
        req.body,
        taxonomyActor(req),
      );
      return res.json({ success: true, dimension });
    } catch (error) {
      logger.error(
        `Failed to update taxonomy dimension [${req.params.id}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/taxonomy/dimensions/:id",
  authMiddleware,
  (req, res) => {
    try {
      return res.json(
        taxonomyService.deleteDimension(req.params.id, taxonomyActor(req)),
      );
    } catch (error) {
      logger.error(
        `Failed to delete taxonomy dimension [${req.params.id}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/taxonomy/terms",
  authMiddleware,
  validateBody(createTaxonomyTermSchema),
  (req, res) => {
    try {
      const term = taxonomyService.createTerm(req.body, taxonomyActor(req));
      return res.status(201).json({ success: true, term });
    } catch (error) {
      logger.error("Failed to create taxonomy term", error);
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/taxonomy/terms/:id",
  authMiddleware,
  validateBody(updateTaxonomyTermSchema),
  (req, res) => {
    try {
      const term = taxonomyService.updateTerm(
        req.params.id,
        req.body,
        taxonomyActor(req),
      );
      return res.json({ success: true, term });
    } catch (error) {
      logger.error(`Failed to update taxonomy term [${req.params.id}]`, error);
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.delete("/admin/taxonomy/terms/:id", authMiddleware, (req, res) => {
  try {
    return res.json(
      taxonomyService.deleteTerm(req.params.id, taxonomyActor(req)),
    );
  } catch (error) {
    logger.error(`Failed to delete taxonomy term [${req.params.id}]`, error);
    return sendTaxonomyError(res, error);
  }
});

adminRouter.post(
  "/admin/taxonomy/terms/:termId/aliases",
  authMiddleware,
  validateBody(createTaxonomyAliasSchema),
  (req, res) => {
    try {
      const alias = taxonomyService.createAlias(
        req.params.termId,
        req.body.alias,
        taxonomyActor(req),
      );
      return res.status(201).json({ success: true, alias });
    } catch (error) {
      logger.error(
        `Failed to create taxonomy alias for [${req.params.termId}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/taxonomy/aliases/:id",
  authMiddleware,
  (req, res) => {
    try {
      return res.json(
        taxonomyService.deleteAlias(req.params.id, taxonomyActor(req)),
      );
    } catch (error) {
      logger.error(`Failed to delete taxonomy alias [${req.params.id}]`, error);
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/taxonomy/relations",
  authMiddleware,
  validateBody(createTaxonomyRelationSchema),
  (req, res) => {
    try {
      const relation = taxonomyService.createRelation(
        req.body,
        taxonomyActor(req),
      );
      return res.status(201).json({ success: true, relation });
    } catch (error) {
      logger.error("Failed to create taxonomy relation", error);
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/taxonomy/relations/:id",
  authMiddleware,
  validateBody(updateTaxonomyRelationSchema),
  (req, res) => {
    try {
      const relation = taxonomyService.updateRelation(
        req.params.id,
        req.body,
        taxonomyActor(req),
      );
      return res.json({ success: true, relation });
    } catch (error) {
      logger.error(
        `Failed to update taxonomy relation [${req.params.id}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/taxonomy/relations/:id",
  authMiddleware,
  (req, res) => {
    try {
      return res.json(
        taxonomyService.deleteRelation(req.params.id, taxonomyActor(req)),
      );
    } catch (error) {
      logger.error(
        `Failed to delete taxonomy relation [${req.params.id}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.get("/admin/smart-collections", authMiddleware, (req, res) => {
  try {
    return res.json(
      taxonomyService.listSmartCollections({
        scope: "all",
        includeInactive: true,
      }),
    );
  } catch (error) {
    logger.error("Failed to read smart collections", error);
    return sendTaxonomyError(res, error);
  }
});

adminRouter.post(
  "/admin/smart-collections",
  authMiddleware,
  validateBody(createSmartCollectionSchema),
  (req, res) => {
    try {
      const collection = taxonomyService.createSmartCollection(
        req.body,
        taxonomyActor(req),
      );
      return res.status(201).json({ success: true, collection });
    } catch (error) {
      logger.error("Failed to create smart collection", error);
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/smart-collections/:id",
  authMiddleware,
  validateBody(updateSmartCollectionSchema),
  (req, res) => {
    try {
      const collection = taxonomyService.updateSmartCollection(
        req.params.id,
        req.body,
        taxonomyActor(req),
      );
      return res.json({ success: true, collection });
    } catch (error) {
      logger.error(
        `Failed to update smart collection [${req.params.id}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/smart-collections/:id",
  authMiddleware,
  (req, res) => {
    try {
      return res.json(
        taxonomyService.deleteSmartCollection(
          req.params.id,
          taxonomyActor(req),
        ),
      );
    } catch (error) {
      logger.error(
        `Failed to delete smart collection [${req.params.id}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.get(
  "/admin/smart-collections/:id/overrides",
  authMiddleware,
  (req, res) => {
    try {
      return res.json({
        overrides: taxonomyService.listSmartCollectionOverrides(req.params.id),
      });
    } catch (error) {
      logger.error(
        `Failed to list smart collection overrides [${req.params.id}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/smart-collections/:id/overrides/:postId",
  authMiddleware,
  validateBody(smartCollectionOverrideSchema),
  (req, res) => {
    try {
      const override = taxonomyService.setSmartCollectionOverride({
        collectionId: req.params.id,
        postId: req.params.postId,
        mode: req.body.mode,
        actor: taxonomyActor(req),
      });
      return res.json({ success: true, override });
    } catch (error) {
      logger.error(
        `Failed to set smart collection override [${req.params.id}:${req.params.postId}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/smart-collections/:id/overrides/:postId",
  authMiddleware,
  (req, res) => {
    try {
      return res.json(
        taxonomyService.deleteSmartCollectionOverride({
          collectionId: req.params.id,
          postId: req.params.postId,
          actor: taxonomyActor(req),
        }),
      );
    } catch (error) {
      logger.error(
        `Failed to delete smart collection override [${req.params.id}:${req.params.postId}]`,
        error,
      );
      return sendTaxonomyError(res, error);
    }
  },
);

// 5c. Native Workflow v1. A definition belongs to a graph layer for topology
// and visual context, but `graph_edges` remain non-executable facts. Only the
// immutable workflow-version transition table can change an instance state.
adminRouter.use("/admin/workflows", authMiddleware, requireOverseerAdmin);
adminRouter.use(
  "/admin/workflow-instances",
  authMiddleware,
  requireOverseerAdmin,
);

adminRouter.get("/admin/workflows", (req, res) => {
  const parsed = workflowListQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendQueryValidationError(req, res, parsed);
  try {
    return res.json({ workflows: workflowService.listWorkflows(parsed.data) });
  } catch (error) {
    logger.error("Failed to list workflow definitions", error);
    return sendWorkflowError(res, error);
  }
});

adminRouter.post(
  "/admin/workflows",
  validateBody(createWorkflowDefinitionSchema),
  (req, res) => {
    try {
      const workflow = workflowService.createWorkflow(
        req.body,
        workflowActor(req),
      );
      return res.status(201).json({ success: true, workflow });
    } catch (error) {
      logger.error("Failed to create workflow definition", error);
      return sendWorkflowError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/workflows/:workflowId/versions",
  validateBody(createWorkflowVersionSchema),
  (req, res) => {
    try {
      const result = workflowService.createWorkflowVersion(
        req.params.workflowId,
        req.body,
        workflowActor(req),
      );
      return res.status(201).json({ success: true, ...result });
    } catch (error) {
      logger.error(
        `Failed to create workflow version [${req.params.workflowId}]`,
        error,
      );
      return sendWorkflowError(res, error);
    }
  },
);

// PUT is a compatibility alias for clients that conceptualize saving a draft
// as an update. It still creates a new immutable revision; it never rewrites
// a published definition or changes an in-flight instance.
adminRouter.put(
  "/admin/workflows/:workflowId/versions",
  validateBody(createWorkflowVersionSchema),
  (req, res) => {
    try {
      const result = workflowService.createWorkflowVersion(
        req.params.workflowId,
        req.body,
        workflowActor(req),
      );
      return res.status(201).json({ success: true, ...result });
    } catch (error) {
      logger.error(
        `Failed to create workflow version [${req.params.workflowId}]`,
        error,
      );
      return sendWorkflowError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/workflows/:workflowId/versions/:version/publish",
  validate(publishWorkflowVersionParamsSchema, "params"),
  (req, res) => {
    try {
      const workflow = workflowService.publishWorkflowVersion(
        req.params.workflowId,
        req.params.version,
        workflowActor(req),
      );
      return res.json({ success: true, workflow });
    } catch (error) {
      logger.error(
        `Failed to publish workflow version [${req.params.workflowId}:${req.params.version}]`,
        error,
      );
      return sendWorkflowError(res, error);
    }
  },
);

// Convenience alias for the current draft. The explicit versioned route above
// remains the canonical machine-friendly endpoint.
adminRouter.post("/admin/workflows/:workflowId/publish", (req, res) => {
  try {
    const current = workflowService.getWorkflow(
      req.params.workflowId,
    ).current_version;
    if (!current) throw new Error("WORKFLOW_VERSION_NOT_FOUND");
    const workflow = workflowService.publishWorkflowVersion(
      req.params.workflowId,
      current.version_number,
      workflowActor(req),
    );
    return res.json({ success: true, workflow });
  } catch (error) {
    logger.error(
      `Failed to publish current workflow version [${req.params.workflowId}]`,
      error,
    );
    return sendWorkflowError(res, error);
  }
});

adminRouter.get("/admin/workflows/:workflowId", (req, res) => {
  try {
    return res.json({
      workflow: workflowService.getWorkflow(req.params.workflowId),
    });
  } catch (error) {
    logger.error(
      `Failed to read workflow definition [${req.params.workflowId}]`,
      error,
    );
    return sendWorkflowError(res, error);
  }
});

adminRouter.post(
  "/admin/workflows/:workflowId/instances",
  validateBody(startWorkflowInstanceSchema),
  (req, res) => {
    try {
      const instance = workflowService.startWorkflowInstance(
        req.params.workflowId,
        req.body,
        workflowActor(req),
      );
      return res.status(201).json({ success: true, instance });
    } catch (error) {
      logger.error(
        `Failed to start workflow instance [${req.params.workflowId}]`,
        error,
      );
      return sendWorkflowError(res, error);
    }
  },
);

adminRouter.get("/admin/workflow-instances", (req, res) => {
  const parsed = workflowInstanceListQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendQueryValidationError(req, res, parsed);
  try {
    return res.json({
      instances: workflowService.listWorkflowInstances(parsed.data),
    });
  } catch (error) {
    logger.error("Failed to list workflow instances", error);
    return sendWorkflowError(res, error);
  }
});

adminRouter.get("/admin/workflow-instances/:instanceId", (req, res) => {
  try {
    return res.json({
      instance: workflowService.getWorkflowInstance(req.params.instanceId),
    });
  } catch (error) {
    logger.error(
      `Failed to read workflow instance [${req.params.instanceId}]`,
      error,
    );
    return sendWorkflowError(res, error);
  }
});

adminRouter.post(
  "/admin/workflow-instances/:instanceId/transitions",
  validateBody(transitionWorkflowInstanceSchema),
  (req, res) => {
    try {
      const instance = workflowService.transitionWorkflowInstance(
        req.params.instanceId,
        req.body,
        workflowActor(req),
      );
      return res.json({ success: true, instance });
    } catch (error) {
      logger.error(
        `Failed to transition workflow instance [${req.params.instanceId}]`,
        error,
      );
      return sendWorkflowError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/workflow-instances/:instanceId/pause",
  validateBody(lifecycleWorkflowInstanceSchema),
  (req, res) => {
    try {
      const instance = workflowService.pauseWorkflowInstance(
        req.params.instanceId,
        req.body,
        workflowActor(req),
      );
      return res.json({ success: true, instance });
    } catch (error) {
      logger.error(
        `Failed to pause workflow instance [${req.params.instanceId}]`,
        error,
      );
      return sendWorkflowError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/workflow-instances/:instanceId/resume",
  validateBody(lifecycleWorkflowInstanceSchema),
  (req, res) => {
    try {
      const instance = workflowService.resumeWorkflowInstance(
        req.params.instanceId,
        req.body,
        workflowActor(req),
      );
      return res.json({ success: true, instance });
    } catch (error) {
      logger.error(
        `Failed to resume workflow instance [${req.params.instanceId}]`,
        error,
      );
      return sendWorkflowError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/workflow-instances/:instanceId/fail",
  validateBody(lifecycleWorkflowInstanceSchema),
  (req, res) => {
    try {
      const instance = workflowService.failWorkflowInstance(
        req.params.instanceId,
        req.body,
        workflowActor(req),
      );
      return res.json({ success: true, instance });
    } catch (error) {
      logger.error(
        `Failed to fail workflow instance [${req.params.instanceId}]`,
        error,
      );
      return sendWorkflowError(res, error);
    }
  },
);

// 5d. Database-owned directed multilayer graph. Graph rows commit first; a
// post-commit coordinator then mirrors eligible DB-owned arcs to CA:SYSTEM.
// Graph mutations can alter the canonical DB topology and may trigger a
// Markdown projection. Authentication alone is not sufficient here: viewers
// must never be able to reach these routes just by calling the API directly.
adminRouter.use("/admin/graphs", authMiddleware, requireOverseerAdmin);

adminRouter.get("/admin/graphs", authMiddleware, (req, res) => {
  try {
    return res.json({
      graphs: graphService.listGraphs({
        visibility: "all",
        includeInactive: true,
      }),
    });
  } catch (error) {
    logger.error("Failed to list graph definitions", error);
    return sendGraphError(res, error);
  }
});

adminRouter.post(
  "/admin/graphs",
  authMiddleware,
  validateBody(createGraphSchema),
  (req, res) => {
    try {
      const graph = graphService.createGraph(req.body, graphActor(req));
      return res.status(201).json({ success: true, graph });
    } catch (error) {
      logger.error("Failed to create graph definition", error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.get("/admin/graphs/edge-types", authMiddleware, (_req, res) => {
  try {
    return res.json({
      edge_types: graphService.listEdgeTypes({
        visibility: "all",
        includeInactive: true,
      }),
    });
  } catch (error) {
    logger.error("Failed to list graph edge types", error);
    return sendGraphError(res, error);
  }
});

// Resolves a Vault document to its existing canonical graph node(s). This is
// intentionally an exact DB binding lookup, not a title/slug heuristic.
adminRouter.get(
  "/admin/graphs/document-bindings/:postId",
  authMiddleware,
  (req, res) => {
    try {
      return res.json({
        nodes: graphService.listNodesForDocumentPostId(req.params.postId),
      });
    } catch (error) {
      logger.error(
        `Failed to resolve document graph bindings [${req.params.postId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

// The client asks for an existing document binding first.  When none exists,
// this endpoint creates exactly one node from the authoritative document/RAG
// identity.  It deliberately never accepts title, slug or source reference
// from the browser.
adminRouter.post(
  "/admin/graphs/document-bindings/:postId/ensure",
  authMiddleware,
  (req, res) => {
    try {
      const result = graphService.ensureDocumentNodeForPostId(
        req.params.postId,
        graphActor(req),
      );
      return res
        .status(result.created ? 201 : 200)
        .json({ success: true, ...result });
    } catch (error) {
      logger.error(
        `Failed to ensure document graph binding [${req.params.postId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/graphs/edge-types",
  authMiddleware,
  validateBody(createGraphEdgeTypeSchema),
  (req, res) => {
    try {
      const edge_type = graphService.createEdgeType(req.body, graphActor(req));
      return res.status(201).json({ success: true, edge_type });
    } catch (error) {
      logger.error("Failed to create graph edge type", error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/graphs/edge-types/:edgeTypeId",
  authMiddleware,
  validateBody(updateGraphEdgeTypeSchema),
  (req, res) => {
    try {
      const edge_type = graphService.updateEdgeType(
        req.params.edgeTypeId,
        req.body,
        graphActor(req),
      );
      return res.json({ success: true, edge_type });
    } catch (error) {
      logger.error(
        `Failed to update graph edge type [${req.params.edgeTypeId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/graphs/edge-types/:edgeTypeId",
  authMiddleware,
  (req, res) => {
    try {
      return res.json(
        graphService.deleteEdgeType(req.params.edgeTypeId, graphActor(req)),
      );
    } catch (error) {
      logger.error(
        `Failed to delete graph edge type [${req.params.edgeTypeId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

adminRouter.get("/admin/graphs/nodes", authMiddleware, (req, res) => {
  try {
    return res.json({
      nodes: graphService.listNodes({
        graphId: req.query.graph_id || null,
        visibility: "all",
        includeInactive: true,
        limit: req.query.limit,
      }),
    });
  } catch (error) {
    logger.error("Failed to list graph nodes", error);
    return sendGraphError(res, error);
  }
});

adminRouter.post(
  "/admin/graphs/nodes",
  authMiddleware,
  validateBody(createGraphNodeSchema),
  (req, res) => {
    try {
      const node = graphService.createNode(req.body, graphActor(req));
      return res.status(201).json({ success: true, node });
    } catch (error) {
      logger.error("Failed to create graph node", error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/graphs/nodes/:nodeId",
  authMiddleware,
  validateBody(updateGraphNodeSchema),
  (req, res) => {
    try {
      const node = graphService.updateNode(
        req.params.nodeId,
        req.body,
        graphActor(req),
      );
      return res.json({ success: true, node });
    } catch (error) {
      logger.error(`Failed to update graph node [${req.params.nodeId}]`, error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/graphs/nodes/:nodeId",
  authMiddleware,
  (req, res) => {
    try {
      return res.json(
        graphService.deleteNode(req.params.nodeId, graphActor(req)),
      );
    } catch (error) {
      logger.error(`Failed to delete graph node [${req.params.nodeId}]`, error);
      return sendGraphError(res, error);
    }
  },
);

// Narrow incident-edge read for the document workbench.  It uses the same
// relation mapper as Markdown projection rather than returning a global graph
// snapshot for every note that is opened.
adminRouter.get(
  "/admin/graphs/nodes/:nodeId/relations",
  authMiddleware,
  (req, res) => {
    try {
      const includeInactive =
        String(req.query.include_inactive || "").toLowerCase() !== "false";
      return res.json(
        graphService.listMarkdownProjectionRelations({
          sourceNodeId: req.params.nodeId,
          includeInactive,
        }),
      );
    } catch (error) {
      logger.error(
        `Failed to list document graph relations [${req.params.nodeId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

adminRouter.get("/admin/graphs/edges", authMiddleware, (req, res) => {
  try {
    return res.json({
      edges: graphService.listEdges({
        graphId: req.query.graph_id || null,
        visibility: "all",
        includeInactive: true,
        limit: req.query.limit,
      }),
    });
  } catch (error) {
    logger.error("Failed to list graph edges", error);
    return sendGraphError(res, error);
  }
});

adminRouter.post(
  "/admin/graphs/edges",
  authMiddleware,
  validateBody(createGraphEdgeSchema),
  (req, res) => {
    try {
      const result = graphService.createEdge(req.body, graphActor(req));
      const markdown_projection = projectCommittedGraphEdges([
        result.edge,
        ...(result.reciprocal_edge ? [result.reciprocal_edge] : []),
      ]);
      return res
        .status(201)
        .json({ success: true, ...result, markdown_projection });
    } catch (error) {
      logger.error("Failed to create graph edge", error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/graphs/edges/:edgeId",
  authMiddleware,
  validateBody(updateGraphEdgeSchema),
  (req, res) => {
    try {
      const edge = graphService.updateEdge(
        req.params.edgeId,
        req.body,
        graphActor(req),
      );
      const markdown_projection = projectCommittedGraphEdges([edge]);
      return res.json({ success: true, edge, markdown_projection });
    } catch (error) {
      logger.error(`Failed to update graph edge [${req.params.edgeId}]`, error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/graphs/edges/:edgeId",
  authMiddleware,
  (req, res) => {
    try {
      const result = graphService.deleteEdge(
        req.params.edgeId,
        graphActor(req),
      );
      const markdown_projection = projectCommittedGraphEdges(
        result.deleted_edges || [],
      );
      return res.json({ ...result, markdown_projection });
    } catch (error) {
      logger.error(`Failed to delete graph edge [${req.params.edgeId}]`, error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/graphs/projections/retry",
  authMiddleware,
  validateBody(graphProjectionRetrySchema),
  (req, res) => {
    try {
      const markdown_projection =
        graphMarkdownProjectionCoordinator.retryMarkdownNodes({
          nodeIds: req.body.node_ids,
        });
      return res.json({
        success: markdown_projection.failed === 0,
        markdown_projection,
      });
    } catch (error) {
      // The coordinator normally reports per-node failures as data. Keep this
      // route fail-safe if an unexpected programming/configuration failure leaks.
      logger.error("Failed to retry graph Markdown projections", error);
      return res
        .status(500)
        .json({ error: "GRAPH_MARKDOWN_PROJECTION_RETRY_FAILED" });
    }
  },
);

adminRouter.post(
  "/admin/graphs/:graphId/traverse",
  authMiddleware,
  validateBody(graphTraversalSchema),
  (req, res) => {
    try {
      const result = graphService.traverseGraph(req.params.graphId, req.body, {
        visibility: "private",
      });
      return res.json(result);
    } catch (error) {
      logger.error(`Failed to traverse graph [${req.params.graphId}]`, error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.get("/admin/graphs/:graphId/nodes", authMiddleware, (req, res) => {
  try {
    return res.json({
      nodes: graphService.listNodes({
        graphId: req.params.graphId,
        visibility: "all",
        includeInactive: true,
        limit: req.query.limit,
      }),
    });
  } catch (error) {
    logger.error(
      `Failed to list nodes for graph [${req.params.graphId}]`,
      error,
    );
    return sendGraphError(res, error);
  }
});

adminRouter.get("/admin/graphs/:graphId/edges", authMiddleware, (req, res) => {
  try {
    return res.json({
      edges: graphService.listEdges({
        graphId: req.params.graphId,
        visibility: "all",
        includeInactive: true,
        limit: req.query.limit,
      }),
    });
  } catch (error) {
    logger.error(
      `Failed to list edges for graph [${req.params.graphId}]`,
      error,
    );
    return sendGraphError(res, error);
  }
});

adminRouter.put(
  "/admin/graphs/:graphId/nodes/:nodeId",
  authMiddleware,
  validateBody(graphMembershipSchema),
  (req, res) => {
    try {
      const membership = graphService.addNodeMembership({
        graphId: req.params.graphId,
        nodeId: req.params.nodeId,
        metadata: req.body.metadata,
        actor: graphActor(req),
      });
      return res.json({ success: true, membership });
    } catch (error) {
      logger.error(
        `Failed to set node membership [${req.params.graphId}:${req.params.nodeId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/graphs/:graphId/nodes/:nodeId",
  authMiddleware,
  (req, res) => {
    try {
      return res.json(
        graphService.removeNodeMembership({
          graphId: req.params.graphId,
          nodeId: req.params.nodeId,
          actor: graphActor(req),
        }),
      );
    } catch (error) {
      logger.error(
        `Failed to remove node membership [${req.params.graphId}:${req.params.nodeId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

adminRouter.put(
  "/admin/graphs/:graphId/edges/:edgeId",
  authMiddleware,
  validateBody(graphMembershipSchema),
  (req, res) => {
    try {
      const membership = graphService.addEdgeMembership({
        graphId: req.params.graphId,
        edgeId: req.params.edgeId,
        metadata: req.body.metadata,
        actor: graphActor(req),
      });
      const edge = graphService.getEdge(req.params.edgeId);
      const markdown_projection = projectCommittedGraphEdges([edge]);
      return res.json({ success: true, membership, markdown_projection });
    } catch (error) {
      logger.error(
        `Failed to set edge membership [${req.params.graphId}:${req.params.edgeId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

adminRouter.delete(
  "/admin/graphs/:graphId/edges/:edgeId",
  authMiddleware,
  (req, res) => {
    try {
      const result = graphService.removeEdgeMembership({
        graphId: req.params.graphId,
        edgeId: req.params.edgeId,
        actor: graphActor(req),
      });
      const edge = graphService.getEdge(req.params.edgeId);
      const markdown_projection = projectCommittedGraphEdges([edge]);
      return res.json({ ...result, markdown_projection });
    } catch (error) {
      logger.error(
        `Failed to remove edge membership [${req.params.graphId}:${req.params.edgeId}]`,
        error,
      );
      return sendGraphError(res, error);
    }
  },
);

adminRouter.get("/admin/graphs/:graphId", authMiddleware, (req, res) => {
  try {
    return res.json({ graph: graphService.getGraph(req.params.graphId) });
  } catch (error) {
    logger.error(`Failed to read graph [${req.params.graphId}]`, error);
    return sendGraphError(res, error);
  }
});

adminRouter.put(
  "/admin/graphs/:graphId",
  authMiddleware,
  validateBody(updateGraphSchema),
  (req, res) => {
    try {
      const graph = graphService.updateGraph(
        req.params.graphId,
        req.body,
        graphActor(req),
      );
      return res.json({ success: true, graph });
    } catch (error) {
      logger.error(`Failed to update graph [${req.params.graphId}]`, error);
      return sendGraphError(res, error);
    }
  },
);

adminRouter.delete("/admin/graphs/:graphId", authMiddleware, (req, res) => {
  try {
    return res.json(
      graphService.deleteGraph(req.params.graphId, graphActor(req)),
    );
  } catch (error) {
    logger.error(`Failed to delete graph [${req.params.graphId}]`, error);
    return sendGraphError(res, error);
  }
});

// 6. Legacy database folder projection. The listing is retained for diagnostics,
// but package placement is authored by the path below Content/ in the Vault.
adminRouter.get(
  "/admin/content-folders",
  authMiddleware,
  requireOverseerAdmin,
  (_req, res) => {
    try {
      const tree = contentFolderService.listTree();
      return res
        .setHeader("Cache-Control", "private, no-store, max-age=0")
        .json({
          success: true,
          tree,
          folders: folderFlatList(tree),
        });
    } catch (error) {
      logger.error("[CONTENT_FOLDER] Listing failed", error);
      return sendContentFolderError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/content-folders",
  authMiddleware,
  requireOverseerAdmin,
  validateBody(createContentFolderSchema),
  rejectVaultAuthoritativeMutation,
);

adminRouter.put(
  "/admin/content-folders/:id",
  authMiddleware,
  requireOverseerAdmin,
  validateBody(updateContentFolderSchema),
  rejectVaultAuthoritativeMutation,
);

adminRouter.delete(
  "/admin/content-folders/:id",
  authMiddleware,
  requireOverseerAdmin,
  rejectVaultAuthoritativeMutation,
);

adminRouter.get(
  "/admin/content/documents/:id/assets",
  authMiddleware,
  requireOverseerAdmin,
  (req, res) => {
    try {
      const document = dbService.getBlogPostById(
        readContentDocumentId(req.params.id),
      );
      if (!document) {
        return res
          .status(404)
          .json({ success: false, error: "CONTENT_DOCUMENT_NOT_FOUND" });
      }
      const assets = contentDocumentAssetService
        .listDocumentAssets(document.id)
        .map((asset) => serializeContentDocumentAsset(document, asset));
      return res
        .setHeader("Cache-Control", "private, no-store, max-age=0")
        .json({ success: true, assets });
    } catch (error) {
      logger.warn("[CONTENT_DOCUMENT_ASSET] List rejected", {
        code: error?.code || error?.message,
        requestId: req.id,
      });
      return sendContentDocumentAssetError(res, error);
    }
  },
);

// The request body is the raw file bytes.  A browser client sends
// `Content-Type: application/octet-stream` and provides the safe logical file
// name in X-Content-Asset-Path; it never submits an operating-system path.
adminRouter.post(
  "/admin/content/documents/:id/assets",
  authMiddleware,
  requireOverseerAdmin,
  parseContentDocumentAssetRawBody,
  rejectVaultAuthoritativeMutation,
);

adminRouter.delete(
  "/admin/content/documents/:id/assets/:assetId",
  authMiddleware,
  requireOverseerAdmin,
  rejectVaultAuthoritativeMutation,
);

adminRouter.get(
  "/admin/content/documents/:id",
  authMiddleware,
  requireOverseerAdmin,
  (req, res) => {
    try {
      const document = dbService.getBlogPostById(
        readContentDocumentId(req.params.id),
      );
      if (!document)
        return res
          .status(404)
          .json({ success: false, error: "CONTENT_DOCUMENT_NOT_FOUND" });
      return res
        .setHeader("Cache-Control", "private, no-store, max-age=0")
        .json({
          success: true,
          document: serializeEditableDocument(document, taxonomyActor(req)),
        });
    } catch (error) {
      logger.warn("[CONTENT_DOCUMENT] Read rejected", {
        code: error?.code || error?.message,
        requestId: req.id,
      });
      return sendContentDocumentError(res, error);
    }
  },
);

adminRouter.post(
  "/admin/content/documents",
  authMiddleware,
  requireOverseerAdmin,
  validateBody(createContentDocumentSchema),
  rejectVaultAuthoritativeMutation,
);

adminRouter.put(
  "/admin/content/documents/:id",
  authMiddleware,
  requireOverseerAdmin,
  validateBody(updateContentDocumentSchema),
  rejectVaultAuthoritativeMutation,
);

// Compatibility list endpoint retained for the searchable SQLite projection.
// Authoring always happens in the canonical Content/ Vault package.
adminRouter.get(
  "/admin/blog",
  authMiddleware,
  requireOverseerAdmin,
  (req, res) => {
    try {
      const parsedQuery = adminContentListQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return sendQueryValidationError(req, res, parsedQuery);
      }

      const { projectId, visibility, content_type } = parsedQuery.data;
      const posts = dbService.getBlogPosts({
        publishedOnly: false,
        visibility,
        projectId,
        contentType: content_type,
      });
      res.json(posts);
    } catch (err) {
      logger.error("Failed to fetch admin blog posts", err);
      res.status(500).json({ error: "DATABASE_QUERY_ERROR" });
    }
  },
);

// Legacy CMS writer URLs deliberately fail closed. Callers must author the
// Markdown package in Content/, then refresh its SQLite/RAG projection.
const rejectLegacyContentMutation = (_req, res) =>
  res.status(410).json({
    success: false,
    error: "VAULT_AUTHORITATIVE",
    message:
      "A közvetlen CMS-szerkesztés megszűnt. A Content/ Vault-csomag index.md fájlját szerkeszd, majd futtasd a Vault szinkront.",
    source_of_truth: "LOCAL_VAULT",
    vault_sync_endpoint: "/api/admin/vault/sync",
  });
adminRouter.post(
  "/admin/blog",
  authMiddleware,
  requireOverseerAdmin,
  validateBody(createAdminContentSchema),
  rejectLegacyContentMutation,
);
adminRouter.put(
  "/admin/blog/:id",
  authMiddleware,
  requireOverseerAdmin,
  validateBody(updateAdminContentSchema),
  rejectLegacyContentMutation,
);
adminRouter.delete(
  "/admin/blog/:id",
  authMiddleware,
  requireOverseerAdmin,
  rejectLegacyContentMutation,
);

// 7. Manage Messages
adminRouter.get("/admin/messages", authMiddleware, (req, res) => {
  try {
    const messages = dbService.getMessages();
    res.json(messages);
  } catch (err) {
    logger.error("Failed to fetch messages", err);
    res.status(500).json({ error: "DATABASE_QUERY_ERROR" });
  }
});

adminRouter.put("/admin/messages/:id/read", authMiddleware, (req, res) => {
  try {
    dbService.markMessageRead(req.params.id, 1);
    res.json({ success: true });
  } catch (err) {
    logger.error("Failed to mark message as read", err);
    res.status(500).json({ error: "UPDATE_FAILED" });
  }
});

adminRouter.delete("/admin/messages/:id", authMiddleware, (req, res) => {
  try {
    dbService.deleteMessage(req.params.id);
    logger.info(`Message purged: #${req.params.id}`);
    res.json({ success: true, message: "MESSAGE_DELETED" });
  } catch (err) {
    logger.error("Failed to delete message", err);
    res.status(500).json({ error: "DELETE_FAILED" });
  }
});

// 8. Update PIN (Aliases: /admin/pin, /admin/security/pin)
const updatePinHandler = (req, res) => {
  try {
    const { pin } = req.body;
    dbService.updatePin(pin, "ADMIN_DASHBOARD");
    logger.security("ADMIN_PIN_UPDATED", { ip: req.ip });
    res.json({ success: true, message: "SECURITY_PIN_UPDATED" });
  } catch (err) {
    logger.error("Failed to update PIN", err);
    res.status(500).json({ error: err.message || "UPDATE_FAILED" });
  }
};
adminRouter.put(
  "/admin/pin",
  authMiddleware,
  validateBody(updatePinSchema),
  updatePinHandler,
);
adminRouter.put(
  "/admin/security/pin",
  authMiddleware,
  validateBody(updatePinSchema),
  updatePinHandler,
);

// 9. Audit Trail Logs & Rollback
adminRouter.get("/admin/audit", authMiddleware, (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const entity = req.query.entity || null;
    const action = req.query.action || null;
    const logs = dbService.getAuditLogs({ limit, entity, action });
    res.json(logs);
  } catch (err) {
    logger.error("Failed to fetch audit logs", err);
    res.status(500).json({ error: "DATABASE_QUERY_ERROR" });
  }
});

adminRouter.post("/admin/audit/:id/rollback", authMiddleware, (req, res) => {
  try {
    const result = dbService.rollbackAuditEntry(
      req.params.id,
      "ADMIN_DASHBOARD",
    );
    logger.info(`Rollback executed for audit log #${req.params.id}`);
    res.json({ success: true, message: "ROLLBACK_EXECUTED", result });
  } catch (err) {
    logger.error(`Rollback failed for audit #${req.params.id}`, err);
    res.status(500).json({ error: err.message || "ROLLBACK_FAILED" });
  }
});

// 10. Agent API Key & Token Registration
adminRouter.get("/admin/agent-keys", authMiddleware, (req, res) => {
  try {
    const keys = dbService.getAgentApiKeys();
    res.json({ success: true, count: keys.length, keys });
  } catch (err) {
    logger.error("Failed to fetch agent API keys", err);
    res.status(500).json({ error: "DATABASE_QUERY_ERROR" });
  }
});

adminRouter.post("/admin/agent-keys", authMiddleware, (req, res) => {
  try {
    const { agent_name, role, permissions } = req.body;
    if (!agent_name)
      return res.status(400).json({ error: "MISSING_AGENT_NAME" });

    const newKey = dbService.generateAgentApiKey(
      { agent_name, role, permissions },
      "ADMIN_DASHBOARD",
    );
    logger.security(`AGENT_KEY_ISSUED: ${agent_name}`, { id: newKey.id, role });
    res.json({
      success: true,
      message: "AGENT_API_KEY_GENERATED",
      key: newKey,
    });
  } catch (err) {
    logger.error("Failed to generate agent key", err);
    res.status(500).json({ error: err.message || "KEY_GENERATION_FAILED" });
  }
});

adminRouter.post("/admin/agent-keys/:id/revoke", authMiddleware, (req, res) => {
  try {
    const result = dbService.revokeAgentApiKey(
      req.params.id,
      "ADMIN_DASHBOARD",
    );
    logger.security(`AGENT_KEY_REVOKED: #${req.params.id}`);
    res.json(result);
  } catch (err) {
    logger.error("Failed to revoke agent key", err);
    res.status(500).json({ error: err.message || "KEY_REVOCATION_FAILED" });
  }
});

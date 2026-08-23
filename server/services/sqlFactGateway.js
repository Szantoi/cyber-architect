import { db } from '../db.js';

// These names are a contract between the RAG application and the internal
// operational-data service. They are fact profiles, not SQL statements.
export const ALLOWED_FACT_PROFILES = Object.freeze([
  'project_snapshot',
  'bom_availability',
  'production_risks'
]);

const ALLOWED_FACT_PROFILE_SET = new Set(ALLOWED_FACT_PROFILES);
const SQL_PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const MAX_FACT_PAYLOAD_BYTES = 128 * 1024;
const DEFAULT_GATEWAY_TIMEOUT_MS = 4_000;

export function normalizeSqlProjectId(value) {
  const normalized = String(value || '').trim();
  if (!SQL_PROJECT_ID_PATTERN.test(normalized)) {
    throw new Error('INVALID_SQL_PROJECT_ID');
  }
  return normalized;
}

export function normalizeFactProfiles(profiles, { defaultProfiles = [] } = {}) {
  const requested = profiles === undefined || profiles === null
    ? defaultProfiles
    : (Array.isArray(profiles) ? profiles : [profiles]);
  const normalized = [...new Set(requested.map(profile => String(profile || '').trim()).filter(Boolean))];

  for (const profile of normalized) {
    if (!ALLOWED_FACT_PROFILE_SET.has(profile)) {
      throw new Error(`UNSUPPORTED_FACT_PROFILE: ${profile}`);
    }
  }

  return normalized;
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function cloneJson(value, errorCode) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_FACT_PAYLOAD_BYTES) {
      throw new Error(errorCode);
    }
    return JSON.parse(serialized);
  } catch (error) {
    if (error.message === errorCode) throw error;
    throw new Error(errorCode);
  }
}

function normalizeIsoTimestamp(value, fieldName) {
  const timestamp = String(value || '').trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`INVALID_${fieldName.toUpperCase()}`);
  }
  return new Date(timestamp).toISOString();
}

function selectRequestedFacts(facts, profiles) {
  const selected = {};
  for (const profile of profiles) {
    if (Object.hasOwn(facts, profile)) selected[profile] = facts[profile];
  }
  return selected;
}

function parseSnapshotRow(row, profiles, now = Date.now()) {
  if (!row) return null;

  let facts = {};
  try {
    facts = JSON.parse(row.facts_json || '{}');
  } catch {
    return {
      source: row.source || 'local_snapshot',
      availability: 'unavailable',
      reason: 'SNAPSHOT_MALFORMED',
      as_of: row.as_of || null,
      expires_at: row.expires_at || null,
      facts: {},
      unavailable_profiles: profiles
    };
  }

  if (!isPlainObject(facts)) {
    return {
      source: row.source || 'local_snapshot',
      availability: 'unavailable',
      reason: 'SNAPSHOT_MALFORMED',
      as_of: row.as_of || null,
      expires_at: row.expires_at || null,
      facts: {},
      unavailable_profiles: profiles
    };
  }

  const selectedFacts = selectRequestedFacts(facts, profiles);
  const unavailableProfiles = profiles.filter(profile => !Object.hasOwn(selectedFacts, profile));
  const stale = Boolean(row.expires_at) && Date.parse(row.expires_at) < now;

  return {
    source: row.source || 'local_snapshot',
    availability: stale ? 'stale' : 'available',
    as_of: row.as_of || null,
    expires_at: row.expires_at || null,
    facts: selectedFacts,
    unavailable_profiles: unavailableProfiles
  };
}

export function upsertLocalSqlSnapshot({
  sqlProjectId,
  facts,
  asOf = new Date().toISOString(),
  expiresAt = null,
  source = 'local_snapshot'
}) {
  const projectId = normalizeSqlProjectId(sqlProjectId);
  if (!isPlainObject(facts)) throw new Error('INVALID_SQL_FACTS');

  const safeFacts = cloneJson(facts, 'INVALID_SQL_FACTS');
  const factProfiles = normalizeFactProfiles(Object.keys(safeFacts));
  const safeAsOf = normalizeIsoTimestamp(asOf, 'as_of');
  const safeExpiresAt = expiresAt === null || expiresAt === undefined || expiresAt === ''
    ? null
    : normalizeIsoTimestamp(expiresAt, 'expires_at');
  if (safeExpiresAt && Date.parse(safeExpiresAt) < Date.parse(safeAsOf)) {
    throw new Error('INVALID_SQL_SNAPSHOT_EXPIRY');
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO hybrid_rag_sql_snapshots
      (sql_project_id, facts_json, source, as_of, expires_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(sql_project_id) DO UPDATE SET
      facts_json = excluded.facts_json,
      source = excluded.source,
      as_of = excluded.as_of,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run(projectId, JSON.stringify(safeFacts), String(source || 'local_snapshot').slice(0, 120), safeAsOf, safeExpiresAt, now);

  return {
    sql_project_id: projectId,
    source: String(source || 'local_snapshot').slice(0, 120),
    as_of: safeAsOf,
    expires_at: safeExpiresAt,
    updated_at: now,
    fact_profiles: factProfiles
  };
}

function resolveGatewayConfiguration(env = process.env) {
  const rawUrl = String(env.HYBRID_SQL_FACT_GATEWAY_URL || '').trim();
  if (!rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('INVALID_SQL_FACT_GATEWAY_URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('INVALID_SQL_FACT_GATEWAY_URL');
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('SQL_FACT_GATEWAY_HTTPS_REQUIRED');
  }

  const configuredTimeout = Number(env.HYBRID_SQL_FACT_GATEWAY_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 250 && configuredTimeout <= 15_000
    ? configuredTimeout
    : DEFAULT_GATEWAY_TIMEOUT_MS;

  return {
    url: url.toString(),
    token: String(env.HYBRID_SQL_FACT_GATEWAY_TOKEN || '').trim(),
    timeoutMs
  };
}

async function getGatewayFacts({ projectId, profiles, configuration, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);

  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (configuration.token) headers.Authorization = `Bearer ${configuration.token}`;

    const response = await fetchImpl(configuration.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ project_id: projectId, fact_profiles: profiles }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('SQL_FACT_GATEWAY_UNAVAILABLE');

    const rawBody = await response.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_FACT_PAYLOAD_BYTES) {
      throw new Error('SQL_FACT_GATEWAY_RESPONSE_TOO_LARGE');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error('SQL_FACT_GATEWAY_RESPONSE_INVALID');
    }

    if (!isPlainObject(payload) || payload.project_id !== projectId || !isPlainObject(payload.facts)) {
      throw new Error('SQL_FACT_GATEWAY_RESPONSE_INVALID');
    }

    const facts = cloneJson(selectRequestedFacts(payload.facts, profiles), 'SQL_FACT_GATEWAY_RESPONSE_INVALID');
    return {
      source: String(payload.source || 'operational_gateway').slice(0, 120),
      availability: 'available',
      as_of: payload.as_of && !Number.isNaN(Date.parse(payload.as_of))
        ? new Date(payload.as_of).toISOString()
        : null,
      expires_at: payload.expires_at && !Number.isNaN(Date.parse(payload.expires_at))
        ? new Date(payload.expires_at).toISOString()
        : null,
      facts,
      unavailable_profiles: profiles.filter(profile => !Object.hasOwn(facts, profile))
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves only allowlisted operational fact profiles. The caller cannot pass
 * raw SQL, connection strings, table names, or a gateway URL.
 */
export async function getOperationalFacts({
  sqlProjectId,
  factProfiles,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now
}) {
  const projectId = normalizeSqlProjectId(sqlProjectId);
  const profiles = normalizeFactProfiles(factProfiles);
  if (profiles.length === 0) {
    return {
      sql_project_id: projectId,
      source: null,
      availability: 'not_requested',
      as_of: null,
      expires_at: null,
      facts: {},
      unavailable_profiles: []
    };
  }

  let gatewayFailure = null;
  let configuration = null;
  try {
    configuration = resolveGatewayConfiguration(env);
    if (configuration) {
      const result = await getGatewayFacts({ projectId, profiles, configuration, fetchImpl });
      return { sql_project_id: projectId, ...result };
    }
  } catch (error) {
    // Fall back to the local pilot snapshot without exposing transport details
    // to callers. The result stays explicitly marked as a fallback.
    gatewayFailure = error.message || 'SQL_FACT_GATEWAY_UNAVAILABLE';
    if (env.NODE_ENV === 'production' && /^(INVALID_SQL_FACT_GATEWAY_URL|SQL_FACT_GATEWAY_HTTPS_REQUIRED)$/.test(gatewayFailure)) {
      return {
        sql_project_id: projectId,
        source: null,
        availability: 'unavailable',
        reason: 'SQL_FACT_GATEWAY_CONFIGURATION_INVALID',
        as_of: null,
        expires_at: null,
        facts: {},
        unavailable_profiles: profiles
      };
    }
  }

  const row = db.prepare(`
    SELECT sql_project_id, facts_json, source, as_of, expires_at
    FROM hybrid_rag_sql_snapshots
    WHERE sql_project_id = ?
  `).get(projectId);
  const snapshot = parseSnapshotRow(row, profiles, now());
  if (snapshot) {
    return {
      sql_project_id: projectId,
      ...snapshot,
      fallback_from_gateway: Boolean(gatewayFailure)
    };
  }

  return {
    sql_project_id: projectId,
    source: null,
    availability: 'unavailable',
    reason: gatewayFailure || (configuration ? 'SQL_FACT_GATEWAY_UNAVAILABLE' : 'SQL_SNAPSHOT_NOT_FOUND'),
    as_of: null,
    expires_at: null,
    facts: {},
    unavailable_profiles: profiles
  };
}

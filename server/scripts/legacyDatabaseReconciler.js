import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const SOURCE_TABLE = 'blog_posts';
const TARGET_TABLE = 'blog_posts';
const MAPPING_TABLE = 'legacy_migration_records';
const SNAPSHOT_DIRECTORY_PREFIX = 'cyberarchitect-sqlite-snapshot-';
const SQLITE_FILE_SUFFIXES = Object.freeze(['', '-wal', '-shm', '-journal']);
const SNAPSHOT_MAX_ATTEMPTS = 3;
const HASH_BUFFER_SIZE = 1024 * 1024;

const REQUIRED_SOURCE_COLUMNS = Object.freeze([
  'id',
  'slug',
  'title',
  'summary',
  'content',
  'created_at'
]);

const REQUIRED_TARGET_COLUMNS = Object.freeze([
  'id',
  'slug',
  'title',
  'summary',
  'content',
  'created_at'
]);

const BLOG_POST_COLUMNS = Object.freeze([
  'project_id',
  'content_type',
  'slug',
  'title',
  'summary',
  'content',
  'category',
  'dimensions',
  'visibility',
  'audio_url',
  'video_url',
  'drive_file_id',
  'drive_modified_time',
  'embedding',
  'read_time',
  'created_at',
  'published'
]);

const ADOPTION_EXTERNAL_COLUMNS = Object.freeze([
  'drive_file_id',
  'drive_modified_time'
]);

const ADOPTION_CONTENT_COLUMNS = Object.freeze(BLOG_POST_COLUMNS.filter((column) => (
  !ADOPTION_EXTERNAL_COLUMNS.includes(column)
)));

const ADOPTION_IDENTITY_COLUMNS = Object.freeze([
  'title',
  'content_type',
  'category',
  'project_id',
  'visibility'
]);

const COLUMN_DEFAULTS = Object.freeze({
  project_id: 'prj_general',
  content_type: 'blog',
  slug: '',
  title: '',
  summary: '',
  content: '',
  category: 'SYSTEM_LOG',
  dimensions: '{}',
  visibility: 'public',
  audio_url: '',
  video_url: '',
  drive_file_id: '',
  drive_modified_time: '',
  embedding: '[]',
  read_time: '4 MIN',
  created_at: '1970-01-01T00:00:00.000Z',
  published: 1
});

const REQUIRED_MAPPING_COLUMNS = Object.freeze([
  'source_key',
  'source_table',
  'source_record_id',
  'source_slug',
  'target_slug',
  'slug_strategy',
  'target_table',
  'target_record_id',
  'source_fingerprint',
  'target_fingerprint',
  'migrated_at'
]);

const CREATE_MAPPING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${MAPPING_TABLE} (
    source_key TEXT NOT NULL,
    source_table TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    source_slug TEXT NOT NULL,
    target_slug TEXT NOT NULL,
    slug_strategy TEXT NOT NULL CHECK (slug_strategy IN ('direct', 'suffix')),
    target_table TEXT NOT NULL,
    target_record_id INTEGER NOT NULL,
    source_fingerprint TEXT NOT NULL,
    target_fingerprint TEXT NOT NULL,
    migrated_at TEXT NOT NULL,
    PRIMARY KEY (source_key, source_table, source_record_id),
    UNIQUE (target_table, target_record_id)
  )
`;

export class LegacyMigrationError extends Error {
  constructor(message, { code = 'LEGACY_MIGRATION_FAILED', summary = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'LegacyMigrationError';
    this.code = code;
    this.summary = summary;
  }
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function resolveExistingDatabase(filePath, label) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new LegacyMigrationError(`${label} database path is required.`, {
      code: `MISSING_${label.toUpperCase()}_PATH`
    });
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new LegacyMigrationError(`${label} database does not exist: ${resolvedPath}`, {
      code: `${label.toUpperCase()}_NOT_FOUND`
    });
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile()) {
    throw new LegacyMigrationError(`${label} database path is not a file: ${resolvedPath}`, {
      code: `${label.toUpperCase()}_NOT_A_FILE`
    });
  }

  return {
    path: fs.realpathSync.native(resolvedPath),
    stats
  };
}

function assertDifferentDatabases(source, target) {
  const sourcePath = process.platform === 'win32' ? source.path.toLowerCase() : source.path;
  const targetPath = process.platform === 'win32' ? target.path.toLowerCase() : target.path;
  const sameFileIdentity = source.stats.dev === target.stats.dev
    && source.stats.ino !== 0
    && source.stats.ino === target.stats.ino;

  if (sourcePath === targetPath || sameFileIdentity) {
    throw new LegacyMigrationError('Source and target must be different database files.', {
      code: 'SOURCE_TARGET_SAME_FILE'
    });
  }
}

function openReadonlyDatabase(databasePath) {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true
  });

  if (!database.readonly) {
    database.close();
    throw new LegacyMigrationError(`Readonly SQLite open failed for: ${databasePath}`, {
      code: 'READONLY_OPEN_FAILED'
    });
  }

  return database;
}

function tableExists(database, tableName) {
  return Boolean(database.prepare(`
    SELECT 1
    FROM sqlite_schema
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function getTableColumns(database, tableName) {
  return database.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all()
    .map((column) => column.name);
}

function assertRequiredColumns(database, tableName, requiredColumns, label) {
  if (!tableExists(database, tableName)) {
    throw new LegacyMigrationError(`${label} is missing the ${tableName} table.`, {
      code: `${label.toUpperCase()}_TABLE_MISSING`
    });
  }

  const columns = getTableColumns(database, tableName);
  const missingColumns = requiredColumns.filter((column) => !columns.includes(column));
  if (missingColumns.length > 0) {
    throw new LegacyMigrationError(
      `${label} ${tableName} table is missing required columns: ${missingColumns.join(', ')}`,
      { code: `${label.toUpperCase()}_SCHEMA_INCOMPATIBLE` }
    );
  }

  return columns;
}

function assertMappingTableSchema(database) {
  if (!tableExists(database, MAPPING_TABLE)) return false;

  const columns = getTableColumns(database, MAPPING_TABLE);
  const missingColumns = REQUIRED_MAPPING_COLUMNS.filter((column) => !columns.includes(column));
  if (missingColumns.length > 0) {
    throw new LegacyMigrationError(
      `${MAPPING_TABLE} has an incompatible schema; missing: ${missingColumns.join(', ')}`,
      { code: 'MAPPING_SCHEMA_INCOMPATIBLE' }
    );
  }

  return true;
}

function normalizeSourceIdentity(sourcePath, sourceId) {
  if (sourceId !== undefined && sourceId !== null) {
    if (typeof sourceId !== 'string' || !sourceId.trim()) {
      throw new LegacyMigrationError('sourceId must be a non-empty string when provided.', {
        code: 'INVALID_SOURCE_ID'
      });
    }
    if (sourceId.length > 256) {
      throw new LegacyMigrationError('sourceId must be at most 256 characters.', {
        code: 'INVALID_SOURCE_ID'
      });
    }
  }

  const normalizedPath = process.platform === 'win32' ? sourcePath.toLowerCase() : sourcePath;
  const identityBasis = sourceId?.trim()
    ? `operator:${sourceId.trim()}`
    : `canonical-path:${normalizedPath}`;

  return {
    sourceKey: `sha256:${hashValue(identityBasis)}`,
    sourceIdentityMode: sourceId?.trim() ? 'operator' : 'canonical-path'
  };
}

function normalizeBlogPost(row, columns) {
  const values = {};

  for (const column of columns) {
    const defaultValue = COLUMN_DEFAULTS[column];
    const sourceValue = row[column];

    if (column === 'published') {
      values[column] = sourceValue === true || Number(sourceValue) === 1 ? 1 : 0;
      continue;
    }

    values[column] = String(sourceValue ?? defaultValue);
  }

  values.slug = values.slug.trim();
  for (const column of ADOPTION_EXTERNAL_COLUMNS) {
    if (Object.hasOwn(values, column)) values[column] = values[column].trim();
  }
  if (!values.slug) {
    throw new LegacyMigrationError('Source row has an empty slug.', {
      code: 'INVALID_SOURCE_ROW'
    });
  }
  if (!values.title.trim()) {
    throw new LegacyMigrationError(`Source row ${values.slug} has an empty title.`, {
      code: 'INVALID_SOURCE_ROW'
    });
  }

  return values;
}

function fingerprintBlogPost(values, columns) {
  const canonicalValues = {};
  for (const column of columns) canonicalValues[column] = values[column];
  return `sha256:${hashValue(JSON.stringify(canonicalValues))}`;
}

function normalizeIdentityText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('hu-HU');
}

function normalizeComparableContent(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function normalizeAdoptionValue(column, value) {
  if (column === 'slug') return String(value ?? '').trim();
  if (ADOPTION_IDENTITY_COLUMNS.includes(column)) return normalizeIdentityText(value);
  return normalizeComparableContent(value);
}

function fingerprintAdoptionContent(values) {
  const canonicalValues = {};
  for (const column of ADOPTION_CONTENT_COLUMNS) {
    canonicalValues[column] = normalizeAdoptionValue(column, values[column]);
  }
  return `sha256:${hashValue(JSON.stringify(canonicalValues))}`;
}

function assessUntrackedTargetAdoption(sourceValues, targetValues, comparableColumns) {
  const sourceDriveId = String(sourceValues.drive_file_id ?? '').trim();
  const targetDriveId = String(targetValues.drive_file_id ?? '').trim();
  const sourceDriveModifiedTime = String(sourceValues.drive_modified_time ?? '').trim();
  const targetDriveModifiedTime = String(targetValues.drive_modified_time ?? '').trim();
  const missingComparableFields = ADOPTION_CONTENT_COLUMNS.filter((column) => (
    !comparableColumns.includes(column)
  ));
  const mismatchedContentFields = ADOPTION_CONTENT_COLUMNS.filter((column) => (
    comparableColumns.includes(column)
    && normalizeAdoptionValue(column, sourceValues[column])
      !== normalizeAdoptionValue(column, targetValues[column])
  ));
  const compatibleExternalIdentity = !targetDriveId
    || (Boolean(sourceDriveId) && sourceDriveId === targetDriveId);
  const compatibleExternalVersion = !targetDriveModifiedTime
    || targetDriveModifiedTime === sourceDriveModifiedTime;
  const contentFingerprintMatches = missingComparableFields.length === 0
    && fingerprintAdoptionContent(sourceValues) === fingerprintAdoptionContent(targetValues);

  return {
    eligible: contentFingerprintMatches
      && compatibleExternalIdentity
      && compatibleExternalVersion,
    mismatchFields: [
      ...missingComparableFields.map((column) => `missing:${column}`),
      ...mismatchedContentFields,
      ...(!compatibleExternalIdentity ? ['drive_file_id'] : []),
      ...(!compatibleExternalVersion ? ['drive_modified_time'] : [])
    ]
  };
}

function buildAdoptedTargetValues(sourceValues, targetValues, columns) {
  const adoptedValues = { ...targetValues };
  for (const column of ADOPTION_EXTERNAL_COLUMNS) {
    if (
      columns.includes(column)
      && !String(targetValues[column] ?? '').trim()
      && String(sourceValues[column] ?? '').trim()
    ) {
      adoptedValues[column] = sourceValues[column];
    }
  }
  return adoptedValues;
}

function createStableSuffixedSlug(slug, sourceKey, sourceRecordId) {
  const suffix = hashValue(`${sourceKey}:${SOURCE_TABLE}:${sourceRecordId}`).slice(0, 10);
  const suffixSegment = `-legacy-${suffix}`;
  const canonicalBase = String(slug || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document';
  const maxBaseLength = 160 - suffixSegment.length;
  const boundedBase = canonicalBase
    .slice(0, maxBaseLength)
    .replace(/-+$/g, '') || 'document';
  return `${boundedBase}${suffixSegment}`;
}

function metadataMatches(left, right) {
  return left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
    && left.dev === right.dev
    && left.ino === right.ino;
}

function hashFileContents(filePath) {
  const descriptor = fs.openSync(filePath, 'r');
  const hasher = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_SIZE);
  let bytesReadTotal = 0n;

  try {
    while (true) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hasher.update(buffer.subarray(0, bytesRead));
      bytesReadTotal += BigInt(bytesRead);
    }
  } finally {
    fs.closeSync(descriptor);
  }

  return {
    bytesRead: bytesReadTotal,
    hash: hasher.digest('hex')
  };
}

function readHashedFileState(filePath, suffix) {
  if (!fs.existsSync(filePath)) return { suffix, path: filePath, exists: false };

  const before = fs.statSync(filePath, { bigint: true });
  if (!before.isFile()) {
    throw new Error(`SQLite snapshot input is not a regular file: ${filePath}`);
  }
  const contents = hashFileContents(filePath);
  const after = fs.statSync(filePath, { bigint: true });
  const beforeMetadata = {
    size: before.size,
    mtimeNs: before.mtimeNs,
    ctimeNs: before.ctimeNs,
    dev: before.dev,
    ino: before.ino
  };
  const afterMetadata = {
    size: after.size,
    mtimeNs: after.mtimeNs,
    ctimeNs: after.ctimeNs,
    dev: after.dev,
    ino: after.ino
  };

  if (!metadataMatches(beforeMetadata, afterMetadata) || contents.bytesRead !== before.size) {
    throw new Error(`SQLite file changed while it was being hashed: ${filePath}`);
  }

  return {
    suffix,
    path: filePath,
    exists: true,
    ...afterMetadata,
    hash: contents.hash
  };
}

function captureHashedDatabaseState(databasePath, { includeSharedMemory = true } = {}) {
  const suffixes = includeSharedMemory
    ? SQLITE_FILE_SUFFIXES
    : SQLITE_FILE_SUFFIXES.filter((suffix) => suffix !== '-shm');
  return suffixes.map((suffix) => (
    readHashedFileState(`${databasePath}${suffix}`, suffix)
  ));
}

function databaseStatesMatch(left, right) {
  if (left.length !== right.length) return false;
  return left.every((leftEntry, index) => {
    const rightEntry = right[index];
    if (leftEntry.suffix !== rightEntry.suffix || leftEntry.exists !== rightEntry.exists) {
      return false;
    }
    if (!leftEntry.exists) return true;
    return metadataMatches(leftEntry, rightEntry) && leftEntry.hash === rightEntry.hash;
  });
}

function snapshotMatchesSource(sourceState, snapshotState) {
  if (sourceState.length !== snapshotState.length) return false;
  return sourceState.every((sourceEntry, index) => {
    const snapshotEntry = snapshotState[index];
    return sourceEntry.suffix === snapshotEntry.suffix
      && sourceEntry.exists === snapshotEntry.exists
      && (!sourceEntry.exists || (
        sourceEntry.size === snapshotEntry.size && sourceEntry.hash === snapshotEntry.hash
      ));
  });
}

function assertSafeSnapshotDirectory(snapshotDirectory) {
  const tempRoot = fs.realpathSync.native(os.tmpdir());
  const resolvedDirectory = fs.realpathSync.native(snapshotDirectory);
  const relativePath = path.relative(tempRoot, resolvedDirectory);
  if (
    relativePath.startsWith('..')
    || path.isAbsolute(relativePath)
    || !path.basename(resolvedDirectory).startsWith(SNAPSHOT_DIRECTORY_PREFIX)
  ) {
    throw new LegacyMigrationError(`Refusing to clean unsafe snapshot path: ${resolvedDirectory}`, {
      code: 'SNAPSHOT_CLEANUP_UNSAFE'
    });
  }
}

function cleanupSqliteSnapshot(snapshot) {
  if (!snapshot?.directory || !fs.existsSync(snapshot.directory)) return;
  assertSafeSnapshotDirectory(snapshot.directory);
  fs.rmSync(snapshot.directory, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 50
  });
}

function runCleanupActions(cleanupActions) {
  const failures = [];
  for (const [resource, cleanup] of cleanupActions) {
    try {
      cleanup();
    } catch (error) {
      failures.push({ resource, error });
    }
  }
  return failures;
}

function appendCleanupFailures(summary, failures) {
  for (const failure of failures) {
    summary.errorDetails.push({
      code: 'SNAPSHOT_CLEANUP_FAILED',
      message: `${failure.resource}: ${failure.error.message}`
    });
  }
  summary.errors = summary.errorDetails.length;
}

function verifySnapshotIntegrity(snapshotPath) {
  const snapshotDatabase = new Database(snapshotPath, { fileMustExist: true });
  try {
    const integrityResult = snapshotDatabase.pragma('quick_check', { simple: true });
    if (integrityResult !== 'ok') {
      throw new Error(`Snapshot quick_check failed: ${integrityResult}`);
    }
  } finally {
    snapshotDatabase.close();
  }
}

function createConsistentSqliteSnapshot(databasePath, { includeSharedMemory = true } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
    let snapshot = null;
    try {
      const stateOptions = { includeSharedMemory };
      const beforeState = captureHashedDatabaseState(databasePath, stateOptions);
      const snapshotDirectory = fs.mkdtempSync(path.join(os.tmpdir(), SNAPSHOT_DIRECTORY_PREFIX));
      fs.chmodSync(snapshotDirectory, 0o700);
      const snapshotPath = path.join(snapshotDirectory, path.basename(databasePath));
      snapshot = { directory: snapshotDirectory, path: snapshotPath };

      for (const sourceEntry of beforeState) {
        if (!sourceEntry.exists) continue;
        const destinationPath = `${snapshotPath}${sourceEntry.suffix}`;
        fs.copyFileSync(sourceEntry.path, destinationPath, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(destinationPath, 0o600);
      }

      const afterState = captureHashedDatabaseState(databasePath, stateOptions);
      const copiedState = captureHashedDatabaseState(snapshotPath, stateOptions);
      if (!databaseStatesMatch(beforeState, afterState)) {
        throw new Error(`SQLite source changed during snapshot attempt ${attempt}.`);
      }
      if (!snapshotMatchesSource(beforeState, copiedState)) {
        throw new Error(`SQLite snapshot copy verification failed on attempt ${attempt}.`);
      }

      verifySnapshotIntegrity(snapshotPath);
      return snapshot;
    } catch (error) {
      lastError = error;
      const cleanupFailures = runCleanupActions([
        [`snapshot attempt ${attempt} removal`, () => cleanupSqliteSnapshot(snapshot)]
      ]);
      if (cleanupFailures.length > 0) {
        const retryFailures = runCleanupActions([
          [`snapshot attempt ${attempt} removal retry`, () => cleanupSqliteSnapshot(snapshot)]
        ]);
        if (retryFailures.length > 0) {
          const allErrors = [
            error,
            ...cleanupFailures.map((failure) => failure.error),
            ...retryFailures.map((failure) => failure.error)
          ];
          throw new LegacyMigrationError(
            `SQLite snapshot attempt ${attempt} failed: ${error.message}; cleanup also failed: ${retryFailures[0].error.message}`,
            {
              code: 'SNAPSHOT_CAPTURE_FAILED',
              cause: new AggregateError(allErrors, 'Snapshot capture and cleanup failed')
            }
          );
        }
      }
    }
  }

  throw new LegacyMigrationError(
    `Could not capture a stable SQLite snapshot after ${SNAPSHOT_MAX_ATTEMPTS} attempts: ${lastError?.message}`,
    { code: 'SNAPSHOT_CAPTURE_FAILED', cause: lastError }
  );
}

function makeSummary({ apply, sourcePath, targetPath, sourceKey, sourceIdentityMode }) {
  return {
    mode: apply ? 'apply' : 'dry-run',
    applied: false,
    rolledBack: false,
    source: sourcePath,
    target: targetPath,
    sourceIdentity: sourceKey,
    sourceIdentityMode,
    backupPath: null,
    planned: null,
    examined: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    collisions: 0,
    errors: 0,
    collisionDetails: [],
    errorDetails: []
  };
}

function applyPlanCounts(summary, plan) {
  summary.examined = plan.examined;
  summary.created = plan.operations.filter((operation) => operation.type === 'create').length;
  summary.updated = plan.operations.filter((operation) => (
    operation.type === 'update' || operation.type === 'adopt'
  )).length;
  summary.skipped = plan.skipped;
  summary.collisions = plan.collisions.length;
  summary.errors = plan.errors.length;
  summary.collisionDetails = plan.collisions;
  summary.errorDetails = plan.errors;
  return summary;
}

function capturePlannedCounts(summary) {
  if (summary.planned) return summary.planned;
  summary.planned = {
    created: summary.created,
    updated: summary.updated,
    skipped: summary.skipped,
    collisions: summary.collisions,
    errors: summary.errors
  };
  return summary.planned;
}

function markSummaryFailed(summary, error, { rolledBack = false } = {}) {
  if (summary.mode === 'apply') {
    capturePlannedCounts(summary);
    summary.created = 0;
    summary.updated = 0;
  }
  summary.applied = false;
  summary.rolledBack = rolledBack;

  const detail = {
    code: error.code || 'LEGACY_MIGRATION_FAILED',
    message: error.message
  };
  const alreadyReported = summary.errorDetails.some((item) => (
    item.code === detail.code && item.message === detail.message
  ));
  if (!alreadyReported) summary.errorDetails.push(detail);
  summary.errors = summary.errorDetails.length;
  return summary;
}

function validatePlannedTargetDriveFileIds(targetDatabase, plan, columns) {
  if (!columns.includes('drive_file_id')) return;

  const plannedRows = new Map(targetDatabase.prepare(`
    SELECT id, slug, drive_file_id
    FROM ${quoteIdentifier(TARGET_TABLE)}
  `).all().map((row) => [
    `target:${row.id}`,
    {
      ownerType: 'target',
      targetRecordId: Number(row.id),
      slug: String(row.slug ?? '').trim(),
      driveFileId: String(row.drive_file_id ?? '').trim()
    }
  ]));

  for (const operation of plan.operations) {
    const plannedRow = {
      ownerType: operation.type === 'create' ? 'create' : operation.type,
      sourceRecordId: operation.sourceRecordId,
      targetRecordId: operation.targetRecordId ?? null,
      slug: operation.targetSlug,
      driveFileId: String(operation.values.drive_file_id ?? '').trim()
    };
    const key = operation.type === 'create'
      ? `create:${operation.sourceRecordId}`
      : `target:${operation.targetRecordId}`;
    plannedRows.set(key, plannedRow);
  }

  const ownersByDriveFileId = new Map();
  for (const plannedRow of plannedRows.values()) {
    if (!plannedRow.driveFileId) continue;
    const owners = ownersByDriveFileId.get(plannedRow.driveFileId) || [];
    owners.push(plannedRow);
    ownersByDriveFileId.set(plannedRow.driveFileId, owners);
  }

  for (const [driveFileId, owners] of ownersByDriveFileId) {
    if (owners.length < 2) continue;
    plan.errors.push({
      code: 'PLANNED_TARGET_DRIVE_FILE_ID_DUPLICATE',
      driveFileIdentity: `sha256:${hashValue(driveFileId)}`,
      owners: owners.map(({ driveFileId: _driveFileId, ...owner }) => owner),
      message: 'The planned target state would contain a duplicate non-empty Drive file ID.'
    });
  }
}

function buildReconciliationPlan(sourceDatabase, targetDatabase, context) {
  const sourceColumns = assertRequiredColumns(
    sourceDatabase,
    SOURCE_TABLE,
    REQUIRED_SOURCE_COLUMNS,
    'source'
  );
  const targetColumns = assertRequiredColumns(
    targetDatabase,
    TARGET_TABLE,
    REQUIRED_TARGET_COLUMNS,
    'target'
  );
  const mappingTableExists = assertMappingTableSchema(targetDatabase);
  const migratableColumns = BLOG_POST_COLUMNS.filter((column) => targetColumns.includes(column));
  const adoptionComparableColumns = ADOPTION_CONTENT_COLUMNS.filter((column) => (
    sourceColumns.includes(column) && targetColumns.includes(column)
  ));
  const selectedSourceColumns = ['id', ...BLOG_POST_COLUMNS.filter((column) => sourceColumns.includes(column))];
  const sourceRows = sourceDatabase.prepare(`
    SELECT ${selectedSourceColumns.map(quoteIdentifier).join(', ')}
    FROM ${quoteIdentifier(SOURCE_TABLE)}
    ORDER BY id
  `).all();

  const slugCounts = new Map();
  const sourceDriveFileIdCounts = new Map();
  for (const row of sourceRows) {
    const slug = String(row.slug ?? '').trim();
    slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
    const driveFileId = String(row.drive_file_id ?? '').trim();
    if (driveFileId) {
      sourceDriveFileIdCounts.set(
        driveFileId,
        (sourceDriveFileIdCounts.get(driveFileId) || 0) + 1
      );
    }
  }

  const findTargetById = targetDatabase.prepare(`
    SELECT ${['id', ...migratableColumns].map(quoteIdentifier).join(', ')}
    FROM ${quoteIdentifier(TARGET_TABLE)}
    WHERE id = ?
  `);
  const findTargetBySlug = targetDatabase.prepare(`
    SELECT ${['id', ...migratableColumns].map(quoteIdentifier).join(', ')}
    FROM ${quoteIdentifier(TARGET_TABLE)}
    WHERE slug = ?
  `);
  const findOtherTargetBySlug = targetDatabase.prepare(`
    SELECT id
    FROM ${quoteIdentifier(TARGET_TABLE)}
    WHERE slug = ? AND id != ?
  `);
  const findMapping = mappingTableExists
    ? targetDatabase.prepare(`
      SELECT
        target_record_id,
        source_slug,
        target_slug,
        slug_strategy,
        source_fingerprint,
        target_fingerprint
      FROM ${quoteIdentifier(MAPPING_TABLE)}
      WHERE source_key = ? AND source_table = ? AND source_record_id = ?
    `)
    : null;

  const plan = {
    examined: sourceRows.length,
    operations: [],
    skipped: 0,
    collisions: [],
    errors: []
  };

  for (const sourceRow of sourceRows) {
    const sourceRecordId = String(sourceRow.id ?? '');
    const rawSlug = String(sourceRow.slug ?? '').trim();
    const rawDriveFileId = String(sourceRow.drive_file_id ?? '').trim();

    if (rawDriveFileId && sourceDriveFileIdCounts.get(rawDriveFileId) > 1) {
      plan.errors.push({
        code: 'DUPLICATE_SOURCE_DRIVE_FILE_ID',
        sourceRecordId,
        slug: rawSlug,
        driveFileIdentity: `sha256:${hashValue(rawDriveFileId)}`,
        message: 'Multiple source rows use the same non-empty Drive file ID.'
      });
      continue;
    }

    if (slugCounts.get(rawSlug) > 1) {
      plan.collisions.push({
        code: 'DUPLICATE_SOURCE_SLUG',
        sourceRecordId,
        slug: rawSlug,
        message: 'Multiple source rows use the same slug.'
      });
      continue;
    }

    let values;
    try {
      values = normalizeBlogPost(sourceRow, migratableColumns);
    } catch (error) {
      plan.errors.push({
        code: error.code || 'INVALID_SOURCE_ROW',
        sourceRecordId,
        slug: rawSlug,
        message: error.message
      });
      continue;
    }

    const sourceFingerprint = fingerprintBlogPost(values, migratableColumns);
    const mapping = findMapping?.get(context.sourceKey, SOURCE_TABLE, sourceRecordId);

    if (!mapping) {
      const slugOwner = findTargetBySlug.get(values.slug);
      if (slugOwner) {
        const targetValues = normalizeBlogPost(slugOwner, migratableColumns);
        const adoptionAssessment = assessUntrackedTargetAdoption(
          values,
          targetValues,
          adoptionComparableColumns
        );
        if (adoptionAssessment.eligible) {
          plan.operations.push({
            type: 'adopt',
            sourceRecordId,
            targetRecordId: Number(slugOwner.id),
            sourceSlug: values.slug,
            targetSlug: values.slug,
            slugStrategy: 'direct',
            values: buildAdoptedTargetValues(values, targetValues, migratableColumns),
            sourceFingerprint
          });
          continue;
        }

        const stableSlug = createStableSuffixedSlug(values.slug, context.sourceKey, sourceRecordId);
        const stableSlugOwner = findTargetBySlug.get(stableSlug);
        plan.collisions.push({
          code: 'UNTRACKED_TARGET_SLUG',
          sourceRecordId,
          slug: values.slug,
          targetRecordId: Number(slugOwner.id),
          resolution: stableSlugOwner ? 'SKIPPED_SUFFIX_OCCUPIED' : 'CREATE_WITH_STABLE_SUFFIX',
          targetSlug: stableSlug,
          adoptionMismatchFields: adoptionAssessment.mismatchFields,
          message: stableSlugOwner
            ? 'Target slug and its deterministic legacy suffix are both owned by untracked rows.'
            : 'Target content or identity differs; the legacy row will use a deterministic suffix.'
        });
        if (stableSlugOwner) continue;

        plan.operations.push({
          type: 'create',
          sourceRecordId,
          sourceSlug: values.slug,
          targetSlug: stableSlug,
          slugStrategy: 'suffix',
          values: { ...values, slug: stableSlug },
          sourceFingerprint
        });
        continue;
      }

      plan.operations.push({
        type: 'create',
        sourceRecordId,
        sourceSlug: values.slug,
        targetSlug: values.slug,
        slugStrategy: 'direct',
        values,
        sourceFingerprint
      });
      continue;
    }

    const targetRow = findTargetById.get(mapping.target_record_id);
    if (!targetRow) {
      plan.collisions.push({
        code: 'MAPPED_TARGET_MISSING',
        sourceRecordId,
        slug: values.slug,
        targetRecordId: Number(mapping.target_record_id),
        message: 'The mapped target row no longer exists; it will not be recreated automatically.'
      });
      continue;
    }

    const currentTargetValues = normalizeBlogPost(targetRow, migratableColumns);
    const currentTargetFingerprint = fingerprintBlogPost(currentTargetValues, migratableColumns);
    if (
      currentTargetFingerprint !== mapping.target_fingerprint
      || currentTargetValues.slug !== mapping.target_slug
    ) {
      plan.collisions.push({
        code: 'TARGET_DIVERGED',
        sourceRecordId,
        slug: values.slug,
        targetRecordId: Number(targetRow.id),
        message: 'The mapped target row changed after the previous migration.'
      });
      continue;
    }

    if (sourceFingerprint === mapping.source_fingerprint) {
      plan.skipped += 1;
      continue;
    }

    const desiredTargetSlug = mapping.slug_strategy === 'suffix'
      ? createStableSuffixedSlug(values.slug, context.sourceKey, sourceRecordId)
      : values.slug;
    const desiredTargetValues = { ...values, slug: desiredTargetSlug };
    const otherSlugOwner = findOtherTargetBySlug.get(desiredTargetSlug, targetRow.id);
    if (otherSlugOwner) {
      plan.collisions.push({
        code: 'UPDATED_SLUG_COLLISION',
        sourceRecordId,
        slug: desiredTargetSlug,
        targetRecordId: Number(otherSlugOwner.id),
        message: 'The source slug changed to one owned by another target row.'
      });
      continue;
    }

    plan.operations.push({
      type: 'update',
      sourceRecordId,
      targetRecordId: Number(targetRow.id),
      sourceSlug: values.slug,
      targetSlug: desiredTargetSlug,
      slugStrategy: mapping.slug_strategy,
      values: desiredTargetValues,
      sourceFingerprint
    });
  }

  validatePlannedTargetDriveFileIds(targetDatabase, plan, migratableColumns);
  return { ...plan, migratableColumns };
}

function executePlan(targetDatabase, plan, context) {
  const columns = plan.migratableColumns;
  const insertPost = targetDatabase.prepare(`
    INSERT INTO ${quoteIdentifier(TARGET_TABLE)} (${columns.map(quoteIdentifier).join(', ')})
    VALUES (${columns.map((column) => `@${column}`).join(', ')})
  `);
  const updatePost = targetDatabase.prepare(`
    UPDATE ${quoteIdentifier(TARGET_TABLE)}
    SET ${columns.map((column) => `${quoteIdentifier(column)} = @${column}`).join(', ')}
    WHERE id = @__targetRecordId
  `);
  const findTargetById = targetDatabase.prepare(`
    SELECT ${['id', ...columns].map(quoteIdentifier).join(', ')}
    FROM ${quoteIdentifier(TARGET_TABLE)}
    WHERE id = ?
  `);
  const createMapping = targetDatabase.prepare(`
    INSERT INTO ${quoteIdentifier(MAPPING_TABLE)} (
      source_key,
      source_table,
      source_record_id,
      source_slug,
      target_slug,
      slug_strategy,
      target_table,
      target_record_id,
      source_fingerprint,
      target_fingerprint,
      migrated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateMapping = targetDatabase.prepare(`
    UPDATE ${quoteIdentifier(MAPPING_TABLE)}
    SET
      source_slug = ?,
      target_slug = ?,
      slug_strategy = ?,
      source_fingerprint = ?,
      target_fingerprint = ?,
      migrated_at = ?
    WHERE source_key = ? AND source_table = ? AND source_record_id = ?
  `);

  let created = 0;
  let updated = 0;

  for (const operation of plan.operations) {
    let targetRecordId;
    if (operation.type === 'create') {
      const result = insertPost.run(operation.values);
      targetRecordId = Number(result.lastInsertRowid);
      created += 1;
    } else {
      targetRecordId = operation.targetRecordId;
      const result = updatePost.run({
        ...operation.values,
        __targetRecordId: targetRecordId
      });
      if (result.changes !== 1) {
        throw new LegacyMigrationError(`Expected one updated row for source record ${operation.sourceRecordId}.`, {
          code: 'TARGET_UPDATE_INVARIANT_FAILED'
        });
      }
      updated += 1;
    }

    const persistedRow = findTargetById.get(targetRecordId);
    const persistedValues = normalizeBlogPost(persistedRow, columns);
    const targetFingerprint = fingerprintBlogPost(persistedValues, columns);
    const expectedTargetFingerprint = fingerprintBlogPost(operation.values, columns);
    if (targetFingerprint !== expectedTargetFingerprint) {
      throw new LegacyMigrationError(`Persisted target fingerprint mismatch for source record ${operation.sourceRecordId}.`, {
        code: 'TARGET_FINGERPRINT_MISMATCH'
      });
    }

    if (operation.type === 'create' || operation.type === 'adopt') {
      createMapping.run(
        context.sourceKey,
        SOURCE_TABLE,
        operation.sourceRecordId,
        operation.sourceSlug,
        operation.targetSlug,
        operation.slugStrategy,
        TARGET_TABLE,
        targetRecordId,
        operation.sourceFingerprint,
        targetFingerprint,
        context.migratedAt
      );
    } else {
      const mappingResult = updateMapping.run(
        operation.sourceSlug,
        operation.targetSlug,
        operation.slugStrategy,
        operation.sourceFingerprint,
        targetFingerprint,
        context.migratedAt,
        context.sourceKey,
        SOURCE_TABLE,
        operation.sourceRecordId
      );
      if (mappingResult.changes !== 1) {
        throw new LegacyMigrationError(`Missing provenance mapping for source record ${operation.sourceRecordId}.`, {
          code: 'MAPPING_UPDATE_INVARIANT_FAILED'
        });
      }
    }
  }

  return { created, updated };
}

function createTargetBackupFromSnapshot(snapshotPath, target, { now }) {
  const backupDirectory = path.join(path.dirname(target.path), 'backups');
  let backupPath = null;
  let partialPath = null;
  let snapshotDatabase = null;
  let primaryError = null;

  try {
    if (fs.existsSync(backupDirectory) && !fs.statSync(backupDirectory).isDirectory()) {
      throw new Error(`Backup path is not a directory: ${backupDirectory}`);
    }
    fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    fs.chmodSync(backupDirectory, 0o700);

    const extension = path.extname(target.path) || '.sqlite';
    const baseName = path.basename(target.path, path.extname(target.path));
    const timestamp = now().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(
      backupDirectory,
      `${baseName}-pre-legacy-migration-${timestamp}${extension}`
    );
    let suffix = 1;
    while (fs.existsSync(backupPath)) {
      backupPath = path.join(
        backupDirectory,
        `${baseName}-pre-legacy-migration-${timestamp}-${suffix}${extension}`
      );
      suffix += 1;
    }

    partialPath = `${backupPath}.partial-${process.pid}-${crypto.randomUUID()}`;
    snapshotDatabase = new Database(snapshotPath, { fileMustExist: true });
    snapshotDatabase.prepare('VACUUM INTO ?').run(partialPath);
    fs.chmodSync(partialPath, 0o600);
    snapshotDatabase.close();
    snapshotDatabase = null;

    verifySnapshotIntegrity(partialPath);
    fs.linkSync(partialPath, backupPath);
  } catch (error) {
    primaryError = error;
  }

  const cleanupActions = [
    ['backup snapshot database close', () => snapshotDatabase?.close()],
    ['partial backup removal', () => {
      if (partialPath && fs.existsSync(partialPath)) {
        fs.rmSync(partialPath, { force: true, maxRetries: 3, retryDelay: 50 });
      }
    }]
  ];
  let cleanupFailures = runCleanupActions(cleanupActions);
  if (cleanupFailures.length > 0) {
    cleanupFailures = runCleanupActions(cleanupActions);
  }

  if (primaryError || cleanupFailures.length > 0) {
    const cleanupMessage = cleanupFailures.length > 0
      ? `; cleanup failed: ${cleanupFailures.map((failure) => (
        `${failure.resource}: ${failure.error.message}`
      )).join('; ')}`
      : '';
    const errors = [
      ...(primaryError ? [primaryError] : []),
      ...cleanupFailures.map((failure) => failure.error)
    ];
    throw new LegacyMigrationError(
      `Target backup failed: ${primaryError?.message || 'temporary resource cleanup failed'}${cleanupMessage}`,
      {
      code: 'BACKUP_FAILED',
        cause: new AggregateError(errors, 'Target backup or cleanup failed')
      }
    );
  }

  return backupPath;
}

export function createTargetBackup(targetPath, { now = () => new Date() } = {}) {
  const target = resolveExistingDatabase(targetPath, 'target');
  let targetSnapshot;
  let backupPath = null;
  let primaryError = null;

  try {
    targetSnapshot = createConsistentSqliteSnapshot(target.path);
    backupPath = createTargetBackupFromSnapshot(targetSnapshot.path, target, { now });
  } catch (error) {
    primaryError = error;
  }

  const cleanupActions = [
    ['standalone backup snapshot removal', () => cleanupSqliteSnapshot(targetSnapshot)]
  ];
  let cleanupFailures = runCleanupActions(cleanupActions);
  if (cleanupFailures.length > 0) {
    cleanupFailures = runCleanupActions(cleanupActions);
  }
  if (primaryError || cleanupFailures.length > 0) {
    const errors = [
      ...(primaryError ? [primaryError] : []),
      ...cleanupFailures.map((failure) => failure.error)
    ];
    throw new LegacyMigrationError(
      primaryError?.message || 'Target backup snapshot cleanup failed.',
      {
        code: primaryError?.code || 'BACKUP_FAILED',
        cause: new AggregateError(errors, 'Target backup or snapshot cleanup failed')
      }
    );
  }

  return backupPath;
}

export function reconcileLegacyDatabase({
  sourcePath,
  targetPath,
  apply = false,
  sourceId = null,
  now = () => new Date()
}) {
  const source = resolveExistingDatabase(sourcePath, 'source');
  const target = resolveExistingDatabase(targetPath, 'target');
  assertDifferentDatabases(source, target);

  const { sourceKey, sourceIdentityMode } = normalizeSourceIdentity(source.path, sourceId);
  const context = { sourceKey, sourceIdentityMode };
  const summary = makeSummary({
    apply,
    sourcePath: source.path,
    targetPath: target.path,
    sourceKey,
    sourceIdentityMode
  });
  let sourceSnapshot;
  let targetSnapshot;
  let applyTargetSnapshot;
  let sourceDatabase;
  let targetDatabase;
  let targetSnapshotDatabase;
  let pendingError = null;
  let result = null;
  const cleanupFailures = [];

  try {
    result = (() => {
      sourceSnapshot = createConsistentSqliteSnapshot(source.path);
      targetSnapshot = createConsistentSqliteSnapshot(target.path);
      sourceDatabase = openReadonlyDatabase(sourceSnapshot.path);
      targetSnapshotDatabase = openReadonlyDatabase(targetSnapshot.path);
      const preflightPlan = buildReconciliationPlan(
        sourceDatabase,
        targetSnapshotDatabase,
        context
      );
      targetSnapshotDatabase.close();
      targetSnapshotDatabase = null;
      applyPlanCounts(summary, preflightPlan);

      if (!apply) return summary;
      capturePlannedCounts(summary);
      if (preflightPlan.errors.length > 0) {
        markSummaryFailed(summary, new LegacyMigrationError(
          'Apply refused because source validation errors were found.',
          { code: 'SOURCE_VALIDATION_FAILED' }
        ));
        throw new LegacyMigrationError('Apply refused because source validation errors were found.', {
          code: 'SOURCE_VALIDATION_FAILED',
          summary
        });
      }

      targetDatabase = new Database(target.path, { fileMustExist: true });
      let transactionPlan = preflightPlan;

      try {
        targetDatabase.exec('BEGIN IMMEDIATE');
        // SQLite locks SHM byte ranges while this writer lock is held on Windows.
        // WAL is durable; the disposable copy safely rebuilds its transient SHM index.
        applyTargetSnapshot = createConsistentSqliteSnapshot(target.path, {
          includeSharedMemory: false
        });
        summary.backupPath = createTargetBackupFromSnapshot(
          applyTargetSnapshot.path,
          target,
          { now }
        );
        targetDatabase.exec(CREATE_MAPPING_TABLE_SQL);
        assertMappingTableSchema(targetDatabase);
        transactionPlan = buildReconciliationPlan(sourceDatabase, targetDatabase, context);
        if (transactionPlan.errors.length > 0) {
          throw new LegacyMigrationError('Apply refused because source validation errors were found.', {
            code: 'SOURCE_VALIDATION_FAILED'
          });
        }

        const actual = executePlan(targetDatabase, transactionPlan, {
          sourceKey,
          migratedAt: now().toISOString()
        });
        targetDatabase.exec('COMMIT');
        applyPlanCounts(summary, transactionPlan);
        summary.created = actual.created;
        summary.updated = actual.updated;
        summary.applied = true;
        return summary;
      } catch (error) {
        let rollbackError = null;
        let rolledBack = false;
        if (targetDatabase.inTransaction) {
          try {
            targetDatabase.exec('ROLLBACK');
            rolledBack = true;
          } catch (caughtRollbackError) {
            rollbackError = caughtRollbackError;
          }
        }
        const failedSummary = applyPlanCounts(summary, transactionPlan);
        markSummaryFailed(failedSummary, error, { rolledBack });
        if (rollbackError) {
          failedSummary.errorDetails.push({
            code: 'ROLLBACK_FAILED',
            message: rollbackError.message
          });
          failedSummary.errors = failedSummary.errorDetails.length;
        }
        const outcome = rolledBack ? 'rolled back' : 'failed before rollback';
        throw new LegacyMigrationError(`Migration transaction ${outcome}: ${error.message}`, {
          code: error.code || 'APPLY_TRANSACTION_FAILED',
          summary: failedSummary,
          cause: rollbackError || error
        });
      }
    })();
  } catch (error) {
    if (error instanceof LegacyMigrationError) {
      if (!error.summary) error.summary = markSummaryFailed(summary, error);
      pendingError = error;
    } else {
      const wrappedError = new LegacyMigrationError(error.message, {
        cause: error
      });
      wrappedError.summary = markSummaryFailed(summary, wrappedError);
      pendingError = wrappedError;
    }
  } finally {
    const cleanupActions = [
      ['target database close', () => targetDatabase?.close()],
      ['target snapshot database close', () => targetSnapshotDatabase?.close()],
      ['source snapshot database close', () => sourceDatabase?.close()],
      ['apply target snapshot removal', () => cleanupSqliteSnapshot(applyTargetSnapshot)],
      ['target snapshot removal', () => cleanupSqliteSnapshot(targetSnapshot)],
      ['source snapshot removal', () => cleanupSqliteSnapshot(sourceSnapshot)]
    ];

    cleanupFailures.push(...runCleanupActions(cleanupActions));

  }

  let cleanupError = null;
  if (cleanupFailures.length > 0) {
    appendCleanupFailures(pendingError?.summary || summary, cleanupFailures);
    if (!pendingError) {
      cleanupError = new LegacyMigrationError(
        'Migration completed, but temporary snapshot cleanup failed.',
        {
          code: 'SNAPSHOT_CLEANUP_FAILED',
          summary,
          cause: cleanupFailures[0].error
        }
      );
    }
  }

  if (pendingError) throw pendingError;
  if (cleanupError) throw cleanupError;
  return result;
}

export const legacyMigrationInternals = Object.freeze({
  BLOG_POST_COLUMNS,
  MAPPING_TABLE,
  SNAPSHOT_DIRECTORY_PREFIX,
  SOURCE_TABLE,
  TARGET_TABLE
});

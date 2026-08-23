import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, initDatabase } from '../../db.js';
import {
  getOperationalFacts,
  upsertLocalSqlSnapshot
} from '../../services/sqlFactGateway.js';

beforeEach(() => {
  initDatabase();
  db.prepare("DELETE FROM hybrid_rag_sql_snapshots WHERE sql_project_id = 'PRJ-2026'").run();
});

describe('allowlisted SQL fact gateway', () => {
  it('sends only project ID and fact profiles to the configured gateway', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      project_id: 'PRJ-2026',
      source: 'erp-fact-gateway',
      as_of: '2026-08-20T10:00:00.000Z',
      facts: {
        bom_availability: { shortage_count: 3 },
        ignored_profile: { should_not: 'surface' }
      }
    }), { status: 200 }));

    const result = await getOperationalFacts({
      sqlProjectId: 'PRJ-2026',
      factProfiles: ['bom_availability'],
      env: {
        NODE_ENV: 'production',
        HYBRID_SQL_FACT_GATEWAY_URL: 'https://erp.example.internal/rag/facts',
        HYBRID_SQL_FACT_GATEWAY_TOKEN: 'test-token'
      },
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      project_id: 'PRJ-2026',
      fact_profiles: ['bom_availability']
    });
    expect(request.body).not.toContain('SELECT');
    expect(result).toMatchObject({
      availability: 'available',
      facts: { bom_availability: { shortage_count: 3 } },
      unavailable_profiles: []
    });
  });

  it('fails closed for an insecure production gateway even if a pilot snapshot exists', async () => {
    upsertLocalSqlSnapshot({
      sqlProjectId: 'PRJ-2026',
      facts: { project_snapshot: { phase: 'pilot' } },
      asOf: '2026-08-20T10:00:00.000Z'
    });

    const result = await getOperationalFacts({
      sqlProjectId: 'PRJ-2026',
      factProfiles: ['project_snapshot'],
      env: {
        NODE_ENV: 'production',
        HYBRID_SQL_FACT_GATEWAY_URL: 'http://erp.example.internal/rag/facts'
      }
    });

    expect(result).toMatchObject({
      availability: 'unavailable',
      reason: 'SQL_FACT_GATEWAY_CONFIGURATION_INVALID',
      facts: {}
    });
  });
});

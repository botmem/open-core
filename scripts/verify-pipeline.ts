#!/usr/bin/env npx tsx
/**
 * Pipeline Verification Script
 *
 * Validates pipeline correctness per connector type by checking:
 * raw events, memories, pipeline completion, embeddings, contacts,
 * entities, factuality, and Qdrant vectors.
 *
 * Usage:
 *   npx tsx scripts/verify-pipeline.ts                  # check all connectors
 *   npx tsx scripts/verify-pipeline.ts --connector gmail # check one connector
 *   npx tsx scripts/verify-pipeline.ts --help
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';

const { Client } = pg;

// --- Config ---
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://botmem:botmem@localhost:5432/botmem';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'memories';

// Expected source_type per connector
const EXPECTED_SOURCE_TYPE: Record<string, string> = {
  gmail: 'email',
  slack: 'message',
  whatsapp: 'message',
  imessage: 'message',
  'photos-immich': 'photo',
  owntracks: 'location',
};

// Connectors where contacts are expected
const CONTACT_CONNECTORS = new Set(['gmail', 'slack', 'whatsapp', 'imessage']);

interface CheckResult {
  connector: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  details: string;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Pipeline Verification Script

Validates that the data pipeline produced correct output for each connector.

Usage:
  npx tsx scripts/verify-pipeline.ts [options]

Options:
  --connector <type>   Check a specific connector type (e.g., gmail, slack, whatsapp)
  --help, -h           Show this help message

Checks performed per connector:
  1.  Raw events exist
  2.  Memories created
  3.  Correct source_type mapping
  4.  Pipeline complete flag
  5.  Embeddings status
  6.  Contacts resolved (email/message types)
  7.  Entities extracted
  8.  Factuality set
  9.  Qdrant vectors exist
  10. Search sanity (Qdrant filtered search)
`);
    process.exit(0);
  }

  let targetConnector: string | null = null;
  const connectorIdx = args.indexOf('--connector');
  if (connectorIdx !== -1 && args[connectorIdx + 1]) {
    targetConnector = args[connectorIdx + 1];
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const qdrant = new QdrantClient({ url: QDRANT_URL });

  try {
    // Discover connector types with data
    let connectors: string[];
    if (targetConnector) {
      connectors = [targetConnector];
    } else {
      const res = await client.query(
        'SELECT DISTINCT connector_type FROM raw_events ORDER BY connector_type',
      );
      connectors = res.rows.map((r: any) => r.connector_type);
      if (!connectors.length) {
        console.log('No raw events found in database. Nothing to verify.');
        process.exit(0);
      }
    }

    const results: CheckResult[] = [];

    for (const connector of connectors) {
      results.push(...(await runChecks(client, qdrant, connector)));
    }

    // Print results table
    printTable(results);

    // Exit code
    const failures = results.filter((r) => r.status === 'FAIL');
    if (failures.length > 0) {
      console.log(`\n${failures.length} check(s) FAILED.`);
      process.exit(1);
    } else {
      console.log('\nAll checks passed.');
    }
  } finally {
    await client.end();
  }
}

async function runChecks(
  db: pg.Client,
  qdrant: QdrantClient,
  connector: string,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Raw events exist
  const rawCount = await queryCount(db, 'raw_events', connector);
  results.push({
    connector,
    check: '1. Raw events exist',
    status: rawCount > 0 ? 'PASS' : 'FAIL',
    details: `${rawCount} raw events`,
  });

  // 2. Memories created
  const memCount = await queryCount(db, 'memories', connector);
  results.push({
    connector,
    check: '2. Memories created',
    status: memCount > 0 ? 'PASS' : 'FAIL',
    details: `${memCount} memories`,
  });

  if (memCount === 0) {
    // Skip remaining checks if no memories
    for (let i = 3; i <= 10; i++) {
      results.push({
        connector,
        check: `${i}. (skipped)`,
        status: 'SKIP',
        details: 'No memories to check',
      });
    }
    return results;
  }

  // 3. Correct source_type
  const expectedType = EXPECTED_SOURCE_TYPE[connector];
  if (expectedType) {
    const correctCount = await queryScalar<number>(
      db,
      `SELECT COUNT(*) as count FROM memories WHERE connector_type = $1 AND source_type = $2`,
      [connector, expectedType],
    );
    const wrongCount = memCount - correctCount;
    results.push({
      connector,
      check: '3. Correct source_type',
      status: wrongCount === 0 ? 'PASS' : 'WARN',
      details:
        wrongCount === 0
          ? `All ${memCount} have source_type='${expectedType}'`
          : `${wrongCount}/${memCount} have unexpected source_type (expected '${expectedType}')`,
    });
  } else {
    results.push({
      connector,
      check: '3. Correct source_type',
      status: 'SKIP',
      details: `No expected source_type mapping defined for '${connector}'`,
    });
  }

  // 4. Pipeline complete
  const completeCount = await queryScalar<number>(
    db,
    `SELECT COUNT(*) as count FROM memories WHERE connector_type = $1 AND pipeline_complete = true`,
    [connector],
  );
  const incompleteCount = memCount - completeCount;
  results.push({
    connector,
    check: '4. Pipeline complete',
    status: incompleteCount === 0 ? 'PASS' : 'FAIL',
    details:
      incompleteCount === 0
        ? `All ${memCount} pipeline complete`
        : `${incompleteCount}/${memCount} NOT pipeline complete`,
  });

  // 5. Embeddings status
  const doneCount = await queryScalar<number>(
    db,
    `SELECT COUNT(*) as count FROM memories WHERE connector_type = $1 AND embedding_status = 'done'`,
    [connector],
  );
  const notDoneCount = memCount - doneCount;
  results.push({
    connector,
    check: '5. Embeddings status',
    status: notDoneCount === 0 ? 'PASS' : 'FAIL',
    details:
      notDoneCount === 0
        ? `All ${memCount} embedding_status='done'`
        : `${notDoneCount}/${memCount} NOT done`,
  });

  // 6. Contacts resolved
  if (CONTACT_CONNECTORS.has(connector)) {
    const contactCount = await queryScalar<number>(
      db,
      `SELECT COUNT(DISTINCT mc.contact_id) as count
       FROM memory_contacts mc
       JOIN memories m ON mc.memory_id = m.id
       WHERE m.connector_type = $1`,
      [connector],
    );
    results.push({
      connector,
      check: '6. Contacts resolved',
      status: contactCount > 0 ? 'PASS' : 'FAIL',
      details: `${contactCount} distinct contacts linked`,
    });
  } else {
    results.push({
      connector,
      check: '6. Contacts resolved',
      status: 'SKIP',
      details: `Contact resolution not expected for '${connector}'`,
    });
  }

  // 7. Entities extracted
  const withEntities = await queryScalar<number>(
    db,
    `SELECT COUNT(*) as count FROM memories WHERE connector_type = $1 AND entities != '[]' AND entities IS NOT NULL AND entities != ''`,
    [connector],
  );
  const entityPct = ((withEntities / memCount) * 100).toFixed(1);
  results.push({
    connector,
    check: '7. Entities extracted',
    status: withEntities > 0 ? 'PASS' : 'WARN',
    details: `${withEntities}/${memCount} (${entityPct}%) have entities`,
  });

  // 8. Factuality set
  const withFactuality = await queryScalar<number>(
    db,
    `SELECT COUNT(*) as count FROM memories
     WHERE connector_type = $1
     AND factuality IS NOT NULL
     AND factuality::text != '{"label":"UNVERIFIED","confidence":0.5,"rationale":"Pending evaluation"}'`,
    [connector],
  );
  const factPct = ((withFactuality / memCount) * 100).toFixed(1);
  results.push({
    connector,
    check: '8. Factuality set',
    status: withFactuality > 0 ? 'PASS' : 'WARN',
    details: `${withFactuality}/${memCount} (${factPct}%) have non-default factuality`,
  });

  // 9. Qdrant vectors
  try {
    const qdrantCount = await qdrant.count(COLLECTION, {
      filter: {
        must: [{ key: 'connector_type', match: { value: connector } }],
      },
      exact: true,
    });
    const vectorCount = qdrantCount.count;
    const diff = Math.abs(memCount - vectorCount);
    results.push({
      connector,
      check: '9. Qdrant vectors',
      status: diff === 0 ? 'PASS' : diff <= memCount * 0.05 ? 'WARN' : 'FAIL',
      details: `${vectorCount} vectors vs ${memCount} memories (diff: ${diff})`,
    });
  } catch (err: any) {
    results.push({
      connector,
      check: '9. Qdrant vectors',
      status: 'FAIL',
      details: `Qdrant error: ${err?.message || err}`,
    });
  }

  // 10. Search sanity
  try {
    // Get a random vector from this connector to use as search query
    const scrollResult = await qdrant.scroll(COLLECTION, {
      filter: {
        must: [{ key: 'connector_type', match: { value: connector } }],
      },
      limit: 1,
      with_vector: true,
    });

    if (scrollResult.points.length === 0) {
      results.push({
        connector,
        check: '10. Search sanity',
        status: 'SKIP',
        details: 'No vectors to search with',
      });
    } else {
      const sampleVector = scrollResult.points[0].vector as number[];
      const searchResult = await qdrant.search(COLLECTION, {
        vector: sampleVector,
        filter: {
          must: [{ key: 'connector_type', match: { value: connector } }],
        },
        limit: 5,
      });
      results.push({
        connector,
        check: '10. Search sanity',
        status: searchResult.length > 0 ? 'PASS' : 'FAIL',
        details: `Returned ${searchResult.length} results`,
      });
    }
  } catch (err: any) {
    results.push({
      connector,
      check: '10. Search sanity',
      status: 'FAIL',
      details: `Qdrant search error: ${err?.message || err}`,
    });
  }

  return results;
}

async function queryCount(db: pg.Client, table: string, connector: string): Promise<number> {
  const res = await db.query(`SELECT COUNT(*) as count FROM ${table} WHERE connector_type = $1`, [
    connector,
  ]);
  return parseInt(res.rows[0].count, 10);
}

async function queryScalar<T>(db: pg.Client, query: string, params: any[]): Promise<T> {
  const res = await db.query(query, params);
  return res.rows[0]?.count ?? 0;
}

function printTable(results: CheckResult[]) {
  // Calculate column widths
  const connW = Math.max(9, ...results.map((r) => r.connector.length));
  const checkW = Math.max(5, ...results.map((r) => r.check.length));
  const statusW = 6;
  const detailW = Math.max(7, ...results.map((r) => r.details.length));

  const header = `${'Connector'.padEnd(connW)} | ${'Check'.padEnd(checkW)} | ${'Status'.padEnd(statusW)} | ${'Details'.padEnd(detailW)}`;
  const separator = '-'.repeat(header.length);

  console.log('\n' + separator);
  console.log(header);
  console.log(separator);

  let currentConnector = '';
  for (const r of results) {
    const connLabel = r.connector !== currentConnector ? r.connector : '';
    currentConnector = r.connector;
    const statusColor =
      r.status === 'PASS' ? '\x1b[32m' : r.status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
    console.log(
      `${connLabel.padEnd(connW)} | ${r.check.padEnd(checkW)} | ${statusColor}${r.status.padEnd(statusW)}\x1b[0m | ${r.details}`,
    );
  }
  console.log(separator);
}

main().catch((err) => {
  console.error('Pipeline verification failed:', err);
  process.exit(2);
});

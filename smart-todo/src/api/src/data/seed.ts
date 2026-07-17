import sql from 'mssql';
import { buildSqlConfig } from './sqlDataStore.js';
import { SCHEMA_SQL } from './schema.js';
import { SEED_TODOS, SEED_STEPS } from './seedData.js';

/**
 * Idempotent seed script. Ensures the schema exists, then inserts the exact
 * seed rows from PLAN.md — but only when the Todos table is empty, so re-runs
 * are safe. Run with: npm run seed
 */
async function main(): Promise<void> {
  const pool = await new sql.ConnectionPool(buildSqlConfig()).connect();
  try {
    await pool.request().batch(SCHEMA_SQL);

    const countResult = await pool.request().query<{ n: number }>('SELECT COUNT(*) AS n FROM Todos');
    if ((countResult.recordset[0]?.n ?? 0) > 0) {
      console.log('Seed skipped: Todos table already contains rows.');
      return;
    }

    for (const t of SEED_TODOS) {
      await pool
        .request()
        .input('id', sql.NVarChar(36), t.id)
        .input('title', sql.NVarChar(500), t.title)
        .input('status', sql.NVarChar(20), t.status)
        .input('userId', sql.NVarChar(100), t.userId)
        .input('stepsGenerated', sql.Bit, t.stepsGenerated)
        .query(
          'INSERT INTO Todos (id, title, status, userId, stepsGenerated) VALUES (@id, @title, @status, @userId, @stepsGenerated)',
        );
    }

    for (const s of SEED_STEPS) {
      await pool
        .request()
        .input('id', sql.NVarChar(36), s.id)
        .input('todoId', sql.NVarChar(36), s.todoId)
        .input('title', sql.NVarChar(200), s.title)
        .input('description', sql.NVarChar(1000), s.description)
        .input('order', sql.Int, s.order)
        .input('isCompleted', sql.Bit, s.isCompleted)
        .query(
          'INSERT INTO ActionSteps (id, todoId, title, description, [order], isCompleted) VALUES (@id, @todoId, @title, @description, @order, @isCompleted)',
        );
    }

    console.log(`Seeded ${SEED_TODOS.length} todos and ${SEED_STEPS.length} action steps.`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

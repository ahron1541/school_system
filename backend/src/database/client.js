const { Pool } = require('pg');
const { ApiError } = require('../shared/middleware/error-handler');

function createDatabase(url) {
  const pool = url ? new Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 2500, statement_timeout: 5000, idleTimeoutMillis: 10000 }) : null;
  pool?.on('error', () => console.error('[DATABASE] An idle connection was lost.'));
  async function query(sql, values) {
    if (!pool) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database is not configured.');
    try { return await pool.query(sql, values); }
    catch (error) {
      if (['23505', '23503', '23514'].includes(error.code)) throw error;
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable. Please try again.');
    }
  }
  async function transaction(work) {
    if (!pool) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database is not configured.');
    let connection;
    try {
      connection = await pool.connect();
      await connection.query('BEGIN');
      const result = await work(connection);
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      if (connection) await connection.query('ROLLBACK').catch(() => {});
      if (error instanceof ApiError || ['23505', '23503', '23514'].includes(error.code)) throw error;
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database operation failed. Please retry.');
    } finally { connection?.release(); }
  }
  return { query, transaction, close: () => pool?.end() };
}

module.exports = { createDatabase };

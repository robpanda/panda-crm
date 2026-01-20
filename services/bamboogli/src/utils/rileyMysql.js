/**
 * Riley MySQL Connection Utility
 *
 * Provides connection to Riley's MySQL database for accessing campaign data.
 * Uses AWS Secrets Manager for credentials, matching Riley's existing pattern.
 */

import mysql from 'mysql2/promise';
import AWS from 'aws-sdk';

const secretsManager = new AWS.SecretsManager({ region: 'us-east-2' });

let connectionPool = null;

/**
 * Get database credentials from AWS Secrets Manager
 */
async function getDbCredentials() {
  console.log('[RileyMySQL] Fetching database credentials from AWS Secrets Manager...');
  try {
    const response = await secretsManager.getSecretValue({ SecretId: 'RileyDatabaseCredentials' }).promise();
    const creds = JSON.parse(response.SecretString);
    console.log('[RileyMySQL] ✓ Retrieved credentials from Secrets Manager');
    return {
      host: creds.host,
      user: creds.username,
      password: creds.password,
      database: creds.dbname || creds.database || 'riley_chat'
    };
  } catch (error) {
    console.error('[RileyMySQL] Failed to get secrets from AWS:', error.message);
    // Fallback to environment variables
    return {
      host: process.env.RILEY_DB_HOST || 'riley-db-prod.c1o4i6ekayqo.us-east-2.rds.amazonaws.com',
      user: process.env.RILEY_DB_USER || 'admin',
      password: process.env.RILEY_DB_PASSWORD,
      database: process.env.RILEY_DB_NAME || 'riley_chat'
    };
  }
}

/**
 * Get or create MySQL connection pool
 */
async function getConnection() {
  if (!connectionPool) {
    const credentials = await getDbCredentials();
    connectionPool = await mysql.createPool({
      host: credentials.host,
      user: credentials.user,
      password: credentials.password,
      database: credentials.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000
    });
    console.log('[RileyMySQL] ✓ Database connection pool created');
  }
  return connectionPool;
}

/**
 * Execute a query on Riley's MySQL database
 */
async function query(sql, params = []) {
  const pool = await getConnection();
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Execute a query and return first row
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Close the connection pool
 */
async function closeConnection() {
  if (connectionPool) {
    await connectionPool.end();
    connectionPool = null;
    console.log('[RileyMySQL] ✓ Database connection pool closed');
  }
}

export {
  getConnection,
  query,
  queryOne,
  closeConnection
};

export default {
  getConnection,
  query,
  queryOne,
  closeConnection
};

// Salesforce Connection Client
import jsforce from 'jsforce';
import dotenv from 'dotenv';

dotenv.config();

let connection = null;

export async function getSalesforceConnection() {
  if (connection && connection.accessToken) {
    return connection;
  }

  connection = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    instanceUrl: process.env.SF_INSTANCE_URL,
    accessToken: process.env.SF_ACCESS_TOKEN,
  });

  // If no access token, login with username/password
  if (!process.env.SF_ACCESS_TOKEN) {
    await connection.login(
      process.env.SF_USERNAME,
      process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
    );
    console.log('Connected to Salesforce:', connection.instanceUrl);
  }

  return connection;
}

export async function querySalesforce(connOrSoql, soqlOrOptions = {}) {
  // Support both calling patterns:
  // querySalesforce(soql) - old pattern
  // querySalesforce(conn, soql) - new pattern used by sync scripts
  let conn, soql, options;

  if (typeof connOrSoql === 'string') {
    // Old pattern: querySalesforce(soql, options)
    conn = await getSalesforceConnection();
    soql = connOrSoql;
    options = soqlOrOptions || {};
  } else {
    // New pattern: querySalesforce(conn, soql)
    conn = connOrSoql;
    soql = soqlOrOptions;
    options = {};
  }

  const { batchSize = 2000, onBatch } = options;

  const records = [];
  // Use autoFetch with maxFetch to get all records (no limit)
  let query = conn.query(soql).maxFetch(500000);

  return new Promise((resolve, reject) => {
    query.on('record', (record) => {
      records.push(record);
      if (onBatch && records.length % batchSize === 0) {
        onBatch(records.slice(-batchSize), records.length);
      }
    });

    query.on('end', () => {
      console.log(`Fetched ${records.length} records`);
      resolve(records);
    });

    query.on('error', (err) => {
      reject(err);
    });

    query.run({ autoFetch: true, maxFetch: 500000 });
  });
}

export async function bulkQuery(objectName, fields, where = '') {
  const conn = await getSalesforceConnection();
  const soql = `SELECT ${fields.join(', ')} FROM ${objectName}${where ? ' WHERE ' + where : ''}`;

  console.log(`Executing bulk query: ${soql.substring(0, 100)}...`);

  return new Promise((resolve, reject) => {
    const records = [];

    conn.bulk.query(soql)
      .on('record', (rec) => {
        records.push(rec);
      })
      .on('end', () => {
        resolve(records);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

export default { getSalesforceConnection, querySalesforce, bulkQuery };

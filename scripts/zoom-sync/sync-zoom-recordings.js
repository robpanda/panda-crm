#!/usr/bin/env node

/**
 * Zoom Cloud Recordings to S3 Sync Script
 *
 * Downloads all Zoom cloud recordings and uploads them to S3.
 * Uses Server-to-Server OAuth for authentication.
 *
 * Usage:
 *   node sync-zoom-recordings.js [options]
 *
 * Options:
 *   --start-date=YYYY-MM-DD  Start date for recordings (default: 2020-01-01)
 *   --end-date=YYYY-MM-DD    End date for recordings (default: today)
 *   --dry-run                List recordings without downloading
 *   --skip-existing          Skip files already in S3
 *   --user=email@domain.com  Sync only specific user's recordings
 *   --verbose                Show detailed progress
 *
 * Required Environment Variables:
 *   ZOOM_ACCOUNT_ID     - From Zoom Server-to-Server OAuth app
 *   ZOOM_CLIENT_ID      - From Zoom Server-to-Server OAuth app
 *   ZOOM_CLIENT_SECRET  - From Zoom Server-to-Server OAuth app
 *
 * Or use AWS Secrets Manager:
 *   Secret: zoom-api-credentials (with accountId, clientId, clientSecret)
 *
 * Required Zoom Scopes:
 *   - cloud_recording:read:list_user_recordings:admin
 *   - user:read:user:admin
 *   - user:read:list_users:admin
 */

const https = require('https');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { URL } = require('url');
const path = require('path');

// Configuration
const CONFIG = {
  s3Bucket: 'panda-zoom-recordings',
  s3Region: 'us-east-2',
  zoomApiBase: 'https://api.zoom.us/v2',
  zoomOAuthUrl: 'https://zoom.us/oauth/token',
  tokenSecretName: 'zoom-oauth-tokens',
  credentialsSecretName: 'zoom-app-credentials',
  defaultStartDate: '2020-01-01',
  pageSize: 300, // Max recordings per page
  retryAttempts: 3,
  retryDelayMs: 2000,
};

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    acc[key] = value || true;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] || false;
const SKIP_EXISTING = args['skip-existing'] !== false; // Default true
const VERBOSE = args['verbose'] || false;
const SPECIFIC_USER = args['user'] || null;
const START_DATE = args['start-date'] || CONFIG.defaultStartDate;
const END_DATE = args['end-date'] || new Date().toISOString().split('T')[0];

// Initialize AWS clients
const s3Client = new S3Client({ region: CONFIG.s3Region });
const secretsClient = new SecretsManagerClient({ region: CONFIG.s3Region });

// Token cache
let accessToken = null;
let tokenExpiry = null;

// Statistics
const stats = {
  usersProcessed: 0,
  recordingsFound: 0,
  recordingsDownloaded: 0,
  recordingsSkipped: 0,
  recordingsFailed: 0,
  bytesDownloaded: 0,
  startTime: Date.now(),
};

/**
 * Get stored OAuth tokens from AWS Secrets Manager
 */
async function getStoredTokens() {
  try {
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: CONFIG.tokenSecretName,
    }));
    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error('Failed to get Zoom tokens:', error.message);
    console.error('\nRun authorization first: node auth-zoom.js');
    process.exit(1);
  }
}

/**
 * Get app credentials from AWS Secrets Manager
 */
async function getAppCredentials() {
  try {
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: CONFIG.credentialsSecretName,
    }));
    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error('Failed to get Zoom app credentials:', error.message);
    process.exit(1);
  }
}

/**
 * Save updated tokens to AWS Secrets Manager
 */
async function saveTokens(tokens) {
  const { UpdateSecretCommand } = require('@aws-sdk/client-secrets-manager');
  await secretsClient.send(new UpdateSecretCommand({
    SecretId: CONFIG.tokenSecretName,
    SecretString: JSON.stringify({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }),
  }));
}

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(refreshToken) {
  const credentials = await getAppCredentials();
  const authString = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString();

    const options = {
      hostname: 'zoom.us',
      path: '/oauth/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response);
          } else {
            reject(new Error(`Token refresh failed: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Get OAuth access token (from stored tokens, refresh if needed)
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 60000) {
    return accessToken;
  }

  const stored = await getStoredTokens();

  // Check if token is expired
  const expiresAt = new Date(stored.expiresAt);
  if (expiresAt > new Date(Date.now() + 60000)) {
    // Token still valid
    accessToken = stored.accessToken;
    tokenExpiry = expiresAt.getTime();
    if (VERBOSE) console.log('Using stored access token');
    return accessToken;
  }

  // Token expired, refresh it
  if (VERBOSE) console.log('Access token expired, refreshing...');
  const newTokens = await refreshAccessToken(stored.refreshToken);
  await saveTokens(newTokens);

  accessToken = newTokens.access_token;
  tokenExpiry = Date.now() + (newTokens.expires_in * 1000);
  if (VERBOSE) console.log('Access token refreshed successfully');
  return accessToken;
}

/**
 * Make authenticated API request to Zoom
 */
async function zoomApiRequest(endpoint, retries = CONFIG.retryAttempts) {
  const token = await getAccessToken();
  // Construct path correctly - endpoint should start with /
  const path = endpoint.startsWith('/') ? `/v2${endpoint}` : `/v2/${endpoint}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.zoom.us',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else if (res.statusCode === 429 && retries > 0) {
          // Rate limited - wait and retry
          const retryAfter = parseInt(res.headers['retry-after'] || '5') * 1000;
          console.log(`Rate limited, waiting ${retryAfter}ms...`);
          setTimeout(() => {
            zoomApiRequest(endpoint, retries - 1).then(resolve).catch(reject);
          }, retryAfter);
        } else if (res.statusCode === 401) {
          // Token expired - clear and retry
          accessToken = null;
          tokenExpiry = null;
          if (retries > 0) {
            zoomApiRequest(endpoint, retries - 1).then(resolve).catch(reject);
          } else {
            reject(new Error(`Authentication failed: ${data}`));
          }
        } else {
          reject(new Error(`API error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Get current authenticated user info
 */
async function getCurrentUser() {
  const response = await zoomApiRequest('/users/me');
  return response;
}

/**
 * Get all users in the account (requires admin scope)
 */
async function getAllUsers() {
  const users = [];
  let nextPageToken = '';

  do {
    const endpoint = `/users?page_size=300&status=active${nextPageToken ? `&next_page_token=${nextPageToken}` : ''}`;

    try {
      const response = await zoomApiRequest(endpoint);

      if (response.users) {
        users.push(...response.users);
      }
      nextPageToken = response.next_page_token || '';
    } catch (error) {
      // If we get a 403/401/400, we don't have admin scope - fall back to current user only
      if (error.message.includes('403') || error.message.includes('401') || error.message.includes('400') || error.message.includes('4700') || error.message.includes('4711')) {
        if (VERBOSE) console.log('  Note: No admin scope - can only access current user\'s recordings');
        return null; // Signal to fall back to current user
      }
      throw error;
    }
  } while (nextPageToken);

  return users;
}

/**
 * Get recordings for a specific user within date range
 */
async function getUserRecordings(userId, from, to) {
  const recordings = [];
  let nextPageToken = '';

  do {
    const endpoint = `/users/${userId}/recordings?page_size=${CONFIG.pageSize}&from=${from}&to=${to}${nextPageToken ? `&next_page_token=${nextPageToken}` : ''}`;

    try {
      const response = await zoomApiRequest(endpoint);

      if (response.meetings) {
        recordings.push(...response.meetings);
      }
      nextPageToken = response.next_page_token || '';
    } catch (error) {
      // Some users may not have recording access
      if (error.message.includes('4102') || error.message.includes('1001')) {
        if (VERBOSE) console.log(`User ${userId} has no recording access`);
        return [];
      }
      throw error;
    }
  } while (nextPageToken);

  return recordings;
}

/**
 * Check if file exists in S3
 */
async function fileExistsInS3(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: CONFIG.s3Bucket,
      Key: key,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Download recording file and upload to S3
 */
async function downloadAndUploadRecording(recording, file, meetingDate) {
  const dateFolder = meetingDate.split('T')[0];
  const sanitizedTopic = (recording.topic || 'untitled')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);

  const fileName = `${sanitizedTopic}_${recording.id}_${file.recording_type}.${file.file_extension || 'mp4'}`;
  const s3Key = `${dateFolder}/${fileName}`;

  // Check if already exists
  if (SKIP_EXISTING) {
    const exists = await fileExistsInS3(s3Key);
    if (exists) {
      if (VERBOSE) console.log(`  Skipping (exists): ${s3Key}`);
      stats.recordingsSkipped++;
      return { skipped: true, key: s3Key };
    }
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would download: ${s3Key} (${formatBytes(file.file_size)})`);
    return { dryRun: true, key: s3Key };
  }

  // Get download URL with access token
  const token = await getAccessToken();
  const downloadUrl = file.download_url + `?access_token=${token}`;

  return new Promise((resolve, reject) => {
    const url = new URL(downloadUrl);

    const download = (redirectUrl) => {
      const targetUrl = new URL(redirectUrl || downloadUrl);

      const options = {
        hostname: targetUrl.hostname,
        path: targetUrl.pathname + targetUrl.search,
        method: 'GET',
        headers: redirectUrl ? {} : { 'Authorization': `Bearer ${token}` },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Follow redirect
          download(res.headers.location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }

        const chunks = [];
        let downloadedBytes = 0;

        res.on('data', (chunk) => {
          chunks.push(chunk);
          downloadedBytes += chunk.length;
          if (VERBOSE && downloadedBytes % (10 * 1024 * 1024) < chunk.length) {
            process.stdout.write(`\r  Downloading: ${formatBytes(downloadedBytes)}...`);
          }
        });

        res.on('end', async () => {
          if (VERBOSE) process.stdout.write('\r');

          const buffer = Buffer.concat(chunks);

          try {
            await s3Client.send(new PutObjectCommand({
              Bucket: CONFIG.s3Bucket,
              Key: s3Key,
              Body: buffer,
              ContentType: getContentType(file.file_extension),
              Metadata: {
                'zoom-meeting-id': String(recording.id),
                'zoom-topic': sanitizedTopic,
                'zoom-start-time': meetingDate,
                'zoom-host-email': recording.host_email || '',
                'zoom-recording-type': file.recording_type || '',
              },
            }));

            stats.recordingsDownloaded++;
            stats.bytesDownloaded += buffer.length;
            console.log(`  Uploaded: ${s3Key} (${formatBytes(buffer.length)})`);
            resolve({ uploaded: true, key: s3Key, size: buffer.length });
          } catch (uploadError) {
            reject(new Error(`S3 upload failed: ${uploadError.message}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    };

    download();
  });
}

/**
 * Get content type for file extension
 */
function getContentType(ext) {
  const types = {
    'mp4': 'video/mp4',
    'm4a': 'audio/mp4',
    'txt': 'text/plain',
    'vtt': 'text/vtt',
    'json': 'application/json',
    'csv': 'text/csv',
  };
  return types[ext?.toLowerCase()] || 'application/octet-stream';
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Main sync function
 */
async function syncRecordings() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('          ZOOM CLOUD RECORDINGS → S3 SYNC');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no downloads)' : 'LIVE'}`);
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`);
  console.log(`S3 Bucket: ${CONFIG.s3Bucket}`);
  console.log(`Skip Existing: ${SKIP_EXISTING}`);
  if (SPECIFIC_USER) console.log(`User Filter: ${SPECIFIC_USER}`);
  console.log('───────────────────────────────────────────────────────────────────');

  // Validate credentials
  await getAccessToken();
  console.log('Authentication successful!\n');

  // Try to get all users (requires admin scope)
  let users = [];
  console.log('Fetching users...');

  const allUsers = await getAllUsers();

  if (allUsers && allUsers.length > 0) {
    // Admin scope available - can access all users
    console.log(`Found ${allUsers.length} users in account (admin scope available)`);

    if (SPECIFIC_USER && SPECIFIC_USER !== 'me') {
      // Filter to specific user if requested
      const filtered = allUsers.filter(u => u.email === SPECIFIC_USER || u.id === SPECIFIC_USER);
      if (filtered.length > 0) {
        users = filtered.map(u => ({ id: u.id, email: u.email }));
        console.log(`Filtering to user: ${SPECIFIC_USER}`);
      } else {
        console.log(`User ${SPECIFIC_USER} not found, syncing all users`);
        users = allUsers.map(u => ({ id: u.id, email: u.email }));
      }
    } else {
      users = allUsers.map(u => ({ id: u.id, email: u.email }));
    }
  } else {
    // Fall back to current user only
    console.log('Admin scope not available - syncing current user only');
    const currentUser = await getCurrentUser();
    users = [{ id: currentUser.id, email: currentUser.email }];

    if (SPECIFIC_USER && SPECIFIC_USER !== currentUser.email && SPECIFIC_USER !== 'me') {
      console.log(`Note: Cannot access other users without admin scope.`);
      console.log(`      Using current user: ${currentUser.email}`);
    }
  }

  console.log(`\nWill sync recordings for ${users.length} user(s)\n`);

  // Process each user
  for (const user of users) {
    stats.usersProcessed++;
    console.log(`\n[${stats.usersProcessed}/${users.length}] Processing: ${user.email}`);

    try {
      const recordings = await getUserRecordings(user.id, START_DATE, END_DATE);

      if (recordings.length === 0) {
        if (VERBOSE) console.log('  No recordings found');
        continue;
      }

      console.log(`  Found ${recordings.length} meetings with recordings`);

      for (const meeting of recordings) {
        stats.recordingsFound++;
        const meetingDate = meeting.start_time || new Date().toISOString();

        if (VERBOSE) {
          console.log(`\n  Meeting: ${meeting.topic || 'Untitled'}`);
          console.log(`  Date: ${meetingDate}`);
          console.log(`  Files: ${meeting.recording_files?.length || 0}`);
        }

        if (!meeting.recording_files || meeting.recording_files.length === 0) {
          continue;
        }

        for (const file of meeting.recording_files) {
          // Skip if no download URL
          if (!file.download_url) {
            if (VERBOSE) console.log(`  Skipping file without download URL: ${file.recording_type}`);
            continue;
          }

          try {
            await downloadAndUploadRecording(meeting, file, meetingDate);
          } catch (error) {
            console.error(`  ERROR downloading ${file.recording_type}: ${error.message}`);
            stats.recordingsFailed++;
          }
        }
      }
    } catch (error) {
      console.error(`  ERROR processing user: ${error.message}`);
    }
  }

  // Print summary
  const duration = Date.now() - stats.startTime;
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         SYNC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Duration: ${formatDuration(duration)}`);
  console.log(`Users Processed: ${stats.usersProcessed}`);
  console.log(`Recordings Found: ${stats.recordingsFound}`);
  console.log(`Recordings Downloaded: ${stats.recordingsDownloaded}`);
  console.log(`Recordings Skipped: ${stats.recordingsSkipped}`);
  console.log(`Recordings Failed: ${stats.recordingsFailed}`);
  console.log(`Total Downloaded: ${formatBytes(stats.bytesDownloaded)}`);
  console.log('═══════════════════════════════════════════════════════════════════');
}

// Run the sync
syncRecordings().catch(error => {
  console.error('\nFATAL ERROR:', error.message);
  process.exit(1);
});

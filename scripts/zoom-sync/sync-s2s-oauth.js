#!/usr/bin/env node

/**
 * Zoom Cloud Recordings to S3 Sync Script (Server-to-Server OAuth)
 *
 * Downloads all Zoom cloud recordings and uploads them to S3.
 * Uses Server-to-Server OAuth for authentication (no user interaction needed).
 *
 * Usage:
 *   ZOOM_ACCOUNT_ID="xxx" ZOOM_CLIENT_ID="xxx" ZOOM_CLIENT_SECRET="xxx" node sync-s2s-oauth.js [options]
 *
 * Options:
 *   --start-date=YYYY-MM-DD  Start date for recordings (default: 2020-01-01)
 *   --end-date=YYYY-MM-DD    End date for recordings (default: today)
 *   --dry-run                List recordings without downloading
 *   --skip-existing          Skip files already in S3 (default: true)
 *   --verbose                Show detailed progress
 *
 * Required Zoom Server-to-Server OAuth Scopes:
 *   - cloud_recording:read:list_account_recordings:master
 *   - cloud_recording:read:list_recording_files:master
 */

const https = require('https');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { URL } = require('url');

// Configuration
const CONFIG = {
  s3Bucket: 'panda-zoom-recordings',
  s3Region: 'us-east-2',
  pageSize: 300,
  retryAttempts: 3,
  defaultStartDate: '2020-01-01',
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
const SKIP_EXISTING = args['skip-existing'] !== false;
const VERBOSE = args['verbose'] || false;
const START_DATE = args['start-date'] || CONFIG.defaultStartDate;
const END_DATE = args['end-date'] || new Date().toISOString().split('T')[0];

// Get credentials from environment
const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
  console.error('ERROR: Missing required environment variables');
  console.error('Required: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET');
  console.error('');
  console.error('Usage:');
  console.error('  ZOOM_ACCOUNT_ID="xxx" ZOOM_CLIENT_ID="xxx" ZOOM_CLIENT_SECRET="xxx" node sync-s2s-oauth.js');
  process.exit(1);
}

// Initialize AWS S3 client
const s3Client = new S3Client({ region: CONFIG.s3Region });

// Token cache
let accessToken = null;
let tokenExpiry = null;

// Statistics
const stats = {
  meetingsFound: 0,
  filesFound: 0,
  filesDownloaded: 0,
  filesSkipped: 0,
  filesFailed: 0,
  bytesDownloaded: 0,
  startTime: Date.now(),
};

/**
 * Get Server-to-Server OAuth access token
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 60000) {
    return accessToken;
  }

  console.log('Obtaining new access token...');

  const authString = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');

  return new Promise((resolve, reject) => {
    const postData = `grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`;

    const options = {
      hostname: 'zoom.us',
      path: '/oauth/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const tokens = JSON.parse(data);
            accessToken = tokens.access_token;
            tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            console.log(`Token obtained, expires in ${tokens.expires_in} seconds`);
            resolve(accessToken);
          } catch (e) {
            reject(new Error(`Failed to parse token response: ${data}`));
          }
        } else {
          reject(new Error(`OAuth error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Make authenticated API request to Zoom
 */
async function zoomApiRequest(endpoint, retries = CONFIG.retryAttempts) {
  const token = await getAccessToken();
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
          const retryAfter = parseInt(res.headers['retry-after'] || '5') * 1000;
          console.log(`Rate limited, waiting ${retryAfter}ms...`);
          setTimeout(() => {
            zoomApiRequest(endpoint, retries - 1).then(resolve).catch(reject);
          }, retryAfter);
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
 * Get all account recordings within a date range (max 30 days per request)
 */
async function getAccountRecordings(from, to) {
  const recordings = [];
  let nextPageToken = '';

  do {
    const endpoint = `/accounts/me/recordings?page_size=${CONFIG.pageSize}&from=${from}&to=${to}${nextPageToken ? `&next_page_token=${nextPageToken}` : ''}`;

    try {
      const response = await zoomApiRequest(endpoint);
      if (response.meetings) {
        recordings.push(...response.meetings);
      }
      nextPageToken = response.next_page_token || '';

      if (VERBOSE && response.total_records) {
        console.log(`  Fetched ${recordings.length} of ${response.total_records} recordings`);
      }
    } catch (error) {
      console.error(`Error fetching recordings: ${error.message}`);
      throw error;
    }
  } while (nextPageToken);

  return recordings;
}

/**
 * Split date range into 30-day chunks (Zoom API limit)
 */
function splitDateRange(startDate, endDate) {
  const chunks = [];
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current < end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + 30);

    if (chunkEnd > end) {
      chunkEnd.setTime(end.getTime());
    }

    chunks.push({
      from: current.toISOString().split('T')[0],
      to: chunkEnd.toISOString().split('T')[0],
    });

    current = new Date(chunkEnd);
    current.setDate(current.getDate() + 1);
  }

  return chunks;
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
 * Sanitize filename
 */
function sanitizeFilename(name) {
  return (name || 'untitled')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
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
 * Format duration
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Download recording file and upload to S3
 */
async function downloadAndUploadRecording(meeting, file, meetingDate) {
  const token = await getAccessToken();
  const dateFolder = meetingDate.split('T')[0];
  const sanitizedTopic = sanitizeFilename(meeting.topic);
  const hostEmail = meeting.host_email ? `_${meeting.host_email.split('@')[0]}` : '';
  const fileName = `${sanitizedTopic}${hostEmail}_${meeting.id}_${file.recording_type}.${file.file_extension || 'mp4'}`;
  const s3Key = `${dateFolder}/${fileName}`;

  // Check if already exists
  if (SKIP_EXISTING) {
    const exists = await fileExistsInS3(s3Key);
    if (exists) {
      if (VERBOSE) console.log(`    Skipping (exists): ${s3Key}`);
      stats.filesSkipped++;
      return;
    }
  }

  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would download: ${s3Key} (${formatBytes(file.file_size || 0)})`);
    return;
  }

  // Download URL with access token
  const downloadUrl = file.download_url + `?access_token=${token}`;

  return new Promise((resolve, reject) => {
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
            process.stdout.write(`\r    Downloading: ${formatBytes(downloadedBytes)}...`);
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
                'zoom-meeting-id': String(meeting.id),
                'zoom-topic': sanitizedTopic,
                'zoom-start-time': meetingDate,
                'zoom-host-email': meeting.host_email || '',
                'zoom-recording-type': file.recording_type || '',
              },
            }));

            stats.filesDownloaded++;
            stats.bytesDownloaded += buffer.length;
            console.log(`    Uploaded: ${s3Key} (${formatBytes(buffer.length)})`);
            resolve();
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
 * Main sync function
 */
async function syncRecordings() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('          ZOOM CLOUD RECORDINGS → S3 SYNC (Server-to-Server OAuth)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no downloads)' : 'LIVE'}`);
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`);
  console.log(`S3 Bucket: ${CONFIG.s3Bucket}`);
  console.log(`Skip Existing: ${SKIP_EXISTING}`);
  console.log('───────────────────────────────────────────────────────────────────');

  // Get access token (verifies credentials work)
  console.log('\nAuthenticating with Zoom...');
  try {
    await getAccessToken();
    console.log('Authentication successful!\n');
  } catch (error) {
    console.error(`Authentication failed: ${error.message}`);
    process.exit(1);
  }

  // Split date range into 30-day chunks (Zoom API requirement)
  const dateChunks = splitDateRange(START_DATE, END_DATE);
  console.log(`Processing ${dateChunks.length} date range chunks (30-day max per API call)\n`);

  // Process each date chunk
  for (let i = 0; i < dateChunks.length; i++) {
    const chunk = dateChunks[i];
    console.log(`\n[Chunk ${i + 1}/${dateChunks.length}] ${chunk.from} to ${chunk.to}`);
    console.log('───────────────────────────────────────────────────────────────────');

    try {
      const meetings = await getAccountRecordings(chunk.from, chunk.to);

      if (meetings.length === 0) {
        console.log('  No recordings found in this period');
        continue;
      }

      console.log(`  Found ${meetings.length} meetings with recordings`);

      for (const meeting of meetings) {
        stats.meetingsFound++;
        const meetingDate = meeting.start_time || new Date().toISOString();

        console.log(`\n  Meeting: ${meeting.topic || 'Untitled'}`);
        console.log(`  Host: ${meeting.host_email || 'Unknown'}`);
        console.log(`  Date: ${meetingDate.split('T')[0]}`);
        console.log(`  Files: ${meeting.recording_files?.length || 0}`);

        if (!meeting.recording_files || meeting.recording_files.length === 0) {
          continue;
        }

        for (const file of meeting.recording_files) {
          stats.filesFound++;

          if (!file.download_url) {
            if (VERBOSE) console.log(`    Skipping file without download URL: ${file.recording_type}`);
            continue;
          }

          try {
            await downloadAndUploadRecording(meeting, file, meetingDate);
          } catch (error) {
            console.error(`    ERROR: ${error.message}`);
            stats.filesFailed++;
          }
        }
      }
    } catch (error) {
      console.error(`  ERROR processing chunk: ${error.message}`);
    }
  }

  // Print summary
  const duration = Date.now() - stats.startTime;
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         SYNC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Duration: ${formatDuration(duration)}`);
  console.log(`Meetings Found: ${stats.meetingsFound}`);
  console.log(`Files Found: ${stats.filesFound}`);
  console.log(`Files Downloaded: ${stats.filesDownloaded}`);
  console.log(`Files Skipped (already in S3): ${stats.filesSkipped}`);
  console.log(`Files Failed: ${stats.filesFailed}`);
  console.log(`Total Downloaded: ${formatBytes(stats.bytesDownloaded)}`);
  console.log('═══════════════════════════════════════════════════════════════════');
}

// Run the sync
syncRecordings().catch(error => {
  console.error('\nFATAL ERROR:', error.message);
  process.exit(1);
});

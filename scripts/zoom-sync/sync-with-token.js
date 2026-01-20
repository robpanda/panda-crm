#!/usr/bin/env node

/**
 * Zoom Cloud Recordings to S3 Sync Script
 *
 * Downloads all Zoom cloud recordings and uploads them to S3.
 * Uses a direct server-to-server access token.
 *
 * Usage:
 *   ZOOM_TOKEN="your-token" node sync-with-token.js [options]
 *
 * Options:
 *   --start-date=YYYY-MM-DD  Start date for recordings (default: 2020-01-01)
 *   --end-date=YYYY-MM-DD    End date for recordings (default: today)
 *   --dry-run                List recordings without downloading
 *   --skip-existing          Skip files already in S3 (default: true)
 *   --user=email@domain.com  Sync only specific user's recordings
 *   --verbose                Show detailed progress
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
const SPECIFIC_USER = args['user'] || null;
const START_DATE = args['start-date'] || CONFIG.defaultStartDate;
const END_DATE = args['end-date'] || new Date().toISOString().split('T')[0];

// Get token from environment
const ACCESS_TOKEN = process.env.ZOOM_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('ERROR: ZOOM_TOKEN environment variable is required');
  console.error('Usage: ZOOM_TOKEN="your-token" node sync-with-token.js');
  process.exit(1);
}

// Initialize AWS S3 client
const s3Client = new S3Client({ region: CONFIG.s3Region });

// Statistics
const stats = {
  usersProcessed: 0,
  meetingsFound: 0,
  filesFound: 0,
  filesDownloaded: 0,
  filesSkipped: 0,
  filesFailed: 0,
  bytesDownloaded: 0,
  startTime: Date.now(),
};

/**
 * Make authenticated API request to Zoom
 */
async function zoomApiRequest(endpoint, retries = CONFIG.retryAttempts) {
  const path = endpoint.startsWith('/') ? `/v2${endpoint}` : `/v2/${endpoint}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.zoom.us',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
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
 * Get current authenticated user info
 */
async function getCurrentUser() {
  return await zoomApiRequest('/users/me');
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
      if (error.message.includes('403') || error.message.includes('401') || error.message.includes('4700')) {
        if (VERBOSE) console.log('Note: No admin scope - can only access current user\'s recordings');
        return null;
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
  const dateFolder = meetingDate.split('T')[0];
  const sanitizedTopic = sanitizeFilename(meeting.topic);
  const fileName = `${sanitizedTopic}_${meeting.id}_${file.recording_type}.${file.file_extension || 'mp4'}`;
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
  const downloadUrl = file.download_url + `?access_token=${ACCESS_TOKEN}`;

  return new Promise((resolve, reject) => {
    const download = (redirectUrl) => {
      const targetUrl = new URL(redirectUrl || downloadUrl);

      const options = {
        hostname: targetUrl.hostname,
        path: targetUrl.pathname + targetUrl.search,
        method: 'GET',
        headers: redirectUrl ? {} : { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
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
  console.log('          ZOOM CLOUD RECORDINGS → S3 SYNC');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no downloads)' : 'LIVE'}`);
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`);
  console.log(`S3 Bucket: ${CONFIG.s3Bucket}`);
  console.log(`Skip Existing: ${SKIP_EXISTING}`);
  if (SPECIFIC_USER) console.log(`User Filter: ${SPECIFIC_USER}`);
  console.log('───────────────────────────────────────────────────────────────────');

  // Verify token works
  console.log('\nVerifying authentication...');
  let currentUser;
  try {
    currentUser = await getCurrentUser();
    console.log(`Authenticated as: ${currentUser.email}\n`);
  } catch (error) {
    console.error(`Authentication failed: ${error.message}`);
    process.exit(1);
  }

  // Try to get all users (requires admin scope)
  let users = [];
  console.log('Fetching users...');

  const allUsers = await getAllUsers();

  if (allUsers && allUsers.length > 0) {
    console.log(`Found ${allUsers.length} users in account (admin scope available)`);

    if (SPECIFIC_USER && SPECIFIC_USER !== 'me') {
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
    console.log('Admin scope not available - syncing current user only');
    users = [{ id: currentUser.id, email: currentUser.email }];
  }

  console.log(`\nWill sync recordings for ${users.length} user(s)\n`);

  // Process each user
  for (const user of users) {
    stats.usersProcessed++;
    console.log(`\n[${stats.usersProcessed}/${users.length}] Processing: ${user.email}`);

    try {
      const meetings = await getUserRecordings(user.id, START_DATE, END_DATE);

      if (meetings.length === 0) {
        if (VERBOSE) console.log('  No recordings found');
        continue;
      }

      console.log(`  Found ${meetings.length} meetings with recordings`);

      for (const meeting of meetings) {
        stats.meetingsFound++;
        const meetingDate = meeting.start_time || new Date().toISOString();

        console.log(`\n  Meeting: ${meeting.topic || 'Untitled'}`);
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

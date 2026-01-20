/**
 * Zoom Webhook Handler for Recording Events
 *
 * This Lambda function handles Zoom webhook events for recording.completed
 * and automatically downloads recordings to S3.
 *
 * Webhook Events Handled:
 * - recording.completed: When a cloud recording finishes processing
 *
 * Setup:
 * 1. Create a Zoom Webhook-Only App in the Marketplace
 * 2. Add the recording.completed event subscription
 * 3. Set the Event Notification Endpoint URL to your API Gateway
 * 4. Copy the Secret Token for webhook validation
 * 5. Deploy this Lambda and configure the environment variables
 */

const crypto = require('crypto');
const https = require('https');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Configuration
const CONFIG = {
  s3Bucket: process.env.S3_BUCKET || 'panda-zoom-recordings',
  s3Region: process.env.AWS_REGION || 'us-east-2',
  webhookSecretName: process.env.WEBHOOK_SECRET_NAME || 'zoom-webhook-secret',
  appCredentialsSecretName: process.env.APP_CREDENTIALS_SECRET_NAME || 'zoom-app-credentials',
};

const s3Client = new S3Client({ region: CONFIG.s3Region });
const secretsClient = new SecretsManagerClient({ region: CONFIG.s3Region });

// Cache for secrets
let webhookSecret = null;
let appCredentials = null;

/**
 * Get webhook secret token from Secrets Manager
 */
async function getWebhookSecret() {
  if (webhookSecret) return webhookSecret;

  try {
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: CONFIG.webhookSecretName,
    }));
    const secret = JSON.parse(response.SecretString);
    webhookSecret = secret.secretToken;
    return webhookSecret;
  } catch (error) {
    console.error('Failed to get webhook secret:', error.message);
    throw error;
  }
}

/**
 * Get app credentials from Secrets Manager
 */
async function getAppCredentials() {
  if (appCredentials) return appCredentials;

  try {
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: CONFIG.appCredentialsSecretName,
    }));
    appCredentials = JSON.parse(response.SecretString);
    return appCredentials;
  } catch (error) {
    console.error('Failed to get app credentials:', error.message);
    throw error;
  }
}

/**
 * Validate Zoom webhook signature
 */
async function validateWebhookSignature(payload, signature, timestamp) {
  const secret = await getWebhookSecret();
  const message = `v0:${timestamp}:${payload}`;
  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Handle Zoom URL validation (endpoint verification)
 */
async function handleUrlValidation(payload) {
  const secret = await getWebhookSecret();
  const plainToken = payload.payload.plainToken;

  const encryptedToken = crypto
    .createHmac('sha256', secret)
    .update(plainToken)
    .digest('hex');

  return {
    plainToken,
    encryptedToken,
  };
}

/**
 * Sanitize filename for S3
 */
function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200);
}

/**
 * Download file from URL
 */
function downloadFile(url, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    // Add access token to download URL
    const downloadUrl = token ? `${url}?access_token=${token}` : url;
    const finalUrl = new URL(downloadUrl);

    const options = {
      hostname: finalUrl.hostname,
      path: finalUrl.pathname + finalUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Panda-Zoom-Sync/1.0',
      },
    };

    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        downloadFile(redirectUrl, null).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed with status ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.end();
  });
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
 * Upload file to S3
 */
async function uploadToS3(key, body, contentType, metadata) {
  await s3Client.send(new PutObjectCommand({
    Bucket: CONFIG.s3Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  }));
}

/**
 * Get content type for file extension
 */
function getContentType(fileType) {
  const types = {
    MP4: 'video/mp4',
    M4A: 'audio/mp4',
    VTT: 'text/vtt',
    TXT: 'text/plain',
    JSON: 'application/json',
    CHAT: 'text/plain',
    CC: 'text/vtt',
    TRANSCRIPT: 'application/json',
  };
  return types[fileType?.toUpperCase()] || 'application/octet-stream';
}

/**
 * Process a single recording file
 */
async function processRecordingFile(meeting, file, downloadToken) {
  const meetingDate = meeting.start_time?.substring(0, 10) || new Date().toISOString().substring(0, 10);
  const topic = sanitizeFilename(meeting.topic || 'Untitled');
  const meetingId = meeting.uuid || meeting.id;
  const fileType = file.file_type || file.recording_type || 'unknown';
  const extension = file.file_extension || fileType;

  const s3Key = `${meetingDate}/${topic}_${meetingId}_${file.recording_type}.${extension}`;

  // Check if already exists
  if (await fileExistsInS3(s3Key)) {
    console.log(`Skipping (exists): ${s3Key}`);
    return { skipped: true, key: s3Key };
  }

  // Download the file
  console.log(`Downloading: ${s3Key} (${formatBytes(file.file_size || 0)})`);
  const downloadUrl = file.download_url;

  if (!downloadUrl) {
    console.log(`No download URL for file: ${file.recording_type}`);
    return { error: 'No download URL' };
  }

  try {
    const fileData = await downloadFile(downloadUrl, downloadToken);

    // Upload to S3
    const metadata = {
      'zoom-meeting-id': String(meeting.id || ''),
      'zoom-meeting-uuid': String(meeting.uuid || ''),
      'zoom-topic': String(meeting.topic || '').substring(0, 1024),
      'zoom-start-time': String(meeting.start_time || ''),
      'zoom-host-email': String(meeting.host_email || ''),
      'zoom-recording-type': String(file.recording_type || ''),
      'zoom-file-type': String(fileType),
    };

    await uploadToS3(s3Key, fileData, getContentType(fileType), metadata);
    console.log(`Uploaded: ${s3Key}`);

    return { uploaded: true, key: s3Key, size: fileData.length };
  } catch (error) {
    console.error(`Failed to process ${s3Key}:`, error.message);
    return { error: error.message };
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Handle recording.completed event
 */
async function handleRecordingCompleted(payload) {
  const meeting = payload.object;
  const recordingFiles = meeting.recording_files || [];
  const downloadToken = payload.download_token;

  console.log(`Processing recording: ${meeting.topic || 'Untitled'}`);
  console.log(`Host: ${meeting.host_email}`);
  console.log(`Files: ${recordingFiles.length}`);

  const results = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
    totalBytes: 0,
  };

  for (const file of recordingFiles) {
    try {
      const result = await processRecordingFile(meeting, file, downloadToken);

      if (result.uploaded) {
        results.uploaded++;
        results.totalBytes += result.size || 0;
      } else if (result.skipped) {
        results.skipped++;
      } else if (result.error) {
        results.failed++;
      }
    } catch (error) {
      console.error(`Error processing file:`, error);
      results.failed++;
    }
  }

  console.log(`Results: ${results.uploaded} uploaded, ${results.skipped} skipped, ${results.failed} failed`);
  console.log(`Total uploaded: ${formatBytes(results.totalBytes)}`);

  return results;
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    // Parse body
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const headers = event.headers || {};

    // Get signature headers (case-insensitive)
    const signature = headers['x-zm-signature'] || headers['X-Zm-Signature'];
    const timestamp = headers['x-zm-request-timestamp'] || headers['X-Zm-Request-Timestamp'];

    // Validate signature if present
    if (signature && timestamp) {
      const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
      const isValid = await validateWebhookSignature(rawBody, signature, timestamp);

      if (!isValid) {
        console.error('Invalid webhook signature');
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Invalid signature' }),
        };
      }
    }

    // Handle URL validation (endpoint verification)
    if (body.event === 'endpoint.url_validation') {
      console.log('Handling URL validation');
      const response = await handleUrlValidation(body);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      };
    }

    // Handle recording.completed event
    if (body.event === 'recording.completed') {
      console.log('Handling recording.completed event');
      const results = await handleRecordingCompleted(body.payload);
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Recording processed',
          results,
        }),
      };
    }

    // Unknown event type
    console.log(`Ignoring event type: ${body.event}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event ignored' }),
    };

  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// For local testing
if (require.main === module) {
  const testEvent = {
    body: JSON.stringify({
      event: 'recording.completed',
      payload: {
        object: {
          id: '123456789',
          uuid: 'abc123',
          topic: 'Test Meeting',
          host_email: 'test@example.com',
          start_time: '2025-01-15T10:00:00Z',
          recording_files: [
            {
              recording_type: 'shared_screen_with_speaker_view',
              file_type: 'MP4',
              file_extension: 'MP4',
              file_size: 1024000,
              download_url: 'https://example.com/recording.mp4',
            },
          ],
        },
        download_token: 'test_token',
      },
    }),
  };

  exports.handler(testEvent).then(console.log).catch(console.error);
}

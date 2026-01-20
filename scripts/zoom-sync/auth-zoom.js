#!/usr/bin/env node

/**
 * Zoom OAuth Authorization Helper
 *
 * For General App OAuth 2.0 flow:
 * 1. Run this script to get the authorization URL
 * 2. Open the URL in browser and authorize
 * 3. Copy the authorization code from the redirect
 * 4. Run with --code=XXXX to exchange for tokens
 * 5. Tokens are saved to AWS Secrets Manager
 *
 * Usage:
 *   node auth-zoom.js                    # Get authorization URL
 *   node auth-zoom.js --code=XXXXXX      # Exchange code for tokens
 *   node auth-zoom.js --refresh          # Refresh existing token
 *   node auth-zoom.js --status           # Check token status
 */

const https = require('https');
const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand, CreateSecretCommand } = require('@aws-sdk/client-secrets-manager');

// Configuration - Panda Zoom General App
const CONFIG = {
  clientId: process.env.ZOOM_CLIENT_ID || '5TQiUr79SIW1XNYpx9mBCQ',
  clientSecret: process.env.ZOOM_CLIENT_SECRET || 'mKtP56jMrc4jPJF3YpJzu5jE3ezU6If6',
  redirectUri: 'https://support.pandaadmin.com/zoom-callback.html',
  secretName: 'zoom-oauth-tokens',
  region: 'us-east-2',
};

const secretsClient = new SecretsManagerClient({ region: CONFIG.region });

// Parse arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    acc[key] = value || true;
  }
  return acc;
}, {});

/**
 * Generate the authorization URL
 */
function getAuthorizationUrl() {
  // Scopes for General App - each user must authorize individually
  // Note: General Apps can only access the authenticated user's recordings
  const scopes = [
    'cloud_recording:read:list_user_recordings',
    'cloud_recording:read:list_recording_files',
    'cloud_recording:read:recording',
    'user:read:user',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    scope: scopes,
  });

  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code) {
  const authString = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');

  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: CONFIG.redirectUri,
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
            reject(new Error(`Token exchange failed: ${JSON.stringify(response)}`));
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
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(refreshToken) {
  const authString = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');

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
 * Save tokens to AWS Secrets Manager
 */
async function saveTokens(tokens) {
  const secretValue = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    tokenType: tokens.token_type,
    scope: tokens.scope,
    savedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };

  try {
    // Try to update existing secret
    await secretsClient.send(new UpdateSecretCommand({
      SecretId: CONFIG.secretName,
      SecretString: JSON.stringify(secretValue),
    }));
    console.log(`✓ Tokens updated in secret: ${CONFIG.secretName}`);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      // Create new secret
      await secretsClient.send(new CreateSecretCommand({
        Name: CONFIG.secretName,
        SecretString: JSON.stringify(secretValue),
        Description: 'Zoom OAuth tokens for recording sync',
      }));
      console.log(`✓ Tokens saved to new secret: ${CONFIG.secretName}`);
    } else {
      throw error;
    }
  }

  return secretValue;
}

/**
 * Get tokens from AWS Secrets Manager
 */
async function getStoredTokens() {
  try {
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: CONFIG.secretName,
    }));
    return JSON.parse(response.SecretString);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return null;
    }
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('          ZOOM OAUTH AUTHORIZATION HELPER');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check if client credentials are configured
  if (CONFIG.clientId === 'YOUR_CLIENT_ID') {
    console.log('⚠️  First, create a Zoom General App and update this script:\n');
    console.log('1. Go to https://marketplace.zoom.us/');
    console.log('2. Click Develop → Build App → General App');
    console.log('3. Name: "Panda Recording Sync"');
    console.log('4. Add Scopes:');
    console.log('   - cloud_recording:read:list_user_recordings:admin');
    console.log('   - user:read:list_users:admin');
    console.log('   - user:read:user:admin');
    console.log('5. Set Redirect URL to: https://zoom.us');
    console.log('6. Copy Client ID and Client Secret');
    console.log('\nThen either:');
    console.log('  A. Edit CONFIG in this file, or');
    console.log('  B. Set environment variables:');
    console.log('     export ZOOM_CLIENT_ID="your_client_id"');
    console.log('     export ZOOM_CLIENT_SECRET="your_client_secret"');
    return;
  }

  // Handle --status
  if (args.status) {
    console.log('Checking token status...\n');
    const tokens = await getStoredTokens();
    if (!tokens) {
      console.log('❌ No tokens found. Run authorization first.');
      return;
    }

    const expiresAt = new Date(tokens.expiresAt);
    const isExpired = expiresAt < new Date();

    console.log(`Access Token: ${tokens.accessToken.substring(0, 20)}...`);
    console.log(`Refresh Token: ${tokens.refreshToken.substring(0, 20)}...`);
    console.log(`Saved At: ${tokens.savedAt}`);
    console.log(`Expires At: ${tokens.expiresAt}`);
    console.log(`Status: ${isExpired ? '❌ EXPIRED' : '✓ Valid'}`);
    console.log(`Scope: ${tokens.scope}`);

    if (isExpired) {
      console.log('\nRun with --refresh to get a new access token.');
    }
    return;
  }

  // Handle --refresh
  if (args.refresh) {
    console.log('Refreshing access token...\n');
    const stored = await getStoredTokens();
    if (!stored || !stored.refreshToken) {
      console.log('❌ No refresh token found. Run authorization first.');
      return;
    }

    const tokens = await refreshAccessToken(stored.refreshToken);
    await saveTokens(tokens);
    console.log('\n✓ Access token refreshed successfully!');
    console.log(`  Expires at: ${new Date(Date.now() + tokens.expires_in * 1000).toISOString()}`);
    return;
  }

  // Handle --code=XXXX
  if (args.code) {
    console.log('Exchanging authorization code for tokens...\n');
    const tokens = await exchangeCodeForTokens(args.code);
    await saveTokens(tokens);
    console.log('\n✓ Authorization successful!');
    console.log(`  Access token expires in ${tokens.expires_in} seconds`);
    console.log(`  Refresh token saved for future use`);
    console.log('\nYou can now run the sync script:');
    console.log('  node sync-zoom-recordings.js --dry-run --verbose');
    return;
  }

  // Default: Show authorization URL
  console.log('Step 1: Open this URL in your browser:\n');
  console.log(getAuthorizationUrl());
  console.log('\n');
  console.log('Step 2: Log in and authorize the app');
  console.log('\n');
  console.log('Step 3: After redirect, copy the "code" from the URL:');
  console.log('        https://zoom.us/?code=XXXXXX');
  console.log('\n');
  console.log('Step 4: Run this command with your code:');
  console.log('        node auth-zoom.js --code=XXXXXX');
}

main().catch(error => {
  console.error('\n❌ ERROR:', error.message);
  process.exit(1);
});

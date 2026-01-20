/**
 * Debug script to investigate CompanyCam API response structure
 * Goal: Find the correct downloadable image URL field
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });
const COMPANYCAM_API_URL = 'https://api.companycam.com/v2';

// Test photo from Timothy Drennan project
const TEST_PHOTO_ID = '2863315418';

async function getCompanyCamToken() {
  const command = new GetSecretValueCommand({ SecretId: 'companycam/api-token' });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString);
  return secret.token || secret.api_token || secret.apiToken;
}

async function debugPhotoApi() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('CompanyCam API Response Investigation');
  console.log('═══════════════════════════════════════════════════════════');

  const { default: fetch } = await import('node-fetch');

  try {
    // Get token
    const token = await getCompanyCamToken();
    console.log(`Token: ${token.substring(0, 10)}...`);
    console.log('');

    // Fetch photo details
    console.log(`Fetching photo ${TEST_PHOTO_ID} from CompanyCam API...`);
    console.log(`URL: ${COMPANYCAM_API_URL}/photos/${TEST_PHOTO_ID}`);
    console.log('');

    const response = await fetch(`${COMPANYCAM_API_URL}/photos/${TEST_PHOTO_ID}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log(`Response Status: ${response.status} ${response.statusText}`);
    console.log('');

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error Response:', errorText);
      return;
    }

    const photo = await response.json();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('FULL API RESPONSE:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(JSON.stringify(photo, null, 2));
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('KEY URL FIELDS:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('photo.photo_url:', photo.photo_url);
    console.log('photo.thumbnail_url:', photo.thumbnail_url);
    console.log('photo.uris:', JSON.stringify(photo.uris, null, 2));
    console.log('photo.urls:', JSON.stringify(photo.urls, null, 2));
    console.log('photo.download_url:', photo.download_url);
    console.log('photo.original_url:', photo.original_url);
    console.log('photo.uri:', photo.uri);
    console.log('photo.url:', photo.url);

    // Check for nested structures
    if (photo.image) {
      console.log('photo.image:', JSON.stringify(photo.image, null, 2));
    }
    if (photo.file) {
      console.log('photo.file:', JSON.stringify(photo.file, null, 2));
    }

    // List all keys
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ALL TOP-LEVEL KEYS:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(Object.keys(photo).join(', '));

    // Test downloading from different URLs to see which one returns actual image data
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TESTING URL DOWNLOADS:');
    console.log('═══════════════════════════════════════════════════════════');

    const urlsToTest = [];

    if (photo.photo_url) urlsToTest.push({ name: 'photo_url', url: photo.photo_url });
    if (photo.uris?.original) urlsToTest.push({ name: 'uris.original', url: photo.uris.original });
    if (photo.uris?.thumbnail) urlsToTest.push({ name: 'uris.thumbnail', url: photo.uris.thumbnail });
    if (photo.uris?.large) urlsToTest.push({ name: 'uris.large', url: photo.uris.large });
    if (photo.uris?.medium) urlsToTest.push({ name: 'uris.medium', url: photo.uris.medium });
    if (photo.uris?.small) urlsToTest.push({ name: 'uris.small', url: photo.uris.small });
    if (photo.download_url) urlsToTest.push({ name: 'download_url', url: photo.download_url });
    if (photo.original_url) urlsToTest.push({ name: 'original_url', url: photo.original_url });

    for (const { name, url } of urlsToTest) {
      console.log(`\nTesting ${name}: ${url}`);
      try {
        const testResponse = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` },
          redirect: 'follow'
        });
        const contentType = testResponse.headers.get('content-type');
        const contentLength = testResponse.headers.get('content-length');
        console.log(`  Status: ${testResponse.status}`);
        console.log(`  Content-Type: ${contentType}`);
        console.log(`  Content-Length: ${contentLength}`);
        console.log(`  Final URL: ${testResponse.url}`);

        // If it's HTML, show a snippet
        if (contentType?.includes('text/html')) {
          const body = await testResponse.text();
          console.log(`  Body snippet: ${body.substring(0, 200)}...`);
        } else if (contentType?.includes('image')) {
          console.log('  ✓ THIS IS AN ACTUAL IMAGE!');
        }
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

debugPhotoApi();

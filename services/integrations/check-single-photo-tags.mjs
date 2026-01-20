/**
 * Check a single photo from CompanyCam API to verify tag structure
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });
const COMPANYCAM_API_URL = 'https://api.companycam.com/v2';

// Sample photo ID from a project
const TEST_PHOTO_ID = '2863315418';

async function getCompanyCamToken() {
  const command = new GetSecretValueCommand({ SecretId: 'companycam/api-token' });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString);
  return secret.token || secret.api_token || secret.apiToken;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Checking Single Photo for Tags');
  console.log('═══════════════════════════════════════════════════════════');

  const { default: fetch } = await import('node-fetch');

  try {
    const token = await getCompanyCamToken();
    console.log(`Token: ${token.substring(0, 10)}...`);
    console.log('');

    // Fetch photo details
    console.log(`Fetching photo ${TEST_PHOTO_ID}...`);
    const response = await fetch(`${COMPANYCAM_API_URL}/photos/${TEST_PHOTO_ID}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log(`Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error Response:', errorText);
      return;
    }

    const photo = await response.json();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('PHOTO TAGS FIELD:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('photo.tags:', JSON.stringify(photo.tags, null, 2));
    console.log('');
    console.log('Type of photo.tags:', typeof photo.tags);
    console.log('Is Array:', Array.isArray(photo.tags));

    // List all keys on the photo object
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ALL TOP-LEVEL KEYS:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(Object.keys(photo).join(', '));

    // Also check if there's a tags endpoint for the photo
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('CHECKING /photos/:id/tags ENDPOINT:');
    console.log('═══════════════════════════════════════════════════════════');

    const tagsResponse = await fetch(`${COMPANYCAM_API_URL}/photos/${TEST_PHOTO_ID}/tags`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log(`Response Status: ${tagsResponse.status} ${tagsResponse.statusText}`);

    if (tagsResponse.ok) {
      const tagsData = await tagsResponse.json();
      console.log('Tags endpoint response:', JSON.stringify(tagsData, null, 2));
    } else {
      const errorText = await tagsResponse.text();
      console.log('Tags endpoint error:', errorText);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main();

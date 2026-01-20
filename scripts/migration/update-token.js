import fs from 'fs';

// Read current .env
const envContent = fs.readFileSync('.env', 'utf8');

// Get new access token from command line argument or environment
const newToken = process.argv[2] || process.env.NEW_SF_TOKEN;

if (!newToken) {
  console.error('Usage: node update-token.js <new-token>');
  console.error('  or set NEW_SF_TOKEN environment variable');
  process.exit(1);
}

// Check if SF_ACCESS_TOKEN already exists
if (envContent.includes('SF_ACCESS_TOKEN=')) {
  // Replace existing
  const updated = envContent.replace(/SF_ACCESS_TOKEN=.*/g, 'SF_ACCESS_TOKEN=' + newToken);
  fs.writeFileSync('.env', updated);
} else {
  // Add new line
  fs.writeFileSync('.env', envContent + '\nSF_ACCESS_TOKEN=' + newToken + '\n');
}

console.log('Updated SF_ACCESS_TOKEN in .env');

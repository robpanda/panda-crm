# Zoom Cloud Recordings → S3 Sync

Downloads all Zoom cloud recordings and uploads them to AWS S3 bucket `zoom-recordings-companyname`.

## Prerequisites

### 1. Create Zoom Server-to-Server OAuth App

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Click **Develop** → **Build App**
3. Choose **Server-to-Server OAuth**
4. Name it "Panda S3 Recording Sync"
5. Note your credentials:
   - Account ID
   - Client ID
   - Client Secret

### 2. Add Required Scopes

In your app's **Scopes** tab, add:
- `cloud_recording:read:list_user_recordings:admin`
- `user:read:user:admin`
- `user:read:list_users:admin`

### 3. Activate the App

Click **Activate** to enable the app.

### 4. Store Credentials

**Option A: Environment Variables**
```bash
export ZOOM_ACCOUNT_ID="your_account_id"
export ZOOM_CLIENT_ID="your_client_id"
export ZOOM_CLIENT_SECRET="your_client_secret"
```

**Option B: AWS Secrets Manager**
```bash
aws secretsmanager create-secret \
  --name zoom-api-credentials \
  --region us-east-2 \
  --secret-string '{
    "accountId": "your_account_id",
    "clientId": "your_client_id",
    "clientSecret": "your_client_secret"
  }'
```

## Installation

```bash
cd /Users/robwinters/panda-crm/scripts/zoom-sync
npm install
```

## Usage

### Dry Run (Preview Only)
```bash
npm run sync:dry-run
# or
node sync-zoom-recordings.js --dry-run --verbose
```

### Full Sync
```bash
npm run sync
# or
node sync-zoom-recordings.js
```

### Sync Specific Date Range
```bash
# Sync all of 2024
node sync-zoom-recordings.js --start-date=2024-01-01 --end-date=2024-12-31

# Sync 2025 onwards
node sync-zoom-recordings.js --start-date=2025-01-01

# Sync specific user only
node sync-zoom-recordings.js --user=john@company.com
```

### Options

| Option | Description |
|--------|-------------|
| `--start-date=YYYY-MM-DD` | Start date (default: 2020-01-01) |
| `--end-date=YYYY-MM-DD` | End date (default: today) |
| `--dry-run` | List recordings without downloading |
| `--skip-existing` | Skip files already in S3 (default: true) |
| `--user=email` | Sync only specific user's recordings |
| `--verbose` | Show detailed progress |

## S3 Structure

Recordings are organized by date:
```
s3://zoom-recordings-companyname/
├── 2024-01-15/
│   ├── Team_Meeting_12345678_shared_screen_with_speaker_view.mp4
│   └── Team_Meeting_12345678_audio_only.m4a
├── 2024-01-16/
│   └── Sales_Call_87654321_shared_screen_with_speaker_view.mp4
└── ...
```

## File Types Downloaded

- `mp4` - Video recordings
- `m4a` - Audio only
- `txt` - Chat transcripts
- `vtt` - Closed captions
- `json` - Transcript data

## Metadata

Each S3 object includes metadata:
- `zoom-meeting-id` - Original meeting ID
- `zoom-topic` - Meeting topic/name
- `zoom-start-time` - When the meeting started
- `zoom-host-email` - Host's email
- `zoom-recording-type` - Type of recording file

## Troubleshooting

### 401 Unauthorized
- Check credentials are correct
- Verify app is activated in Zoom marketplace
- Ensure scopes are properly assigned

### Rate Limiting (429)
- Script automatically handles rate limits with retry
- If persistent, add delays between users

### Missing Recordings
- Some users may not have recording permissions
- Check date range includes the recording dates
- Verify the meeting was cloud-recorded (not local)

## Running as AWS Lambda

For ongoing sync, deploy as Lambda function:

```bash
# See /Users/robwinters/panda-crm/scripts/lambda/zoom-sync-lambda.js
```

Schedule with EventBridge to run daily.

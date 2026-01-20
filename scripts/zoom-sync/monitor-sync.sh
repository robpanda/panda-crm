#!/bin/bash
# Monitor Zoom sync progress - logs status every hour

LOG_FILE="/tmp/zoom-sync-monitor.log"
SYNC_LOG="/tmp/zoom-sync.log"

echo "=== Zoom Sync Monitor Started: $(date) ===" >> $LOG_FILE

while true; do
    # Check if sync process is still running
    SYNC_PID=$(ps aux | grep "sync-s2s-oauth" | grep -v grep | awk '{print $2}')

    if [ -z "$SYNC_PID" ]; then
        echo "" >> $LOG_FILE
        echo "========================================" >> $LOG_FILE
        echo "SYNC COMPLETE: $(date)" >> $LOG_FILE
        echo "========================================" >> $LOG_FILE

        # Final stats
        S3_STATS=$(aws s3 ls s3://panda-zoom-recordings/ --recursive --summarize 2>/dev/null | tail -3)
        echo "Final S3 Stats:" >> $LOG_FILE
        echo "$S3_STATS" >> $LOG_FILE

        # Check for errors
        ERROR_COUNT=$(grep -c "ERROR" $SYNC_LOG 2>/dev/null || echo "0")
        echo "Total Errors: $ERROR_COUNT" >> $LOG_FILE

        echo "" >> $LOG_FILE
        echo "Monitor script exiting." >> $LOG_FILE
        exit 0
    fi

    # Get current stats
    echo "" >> $LOG_FILE
    echo "--- Status Update: $(date) ---" >> $LOG_FILE

    # S3 bucket stats
    S3_STATS=$(aws s3 ls s3://panda-zoom-recordings/ --recursive --summarize 2>/dev/null | tail -3)
    echo "$S3_STATS" >> $LOG_FILE

    # Current activity (last meeting being processed)
    LAST_MEETING=$(grep "Meeting:" $SYNC_LOG 2>/dev/null | tail -1)
    echo "Last Meeting: $LAST_MEETING" >> $LOG_FILE

    # Current chunk progress
    CHUNK_PROGRESS=$(grep "Processing date range chunk" $SYNC_LOG 2>/dev/null | tail -1)
    echo "$CHUNK_PROGRESS" >> $LOG_FILE

    # Recent uploads count
    RECENT_UPLOADS=$(grep "Uploaded:" $SYNC_LOG 2>/dev/null | wc -l | tr -d ' ')
    echo "Total Uploads: $RECENT_UPLOADS" >> $LOG_FILE

    # Sleep for 1 hour
    sleep 3600
done

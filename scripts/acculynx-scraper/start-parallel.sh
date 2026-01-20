#!/bin/bash
# Start multiple parallel workers for AccuLynx message recovery

NUM_WORKERS=${1:-4}
USERNAME="robwinters@pandaexteriors.com"
PASSWORD='@rWSf@F38kv@.w4'

cd /Users/robwinters/panda-crm/scripts/acculynx-scraper

echo "Starting $NUM_WORKERS parallel workers..."
echo ""

for i in $(seq 1 $NUM_WORKERS); do
  echo "Starting worker $i..."
  WORKER=$i TOTAL_WORKERS=$NUM_WORKERS \
  ACCULYNX_USERNAME="$USERNAME" ACCULYNX_PASSWORD="$PASSWORD" \
  nohup node recover-parallel.js > /tmp/acculynx-worker-$i.log 2>&1 &
  echo "Worker $i started (PID: $!)"
  sleep 3  # Stagger startups to avoid login conflicts
done

echo ""
echo "All workers started!"
echo ""
echo "Monitor progress with:"
echo "  tail -f /tmp/acculynx-worker-*.log"
echo ""
echo "Check combined output with:"
echo "  cat output/recovered-messages-worker*.jsonl | wc -l"
echo ""
echo "Kill all workers with:"
echo "  pkill -f recover-parallel.js"

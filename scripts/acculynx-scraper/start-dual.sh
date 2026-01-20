#!/bin/bash
# Start dual-account parallel workers for AccuLynx message recovery
# Each worker uses a different AccuLynx account to avoid session conflicts

cd /Users/robwinters/panda-crm/scripts/acculynx-scraper

echo "═══════════════════════════════════════════════════════════"
echo " AccuLynx Dual-Account Message Recovery"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Starting 2 parallel workers with separate accounts..."
echo ""

# Start Worker 1 with account robwinters@pandaexteriors.com
echo "Starting Worker 1 (robwinters@pandaexteriors.com)..."
WORKER=1 nohup node recover-dual.js > /tmp/acculynx-worker-1.log 2>&1 &
WORKER1_PID=$!
echo "Worker 1 started (PID: $WORKER1_PID)"

# Wait 10 seconds to stagger logins
echo "Waiting 10 seconds before starting worker 2..."
sleep 10

# Start Worker 2 with account rob@thepodops.com
echo "Starting Worker 2 (rob@thepodops.com)..."
WORKER=2 nohup node recover-dual.js > /tmp/acculynx-worker-2.log 2>&1 &
WORKER2_PID=$!
echo "Worker 2 started (PID: $WORKER2_PID)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Both workers started!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Monitor progress with:"
echo "  tail -f /tmp/acculynx-worker-1.log"
echo "  tail -f /tmp/acculynx-worker-2.log"
echo ""
echo "Check combined output:"
echo "  cat output/recovered-messages-worker*.jsonl | wc -l"
echo ""
echo "Kill all workers:"
echo "  pkill -f recover-dual.js"
echo ""

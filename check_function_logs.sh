#!/bin/bash

echo "🔍 Checking Cloud Function logs for today's executions..."
echo ""
echo "This will show logs from the Cloud Functions that ran at 10 AM, 1 PM, 4 PM today"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "⚠️  gcloud CLI not installed"
    echo ""
    echo "To view logs, go to:"
    echo "https://console.cloud.google.com/logs/query?project=hybridofficetracker"
    echo ""
    echo "Then filter by:"
    echo "  resource.type=\"cloud_function\""
    echo "  resource.labels.function_name=\"send10AMReminder\""
    echo "  OR resource.labels.function_name=\"send1PMReminder\""
    echo "  OR resource.labels.function_name=\"send4PMReminder\""
    echo ""
    echo "Look for errors or messages like:"
    echo "  - 'Found X users to notify'"
    echo "  - 'Sent X notifications'"
    echo "  - Any error messages"
    exit 0
fi

# If gcloud is installed, try to get logs
echo "Fetching logs for send10AMReminder..."
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=send10AMReminder AND timestamp>=\"2026-01-18T00:00:00Z\"" \
  --limit 50 \
  --format json \
  --project hybridofficetracker

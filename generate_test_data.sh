#!/bin/bash

# Test script to generate sample analytics data
echo "🚀 Generating sample analytics data..."

FIREBASE_URL="https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"

# Generate some page views
echo "📊 Adding page views..."
for i in {1..5}; do
    curl -X POST "${FIREBASE_URL}/page_views.json" \
        -H "Content-Type: application/json" \
        -d "{
            \"page\": \"/\",
            \"title\": \"OfficeTrack - Hybrid Work Tracker\",
            \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\",
            \"userAgent\": \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Test Browser $i\",
            \"referrer\": \"direct\",
            \"viewport\": \"1920x1080\",
            \"language\": \"en-US\"
        }" > /dev/null 2>&1
    sleep 1
done

# Generate some downloads
echo "📱 Adding downloads..."
platforms=("iOS" "Android")
locations=("hero_section" "download_section")

for i in {1..8}; do
    platform=${platforms[$((RANDOM % 2))]}
    location=${locations[$((RANDOM % 2))]}
    
    curl -X POST "${FIREBASE_URL}/downloads.json" \
        -H "Content-Type: application/json" \
        -d "{
            \"platform\": \"$platform\",
            \"location\": \"$location\",
            \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\",
            \"userAgent\": \"Mozilla/5.0 Test User $i\",
            \"referrer\": \"direct\"
        }" > /dev/null 2>&1
    sleep 1
done

# Generate some user engagement
echo "👥 Adding user engagement data..."
for i in {1..6}; do
    engaged=$((RANDOM % 2))
    timeOnPage=$((RANDOM % 120 + 30))  # 30-150 seconds
    scrollDepth=$((RANDOM % 100 + 1))  # 1-100%
    
    curl -X POST "${FIREBASE_URL}/user_engagement.json" \
        -H "Content-Type: application/json" \
        -d "{
            \"page\": \"/\",
            \"timeOnPage\": $timeOnPage,
            \"maxScrollDepth\": $scrollDepth,
            \"engaged\": $([ $engaged -eq 1 ] && echo "true" || echo "false"),
            \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\"
        }" > /dev/null 2>&1
    sleep 1
done

echo "✅ Sample data generated!"
echo "🌐 Check your analytics dashboard: https://hybridofficetracker.web.app/analytics.html"
echo "📊 Firebase Console: https://console.firebase.google.com/project/hybridofficetracker/database"
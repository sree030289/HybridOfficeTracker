# Firebase Cloud Messaging Setup Guide

This guide will help you deploy Firebase Cloud Functions for sending scheduled push notifications.

## Prerequisites

1. Firebase project already created: `hybridofficetracker`
2. Firebase CLI installed
3. Service account key file: `serviceAccountKey.json` (already present)

## Step 1: Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
```

## Step 2: Login to Firebase

```bash
firebase login
```

## Step 3: Initialize Firebase in your project

Navigate to your project directory:

```bash
cd /Users/sreeramvennapusa/Documents/officeTracker/OfficeHybridTracker
```

Initialize Firebase (select Functions when prompted):

```bash
firebase init
```

Select:
- ✅ Functions: Configure a Cloud Functions directory
- Choose "Use an existing project"
- Select: `hybridofficetracker`
- Language: JavaScript
- ESLint: No (optional)
- Install dependencies: Yes

## Step 4: Install Cloud Functions Dependencies

```bash
cd functions
npm install
cd ..
```

## Step 5: Update Firebase Timezone (Important!)

Edit `functions/index.js` and update the timezone on lines 18, 30, 42, 54, and 66:

```javascript
.timeZone('America/New_York') // Change to your timezone
```

Common timezones:
- US East Coast: `'America/New_York'`
- US West Coast: `'America/Los_Angeles'`
- UK: `'Europe/London'`
- India: `'Asia/Kolkata'`
- Australia: `'Australia/Sydney'`

## Step 6: Deploy Cloud Functions

Deploy all functions to Firebase:

```bash
firebase deploy --only functions
```

This will deploy 6 functions:
- `send10AMReminder` - Daily at 10 AM
- `send1PMReminder` - Daily at 1 PM  
- `send4PMReminder` - Daily at 4 PM
- `sendMondaySummary` - Every Monday at 9 AM
- `sendFridaySummary` - Every Friday at 9 AM
- `sendTestNotification` - HTTP endpoint for testing

## Step 7: Verify Deployment

Check that functions are deployed:

```bash
firebase functions:list
```

View function logs:

```bash
firebase functions:log
```

## Step 8: Test Notifications

### Test with HTTP endpoint:

```bash
# Replace YOUR_PROJECT_ID and USER_ID
curl -X POST https://us-central1-hybridofficetracker.cloudfunctions.net/sendTestNotification \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID"}'
```

### Test scheduled functions manually:

```bash
# Trigger 10 AM reminder manually
firebase functions:shell
> send10AMReminder()
```

## How It Works

### For Manual Mode Users:
1. When user selects "Manual Mode", app updates Firebase: `users/{userId}/settings/trackingMode = 'manual'`
2. Cloud Functions run at scheduled times (10 AM, 1 PM, 4 PM)
3. Functions check which users are in manual mode
4. Functions check if user has already logged for today
5. If not logged, sends FCM push notification to user's device
6. When user logs attendance, it updates Firebase and functions won't send more reminders for that day

### For Weekly Summaries:
1. Cloud Functions run every Monday and Friday at 9 AM
2. Sends summary notifications to ALL users with FCM tokens
3. Notification deep-links to stats page in app

## App Changes

The app now:
- ✅ Registers FCM token on launch
- ✅ Stores token in Firebase under `users/{userId}/fcmToken`
- ✅ Updates user settings (tracking mode) in Firebase
- ✅ No longer schedules local notifications (prevents immediate firing)
- ✅ All notifications come from Firebase Cloud Functions

## Troubleshooting

### Notifications not received:

1. Check FCM token is saved:
```bash
# In Firebase Console > Realtime Database
users/{userId}/fcmToken should have a value
```

2. Check Cloud Function logs:
```bash
firebase functions:log --only send10AMReminder
```

3. Verify user settings:
```bash
# In Firebase Console > Realtime Database  
users/{userId}/settings/trackingMode should be 'manual'
```

4. Test notification permissions in app:
   - iOS: Settings > OfficeTrack > Notifications > Allow Notifications
   - Android: Settings > Apps > OfficeTrack > Notifications > Enabled

### Functions not deploying:

```bash
# Check Firebase project
firebase projects:list

# Ensure you're using correct project
firebase use hybridofficetracker

# Try deploying with debug
firebase deploy --only functions --debug
```

## Cost Estimation

Firebase Cloud Functions free tier:
- 2M invocations/month
- 400K GB-seconds/month

Your usage (per user):
- 3 daily checks (10 AM, 1 PM, 4 PM) = ~90 invocations/month
- 2 weekly summaries = ~8 invocations/month
- Total: ~98 invocations/user/month

**You can support ~20,000 users on free tier!**

## Next Steps

1. Deploy functions: `firebase deploy --only functions`
2. Test with your device
3. Monitor logs: `firebase functions:log --only send10AMReminder`
4. Build new app version with FCM changes
5. Submit to App Store & Google Play

## Firebase Console Links

- Project Overview: https://console.firebase.google.com/project/hybridofficetracker
- Functions: https://console.firebase.google.com/project/hybridofficetracker/functions
- Database: https://console.firebase.google.com/project/hybridofficetracker/database
- Logs: https://console.firebase.google.com/project/hybridofficetracker/functions/logs

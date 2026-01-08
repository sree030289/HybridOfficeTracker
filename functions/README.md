# Office Tracker Firebase Cloud Functions

This directory contains Firebase Cloud Functions for sending scheduled push notifications.

## Functions Overview

### Daily Reminder Functions (Manual Mode Only)
- **send10AMReminder** - Runs daily at 10:00 AM
- **send1PMReminder** - Runs daily at 1:00 PM
- **send4PMReminder** - Runs daily at 4:00 PM

These functions check for users in manual mode who haven't logged attendance for the day.

### Weekly Summary Functions (All Users)
- **sendMondaySummary** - Runs every Monday at 9:00 AM
- **sendFridaySummary** - Runs every Friday at 9:00 AM

These functions send progress updates to all active users.

### Testing Function
- **sendTestNotification** - HTTP endpoint for testing notifications

## Local Development

### Install Dependencies
```bash
npm install
```

### Run Functions Emulator
```bash
cd ..
firebase emulators:start --only functions
```

### Test Functions Locally
```bash
firebase functions:shell
> send10AMReminder()
> sendTestNotification({body: {userId: "test-user-id"}})
```

## Deployment

### Deploy All Functions
```bash
cd ..
firebase deploy --only functions
```

### Deploy Specific Function
```bash
firebase deploy --only functions:send10AMReminder
```

### View Logs
```bash
firebase functions:log
firebase functions:log --only send10AMReminder
```

## Configuration

### Update Timezone
Edit `index.js` and change `.timeZone()` to your region:
```javascript
.timeZone('America/New_York') // Your timezone
```

### Update Notification Times
Edit the schedule in `index.js`:
```javascript
// Change from 10 AM to 9 AM:
.schedule('0 9 * * *') // Format: minute hour day month dayOfWeek
```

Cron schedule format:
```
┌────────────── minute (0 - 59)
│ ┌──────────── hour (0 - 23)
│ │ ┌────────── day of month (1 - 31)
│ │ │ ┌──────── month (1 - 12)
│ │ │ │ ┌────── day of week (0 - 7) (Sunday = 0 or 7)
│ │ │ │ │
* * * * *
```

Examples:
- `'0 10 * * *'` - Every day at 10:00 AM
- `'0 9 * * 1'` - Every Monday at 9:00 AM
- `'30 14 * * 1-5'` - Monday-Friday at 2:30 PM

## Database Structure Expected

```json
{
  "users": {
    "user-id-123": {
      "fcmToken": "ExponentPushToken[...]",
      "fcmTokenUpdatedAt": 1234567890,
      "platform": "ios",
      "settings": {
        "trackingMode": "manual",
        "notificationsEnabled": true
      },
      "attendance": {
        "2026-01-08": {
          "location": "office",
          "timestamp": 1234567890
        }
      }
    }
  }
}
```

## Notification Payload

### Manual Reminder
```json
{
  "notification": {
    "title": "🌅 Morning Check-in",
    "body": "Good morning! Remember to log your work location for today."
  },
  "data": {
    "type": "manual_reminder",
    "time": "10:00 AM",
    "action": "open_app"
  }
}
```

### Weekly Summary
```json
{
  "notification": {
    "title": "📅 Monday Check-in",
    "body": "Time to review your week! Check your office attendance stats."
  },
  "data": {
    "type": "weekly_summary",
    "day": "Monday",
    "action": "open_stats"
  }
}
```

## Troubleshooting

### No notifications sent
1. Check user has FCM token: `users/{userId}/fcmToken`
2. Check tracking mode: `users/{userId}/settings/trackingMode`
3. Check function logs: `firebase functions:log`

### Function execution errors
```bash
# View detailed logs
firebase functions:log --only send10AMReminder

# Check function status
firebase functions:list
```

### Invalid tokens
The functions automatically clean up invalid FCM tokens from the database.

## Cost & Limits

Firebase Cloud Functions free tier:
- 2,000,000 invocations/month
- 400,000 GB-seconds/month
- 200,000 CPU-seconds/month
- 5 GB network egress/month

Your estimated usage:
- ~100 invocations per user per month
- Can support 20,000+ users on free tier

## Security

- Functions run with Firebase Admin SDK privileges
- Service account credentials are stored securely by Firebase
- No API keys exposed in client app
- Token validation happens server-side

## Support

For issues or questions:
1. Check Firebase Console logs
2. Review function execution history
3. Test with `sendTestNotification` endpoint
4. Monitor database for user data structure

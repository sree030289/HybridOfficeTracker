# Firebase Cloud Messaging Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     FIREBASE CLOUD PLATFORM                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Firebase Cloud Functions                    │   │
│  │              (Server-Side Scheduler)                     │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                           │   │
│  │  ⏰ send10AMReminder    (Cron: 0 10 * * *)              │   │
│  │  ⏰ send1PMReminder     (Cron: 0 13 * * *)              │   │
│  │  ⏰ send4PMReminder     (Cron: 0 16 * * *)              │   │
│  │  ⏰ sendMondaySummary   (Cron: 0 9 * * 1)               │   │
│  │  ⏰ sendFridaySummary   (Cron: 0 9 * * 5)               │   │
│  │  🌐 sendTestNotification (HTTP Endpoint)                 │   │
│  │                                                           │   │
│  └──────────────┬────────────────────────────┬──────────────┘   │
│                 │                             │                   │
│                 ▼                             ▼                   │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │  Firebase Realtime DB    │  │   Firebase Cloud         │    │
│  │                           │  │   Messaging (FCM)        │    │
│  │  users/                   │  │                          │    │
│  │   ├─ {userId}/           │  │  📱 Push to iOS (APNs)  │    │
│  │   │   ├─ fcmToken        │  │  📱 Push to Android      │    │
│  │   │   ├─ platform        │  │     (FCM/GCM)           │    │
│  │   │   ├─ settings/       │  │                          │    │
│  │   │   │   ├─ trackingMode│  └──────────┬───────────────┘    │
│  │   │   │   └─ ...         │             │                     │
│  │   │   └─ attendance/     │             │                     │
│  │   │       └─ 2026-01-08  │             │                     │
│  │   └─ ...                 │             │                     │
│  └──────────────────────────┘             │                     │
│                                             │                     │
└─────────────────────────────────────────────┼─────────────────────┘
                                              │
                    ╔═════════════════════════╧═════════════════════╗
                    ║        INTERNET / PUSH NETWORK              ║
                    ╚═════════════════════════╤═════════════════════╝
                                              │
                   ┌──────────────────────────┴─────────────────────────┐
                   │                                                     │
                   ▼                                                     ▼
         ┌─────────────────────┐                           ┌─────────────────────┐
         │   📱 iOS Device     │                           │  📱 Android Device  │
         │   (APNs)             │                           │   (FCM/GCM)         │
         ├─────────────────────┤                           ├─────────────────────┤
         │                      │                           │                      │
         │  Office Tracker App  │                           │  Office Tracker App │
         │                      │                           │                      │
         │  ┌────────────────┐ │                           │ ┌────────────────┐  │
         │  │ FCM Service    │ │                           │ │ FCM Service    │  │
         │  │                │ │                           │ │                │  │
         │  │ • Register     │ │                           │ │ • Register     │  │
         │  │   Token        │ │                           │ │   Token        │  │
         │  │ • Save to      │ │                           │ │ • Save to      │  │
         │  │   Firebase     │ │                           │ │   Firebase     │  │
         │  │ • Handle       │ │                           │ │ • Handle       │  │
         │  │   Incoming     │ │                           │ │   Incoming     │  │
         │  └────────────────┘ │                           │ └────────────────┘  │
         │                      │                           │                      │
         └─────────────────────┘                           └─────────────────────┘
```

## Data Flow

### 1️⃣ Initial Setup (App Launch)

```
User Opens App
      │
      ▼
Request Notification Permissions
      │
      ├─ Granted ──────────┐
      │                     ▼
      │              Get FCM Token
      │                     │
      │                     ▼
      │              fcmService.initialize(userId)
      │                     │
      │                     ▼
      │              Save to Firebase:
      │              users/{userId}/fcmToken
      │              users/{userId}/platform
      │              users/{userId}/deviceModel
      │
      └─ Denied ────> Continue without notifications
```

### 2️⃣ User Selects Tracking Mode

```
User Selects "Manual Mode"
      │
      ▼
fcmService.updateUserSettings({
  trackingMode: 'manual',
  notificationsEnabled: true
})
      │
      ▼
Save to Firebase:
users/{userId}/settings/trackingMode = 'manual'
      │
      ▼
✅ User enrolled in manual reminders
```

### 3️⃣ Cloud Function Execution (e.g., 10 AM)

```
10:00 AM - Cron Trigger
      │
      ▼
send10AMReminder() executes
      │
      ▼
Query Firebase:
FOR EACH user WHERE:
  - settings.trackingMode === 'manual'
  - fcmToken exists
  - attendance[today] === null
      │
      ▼
Build FCM Message:
{
  notification: {
    title: "🌅 Morning Check-in",
    body: "Remember to log..."
  },
  data: {
    type: "manual_reminder",
    time: "10:00 AM"
  }
}
      │
      ▼
admin.messaging().sendEachForMulticast({
  tokens: [token1, token2, ...],
  ...message
})
      │
      ├─ Success ────> Log: "✅ Sent N notifications"
      │
      └─ Failure ────> Log error & cleanup invalid tokens
      │
      ▼
Device receives notification
      │
      ▼
User taps notification
      │
      ▼
App opens
      │
      ▼
User logs attendance
      │
      ▼
Update Firebase:
users/{userId}/attendance/{today} = {
  location: 'office',
  timestamp: now
}
      │
      ▼
✅ No more reminders for today
```

### 4️⃣ Weekly Summary (Monday/Friday 9 AM)

```
Monday 9:00 AM - Cron Trigger
      │
      ▼
sendMondaySummary() executes
      │
      ▼
Query Firebase:
FOR EACH user WHERE:
  - fcmToken exists
      │
      ▼
Calculate stats for each user:
  - Office days this month
  - Remote days
  - Progress toward target
      │
      ▼
Send personalized FCM message
      │
      ▼
Device receives notification
      │
      ▼
User taps → Opens stats page
```

## Notification Delivery Flow

```
                    Firebase Cloud Function
                            │
                            │ Builds FCM Message
                            ▼
                    ┌───────────────────┐
                    │ Firebase Cloud    │
                    │ Messaging         │
                    └───────┬───────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
    ┌──────────────┐              ┌──────────────┐
    │  iOS Device  │              │Android Device│
    │   (APNs)     │              │    (FCM)     │
    └──────┬───────┘              └──────┬───────┘
           │                              │
           ▼                              ▼
    App in foreground?             App in foreground?
           │                              │
    ┌──────┴──────┐              ┌────────┴────────┐
    │             │              │                 │
    ▼             ▼              ▼                 ▼
  Yes           No             Yes               No
    │             │              │                 │
    ▼             ▼              ▼                 ▼
Handle in    Show banner    Handle in      Show notification
  app         notification     app            in tray
```

## Database Schema

```
Firebase Realtime Database

users/
  {userId}/
    ├─ fcmToken: "ExponentPushToken[...]"
    ├─ fcmTokenUpdatedAt: 1704729600000
    ├─ platform: "ios" | "android"
    ├─ deviceModel: "iPhone 14 Pro"
    ├─ osVersion: "17.2"
    │
    ├─ settings/
    │  ├─ trackingMode: "manual" | "auto"
    │  ├─ notificationsEnabled: true
    │  ├─ monthlyTarget: 15
    │  └─ targetMode: "days" | "percentage"
    │
    ├─ attendance/
    │  ├─ 2026-01-08/
    │  │  ├─ location: "office" | "remote"
    │  │  └─ timestamp: 1704729600000
    │  └─ 2026-01-09/
    │     └─ ...
    │
    └─ userData/
       ├─ companyName: "My Company"
       ├─ country: "US"
       └─ ...
```

## Timing & Scheduling

```
Daily Schedule (Manual Mode Users)

00:00 ─────────────────────────────────────────────── 24:00
  │                                                      │
  │  10:00                  13:00              16:00    │
  │    ↓                      ↓                  ↓      │
  │  ┌─────┐              ┌─────┐            ┌─────┐   │
  │  │ 🌅  │              │ ☀️  │            │ 🌆  │   │
  │  │10AM │              │ 1PM │            │ 4PM │   │
  │  │Check│              │Check│            │Check│   │
  │  └─────┘              └─────┘            └─────┘   │
  │                                                      │
  └──────────────────────────────────────────────────────┘

Weekly Schedule (All Users)

Mon     Tue     Wed     Thu     Fri     Sat     Sun
 │                               │
 │ 9:00 AM                       │ 9:00 AM
 ↓                               ↓
┌──────┐                     ┌──────┐
│ 📅   │                     │ 📊   │
│Monday│                     │Friday│
│Check │                     │Update│
└──────┘                     └──────┘
```

## Error Handling & Token Management

```
Notification Send Attempt
      │
      ▼
Try to send FCM message
      │
      ├─ Success ────────> Done ✅
      │
      └─ Error
           │
           ├─ Invalid Token ────────┐
           ├─ Not Registered ───────┤
           ├─ Token Expired ────────┤
           │                         │
           │                         ▼
           │              Delete token from DB:
           │              users/{userId}/fcmToken = null
           │                         │
           │                         ▼
           │              User must reopen app
           │              to get new token
           │
           └─ Other Error ──────> Log & retry later
```

## Key Advantages

```
┌─────────────────────────────────────────────────────────┐
│              OLD SYSTEM (Local Notifications)            │
├─────────────────────────────────────────────────────────┤
│ ❌ Unreliable scheduling                                │
│ ❌ All notifications fire on app open                   │
│ ❌ No server-side logic                                 │
│ ❌ Can't check if already logged                        │
│ ❌ Platform-specific bugs                               │
└─────────────────────────────────────────────────────────┘

                           ↓ MIGRATION ↓

┌─────────────────────────────────────────────────────────┐
│           NEW SYSTEM (Firebase Cloud Messaging)          │
├─────────────────────────────────────────────────────────┤
│ ✅ Reliable server-side scheduling                      │
│ ✅ Notifications sent at correct time                   │
│ ✅ Smart filtering (check if logged)                    │
│ ✅ Automatic token management                           │
│ ✅ Works identically on iOS & Android                   │
│ ✅ Scalable to 20,000+ users (free tier)                │
│ ✅ Centralized monitoring & logging                     │
└─────────────────────────────────────────────────────────┘
```

## Cost & Scalability

```
Firebase Free Tier Limits
├─ Cloud Functions
│  ├─ 2M invocations/month
│  ├─ 400K GB-seconds
│  └─ 200K CPU-seconds
│
└─ Cloud Messaging
   └─ Unlimited (FREE!)

Your Usage per User:
├─ Manual reminders: 3/day × 30 days = 90/month
├─ Weekly summaries: 2/week × 4 weeks = 8/month
└─ Total: ~98 invocations/user/month

Maximum Users on Free Tier:
2,000,000 invocations ÷ 98 invocations/user = 20,408 users! 🎉
```

---

This architecture ensures reliable, scalable, and cost-effective push notifications for your Office Tracker app! 🚀

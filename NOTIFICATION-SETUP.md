# Notification System - Complete Setup Guide

## ✅ What Was Fixed

1. **Timezone**: Changed from `America/New_York` to `Australia/Sydney` (AEST)
2. **FCM Token Persistence**: Fixed token being deleted during onboarding
3. **Database Structure**: Fixed nested `users` node issue
4. **6 PM Auto Mode Notification**: Added new function for auto mode users

## 📅 Notification Schedule

### MANUAL MODE
**Daily Reminders** (only if attendance not logged):
- ⏰ **10:00 AM** - "Good morning! Remember to log your work location for today."
- ⏰ **1:00 PM** - "Quick reminder: Have you logged your location today?"
- ⏰ **4:00 PM** - "Don't forget to log your work location before you finish!"

**Skipped on:**
- Weekends (Saturday/Sunday)
- Public holidays

---

### AUTO MODE
**Daily Reminders**:
- ⏰ **6:00 PM** - "Your location wasn't detected today. Please open the app to manually log." (only if no attendance logged)

**Background Geofencing**:
- 🏢 Auto-logs when within 100m of office
- Sends notification: "Office Attendance Auto-Logged"

**Skipped on:**
- Weekends (Saturday/Sunday)
- Public holidays

---

### BOTH MODES
**Weekly Summaries**:
- 📅 **Monday 9:00 AM** - "Time to review your week! Check your office attendance stats."
- 📊 **Friday 9:00 AM** - "Time to review your week! Check your office attendance stats."

**Skipped on:**
- Public holidays only

---

## 🚀 Deployment

Deploy the updated Cloud Functions:

```bash
cd functions
firebase deploy --only functions
```

This will deploy 7 functions:
- `send10AMReminder`
- `send1PMReminder`
- `send4PMReminder`
- `send6PMAutoReminder` ⭐ NEW
- `sendMondaySummary`
- `sendFridaySummary`
- `sendTestNotification`

---

## 📱 Auto Mode - Background Geofencing Setup

### Why Notifications Only Show When App Opens

The geofencing IS working in the background, but it requires **"Always Allow" location permissions**.

### Required Setup for Users:

1. **During Onboarding:**
   - App requests "While Using the App" permission ✅
   - App requests "Allow All the Time" permission ✅

2. **User Must Select:**
   - ⚠️ **"Always Allow"** or **"Allow All the Time"** 
   - ❌ NOT "While Using the App" - this won't trigger background geofencing

3. **If User Selected Wrong Permission:**
   - Go to **iPhone Settings → Privacy & Security → Location Services → OfficeTracker**
   - Change from "While Using the App" to **"Always"**

### How It Works:

When user arrives within 100m of office (with "Always Allow" permission):
1. Background geofence detects entry
2. Attendance logged automatically as "office"
3. Notification sent: "🏢 Office Attendance Auto-Logged"

**Without "Always Allow"**: Geofence only triggers when app is opened.

---

## 🧪 Testing

### Test Individual Notification:
```bash
node test_expo_notification.js
```

### Test Cloud Function:
```bash
curl -X POST https://us-central1-hybridofficetracker.cloudfunctions.net/sendTestNotification \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID"}'
```

### Check User FCM Token:
```bash
node check_user_db.js
```

Should show:
```
fcmToken: ExponentPushToken[...]
platform: ios
deviceModel: iPhone 11 Pro Max
```

---

## 🔧 Troubleshooting

### Notifications Not Received:

1. **Check FCM Token Exists**: Run `node check_user_db.js`
2. **Verify Permissions**: 
   - Notification permissions: ON
   - Location permissions (Auto mode): "Always Allow"
3. **Check Timezone**: Functions use `Australia/Sydney` (AEST)
4. **Test Manually**: Run `node test_expo_notification.js`

### Geofencing Not Working in Background:

1. **Check Location Permission**: Must be "Always Allow", not "While Using"
2. **iOS Settings**: Settings → Privacy & Security → Location Services → OfficeTracker → **Always**
3. **Background App Refresh**: Settings → General → Background App Refresh → ON for OfficeTracker
4. **Low Power Mode**: Disable Low Power Mode (it restricts background activity)

### FCM Token Deleted After Onboarding:

✅ **FIXED** - `saveAllData()` now preserves existing FCM token using spread operator

---

## 📋 Next Build Checklist

- [x] Timezone changed to Australia/Sydney
- [x] 6 PM auto mode notification added
- [x] FCM token preservation fixed
- [x] Nested users node fixed
- [ ] Deploy updated Cloud Functions
- [ ] Test notifications at scheduled times
- [ ] Verify "Always Allow" permission flow in app

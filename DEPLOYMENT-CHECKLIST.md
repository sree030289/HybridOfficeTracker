# 🚀 Firebase Cloud Messaging - Deployment Checklist

Use this checklist to deploy Firebase Cloud Messaging for your Office Tracker app.

## ✅ Pre-Deployment Checklist

- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] Logged into Firebase (`firebase login`)
- [ ] Service account key exists (`serviceAccountKey.json`)
- [ ] Node.js 18+ installed
- [ ] Firebase project ID confirmed: `hybridofficetracker`

## 📋 Step-by-Step Deployment

### 1. Initialize Firebase (if first time)

```bash
cd /Users/sreeramvennapusa/Documents/officeTracker/OfficeHybridTracker
firebase init
```

**Select:**
- [x] Functions: Configure a Cloud Functions directory
- [x] Use existing project: `hybridofficetracker`
- [x] Language: JavaScript
- [x] Install dependencies: Yes

Status: [ ] Complete

---

### 2. Install Function Dependencies

```bash
cd functions
npm install
cd ..
```

**Expected output:**
```
added 150+ packages
```

Status: [ ] Complete

---

### 3. Update Timezone in Functions

**File:** `functions/index.js`

**Find and replace** on lines 18, 30, 42, 54, 66:
```javascript
.timeZone('America/New_York')
```

**Replace with your timezone:**
- [ ] America/New_York (US East)
- [ ] America/Los_Angeles (US West)
- [ ] Europe/London (UK)
- [ ] Asia/Kolkata (India)
- [ ] Other: _______________

Status: [ ] Complete

---

### 4. Review Notification Times

Current schedule:
- 10:00 AM - Morning reminder
- 1:00 PM - Afternoon reminder
- 4:00 PM - End of day reminder
- Monday 9:00 AM - Weekly summary
- Friday 9:00 AM - Weekly summary

**Do you want to change these times?**
- [ ] Yes → Edit `functions/index.js` schedule strings
- [x] No → Keep defaults

Status: [ ] Complete

---

### 5. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

**Expected output:**
```
✔ functions[send10AMReminder] Successful create operation
✔ functions[send1PMReminder] Successful create operation
✔ functions[send4PMReminder] Successful create operation
✔ functions[sendMondaySummary] Successful create operation
✔ functions[sendFridaySummary] Successful create operation
✔ functions[sendTestNotification] Successful create operation

✔ Deploy complete!
```

**Deployment time:** ~5-10 minutes

Status: [ ] Complete

---

### 6. Verify Deployment

```bash
firebase functions:list
```

**Expected output:**
```
send10AMReminder
send1PMReminder
send4PMReminder
sendMondaySummary
sendFridaySummary
sendTestNotification
```

Status: [ ] Complete

---

### 7. Test FCM Setup

**First, install your updated app on a device and open it**

Status: [ ] App installed and opened

**Then find your user ID:**

1. Open Firebase Console: https://console.firebase.google.com/project/hybridofficetracker/database
2. Navigate to `/users`
3. Copy your user ID

Your User ID: `________________________`

Status: [ ] User ID found

**Run test script:**

```bash
node test_fcm.js YOUR_USER_ID
```

**Expected output:**
```
✅ Firebase Admin initialized
📱 Testing FCM for user: YOUR_USER_ID
User Data:
  Platform: ios
  FCM Token: ✅ Present
  
📤 Sending test notification...
✅ Notification sent successfully!
```

**Did you receive the test notification on your device?**
- [ ] Yes - Success! ✅
- [ ] No - See troubleshooting below

Status: [ ] Complete

---

### 8. Monitor First Scheduled Run

**Wait until next scheduled time (10 AM, 1 PM, or 4 PM)**

Status: [ ] Waited for scheduled time

**Check function logs:**

```bash
firebase functions:log --only send10AMReminder --limit 20
```

**Look for:**
```
10:00 AM Reminder: Found X users to notify
✅ Sent Y notifications, 0 failures
```

**Did users receive notifications at the scheduled time?**
- [ ] Yes - Perfect! ✅
- [ ] No - Check logs for errors

Status: [ ] Complete

---

## 🧪 Testing Matrix

Test these scenarios:

### Manual Mode User - Not Logged
- [ ] User in manual mode
- [ ] Has NOT logged attendance today
- [ ] Receives notification at 10 AM ✅
- [ ] Receives notification at 1 PM ✅
- [ ] Receives notification at 4 PM ✅

### Manual Mode User - Already Logged
- [ ] User in manual mode
- [ ] HAS logged attendance today
- [ ] Does NOT receive notifications ✅

### Auto Mode User
- [ ] User in auto mode
- [ ] Does NOT receive manual reminders ✅

### Weekly Summaries (All Users)
- [ ] Monday 9 AM - Received by all ✅
- [ ] Friday 9 AM - Received by all ✅

---

## 🏗️ App Build & Submission

### 9. Build New App Version

```bash
cd /Users/sreeramvennapusa/Documents/officeTracker/OfficeHybridTracker

# Update version in app.json
# version: "2.2.2" (or next version)

# Build for iOS
eas build --platform ios

# Build for Android  
eas build --platform android
```

Status: [ ] Complete

---

### 10. Submit to App Stores

**iOS - App Store:**
```bash
eas submit --platform ios
```

Status: [ ] Complete

**Android - Google Play:**
```bash
eas submit --platform android
```

Status: [ ] Complete

---

## 📊 Post-Deployment Monitoring

### Day 1-3 Monitoring

Check logs daily:

```bash
# Morning (after 10 AM)
firebase functions:log --only send10AMReminder --limit 50

# Afternoon (after 1 PM)
firebase functions:log --only send1PMReminder --limit 50

# Evening (after 4 PM)
firebase functions:log --only send4PMReminder --limit 50
```

**Checklist:**
- [ ] Day 1: No errors in logs
- [ ] Day 1: Users received notifications
- [ ] Day 2: Consistent delivery
- [ ] Day 3: No invalid tokens

---

### Week 1 Monitoring

- [ ] Monday 9 AM: Weekly summary sent
- [ ] Friday 9 AM: Weekly summary sent
- [ ] No user complaints about timing
- [ ] Firebase quota usage < 10% of free tier

**Check quota:**
Firebase Console → Functions → Usage tab

---

## 🐛 Troubleshooting Guide

### Issue: "No FCM token found"

**Solution:**
1. Uninstall app from device
2. Reinstall updated version
3. Grant notification permissions
4. Check database: `users/{userId}/fcmToken` should exist

Status: [ ] Resolved

---

### Issue: "Notifications not received"

**Check:**
1. [ ] FCM token exists in database
2. [ ] User tracking mode is 'manual' (for manual reminders)
3. [ ] User hasn't logged attendance today
4. [ ] Function logs show "✅ Sent X notifications"
5. [ ] Device notification settings enabled

Status: [ ] Resolved

---

### Issue: "Function deployment failed"

**Solution:**
```bash
# Ensure correct project
firebase use hybridofficetracker

# Try with debug
firebase deploy --only functions --debug

# Check billing (must have Blaze plan for Cloud Functions)
```

Status: [ ] Resolved

---

## ✅ Final Verification

### All Systems Go Checklist

- [ ] Functions deployed successfully
- [ ] Test notification received
- [ ] Manual reminders working (10 AM, 1 PM, 4 PM)
- [ ] Weekly summaries working (Mon/Fri 9 AM)
- [ ] No errors in function logs
- [ ] App submitted to stores
- [ ] Users reporting success

---

## 📞 Emergency Rollback

If something goes wrong and you need to rollback:

### Option 1: Redeploy Previous Version
```bash
# This doesn't undo functions, but you can deploy an older codebase
firebase deploy --only functions
```

### Option 2: Disable Specific Function
```bash
# In Firebase Console
# Functions → [function name] → Actions → Delete
```

### Option 3: Release Hotfix
```bash
# Fix the issue in code
# Redeploy immediately
firebase deploy --only functions
# No app update needed for function-only changes
```

---

## 🎉 Success Criteria

Your deployment is successful when:

✅ All 6 functions deployed  
✅ Test notification received  
✅ Manual reminders arrive at correct times  
✅ Weekly summaries sent on Mon/Fri  
✅ No errors in logs for 3 days  
✅ Users receiving notifications consistently  

---

## 📚 Resources

- **FCM Setup Guide:** [FCM-SETUP-GUIDE.md](FCM-SETUP-GUIDE.md)
- **Migration Summary:** [FCM-MIGRATION-SUMMARY.md](FCM-MIGRATION-SUMMARY.md)
- **Functions README:** [functions/README.md](functions/README.md)
- **Firebase Console:** https://console.firebase.google.com/project/hybridofficetracker

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Version:** 2.2.2  
**Status:** [ ] In Progress  [ ] Complete  

---

Good luck with your deployment! 🚀

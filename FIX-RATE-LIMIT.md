# Firebase API Rate Limit Fix

## The Problem
You hit a rate limit trying to enable multiple APIs at once:
- Cloud Functions API
- Cloud Build API
- Artifact Registry API

## Quick Fix - Enable APIs Manually

### Option 1: Enable via Google Cloud Console (Recommended)

**Open these links and click "Enable" on each:**

1. **Cloud Functions API:**
   https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=hybridofficetracker

2. **Cloud Build API:**
   https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=hybridofficetracker

3. **Artifact Registry API:**
   https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=hybridofficetracker

**After enabling all 3, wait 1-2 minutes, then run:**
```bash
firebase deploy --only functions
```

---

### Option 2: Enable via gcloud CLI

If you have gcloud CLI installed:

```bash
# Enable all required APIs
gcloud services enable cloudfunctions.googleapis.com --project=hybridofficetracker
gcloud services enable cloudbuild.googleapis.com --project=hybridofficetracker
gcloud services enable artifactregistry.googleapis.com --project=hybridofficetracker

# Wait 1 minute, then deploy
firebase deploy --only functions
```

---

### Option 3: Wait and Retry

The rate limit resets after a few minutes. Simply wait 2-3 minutes and try again:

```bash
# Wait 2-3 minutes...
firebase deploy --only functions
```

---

## Verify APIs are Enabled

Check in Firebase Console:
https://console.cloud.google.com/apis/dashboard?project=hybridofficetracker

You should see:
- ✅ Cloud Functions API
- ✅ Cloud Build API
- ✅ Artifact Registry API

---

## Important: Billing Account Required

⚠️ **Note:** Cloud Functions requires a **Blaze (Pay-as-you-go)** plan.

If you see billing errors:

1. Go to: https://console.firebase.google.com/project/hybridofficetracker/overview
2. Click "Upgrade" in the bottom-left
3. Select "Blaze Plan"
4. Add a credit card (won't be charged on free tier)

**Don't worry about costs!** Your usage will stay well within the **FREE tier limits**:
- 2M invocations/month (you'll use ~10K)
- 400K GB-seconds/month
- Cloud Messaging is always free

---

## After Fixing

Once APIs are enabled, run:

```bash
firebase deploy --only functions
```

Expected output:
```
✔ functions[send10AMReminder] Successful create operation
✔ functions[send1PMReminder] Successful create operation  
✔ functions[send4PMReminder] Successful create operation
✔ functions[sendMondaySummary] Successful create operation
✔ functions[sendFridaySummary] Successful create operation
✔ functions[sendTestNotification] Successful create operation

✔ Deploy complete!
```

Then test with:
```bash
node test_fcm.js YOUR_USER_ID
```

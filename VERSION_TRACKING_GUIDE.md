# How to Display App Version in iPhone Settings

## What's Been Added:

### 1. Firebase Version Tracking ✅
**Status:** Code added to App.js

When users open the app, it now automatically saves:
- `appVersion`: "3.0.0 (5)" - version and build number
- `platform`: "ios" or "android"
- `deviceModel`: "iPhone 16 Pro", etc.
- `osVersion`: "18.2", etc.
- `lastActive`: timestamp of last app open

**Location in code:** App.js, line ~1158

**How to verify:**
```bash
node check_app_versions.js
```

---

### 2. In-App Version Display ✅
**Status:** Added to Settings screen

Users can now tap "App Version" in Settings to see:
- Version number (3.0.0)
- Build number (5)
- Device model
- OS version
- User ID

**Location:** Settings screen → "ℹ️ App Version"

---

### 3. iPhone Settings App Display (iOS Settings Bundle)
**Status:** NOT YET IMPLEMENTED

To show version in **iPhone Settings app** (Settings → OfficeTrack):

#### Steps to Add:

1. **Create Settings.bundle folder structure:**
```
OfficeHybridTracker/
  Settings.bundle/
    Root.plist
    en.lproj/
      Root.strings
```

2. **Create Root.plist:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>StringsTable</key>
    <string>Root</string>
    <key>PreferenceSpecifiers</key>
    <array>
        <!-- App Information Group -->
        <dict>
            <key>Type</key>
            <string>PSGroupSpecifier</string>
            <key>Title</key>
            <string>App Information</string>
        </dict>
        
        <!-- Version -->
        <dict>
            <key>Type</key>
            <string>PSTitleValueSpecifier</string>
            <key>Title</key>
            <string>Version</string>
            <key>Key</key>
            <string>version_preference</string>
            <key>DefaultValue</key>
            <string>3.0.0</string>
        </dict>
        
        <!-- Build Number -->
        <dict>
            <key>Type</key>
            <string>PSTitleValueSpecifier</string>
            <key>Title</key>
            <string>Build</string>
            <key>Key</key>
            <string>build_preference</string>
            <key>DefaultValue</key>
            <string>5</string>
        </dict>
        
        <!-- About Group -->
        <dict>
            <key>Type</key>
            <string>PSGroupSpecifier</string>
            <key>Title</key>
            <string>About</string>
            <key>FooterText</key>
            <string>OfficeTrack helps you manage hybrid work attendance effortlessly. Track office days, get smart reminders, and meet your monthly targets.</string>
        </dict>
        
        <!-- App Store Link -->
        <dict>
            <key>Type</key>
            <string>PSChildPaneSpecifier</string>
            <key>Title</key>
            <string>Rate on App Store</string>
            <key>Key</key>
            <string>rate_app</string>
        </dict>
    </array>
</dict>
</plist>
```

3. **Add to app.json:**
```json
"ios": {
  "bundleIdentifier": "com.officetrack.app",
  "buildNumber": "5",
  "infoPlist": {
    "CFBundleURLTypes": [],
    "UIApplicationSupportsIndirectInputEvents": true
  },
  "entitlements": {
    "com.apple.developer.usernotifications.time-sensitive": true
  }
}
```

4. **Build with EAS:**
```bash
eas build --platform ios --profile production
```

The Settings.bundle will be automatically included in the build.

---

## Current Status:

✅ **Firebase tracking:** Working - saves version on app launch
✅ **In-app display:** Working - visible in Settings screen
❌ **iOS Settings app:** Not implemented yet (requires Settings.bundle)

---

## To Verify Firebase Tracking:

Run this script to see all app versions in the database:
```bash
node check_app_versions.js
```

This will show:
- How many users on each version
- Device models and OS versions
- Last active timestamps
- Users without version info (old versions)

---

## Next Steps:

1. ✅ Version tracking code already added to App.js
2. Deploy new build (v3.0.1) with the version tracking
3. Users who update will have their version saved to Firebase
4. (Optional) Add Settings.bundle for iOS Settings app display

# Holiday Sync System - Firebase Functions

## Overview
Centralized holiday data management using Firebase Cloud Functions and Firestore.

## Architecture
```
Firebase Function (scheduled monthly)
  ├─ Syncs 24 priority countries
  ├─ Fetches from Nager.Date (119 countries)
  ├─ Falls back to Calendarific for unsupported countries (India, etc.)
  └─ Stores in Firestore: holidays/{countryCode}_{year}

App reads directly from Firestore (instant, no API calls)
```

## Deploy Functions
```bash
firebase deploy --only functions
```

## Available Functions

### 1. `syncAllHolidays` (Scheduled)
- **Schedule**: 1st of every month at 2 AM UTC
- **Action**: Syncs all priority countries for current + next year
- **Countries**: AU, IN, US, GB, CA, BR, JP, CN, DE, FR, IT, ES, NZ, SG, MY, PH, ID, TH, VN, KR, AE, SA, ZA, NG

### 2. `syncHolidays` (HTTP - Manual)
- **Endpoint**: POST https://YOUR_PROJECT.cloudfunctions.net/syncHolidays
- **Body**: `{ "countryCode": "IN", "year": 2026 }`
- **Use**: Manually sync a specific country

### 3. `getHolidays` (HTTP - Read)
- **Endpoint**: GET https://YOUR_PROJECT.cloudfunctions.net/getHolidays?countryCode=IN&year=2026
- **Use**: Fetch holidays from Firestore (auto-syncs if missing)

## Firestore Structure
```
holidays/
  ├─ AU_2026
  │   ├─ countryCode: "AU"
  │   ├─ year: 2026
  │   ├─ holidays: { "2026-01-26": "Australia Day", ... }
  │   ├─ source: "nager" or "calendarific"
  │   ├─ syncedAt: timestamp
  │   └─ holidayCount: 11
  ├─ IN_2026
  │   ├─ countryCode: "IN"
  │   ├─ holidays: { "2026-01-26": "Republic Day", ... }
  │   └─ source: "calendarific"
  └─ ...
```

## Manual Sync for Immediate Testing
```bash
# Test India holidays sync
curl -X POST https://YOUR_PROJECT.cloudfunctions.net/syncHolidays \
  -H "Content-Type: application/json" \
  -d '{"countryCode":"IN","year":2026}'

# Get India holidays
curl "https://YOUR_PROJECT.cloudfunctions.net/getHolidays?countryCode=IN&year=2026"
```

## Benefits
✅ **No API keys in app** - Secure  
✅ **Instant loading** - Firestore read (~100ms)  
✅ **No per-user quota** - Centralized calls  
✅ **Auto on-demand sync** - Missing countries sync automatically  
✅ **Offline support** - Firestore caching  
✅ **Pre-populated** - Monthly schedule keeps data fresh

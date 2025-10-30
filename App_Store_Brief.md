# App Store Review Response: OfficeHybrid Tracker

## App Purpose
**OfficeHybrid Tracker** is a privacy-first hybrid work attendance tracker designed **primarily for manual entry** with **optional smart location features**. Helps hybrid workers track office vs remote work days to meet company policies.

**Core Function:** Manual entry of daily work locations (Office/WFH/Leave)  
**Data Storage:** 100% local device storage, no backend servers, works offline

## Background Location Usage

**Smart Daily Logic:**
1. Check if user already logged attendance today
2. IF LOGGED: Skip all location checks for the day
3. IF NOT LOGGED: Brief 3-5 second location check to help auto-log

**Result:** Most days have 0-1 background checks instead of 3

**Schedule:** Maximum 3 times per weekday (10am, 1pm, 3pm) - only if not already logged

**Examples:**
- User opens app at 9:30 AM → Auto-logs office → All 3 daily background checks **SKIPPED**
- User forgets to log → 10:00 AM check helps auto-log → 1:00 PM & 3:00 PM checks **SKIPPED**
- Manual mode users → **ZERO background location access**

## What We DON'T Do
- No continuous tracking  
- No location history storage  
- No movement/route tracking  
- No always-on GPS  
- No data transmission to servers

## Privacy Safeguards
- **Local-only processing** - no backend servers  
- **User opt-in required** - not enabled by default  
- **Easy disable** - switch to manual mode removes all location access  
- **Complete alternative** - full functionality without location permission  
- **Intelligent skipping** - no location access if already logged  
- **Minimal usage** - maximum 15 seconds total per day  

## Legitimate Use Cases
1. **Hybrid Work Compliance**: Auto-detect office attendance to meet company policies
2. **Productivity Analytics**: Location-aware daily summaries and goal tracking
3. **User Convenience**: Eliminate daily manual logging friction for office workers

## Manual Mode Alternative
Complete functionality available without location:
- Manual entry notifications (10am, 1pm, 4pm)
- All attendance tracking and analytics
- Calendar planning and goal setting
- Statistics and insights

## Technical Details
- **Duration**: 3-5 seconds per check, immediately stopped
- **Battery Impact**: Minimal - only brief GPS activation when needed
- **Offline Capable**: No internet required
- **Permission Text**: "Scheduled location checks (10am, 1pm, 3pm) to automatically log office attendance. Local processing only, never shared."

## Summary
**OfficeHybrid Tracker** uses background location legitimately for hybrid work attendance automation while:
- Prioritizing manual entry as primary function
- Minimizing location access through intelligent daily logic
- Providing complete user control and easy opt-out
- Storing all data locally with no backend services
- Offering identical functionality without location access

Contact: Sreeram Vennapusa | Privacy: 100% local storage, user-controlled
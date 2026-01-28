/**
 * Firebase Cloud Functions for Office Tracker Notifications
 * 
 * This handles scheduled notifications for:
 * - Manual mode reminders (10 AM, 1 PM, 4 PM)
 * - Weekly summaries (Monday & Friday 9 AM)
 * 
 * Deploy: firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Scheduled function: Send 10 AM reminder (runs daily)
 * Schedule: Every day at 10:00 AM (user's timezone)
 */
exports.send10AMReminder = functions.pubsub
  .schedule('0 10 * * *')
  .timeZone('Australia/Sydney') // AEST timezone
  .onRun(async (context) => {
    return sendReminderToManualUsers({
      title: '🌅 Morning Check-in',
      body: 'Good morning! Remember to log your work location for today.',
      time: '10:00 AM'
    });
  });

/**
 * Scheduled function: Send 1 PM reminder (runs daily)
 */
exports.send1PMReminder = functions.pubsub
  .schedule('0 13 * * *')
  .timeZone('Australia/Sydney')
  .onRun(async (context) => {
    return sendReminderToManualUsers({
      title: '☀️ Afternoon Reminder',
      body: 'Quick reminder: Have you logged your location today?',
      time: '1:00 PM'
    });
  });

/**
 * Scheduled function: Send 4 PM reminder (runs daily)
 */
exports.send4PMReminder = functions.pubsub
  .schedule('0 16 * * *')
  .timeZone('Australia/Sydney')
  .onRun(async (context) => {
    return sendReminderToManualUsers({
      title: '🌆 End of Day Reminder',
      body: 'Don\'t forget to log your work location before you finish!',
      time: '4:00 PM'
    });
  });

/**
 * Scheduled function: Send 6 PM reminder to AUTO mode users (runs daily)
 * Only sends to auto mode users who haven't logged anything today
 */
exports.send6PMAutoReminder = functions.pubsub
  .schedule('0 18 * * *')
  .timeZone('Australia/Sydney')
  .onRun(async (context) => {
    return sendReminderToAutoUsers({
      title: '🏢 Location Not Logged',
      body: 'Your location wasn\'t detected today. Please open the app to manually log your attendance.',
      time: '6:00 PM'
    });
  });

/**
 * Scheduled function: Send Monday morning summary (runs weekly)
 * Schedule: Every Monday at 9:00 AM
 */
exports.sendMondaySummary = functions.pubsub
  .schedule('0 9 * * 1')
  .timeZone('Australia/Sydney')
  .onRun(async (context) => {
    return sendWeeklySummary('Monday');
  });

/**
 * Scheduled function: Send Friday morning summary (runs weekly)
 * Schedule: Every Friday at 9:00 AM
 */
exports.sendFridaySummary = functions.pubsub
  .schedule('0 9 * * 5')
  .timeZone('Australia/Sydney')
  .onRun(async (context) => {
    return sendWeeklySummary('Friday');
  });

/**
 * Helper: Check if today is a weekend
 */
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Helper: Send push notification via Expo Push Service
 */
async function sendExpoPushNotification(expoPushToken, { title, body, data, categoryId }) {
  const https = require('https');
  
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data || {},
    priority: 'high'
  };

  if (categoryId) {
    message.categoryId = categoryId;
  }

  const postData = JSON.stringify(message);

  const options = {
    hostname: 'exp.host',
    port: 443,
    path: '/--/api/v2/push/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (result.data && result.data.status === 'ok') {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: result });
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Helper: Send reminder to users in manual mode who haven't logged today
 */
async function sendReminderToManualUsers({ title, body, time }) {
  try {
    // Check if today is a weekend IN SYDNEY TIMEZONE (not UTC!)
    const sydneyTime = new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' });
    const sydneyDate = new Date(sydneyTime);
    
    if (isWeekend(sydneyDate)) {
      console.log(`${time} Reminder: Skipping - today is a weekend in Sydney`);
      return { success: 0, failed: 0, skipped: 'weekend' };
    }

    const db = admin.database();
    const usersRef = db.ref('users');
    const snapshot = await usersRef.once('value');
    const users = snapshot.val();

    if (!users) {
      console.log('No users found');
      return null;
    }

    // Use Sydney date for "today" key
    const today = sydneyDate.toISOString().split('T')[0];
    console.log(`${time} Reminder: Checking for date ${today} in Sydney timezone`);
    const notifications = [];

    // Find users in manual mode who haven't logged today
    let totalUsers = 0;
    let manualUsers = 0;
    let usersWithTokens = 0;
    
    for (const [userId, userData] of Object.entries(users)) {
      totalUsers++;
      
      // Check if user is in manual mode
      if (userData.userData?.trackingMode === 'manual') {
        manualUsers++;
        
        if (userData.fcmToken) {
          usersWithTokens++;
          
          // Check if today is a public holiday for this user
          const isHoliday = userData.cachedHolidays?.[today];
          if (isHoliday) {
            console.log(`Skipping ${userId.substring(0, 20)}: Today is a public holiday (${isHoliday})`);
            continue;
          }

          // Check if user has already logged today
          const attendance = userData.attendanceData?.[today];
          if (!attendance) {
            notifications.push({
              userId,
              token: userData.fcmToken
            });
          }
        }
      }
    }

    console.log(`${time} Reminder: Total=${totalUsers}, Manual=${manualUsers}, WithTokens=${usersWithTokens}, Eligible=${notifications.length}`);

    if (notifications.length === 0) {
      return { success: 0, failed: 0 };
    }

    // Send notifications via Expo Push Service
    let successCount = 0;
    let failureCount = 0;

    for (const notif of notifications) {
      try {
        const result = await sendExpoPushNotification(notif.token, {
          title: title,
          body: body,
          data: {
            type: 'manual_reminder',
            time: time,
            action: 'open_app'
          }
        });

        if (result.success) {
          successCount++;
        } else {
          failureCount++;
          console.error(`Failed to send to ${notif.userId}:`, result.error);
        }
      } catch (error) {
        failureCount++;
        console.error(`Error sending to ${notif.userId}:`, error);
      }
    }

    console.log(`✅ Sent ${successCount} notifications, ${failureCount} failures`);
    return { success: successCount, failed: failureCount };
  } catch (error) {
    console.error('Error sending reminder:', error);
    return null;
  }
}

/**
 * Helper: Send 6 PM reminder to users in AUTO mode who haven't logged today
 */
async function sendReminderToAutoUsers({ title, body, time }) {
  try {
    // Check if today is a weekend IN SYDNEY TIMEZONE (not UTC!)
    const sydneyTime = new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' });
    const sydneyDate = new Date(sydneyTime);
    
    if (isWeekend(sydneyDate)) {
      console.log(`${time} Auto Reminder: Skipping - today is a weekend in Sydney`);
      return { success: 0, failed: 0, skipped: 'weekend' };
    }

    const db = admin.database();
    const usersRef = db.ref('users');
    const snapshot = await usersRef.once('value');
    const users = snapshot.val();

    if (!users) {
      console.log('No users found');
      return null;
    }

    // Use Sydney date for "today" key
    const today = sydneyDate.toISOString().split('T')[0];
    const notifications = [];

    // Find users in AUTO mode who haven't logged today
    for (const [userId, userData] of Object.entries(users)) {
      // Check if user is in auto mode
      if (userData.userData?.trackingMode === 'auto' && userData.fcmToken) {
        // Check if today is a public holiday for this user
        const isHoliday = userData.cachedHolidays?.[today];
        if (isHoliday) {
          console.log(`Skipping ${userId}: Today is a public holiday (${isHoliday})`);
          continue;
        }

        // Check if user has already logged today
        const attendance = userData.attendanceData?.[today];
        if (!attendance) {
          notifications.push({
            userId,
            token: userData.fcmToken
          });
        }
      }
    }

    console.log(`${time} Auto Reminder: Found ${notifications.length} users to notify`);

    if (notifications.length === 0) {
      return { success: 0, failed: 0 };
    }

    // Send notifications via Expo Push Service
    let successCount = 0;
    let failureCount = 0;

    for (const notif of notifications) {
      try {
        const result = await sendExpoPushNotification(notif.token, {
          title: title,
          body: body,
          data: {
            type: 'auto_reminder',
            time: time,
            action: 'open_app'
          }
        });

        if (result.success) {
          successCount++;
        } else {
          failureCount++;
          console.error(`Failed to send to ${notif.userId}:`, result.error);
        }
      } catch (error) {
        failureCount++;
        console.error(`Error sending to ${notif.userId}:`, error);
      }
    }

    console.log(`✅ Sent ${successCount} auto notifications, ${failureCount} failures`);
    return { success: successCount, failed: failureCount };
  } catch (error) {
    console.error('Error sending auto reminder:', error);
    return null;
  }
}

/**
 * Helper: Send weekly summary to all users
 */
async function sendWeeklySummary(day) {
  try {
    // Check if today is a public holiday (skip summaries on holidays)
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const db = admin.database();
    const usersRef = db.ref('users');
    const snapshot = await usersRef.once('value');
    const users = snapshot.val();

    if (!users) {
      console.log('No users found');
      return null;
    }

    const tokens = [];
    const userIds = [];
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const notifications = [];

    // Calculate summary for each user
    for (const [userId, userData] of Object.entries(users)) {
      if (!userData.fcmToken) continue;

      // Skip if today is a public holiday for this user
      const isHoliday = userData.cachedHolidays?.[today];
      if (isHoliday) {
        console.log(`Skipping ${userId}: Today is a public holiday (${isHoliday})`);
        continue;
      }

      // Count office days from attendanceData for current month
      const attendanceData = userData.attendanceData || {};
      let officeCount = 0;
      
      // Filter attendance for current month
      Object.keys(attendanceData).forEach(dateStr => {
        if (dateStr.startsWith(currentMonth)) {
          const attendance = attendanceData[dateStr];
          // Check both old format (string) and new format (object)
          const status = typeof attendance === 'string' ? attendance : attendance?.status;
          if (status === 'office') officeCount++;
        }
      });

      // Calculate monthly target
      const targetMode = userData.settings?.targetMode || 'percentage';
      const monthlyTarget = userData.settings?.monthlyTarget || 50;
      
      // Calculate working days in current month
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      // Count working days (Mon-Fri) in this month
      let workingDaysInMonth = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
          workingDaysInMonth++;
        }
      }
      
      // Count public holidays in current month (only weekdays)
      const cachedHolidays = userData.cachedHolidays || {};
      let publicHolidaysInMonth = 0;
      Object.keys(cachedHolidays).forEach(dateStr => {
        if (dateStr.startsWith(currentMonth)) {
          const date = new Date(dateStr);
          const dayOfWeek = date.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Only count weekday holidays
            publicHolidaysInMonth++;
          }
        }
      });
      
      // Count approved leaves in current month (only weekdays)
      let approvedLeavesInMonth = 0;
      Object.keys(attendanceData).forEach(dateStr => {
        if (dateStr.startsWith(currentMonth)) {
          const attendance = attendanceData[dateStr];
          const status = typeof attendance === 'string' ? attendance : attendance?.status;
          if (status === 'leave') {
            const date = new Date(dateStr);
            const dayOfWeek = date.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Only count weekday leaves
              approvedLeavesInMonth++;
            }
          }
        }
      });
      
      // Adjust working days by subtracting holidays and leaves
      const adjustedWorkingDays = workingDaysInMonth - publicHolidaysInMonth - approvedLeavesInMonth;
      
      // Calculate remaining working days from today
      let remainingWorkingDays = 0;
      for (let d = now.getDate(); d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          remainingWorkingDays++;
        }
      }
      
      // Calculate required office days based on ADJUSTED working days
      let requiredOfficeDays;
      if (targetMode === 'percentage') {
        requiredOfficeDays = Math.ceil((monthlyTarget / 100) * adjustedWorkingDays);
      } else {
        requiredOfficeDays = monthlyTarget; // Fixed number of days
      }
      
      const daysRemaining = Math.max(0, requiredOfficeDays - officeCount);
      
      notifications.push({
        userId,
        token: userData.fcmToken,
        officeCount,
        daysRemaining,
        remainingWorkingDays
      });
    }

    console.log(`${day} Summary: Notifying ${notifications.length} users`);

    if (notifications.length === 0) {
      return { success: 0, failed: 0 };
    }

    const emoji = day === 'Monday' ? '📅' : '📊';
    
    // Send notifications via Expo Push Service
    let successCount = 0;
    let failureCount = 0;

    for (const notif of notifications) {
      try {
        // Create personalized message based on remaining days
        let body;
        if (notif.daysRemaining === 0) {
          body = `Great job! You've met your office target for this month (${notif.officeCount} days). Keep it up! 🎉`;
        } else if (notif.daysRemaining === 1) {
          body = `You need to come in 1 more day this month to meet your target. You've completed ${notif.officeCount} days so far. 💪`;
        } else {
          body = `You need to come in ${notif.daysRemaining} more days this month. You've completed ${notif.officeCount} days so far. Let's do this! 🚀`;
        }
        
        const result = await sendExpoPushNotification(notif.token, {
          title: `${emoji} ${day} Office Check`,
          body: body,
          data: {
            type: 'weekly_summary',
            day: day,
            officeCount: notif.officeCount,
            daysRemaining: notif.daysRemaining,
            action: 'open_stats'
          }
        });

        if (result.success) {
          successCount++;
        } else {
          failureCount++;
          console.error(`Failed to send to ${notif.userId}:`, result.error);
        }
      } catch (error) {
        failureCount++;
        console.error(`Error sending to ${notif.userId}:`, error);
      }
    }

    console.log(`✅ Sent ${successCount} notifications, ${failureCount} failures`);
    return { success: successCount, failed: failureCount };
  } catch (error) {
    console.error('Error sending weekly summary:', error);
    return null;
  }
}

/**
 * Database trigger: Send notification when user is detected near office
 * Triggers when nearOffice.detected changes to true
 * 
 * NOTE: This trigger may have reliability issues due to cross-region setup.
 * Use sendNearOfficeNotification HTTP endpoint as fallback.
 */
exports.onNearOfficeDetected = functions.database
  .ref('/users/{userId}/nearOffice')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const nearOfficeData = change.after.val();
    const previousData = change.before.val();
    
    // Only send notification if detected changed from false to true
    if (!nearOfficeData?.detected || previousData?.detected) {
      return null;
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Check if it's for today
    if (nearOfficeData.date !== today) {
      return null;
    }

    try {
      const db = admin.database();
      const userSnapshot = await db.ref(`users/${userId}`).get();
      
      if (!userSnapshot.exists()) {
        console.log('User not found:', userId);
        return null;
      }

      const userData = userSnapshot.val();
      
      // Check if user has FCM token
      if (!userData.fcmToken) {
        console.log('No FCM token for user:', userId);
        return null;
      }

      // Check if already logged today
      if (userData.attendanceData?.[today]) {
        console.log('Already logged for today, skipping notification');
        return null;
      }

      // Send notification via Expo Push Service
      const expoPushToken = userData.fcmToken;
      const message = {
        to: expoPushToken,
        sound: 'default',
        title: '📍 Near Office Detected',
        body: 'Tap to confirm office attendance, or use buttons to change.',
        data: { 
          type: 'location_confirmation',
          date: today,
          userId: userId,
          autoLog: 'office',  // Auto-log as office when notification body is tapped
          trackingMode: 'auto'
        },
        categoryId: 'ATTENDANCE_CATEGORY'
      };

      const https = require('https');
      const postData = JSON.stringify(message);

      const options = {
        hostname: 'exp.host',
        port: 443,
        path: '/--/api/v2/push/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            console.log('✅ Near office notification sent to:', userId);
            resolve(data);
          });
        });

        req.on('error', (error) => {
          console.error('❌ Error sending notification:', error);
          reject(error);
        });

        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('Error in onNearOfficeDetected:', error);
      return null;
    }
  });

/**
 * HTTP endpoint: Send notification when user is near office
 * Usage: POST with { userId: string }
 * This is a more reliable alternative to the database trigger
 */
exports.sendNearOfficeNotification = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const { userId } = req.body;
  
  if (!userId) {
    res.status(400).send('userId required');
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    const db = admin.database();
    const userSnapshot = await db.ref(`users/${userId}`).get();
    
    if (!userSnapshot.exists()) {
      res.status(404).send('User not found');
      return;
    }

    const userData = userSnapshot.val();
    
    // Check if user has FCM token
    if (!userData.fcmToken) {
      res.status(404).send('No FCM token for user');
      return;
    }

    // Check if already logged today
    if (userData.attendanceData?.[today]) {
      res.status(200).send({ message: 'Already logged today, skipping notification' });
      return;
    }

    // Send notification via Expo Push Service
    const expoPushToken = userData.fcmToken;
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: '📍 Near Office Detected',
      body: 'Tap to confirm office attendance, or use buttons to change.',
      data: { 
        type: 'location_confirmation',
        date: today,
        userId: userId,
        autoLog: 'office',
        trackingMode: 'auto'
      },
      categoryId: 'ATTENDANCE_CATEGORY'
    };

    const https = require('https');
    const postData = JSON.stringify(message);

    const options = {
      hostname: 'exp.host',
      port: 443,
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    await new Promise((resolve, reject) => {
      const req = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => { data += chunk; });
        apiRes.on('end', () => {
          console.log('✅ Near office notification sent to:', userId);
          res.status(200).send({ success: true, message: 'Notification sent', expoResponse: data });
          resolve();
        });
      });

      req.on('error', (error) => {
        console.error('❌ Error sending notification:', error);
        res.status(500).send({ success: false, error: error.message });
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});

/**
 * Scheduled function: Reset nearOffice flags at midnight (runs daily)
 */
exports.resetNearOfficeFlags = functions.pubsub
  .schedule('0 0 * * *') // Every day at midnight
  .timeZone('Australia/Sydney')
  .onRun(async (context) => {
    try {
      const db = admin.database();
      const usersRef = db.ref('users');
      const snapshot = await usersRef.once('value');
      const users = snapshot.val();

      if (!users) {
        console.log('No users found');
        return null;
      }

      const updates = {};
      let resetCount = 0;

      // Reset nearOffice flag for all users
      for (const userId of Object.keys(users)) {
        if (users[userId].nearOffice?.detected) {
          updates[`users/${userId}/nearOffice`] = {
            detected: false,
            timestamp: Date.now(),
            date: null
          };
          resetCount++;
        }
      }

      if (resetCount > 0) {
        await db.ref().update(updates);
        console.log(`✅ Reset nearOffice flags for ${resetCount} users`);
      } else {
        console.log('No nearOffice flags to reset');
      }

      return { resetCount };
    } catch (error) {
      console.error('Error resetting nearOffice flags:', error);
      return null;
    }
  });

/**
 * Helper: Remove invalid FCM tokens from database
 */
async function cleanupInvalidTokens(responses, tokens, userIds) {
  const db = admin.database();
  const updates = {};

  responses.forEach((response, idx) => {
    if (!response.success) {
      const error = response.error;
      // Remove token if it's invalid or not registered
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        const userId = userIds[idx];
        updates[`users/${userId}/fcmToken`] = null;
        console.log(`Removing invalid token for user ${userId}`);
      }
    }
  });

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    console.log(`Cleaned up ${Object.keys(updates).length} invalid tokens`);
  }
}

/**
 * HTTP endpoint: Trigger notification manually (for testing)
 * Usage: POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/sendTestNotification
 */
exports.sendTestNotification = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const { userId } = req.body;
  
  if (!userId) {
    res.status(400).send('userId required');
    return;
  }

  try {
    const db = admin.database();
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (!userData || !userData.fcmToken) {
      res.status(404).send('User or FCM token not found');
      return;
    }

    // Send via Expo Push Service
    const result = await sendExpoPushNotification(userData.fcmToken, {
      title: '🧪 Test Notification',
      body: 'This is a test notification from Firebase Cloud Functions!',
      data: {
        type: 'test',
        timestamp: Date.now().toString()
      }
    });

    if (result.success) {
      res.status(200).send({ success: true, message: 'Notification sent via Expo Push Service' });
    } else {
      res.status(500).send({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});

/**
 * =====================================================
 * USER HOLIDAY MIGRATION FUNCTIONS
 * =====================================================
 */

/**
 * Helper: Detect country from address using Google Geocoding API
 */
async function detectCountryFromAddress(address) {
  const GOOGLE_API_KEY = 'AIzaSyBsAxs-hOPqsrmMZ2SvcUW0zhm2RHbvtW0';
  
  if (!address || address.trim() === '') {
    console.warn('⚠️ Empty address provided, returning AU as fallback');
    return 'AU';
  }
  
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_API_KEY}`;
    console.log(`🌍 Geocoding address: "${address.substring(0, 50)}..."`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`📍 Geocoding API status: ${data.status}`);
    
    if (data.status === 'OK' && data.results && data.results[0]) {
      const addressComponents = data.results[0].address_components;
      
      // Find country code
      for (const component of addressComponents) {
        if (component.types.includes('country')) {
          const countryCode = component.short_name;
          const countryName = component.long_name;
          console.log(`✅ Detected country: ${countryCode} (${countryName})`);
          return countryCode; // Returns ISO code like 'AU', 'IN', 'US', 'NZ'
        }
      }
      console.warn(`⚠️ Country not found in address components for: "${address}"`);
    } else {
      console.error(`❌ Geocoding failed: ${data.status} - ${data.error_message || 'No error message'}`);
    }
    
    // Only fallback to AU if we truly couldn't detect
    console.warn(`⚠️ Falling back to AU for address: "${address}"`);
    return 'AU';
  } catch (error) {
    console.error(`❌ Error detecting country for "${address}":`, error.message);
    return 'AU';
  }
}

/**
 * Helper: Get holidays from Firestore for a country/year
 */
async function getHolidaysFromFirestore(countryCode, year) {
  try {
    const db = admin.firestore();
    const docRef = db.collection('holidays').doc(`${countryCode}_${year}`);
    const doc = await docRef.get();
    
    if (doc.exists) {
      return doc.data().holidays || {};
    }
    
    // If not in Firestore, try to sync it now
    const holidays = await syncCountryHolidays(countryCode, year);
    return holidays || {};
  } catch (error) {
    console.error(`Error getting holidays from Firestore for ${countryCode}:`, error);
    return {};
  }
}

/**
 * Helper: Fetch holidays from Nager.Date API with Calendarific fallback
 * Used by migration to bypass Firestore timeout issues
 * Tries Nager.Date first, falls back to Calendarific for unsupported countries (like India)
 */
async function fetchHolidaysFromAPI(countryCode, year) {
  // Try Nager.Date first
  try {
    const nagerUrl = `https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`;
    console.log(`   API call (Nager): ${nagerUrl}`);
    const nagerResponse = await fetch(nagerUrl);
    
    if (nagerResponse.ok) {
      const data = await nagerResponse.json();
      
      // Convert to our format: { "2026-01-01": "Holiday Name" }
      const holidays = {};
      data.forEach(holiday => {
        holidays[holiday.date] = holiday.localName || holiday.name;
      });
      
      if (Object.keys(holidays).length > 0) {
        console.log(`   ✅ Fetched ${Object.keys(holidays).length} holidays from Nager.Date for ${countryCode} ${year}`);
        return holidays;
      }
    }
    
    console.warn(`   ⚠️ Nager.Date returned no holidays for ${countryCode}, trying Calendarific...`);
  } catch (error) {
    console.warn(`   ⚠️ Nager.Date failed for ${countryCode}: ${error.message}, trying Calendarific...`);
  }
  
  // Fallback to Calendarific for unsupported countries
  try {
    const CALENDARIFIC_API_KEY = '6bEZNQYum41DfBjIvxzElAkI5pIMcQx7';
    const calendarificUrl = `https://calendarific.com/api/v2/holidays?api_key=${CALENDARIFIC_API_KEY}&country=${countryCode}&year=${year}`;
    console.log(`   API call (Calendarific): https://calendarific.com/api/v2/holidays?api_key=***&country=${countryCode}&year=${year}`);
    
    const calendarificResponse = await fetch(calendarificUrl);
    
    if (!calendarificResponse.ok) {
      console.warn(`   ⚠️ Calendarific returned ${calendarificResponse.status} for ${countryCode}`);
      return {};
    }
    
    const data = await calendarificResponse.json();
    
    if (data.response && data.response.holidays) {
      const holidays = {};
      data.response.holidays.forEach(holiday => {
        // Include National holidays and public holidays (for countries like India)
        const types = holiday.type || [];
        const isPublicHoliday = types.some(t => 
          t.toLowerCase().includes('national') || 
          t.toLowerCase().includes('public') ||
          t.toLowerCase() === 'gazetted holiday' ||
          t.toLowerCase() === 'restricted holiday'
        );
        
        if (isPublicHoliday) {
          holidays[holiday.date.iso] = holiday.name;
        }
      });
      
      console.log(`   ✅ Fetched ${Object.keys(holidays).length} holidays from Calendarific for ${countryCode} ${year}`);
      return holidays;
    }
    
    console.warn(`   ⚠️ No holidays found in Calendarific response for ${countryCode}`);
    return {};
  } catch (error) {
    console.error(`   ❌ Error fetching from Calendarific for ${countryCode}:`, error.message);
    return {};
  }
}

/**
 * Helper function to get country name from ISO code
 */
function getCountryName(countryCode) {
  const countryNames = {
    'AU': 'Australia',
    'NZ': 'New Zealand',
    'IN': 'India',
    'US': 'United States',
    'GB': 'United Kingdom',
    'CA': 'Canada',
    'SG': 'Singapore',
    'MY': 'Malaysia',
    'ID': 'Indonesia',
    'TH': 'Thailand',
    'PH': 'Philippines',
    'VN': 'Vietnam',
    'JP': 'Japan',
    'KR': 'South Korea',
    'CN': 'China',
    'DE': 'Germany',
    'FR': 'France',
    'IT': 'Italy',
    'ES': 'Spain',
    'NL': 'Netherlands',
    'BE': 'Belgium',
    'CH': 'Switzerland',
    'AT': 'Austria',
    'SE': 'Sweden',
    'NO': 'Norway',
    'DK': 'Denmark',
    'FI': 'Finland',
    'IE': 'Ireland',
    'PT': 'Portugal',
    'PL': 'Poland',
    'CZ': 'Czech Republic',
    'GR': 'Greece',
    'BR': 'Brazil',
    'MX': 'Mexico',
    'AR': 'Argentina',
    'CL': 'Chile',
    'CO': 'Colombia',
    'ZA': 'South Africa',
    'AE': 'United Arab Emirates',
    'SA': 'Saudi Arabia',
    'IL': 'Israel',
    'EG': 'Egypt',
    'NG': 'Nigeria',
    'KE': 'Kenya',
    'RU': 'Russia',
    'TR': 'Turkey',
    'UA': 'Ukraine'
  };
  return countryNames[countryCode] || countryCode;
}

/**
 * Generate flag emoji from ISO country code
 * Converts 2-letter ISO code to regional indicator symbols
 */
function getCountryFlag(isoCode) {
  if (!isoCode || isoCode.length !== 2) return '🌍';
  
  // Convert ISO code to regional indicator symbols (🇦-🇿)
  const codePoints = isoCode
    .toUpperCase()
    .split('')
    .map(char => 0x1F1E6 + char.charCodeAt(0) - 65);
  
  return String.fromCodePoint(...codePoints);
}

/**
 * MIGRATION FUNCTION: SAFE re-detection of country for ALL users
 * This fixes data corruption caused by previous invalid Google API key
 * 
 * SAFETY FEATURES:
 * - Dry-run mode: ?dryRun=true to preview changes without writing
 * - Per-user error handling: one failure won't stop others
 * - Detailed logging: logs every change made
 * - Validation: only updates if country detection succeeds
 * - Comprehensive updates: country, countryCode, countryName, holidays
 * 
 * Usage: 
 *   Dry run: POST /migrateUserHolidays?dryRun=true
 *   Real run: POST /migrateUserHolidays
 */
exports.migrateUserHolidays = functions.runWith({ timeoutSeconds: 540 }).https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  
  const dryRun = req.query.dryRun === 'true';
  
  // Return immediately to avoid HTTP timeout
  res.status(202).send({ 
    success: true, 
    dryRun: dryRun,
    message: dryRun 
      ? 'Dry run started - no data will be changed. Check logs for preview.' 
      : 'Migration started in background. Check logs for progress.' 
  });
  
  try {
    console.log(`🚀 Starting ${dryRun ? 'DRY RUN' : 'LIVE'} user holiday migration...`);
    console.log('📝 This migration re-detects countries using the NEW working Google API key');
    console.log('🔧 Fixes data corruption from previous invalid API key');
    
    const db = admin.database();
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.error('❌ No users found');
      return;
    }
    
    const results = {
      total: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      changes: []
    };
    
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    console.log(`👥 Found ${Object.keys(users).length} users to process`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Process each user
    for (const [userId, userData] of Object.entries(users)) {
      results.total++;
      
      try {
        // Skip if no company address
        if (!userData.userData || !userData.userData.companyAddress) {
          console.log(`⏭️  [${results.total}/${Object.keys(users).length}] Skipping ${userId}: No company address`);
          results.skipped++;
          continue;
        }
        
        const companyAddress = userData.userData.companyAddress;
        const oldCountry = userData.country || userData.userData?.country || 'unknown';
        
        // Detect country from address using NEW working API key
        const detectedCountry = await detectCountryFromAddress(companyAddress);
        
        if (!detectedCountry) {
          console.log(`⏭️  [${results.total}/${Object.keys(users).length}] Skipping ${userId}: Country detection failed for "${companyAddress}"`);
          results.skipped++;
          continue;
        }
        
        // Check if country changed or if required fields are missing
        const needsUpdate = 
          oldCountry !== detectedCountry || 
          !userData.userData?.countryCode || 
          !userData.userData?.countryName ||
          !userData.cachedHolidays;
        
        if (!needsUpdate) {
          console.log(`⏭️  [${results.total}/${Object.keys(users).length}] Skipping ${userId}: Already correct (${detectedCountry})`);
          results.skipped++;
          continue;
        }
        
        console.log(`🔍 [${results.total}/${Object.keys(users).length}] User ${userId}:`);
        console.log(`   Address: "${companyAddress}"`);
        console.log(`   Change: ${oldCountry} → ${detectedCountry}${oldCountry === detectedCountry ? ' (refreshing holidays)' : ''}`);
        
        // Fetch holidays directly from Nager.Date API (bypass Firestore to avoid timeout issues)
        console.log(`   Fetching holidays from API...`);
        const holidays2026 = await fetchHolidaysFromAPI(detectedCountry, currentYear);
        const holidays2027 = await fetchHolidaysFromAPI(detectedCountry, nextYear);
        
        console.log(`   Holidays: ${Object.keys(holidays2026).length} in ${currentYear}, ${Object.keys(holidays2027).length} in ${nextYear}`);
        
        if (!dryRun) {
          const cachedHolidays = {};
          const holidayLastUpdated = {};
          
          if (Object.keys(holidays2026).length > 0) {
            cachedHolidays[`${detectedCountry}_${currentYear}`] = holidays2026;
            holidayLastUpdated[`${detectedCountry}_${currentYear}`] = Date.now();
          }
          
          if (Object.keys(holidays2027).length > 0) {
            cachedHolidays[`${detectedCountry}_${nextYear}`] = holidays2027;
            holidayLastUpdated[`${detectedCountry}_${nextYear}`] = Date.now();
          }
          
          // Update BOTH root country and userData fields
          await db.ref(`users/${userId}`).update({
            country: detectedCountry,
            cachedHolidays: cachedHolidays,
            holidayLastUpdated: holidayLastUpdated
          });
          
          await db.ref(`users/${userId}/userData`).update({
            country: detectedCountry,
            countryCode: detectedCountry,
            countryName: getCountryName(detectedCountry),
            countryFlag: getCountryFlag(detectedCountry)
          });
          
          console.log(`   ✅ UPDATED in database`);
        } else {
          console.log(`   🔍 DRY RUN - no changes made`);
        }
        
        results.updated++;
        results.changes.push({
          userId,
          address: companyAddress,
          oldCountry,
          newCountry: detectedCountry,
          holidayCount: Object.keys(holidays2026).length
        });
        
        // Rate limiting: wait 300ms between users
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`❌ [${results.total}/${Object.keys(users).length}] Failed user ${userId}:`, error.message);
        results.failed++;
        // Continue to next user - don't let one failure stop migration
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🎉 Migration ${dryRun ? 'DRY RUN' : ''} complete!`);
    console.log(`📊 Results:`);
    console.log(`   Total users: ${results.total}`);
    console.log(`   ${dryRun ? 'Would update' : 'Updated'}: ${results.updated}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Failed: ${results.failed}`);
    
    if (results.changes.length > 0) {
      console.log(`\n📝 Changes ${dryRun ? 'that would be made' : 'made'}:`);
      results.changes.forEach(change => {
        console.log(`   • ${change.userId}: ${change.oldCountry} → ${change.newCountry} (${change.holidayCount} holidays)`);
      });
    }
    
    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN - no data was changed');
      console.log('🚀 To apply changes, run: POST /migrateUserHolidays (without dryRun parameter)');
    }
    
  } catch (error) {
    console.error('💥 Migration error:', error);
  }
});

/**
 * CALLABLE FUNCTION: Refresh holidays for a specific user
 * Called from the app when user taps "Refresh Holidays" button
 * 
 * This function:
 * 1. Gets the user's country from userData.country (set by onUserDataWrite)
 * 2. Fetches holidays from Nager.Date API for current and next year
 * 3. Updates cachedHolidays and holidayLastUpdated in Firebase
 * 
 * Usage from app: Call via HTTPS request with userId
 */
exports.refreshUserHolidays = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    const { userId } = req.body || req.query;
    
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    
    console.log(`🔄 Refreshing holidays for user ${userId}`);
    
    // Get user data to find their country
    const userSnapshot = await admin.database().ref(`users/${userId}`).once('value');
    const userData = userSnapshot.val();
    
    if (!userData) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    
    // Get country from userData (set by onUserDataWrite) or detect from address
    let country = userData.userData?.country;
    let countryName = userData.userData?.countryName;
    
    if (!country && userData.userData?.companyAddress) {
      // Detect country from address if not already set
      const detectedISO = await detectCountryFromAddress(userData.userData.companyAddress);
      const countryCodeMap = {
        'AU': 'australia', 'NZ': 'nz', 'GB': 'uk', 'IN': 'india',
        'US': 'usa', 'CA': 'canada', 'SG': 'singapore', 'MY': 'malaysia',
        'ID': 'indonesia', 'TH': 'thailand', 'PH': 'philippines', 'VN': 'vietnam',
        'JP': 'japan', 'KR': 'south korea', 'CN': 'china', 'HK': 'hong kong',
        'DE': 'germany', 'FR': 'france', 'IT': 'italy', 'ES': 'spain',
        'NL': 'netherlands', 'BE': 'belgium', 'CH': 'switzerland', 'AT': 'austria',
        'SE': 'sweden', 'NO': 'norway', 'DK': 'denmark', 'FI': 'finland',
        'IE': 'ireland', 'PT': 'portugal', 'PL': 'poland', 'CZ': 'czech republic',
        'BR': 'brazil', 'MX': 'mexico', 'ZA': 'south africa', 'AE': 'uae'
      };
      country = countryCodeMap[detectedISO] || detectedISO.toLowerCase();
      countryName = getCountryName(detectedISO);
    }
    
    if (!country) {
      res.status(400).json({ success: false, error: 'No country found for user. Please set company address first.' });
      return;
    }
    
    // Convert country to ISO code for API
    const countryToISO = {
      'australia': 'AU', 'nz': 'NZ', 'uk': 'GB', 'india': 'IN',
      'usa': 'US', 'canada': 'CA', 'singapore': 'SG', 'malaysia': 'MY',
      'indonesia': 'ID', 'thailand': 'TH', 'philippines': 'PH', 'vietnam': 'VN',
      'japan': 'JP', 'south korea': 'KR', 'china': 'CN', 'hong kong': 'HK',
      'germany': 'DE', 'france': 'FR', 'italy': 'IT', 'spain': 'ES',
      'netherlands': 'NL', 'belgium': 'BE', 'switzerland': 'CH', 'austria': 'AT',
      'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
      'ireland': 'IE', 'portugal': 'PT', 'poland': 'PL', 'czech republic': 'CZ',
      'brazil': 'BR', 'mexico': 'MX', 'south africa': 'ZA', 'uae': 'AE'
    };
    const isoCode = countryToISO[country] || country.toUpperCase();
    
    console.log(`🌍 User country: ${country} (${isoCode})`);
    
    // Fetch holidays for current and next year
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    const holidays2026 = await fetchHolidaysFromAPI(isoCode, currentYear);
    const holidays2027 = await fetchHolidaysFromAPI(isoCode, nextYear);
    
    const cachedHolidays = {};
    const holidayLastUpdated = {};
    
    // Use normalized country code for cache keys
    if (Object.keys(holidays2026).length > 0) {
      cachedHolidays[`${country}_${currentYear}`] = holidays2026;
      holidayLastUpdated[`${country}_${currentYear}`] = Date.now();
    }
    
    if (Object.keys(holidays2027).length > 0) {
      cachedHolidays[`${country}_${nextYear}`] = holidays2027;
      holidayLastUpdated[`${country}_${nextYear}`] = Date.now();
    }
    
    // Update Firebase
    await admin.database().ref(`users/${userId}`).update({
      cachedHolidays,
      holidayLastUpdated
    });
    
    // Also update userData if country wasn't set
    if (!userData.userData?.country || !userData.userData?.countryName) {
      await admin.database().ref(`users/${userId}/userData`).update({
        country,
        countryName: countryName || getCountryName(isoCode)
      });
    }
    
    const totalHolidays = Object.keys(holidays2026).length + Object.keys(holidays2027).length;
    console.log(`✅ Refreshed ${totalHolidays} holidays for ${country}`);
    
    res.json({
      success: true,
      country,
      countryName: countryName || getCountryName(isoCode),
      holidaysUpdated: totalHolidays,
      years: [currentYear, nextYear]
    });
    
  } catch (error) {
    console.error('❌ Error refreshing holidays:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DATABASE TRIGGER: Auto-sync holidays when user adds company address
 * This handles new users in v3.0.1 who complete onboarding
 */
exports.onUserDataWrite = functions.database
  .ref('/users/{userId}/userData')
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const newData = change.after.val();
    const oldData = change.before.val();
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🔔 onUserDataWrite TRIGGERED for user ${userId}`);
    console.log(`📦 New data:`, JSON.stringify(newData || {}, null, 2));
    console.log(`📦 Old data:`, JSON.stringify(oldData || {}, null, 2));
    console.log('═══════════════════════════════════════════════════════════');
    
    // Only process if companyAddress exists
    if (!newData || !newData.companyAddress) {
      console.log(`⏭️ No companyAddress for user ${userId}, skipping`);
      return null;
    }
    
    // Skip if address didn't change AND country already matches
    // This prevents infinite loops when we update userData.country below
    if (oldData && oldData.companyAddress === newData.companyAddress && oldData.country === newData.country) {
      console.log(`⏭️ Address and country unchanged for user ${userId}, skipping`);
      return null;
    }
    
    try {
      const companyAddress = newData.companyAddress;
      console.log(`🔄 Auto-syncing holidays for user ${userId} with address: "${companyAddress}"`);
      
      // Detect country from new address
      const detectedCountry = await detectCountryFromAddress(companyAddress);
      console.log(`🌍 Detected country: ${detectedCountry} for user ${userId}`);
      
      // Convert to lowercase for COUNTRY_DATA compatibility in app
      // App uses lowercase keys: 'australia', 'uk', 'india', 'usa', 'canada', 'nz'
      const countryCodeMap = {
        'AU': 'australia',
        'NZ': 'nz',
        'GB': 'uk',
        'IN': 'india',
        'US': 'usa',
        'CA': 'canada',
        'SG': 'singapore'
      };
      const normalizedCountry = countryCodeMap[detectedCountry] || detectedCountry.toLowerCase();
      console.log(`🔄 Normalized country: ${detectedCountry} → ${normalizedCountry}`);
      
      // Fetch holidays for current and next year
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      
      console.log(`📅 Fetching holidays for ${detectedCountry}: ${currentYear}, ${nextYear}`);
      
      // Use direct API fetch to avoid Firestore timeout issues
      const holidays2026 = await fetchHolidaysFromAPI(detectedCountry, currentYear);
      const holidays2027 = await fetchHolidaysFromAPI(detectedCountry, nextYear);
      
      const cachedHolidays = {};
      const holidayLastUpdated = {};
      
      // Use normalized country code for cache keys (lowercase for app compatibility)
      if (Object.keys(holidays2026).length > 0) {
        cachedHolidays[`${normalizedCountry}_${currentYear}`] = holidays2026;
        holidayLastUpdated[`${normalizedCountry}_${currentYear}`] = Date.now();
        console.log(`📆 Added ${Object.keys(holidays2026).length} holidays for ${normalizedCountry}_${currentYear}`);
      } else {
        console.warn(`⚠️ No holidays found for ${detectedCountry}_${currentYear}`);
      }
      
      if (Object.keys(holidays2027).length > 0) {
        cachedHolidays[`${normalizedCountry}_${nextYear}`] = holidays2027;
        holidayLastUpdated[`${normalizedCountry}_${nextYear}`] = Date.now();
        console.log(`📆 Added ${Object.keys(holidays2027).length} holidays for ${normalizedCountry}_${nextYear}`);
      } else {
        console.warn(`⚠️ No holidays found for ${detectedCountry}_${nextYear}`);
      }
      
      // Write holidays to root level
      const updates = {};
      updates[`cachedHolidays`] = cachedHolidays;
      updates[`holidayLastUpdated`] = holidayLastUpdated;
      
      await admin.database().ref(`users/${userId}`).update(updates);
      
      // Get human-readable country name for UI display
      const countryFullName = getCountryName(detectedCountry);
      
      // Also update userData.country and countryName if changed
      // This will trigger this function again, but the address check above will skip it
      if (newData.country !== normalizedCountry || newData.countryName !== countryFullName) {
        console.log(`📝 Updating userData: country ${newData.country} → ${normalizedCountry}, countryName → ${countryFullName}`);
        await admin.database().ref(`users/${userId}/userData`).update({
          country: normalizedCountry,
          countryName: countryFullName
        });
      }
      
      console.log(`✅ Auto-synced holidays for user ${userId}:`);
      console.log(`   - Country: ${normalizedCountry} (${countryFullName})`);
      console.log(`   - Holiday sets: ${Object.keys(cachedHolidays).length}`);
      console.log(`   - Total holidays: ${Object.keys(holidays2026).length + Object.keys(holidays2027).length}`);
      
      return null;
    } catch (error) {
      console.error(`❌ Error auto-syncing holidays for user ${userId}:`, error.message);
      console.error(error.stack);
      return null;
    }
  });


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
const fetch = require('node-fetch');

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
 * HOLIDAY SYNC FUNCTIONS
 * =====================================================
 */

// API Keys
const CALENDARIFIC_API_KEY = '6bEZNQYum41DfBjIvxzElAkI5pIMcQx7';

// Countries supported by Nager.Date API (119 countries)
const NAGER_SUPPORTED_COUNTRIES = [
  'AD', 'AL', 'AM', 'AR', 'AT', 'AU', 'AX', 'BA', 'BB', 'BE', 'BG', 'BJ', 'BO', 'BR', 'BS', 'BW', 'BY', 'BZ', 
  'CA', 'CD', 'CG', 'CH', 'CL', 'CN', 'CO', 'CR', 'CU', 'CY', 'CZ', 'DE', 'DK', 'DO', 'EC', 'EE', 'EG', 'ES', 
  'FI', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GG', 'GH', 'GI', 'GL', 'GM', 'GR', 'GT', 'GY', 'HK', 'HN', 'HR', 
  'HT', 'HU', 'ID', 'IE', 'IM', 'IS', 'IT', 'JE', 'JM', 'JP', 'KE', 'KR', 'KZ', 'LI', 'LS', 'LT', 'LU', 'LV', 
  'MA', 'MC', 'MD', 'ME', 'MG', 'MK', 'MN', 'MS', 'MT', 'MX', 'MZ', 'NA', 'NE', 'NG', 'NI', 'NL', 'NO', 'NZ', 
  'PA', 'PE', 'PG', 'PH', 'PL', 'PR', 'PT', 'PY', 'RO', 'RS', 'RU', 'SE', 'SG', 'SI', 'SJ', 'SK', 'SM', 'SR', 
  'SV', 'TN', 'TR', 'UA', 'US', 'UY', 'VA', 'VE', 'VN', 'ZA', 'ZW'
];

// High-priority countries to sync (add more as needed)
const PRIORITY_COUNTRIES = [
  'AU', 'IN', 'US', 'GB', 'CA', 'BR', 'JP', 'CN', 'DE', 'FR', 'IT', 'ES', 
  'NZ', 'SG', 'MY', 'PH', 'ID', 'TH', 'VN', 'KR', 'AE', 'SA', 'ZA', 'NG'
];

/**
 * Fetch holidays from Nager.Date API
 */
async function fetchFromNagerDate(countryCode, year) {
  try {
    const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`);
    
    if (!response.ok) {
      return null;
    }
    
    const holidays = await response.json();
    const holidayData = {};
    
    holidays
      .filter(holiday => holiday.types && holiday.types.includes('Public'))
      .forEach(holiday => {
        holidayData[holiday.date] = holiday.name;
      });
    
    return holidayData;
  } catch (error) {
    console.error(`Nager.Date error for ${countryCode}:`, error.message);
    return null;
  }
}

/**
 * Fetch holidays from Calendarific API
 */
async function fetchFromCalendarific(countryCode, year) {
  try {
    const response = await fetch(
      `https://calendarific.com/api/v2/holidays?api_key=${CALENDARIFIC_API_KEY}&country=${countryCode}&year=${year}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (!data.response || !data.response.holidays) {
      return null;
    }
    
    const holidayData = {};
    
    data.response.holidays
      .filter(holiday => 
        holiday.type && (
          holiday.type.includes('National holiday') ||
          holiday.type.includes('Public holiday') ||
          holiday.type.includes('Federal Holiday')
        )
      )
      .forEach(holiday => {
        holidayData[holiday.date.iso] = holiday.name;
      });
    
    return holidayData;
  } catch (error) {
    console.error(`Calendarific error for ${countryCode}:`, error.message);
    return null;
  }
}

/**
 * Sync holidays for a specific country and year
 */
async function syncCountryHolidays(countryCode, year) {
  console.log(`Syncing holidays for ${countryCode} ${year}...`);
  
  let holidays = null;
  let source = null;
  
  // Try Nager.Date first (free, no rate limits)
  if (NAGER_SUPPORTED_COUNTRIES.includes(countryCode)) {
    holidays = await fetchFromNagerDate(countryCode, year);
    if (holidays && Object.keys(holidays).length > 0) {
      source = 'nager';
    }
  }
  
  // Fallback to Calendarific if Nager.Date failed
  if (!holidays) {
    holidays = await fetchFromCalendarific(countryCode, year);
    if (holidays && Object.keys(holidays).length > 0) {
      source = 'calendarific';
    }
  }
  
  if (!holidays || Object.keys(holidays).length === 0) {
    console.log(`No holidays found for ${countryCode} ${year}`);
    return null;
  }
  
  // Store in Firestore
  const db = admin.firestore();
  const docRef = db.collection('holidays').doc(`${countryCode}_${year}`);
  
  await docRef.set({
    countryCode,
    year,
    holidays,
    source,
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    holidayCount: Object.keys(holidays).length
  });
  
  console.log(`✅ Synced ${Object.keys(holidays).length} holidays for ${countryCode} ${year} from ${source}`);
  return holidays;
}

/**
 * Scheduled function: Sync holidays for all priority countries
 * Runs on the 1st of every month at 2 AM
 */
exports.syncAllHolidays = functions.pubsub
  .schedule('0 2 1 * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting monthly holiday sync...');
    
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const results = { success: 0, failed: 0 };
    
    // Sync priority countries for current and next year
    for (const country of PRIORITY_COUNTRIES) {
      try {
        await syncCountryHolidays(country, currentYear);
        await syncCountryHolidays(country, nextYear);
        results.success += 2;
        
        // Rate limiting: wait 1 second between countries
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to sync ${country}:`, error.message);
        results.failed += 2;
      }
    }
    
    console.log(`Holiday sync complete: ${results.success} synced, ${results.failed} failed`);
    return results;
  });

/**
 * HTTP function: Manually trigger holiday sync for specific country
 * Usage: POST /syncHolidays with body: { countryCode: 'IN', year: 2026 }
 */
exports.syncHolidays = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  
  try {
    const { countryCode, year } = req.body;
    
    if (!countryCode) {
      res.status(400).send({ error: 'countryCode is required' });
      return;
    }
    
    const yearToSync = year || new Date().getFullYear();
    const holidays = await syncCountryHolidays(countryCode, yearToSync);
    
    if (holidays) {
      res.status(200).send({ 
        success: true, 
        countryCode, 
        year: yearToSync,
        holidayCount: Object.keys(holidays).length,
        holidays 
      });
    } else {
      res.status(404).send({ 
        success: false, 
        error: 'No holidays found for this country' 
      });
    }
  } catch (error) {
    console.error('Error syncing holidays:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});

/**
 * HTTP function: Get holidays from Firestore
 * Usage: GET /getHolidays?countryCode=IN&year=2026
 */
exports.getHolidays = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  
  try {
    const countryCode = req.query.countryCode;
    const year = req.query.year || new Date().getFullYear();
    
    if (!countryCode) {
      res.status(400).send({ error: 'countryCode query parameter is required' });
      return;
    }
    
    const db = admin.firestore();
    const docRef = db.collection('holidays').doc(`${countryCode}_${year}`);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      // Try to sync on-demand
      console.log(`Cache miss for ${countryCode} ${year}, syncing now...`);
      const holidays = await syncCountryHolidays(countryCode, year);
      
      if (holidays) {
        res.status(200).send({ 
          success: true, 
          countryCode, 
          year,
          holidays,
          cached: false
        });
      } else {
        res.status(404).send({ 
          success: false, 
          error: 'No holidays available for this country' 
        });
      }
      return;
    }
    
    const data = doc.data();
    res.status(200).send({ 
      success: true, 
      countryCode, 
      year,
      holidays: data.holidays,
      source: data.source,
      syncedAt: data.syncedAt,
      cached: true
    });
  } catch (error) {
    console.error('Error getting holidays:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});


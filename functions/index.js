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
 * Helper: Send reminder to users in manual mode who haven't logged today
 */
async function sendReminderToManualUsers({ title, body, time }) {
  try {
    // Check if today is a weekend
    const now = new Date();
    if (isWeekend(now)) {
      console.log(`${time} Reminder: Skipping - today is a weekend`);
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

    const today = new Date().toISOString().split('T')[0];
    const tokens = [];
    const userIds = [];

    // Find users in manual mode who haven't logged today
    for (const [userId, userData] of Object.entries(users)) {
      // Check if user is in manual mode
      if (userData.settings?.trackingMode === 'manual' && userData.fcmToken) {
        // Check if today is a public holiday for this user
        const isHoliday = userData.cachedHolidays?.[today];
        if (isHoliday) {
          console.log(`Skipping ${userId}: Today is a public holiday (${isHoliday})`);
          continue;
        }

        // Check if user has already logged today
        const attendance = userData.attendanceData?.[today];
        if (!attendance) {
          tokens.push(userData.fcmToken);
          userIds.push(userId);
        }
      }
    }

    console.log(`${time} Reminder: Found ${tokens.length} users to notify`);

    if (tokens.length === 0) {
      return null;
    }

    // Send notification to all eligible users
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        type: 'manual_reminder',
        time: time,
        action: 'open_app'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'reminders',
          sound: 'default',
          color: '#4F46E5',
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          }
        }
      }
    };

    // Send to all tokens (batch send)
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      ...message
    });

    console.log(`✅ Sent ${response.successCount} notifications, ${response.failureCount} failures`);
    
    // Clean up invalid tokens
    if (response.failureCount > 0) {
      await cleanupInvalidTokens(response.responses, tokens, userIds);
    }

    return { success: response.successCount, failed: response.failureCount };
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
    // Check if today is a weekend
    const now = new Date();
    if (isWeekend(now)) {
      console.log(`${time} Auto Reminder: Skipping - today is a weekend`);
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

    const today = new Date().toISOString().split('T')[0];
    const tokens = [];
    const userIds = [];

    // Find users in AUTO mode who haven't logged today
    for (const [userId, userData] of Object.entries(users)) {
      // Check if user is in auto mode
      if (userData.settings?.trackingMode === 'auto' && userData.fcmToken) {
        // Check if today is a public holiday for this user
        const isHoliday = userData.cachedHolidays?.[today];
        if (isHoliday) {
          console.log(`Skipping ${userId}: Today is a public holiday (${isHoliday})`);
          continue;
        }

        // Check if user has already logged today
        const attendance = userData.attendanceData?.[today];
        if (!attendance) {
          tokens.push(userData.fcmToken);
          userIds.push(userId);
        }
      }
    }

    console.log(`${time} Auto Reminder: Found ${tokens.length} users to notify`);

    if (tokens.length === 0) {
      return null;
    }

    // Send notification to all eligible users
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        type: 'auto_reminder',
        time: time,
        action: 'open_app'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'reminders',
          sound: 'default',
          color: '#4F46E5',
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          }
        }
      }
    };

    // Send to all tokens (batch send)
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      ...message
    });

    console.log(`✅ Sent ${response.successCount} auto notifications, ${response.failureCount} failures`);
    
    // Clean up invalid tokens
    if (response.failureCount > 0) {
      await cleanupInvalidTokens(response.responses, tokens, userIds);
    }

    return { success: response.successCount, failed: response.failureCount };
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

    // Calculate summary for each user
    for (const [userId, userData] of Object.entries(users)) {
      if (!userData.fcmToken) continue;

      // Skip if today is a public holiday for this user
      const isHoliday = userData.cachedHolidays?.[today];
      if (isHoliday) {
        console.log(`Skipping ${userId}: Today is a public holiday (${isHoliday})`);
        continue;
      }

      // Count office and remote days from attendanceData
      const attendanceData = userData.attendanceData || {};
      let officeCount = 0;
      let remoteCount = 0;
      
      // Filter attendance for current month
      Object.keys(attendanceData).forEach(dateStr => {
        if (dateStr.startsWith(currentMonth)) {
          const location = attendanceData[dateStr];
          if (location === 'office') officeCount++;
          else if (location === 'wfh' || location === 'remote') remoteCount++;
        }
      });
      
      tokens.push(userData.fcmToken);
      userIds.push(userId);
    }

    console.log(`${day} Summary: Notifying ${tokens.length} users`);

    if (tokens.length === 0) {
      return null;
    }

    const emoji = day === 'Monday' ? '📅' : '📊';
    const message = {
      notification: {
        title: `${emoji} ${day} Check-in`,
        body: `Time to review your week! Check your office attendance stats.`,
      },
      data: {
        type: 'weekly_summary',
        day: day,
        action: 'open_stats'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'reminders',
          sound: 'default',
          color: '#4F46E5',
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          }
        }
      }
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      ...message
    });

    console.log(`✅ Sent ${response.successCount} notifications, ${response.failureCount} failures`);
    
    if (response.failureCount > 0) {
      await cleanupInvalidTokens(response.responses, tokens, userIds);
    }

    return { success: response.successCount, failed: response.failureCount };
  } catch (error) {
    console.error('Error sending weekly summary:', error);
    return null;
  }
}

/**
 * Database trigger: Send notification when user is detected near office
 * Triggers when nearOffice.detected changes to true
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
        body: 'We detected you near your office. Where are you working today?',
        data: { 
          type: 'location_confirmation',
          date: today,
          userId: userId
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

    const message = {
      notification: {
        title: '🧪 Test Notification',
        body: 'This is a test notification from Firebase Cloud Functions!',
      },
      data: {
        type: 'test',
        timestamp: Date.now().toString()
      },
      token: userData.fcmToken
    };

    await admin.messaging().send(message);
    res.status(200).send({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});

/**
 * Firebase Cloud Messaging Script
 * Sends push notification to all users to update to version 2.2.1
 * 
 * Usage: node send_update_notification.js
 * 
 * Prerequisites:
 * 1. Download service account key from Firebase Console:
 *    Project Settings > Service Accounts > Generate New Private Key
 * 2. Save as 'serviceAccountKey.json' in project root
 * 3. Install dependencies: npm install firebase-admin
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
try {
  const serviceAccount = require('./serviceAccountKey.json');
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
  
  console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  console.log('\n📝 Please download your service account key:');
  console.log('   1. Go to Firebase Console > Project Settings > Service Accounts');
  console.log('   2. Click "Generate New Private Key"');
  console.log('   3. Save as "serviceAccountKey.json" in project root\n');
  process.exit(1);
}

/**
 * Send update notification to all users
 */
async function sendUpdateNotification() {
  try {
    console.log('🚀 Starting notification send process...\n');
    
    const db = admin.database();
    const usersRef = db.ref('users');
    
    // Get all users with FCM tokens
    const snapshot = await usersRef.once('value');
    const users = snapshot.val();
    
    if (!users) {
      console.log('⚠️  No users found in database');
      return;
    }
    
    const tokens = [];
    const userCount = Object.keys(users).length;
    
    // Collect all FCM tokens
    Object.entries(users).forEach(([userId, userData]) => {
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });
    
    console.log(`📊 Total users: ${userCount}`);
    console.log(`📱 Users with FCM tokens: ${tokens.length}\n`);
    
    if (tokens.length === 0) {
      console.log('⚠️  No FCM tokens found. Users need to grant notification permissions.');
      return;
    }
    
    // Prepare notification payload
    const message = {
      notification: {
        title: '🎉 Update Available - Version 2.2.1',
        body: 'Important fixes & new features! Tap to update now.',
      },
      data: {
        type: 'app_update',
        version: '2.2.1',
        iosUrl: 'https://apps.apple.com/app/hybrid-office-tracker/id6754510381',
        androidUrl: 'https://play.google.com/store/apps/details?id=com.officetrack.app',
        // Will be handled by app to open correct store based on platform
        action: 'open_store'
      },
      // Platform-specific configurations
      android: {
        priority: 'high',
        notification: {
          channelId: 'app_updates',
          sound: 'default',
          color: '#4F46E5',
          icon: 'notification_icon',
          tag: 'app_update_2.2.1', // Prevents duplicate notifications
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            category: 'APP_UPDATE',
          }
        },
        headers: {
          'apns-priority': '10',
        }
      }
    };
    
    // Send to all tokens in batches (FCM limit: 500 tokens per request)
    const batchSize = 500;
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      console.log(`📤 Sending batch ${Math.floor(i / batchSize) + 1} (${batch.length} tokens)...`);
      
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: batch,
          ...message
        });
        
        successCount += response.successCount;
        failureCount += response.failureCount;
        
        // Log failed tokens for debugging
        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              console.log(`   ⚠️  Failed token ${i + idx + 1}: ${resp.error?.code || 'Unknown error'}`);
            }
          });
        }
      } catch (error) {
        console.error(`   ❌ Batch send error:`, error.message);
        failureCount += batch.length;
      }
      
      // Add small delay between batches to avoid rate limiting
      if (i + batchSize < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n📊 Notification Send Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   📱 Total attempted: ${tokens.length}`);
    console.log(`   📈 Success rate: ${((successCount / tokens.length) * 100).toFixed(1)}%\n`);
    
    console.log('✨ Notification campaign completed!\n');
    
  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    throw error;
  }
}

/**
 * Schedule notification for 10 AM
 * Note: For production, use Cloud Functions or Cloud Scheduler instead
 */
function scheduleNotification() {
  const now = new Date();
  const scheduledTime = new Date();
  scheduledTime.setHours(10, 0, 0, 0); // 10:00 AM
  
  // If 10 AM has passed today, schedule for tomorrow
  if (now > scheduledTime) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }
  
  const delay = scheduledTime - now;
  const hours = Math.floor(delay / (1000 * 60 * 60));
  const minutes = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));
  
  console.log(`⏰ Notification scheduled for: ${scheduledTime.toLocaleString()}`);
  console.log(`   (in ${hours}h ${minutes}m)\n`);
  
  setTimeout(() => {
    console.log('⏰ Sending scheduled notification at 10:00 AM...\n');
    sendUpdateNotification()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Error:', err);
        process.exit(1);
      });
  }, delay);
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

console.log('═══════════════════════════════════════════════════════');
console.log('   OfficeTrack - Update Notification Sender v2.2.1');
console.log('═══════════════════════════════════════════════════════\n');

if (command === '--now') {
  console.log('🚀 Sending notification immediately...\n');
  sendUpdateNotification()
    .then(() => {
      console.log('✅ Done!');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Error:', err);
      process.exit(1);
    });
} else if (command === '--schedule') {
  scheduleNotification();
} else {
  console.log('Usage:');
  console.log('  node send_update_notification.js --now        # Send immediately');
  console.log('  node send_update_notification.js --schedule   # Schedule for 10 AM');
  console.log('\n💡 Tip: For production scheduling, use Firebase Cloud Functions with Cloud Scheduler\n');
  process.exit(0);
}

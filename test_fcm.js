#!/usr/bin/env node

/**
 * Test script for Firebase Cloud Messaging setup
 * Tests notification delivery to a specific user
 * 
 * Usage: node test_fcm.js <userId>
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
try {
  const serviceAccount = require('./serviceAccountKey.json');
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
  
  console.log('✅ Firebase Admin initialized\n');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  process.exit(1);
}

async function testFCM(userId) {
  try {
    console.log(`📱 Testing FCM for user: ${userId}\n`);
    
    // Get user data
    const db = admin.database();
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();
    
    if (!userData) {
      console.error('❌ User not found in database');
      process.exit(1);
    }
    
    console.log('User Data:');
    console.log('  Platform:', userData.platform || 'Unknown');
    console.log('  Device:', userData.deviceModel || 'Unknown');
    console.log('  Tracking Mode:', userData.settings?.trackingMode || 'Not set');
    console.log('  Notifications Enabled:', userData.settings?.notificationsEnabled || false);
    console.log('  FCM Token:', userData.fcmToken ? '✅ Present' : '❌ Missing');
    console.log();
    
    if (!userData.fcmToken) {
      console.error('❌ No FCM token found for this user');
      console.log('\nTroubleshooting:');
      console.log('1. Open the app on your device');
      console.log('2. Grant notification permissions');
      console.log('3. Wait for app to register FCM token');
      console.log('4. Check logs in app for "FCM token registered"');
      process.exit(1);
    }
    
    // Send test notification
    console.log('📤 Sending test notification...\n');
    
    const message = {
      notification: {
        title: '🧪 Test Notification',
        body: 'If you see this, Firebase Cloud Messaging is working! 🎉',
      },
      data: {
        type: 'test',
        timestamp: Date.now().toString(),
        source: 'test_script'
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
      },
      token: userData.fcmToken
    };
    
    const result = await admin.messaging().send(message);
    console.log('✅ Notification sent successfully!');
    console.log('   Message ID:', result);
    console.log('\n📱 Check your device for the notification');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      console.log('\n⚠️  FCM token is invalid or expired');
      console.log('Solutions:');
      console.log('1. Uninstall and reinstall the app');
      console.log('2. FCM token will be regenerated on next launch');
      console.log('3. Try again after app registers new token');
    }
    
    process.exit(1);
  }
}

// Get userId from command line
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node test_fcm.js <userId>');
  console.log('\nTo find your userId:');
  console.log('1. Open Firebase Console > Realtime Database');
  console.log('2. Navigate to /users');
  console.log('3. Copy your user ID from the database');
  console.log('\nExample: node test_fcm.js user_abc123');
  process.exit(1);
}

testFCM(userId);

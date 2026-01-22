const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function testManualNotification() {
  const userId = 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb';
  
  console.log('📤 Testing manual 10 AM notification...\n');
  
  // Get user data
  const userSnapshot = await db.ref(`users/${userId}`).once('value');
  const userData = userSnapshot.val();
  
  if (!userData) {
    console.log('❌ User not found!');
    return;
  }
  
  const fcmToken = userData.fcmToken;
  const trackingMode = userData.userData?.trackingMode;
  
  console.log('User ID:', userId);
  console.log('Device:', userData.deviceModel);
  console.log('Tracking Mode:', trackingMode);
  console.log('FCM Token:', fcmToken ? fcmToken.substring(0, 40) + '...' : 'None');
  
  if (trackingMode !== 'manual') {
    console.log('\n⚠️ User is not in manual mode! Current mode:', trackingMode);
    return;
  }
  
  if (!fcmToken) {
    console.log('\n❌ No FCM token found!');
    return;
  }
  
  // Send notification via Expo Push Service
  console.log('\n📤 Sending test notification via Expo Push Service...');
  
  const message = {
    to: fcmToken,
    sound: 'default',
    title: '🏢 Time to Log Your Attendance',
    body: 'Are you in the office today? Log your attendance now!',
    data: {
      type: 'manual_reminder',
      time: '10AM_TEST',
    },
    categoryId: 'ATTENDANCE_CATEGORY',
    priority: 'high',
  };
  
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    const result = await response.json();
    console.log('\n✅ Notification sent!');
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.data?.status === 'ok') {
      console.log('\n🎉 SUCCESS! Check your iPhone 17 Pro Max for the notification.');
    } else {
      console.log('\n⚠️ Unexpected response:', result);
    }
  } catch (error) {
    console.error('\n❌ Error sending notification:', error);
  }
  
  process.exit(0);
}

testManualNotification().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

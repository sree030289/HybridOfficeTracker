const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function checkRealUsers() {
  console.log('🔍 Checking which devices have triggered geofencing...\n');
  console.log('='.repeat(80));
  
  const usersSnapshot = await db.ref('users').once('value');
  const users = usersSnapshot.val();
  
  let realUsersWithGeofencing = 0;
  const testDeviceIds = [
    'iPhone_11_Pro_Max_1767877443924_k2aocjo2x',  // Test device 1
    'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb'   // Your device
  ];
  
  for (const [userId, userData] of Object.entries(users)) {
    const userIdLower = userId.toLowerCase();
    const isIos = userIdLower.startsWith('iphone') || userIdLower.startsWith('ipad');
    const hasNearOffice = !!userData.nearOffice;
    
    if (isIos && hasNearOffice) {
      const isTestDevice = testDeviceIds.includes(userId);
      
      console.log(isTestDevice ? '🧪 TEST DEVICE:' : '✅ REAL USER:');
      console.log('  User ID:', userId);
      console.log('  Device:', userData.deviceModel || 'Unknown');
      console.log('  Has FCM Token:', !!userData.fcmToken);
      console.log('  NearOffice Date:', userData.nearOffice.date);
      console.log('  Triggered At:', new Date(userData.nearOffice.timestamp).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
      console.log('');
      
      if (!isTestDevice) realUsersWithGeofencing++;
    }
  }
  
  console.log('='.repeat(80));
  console.log('Real production users with geofencing:', realUsersWithGeofencing);
  
  if (realUsersWithGeofencing === 0) {
    console.log('\n⚠️  NO REAL USERS have triggered geofencing yet!');
    console.log('All geofencing triggers are from test devices only.');
    console.log('\n💡 Why?');
    console.log('  - Only 5 iOS users have updated to 3.0.0 (out of 70 total iOS users)');
    console.log('  - Of those 5, only 4 are in auto mode');
    console.log('  - Of those 4, only 2 are test devices (yours + iPhone 11)');
    console.log('  - The other 2 real users haven\'t been to the office yet since updating');
    console.log('\n📊 Real production users in auto mode with 3.0.0:');
    
    // Find the real users
    for (const [userId, userData] of Object.entries(users)) {
      const userIdLower = userId.toLowerCase();
      const isIos = userIdLower.startsWith('iphone') || userIdLower.startsWith('ipad');
      const trackingMode = userData.userData?.trackingMode;
      const hasFcmToken = !!userData.fcmToken;
      const isTestDevice = testDeviceIds.includes(userId);
      
      if (isIos && trackingMode === 'auto' && hasFcmToken && !isTestDevice) {
        console.log('  -', userData.deviceModel || userId);
        console.log('    Updated:', userData.fcmTokenUpdatedAt ? new Date(userData.fcmTokenUpdatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Unknown');
      }
    }
  } else {
    console.log('\n✅', realUsersWithGeofencing, 'real users have successfully triggered geofencing!');
  }
  
  process.exit(0);
}

checkRealUsers().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

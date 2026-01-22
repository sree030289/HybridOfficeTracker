const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function checkiOSUsersWithoutToken() {
  console.log('🔍 Checking today\'s iOS users without FCM tokens...\n');
  
  const todayiOSUsers = [
    'iPhone_16_1769062880961_0ji07e4m0',
    'iPhone_14_Pro_1769048255054_lc51tgcpm',
    'iPhone_16_Pro_1769047557256_derpvkb10'
  ];
  
  for (const userId of todayiOSUsers) {
    const snapshot = await db.ref(`users/${userId}`).once('value');
    const userData = snapshot.val();
    
    console.log(`📱 ${userId}`);
    console.log('═'.repeat(80));
    console.log('FCM Token:', userData.fcmToken || '❌ MISSING');
    console.log('Platform:', userData.userData?.platform || 'Not set');
    console.log('Tracking Mode:', userData.userData?.trackingMode);
    console.log('App Version:', userData.appVersion || 'Not recorded');
    console.log('Last Active:', userData.lastActive ? new Date(userData.lastActive).toLocaleString('en-AU') : 'Never');
    console.log('Notifications Enabled:', userData.userData?.notificationsEnabled);
    
    if (!userData.fcmToken) {
      console.log('\n⚠️  WHY NO TOKEN:');
      console.log('   Possible reasons:');
      console.log('   1. User denied notification permission');
      console.log('   2. FCM token registration failed');
      console.log('   3. User closed app before token could register');
      console.log('   4. Network issue during token registration');
    }
    
    console.log('\n');
  }
  
  process.exit(0);
}

checkiOSUsersWithoutToken().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

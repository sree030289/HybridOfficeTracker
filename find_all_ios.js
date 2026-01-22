const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function findAllIosDevices() {
  console.log('🔍 Finding ALL iOS devices in database...\n');
  console.log('='.repeat(80));
  
  const usersSnapshot = await db.ref('users').once('value');
  const allUsers = usersSnapshot.val();
  
  if (!allUsers) {
    console.log('❌ No users found');
    return;
  }
  
  const iosDevices = [];
  const platformCounts = {};
  
  for (const [userId, userData] of Object.entries(allUsers)) {
    const platform = userData.platform;
    const deviceModel = userData.deviceModel;
    const userIdLower = userId.toLowerCase();
    
    // Count platforms
    platformCounts[platform || 'undefined'] = (platformCounts[platform || 'undefined'] || 0) + 1;
    
    // Identify iOS devices by:
    // 1. platform === 'ios'
    // 2. deviceModel contains iPhone/iPad
    // 3. userId starts with iPhone/iPad
    const isIos = platform === 'ios' || 
                  (deviceModel && (deviceModel.includes('iPhone') || deviceModel.includes('iPad'))) ||
                  (userIdLower.startsWith('iphone') || userIdLower.startsWith('ipad'));
    
    if (isIos) {
      iosDevices.push({
        userId,
        deviceModel: deviceModel || 'Unknown',
        platform: platform || 'Not set',
        trackingMode: userData.userData?.trackingMode || 'Not set',
        hasNearOffice: !!userData.nearOffice,
        hasFcmToken: !!userData.fcmToken,
        fcmTokenUpdated: userData.fcmTokenUpdatedAt ? new Date(userData.fcmTokenUpdatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Never'
      });
    }
  }
  
  console.log('\n📊 PLATFORM DISTRIBUTION');
  console.log('-'.repeat(80));
  Object.entries(platformCounts).sort((a, b) => b[1] - a[1]).forEach(([platform, count]) => {
    console.log(`${platform}: ${count}`);
  });
  
  console.log('\n📱 ALL iOS DEVICES FOUND: ' + iosDevices.length);
  console.log('='.repeat(80));
  
  // Separate by tracking mode
  const autoMode = iosDevices.filter(d => d.trackingMode === 'auto');
  const manualMode = iosDevices.filter(d => d.trackingMode === 'manual');
  const noMode = iosDevices.filter(d => d.trackingMode === 'Not set');
  
  console.log('\n🔄 AUTO MODE iOS DEVICES: ' + autoMode.length);
  console.log('-'.repeat(80));
  autoMode.forEach((device, i) => {
    const status = device.hasNearOffice ? '✅ Geofencing working' : '❌ No geofence yet';
    console.log(`${i + 1}. ${device.deviceModel} (${status})`);
    console.log(`   User ID: ${device.userId}`);
    console.log(`   Platform field: ${device.platform}`);
    console.log(`   FCM Token: ${device.hasFcmToken ? 'Yes' : 'No'}`);
    console.log(`   Last updated: ${device.fcmTokenUpdated}`);
    console.log('');
  });
  
  console.log('\n✋ MANUAL MODE iOS DEVICES: ' + manualMode.length);
  console.log('-'.repeat(80));
  manualMode.forEach((device, i) => {
    console.log(`${i + 1}. ${device.deviceModel}`);
    console.log(`   User ID: ${device.userId}`);
    console.log(`   Platform field: ${device.platform}`);
    console.log(`   FCM Token: ${device.hasFcmToken ? 'Yes' : 'No'}`);
    console.log(`   Last updated: ${device.fcmTokenUpdated}`);
    console.log('');
  });
  
  if (noMode.length > 0) {
    console.log('\n⚠️  iOS DEVICES WITHOUT TRACKING MODE: ' + noMode.length);
    console.log('-'.repeat(80));
    noMode.forEach((device, i) => {
      console.log(`${i + 1}. ${device.deviceModel}`);
      console.log(`   User ID: ${device.userId}`);
      console.log('');
    });
  }
  
  // Summary stats
  const yesterday = Date.now() - (24 * 60 * 60 * 1000);
  const recentlyUpdated = iosDevices.filter(d => {
    if (d.fcmTokenUpdated === 'Never') return false;
    const updateDate = new Date(d.fcmTokenUpdated.split(',')[0].split('/').reverse().join('-'));
    return updateDate.getTime() > yesterday;
  });
  
  console.log('\n📊 SUMMARY');
  console.log('='.repeat(80));
  console.log('Total iOS devices:', iosDevices.length);
  console.log('Auto mode:', autoMode.length, `(${Math.round(autoMode.length/iosDevices.length*100)}%)`);
  console.log('Manual mode:', manualMode.length, `(${Math.round(manualMode.length/iosDevices.length*100)}%)`);
  console.log('With FCM tokens:', iosDevices.filter(d => d.hasFcmToken).length);
  console.log('Auto mode with geofencing:', autoMode.filter(d => d.hasNearOffice).length, `of ${autoMode.length}`);
  console.log('Updated in last 24h:', recentlyUpdated.length);
  
  console.log('\n' + '='.repeat(80));
  process.exit(0);
}

findAllIosDevices().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

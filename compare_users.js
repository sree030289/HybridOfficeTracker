const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function compareUsers() {
  console.log('🔍 Comparing Fresh Install vs Upgraded User\n');
  console.log('=' .repeat(80));
  
  // Fresh install user (iPhone 11) - HAS nearOffice working
  const freshUserId = 'iPhone_11_Pro_Max_1767877443924_k2aocjo2x';
  // Upgraded user (iPhone 17) - NO nearOffice not working
  const upgradedUserId = 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb';
  
  const freshSnapshot = await db.ref(`users/${freshUserId}`).once('value');
  const upgradedSnapshot = await db.ref(`users/${upgradedUserId}`).once('value');
  
  const freshData = freshSnapshot.val();
  const upgradedData = upgradedSnapshot.val();
  
  console.log('\n📱 FRESH INSTALL (iPhone 11)');
  console.log('-'.repeat(80));
  console.log('✅ Has fcmToken:', !!freshData?.fcmToken);
  console.log('✅ Has companyLocation:', !!freshData?.userData?.companyLocation);
  console.log('✅ Tracking Mode:', freshData?.userData?.trackingMode);
  console.log('✅ Has nearOffice field:', !!freshData?.nearOffice);
  console.log('✅ Onboarding complete:', freshData?.userData?.onboardingComplete);
  console.log('✅ Platform:', freshData?.platform);
  console.log('✅ Device Model:', freshData?.deviceModel);
  console.log('✅ OS Version:', freshData?.osVersion);
  
  if (freshData?.nearOffice) {
    console.log('\n📍 Fresh nearOffice data:');
    console.log(JSON.stringify(freshData.nearOffice, null, 2));
  }
  
  console.log('\n\n📱 UPGRADED USER (iPhone 17)');
  console.log('-'.repeat(80));
  console.log('✅ Has fcmToken:', !!upgradedData?.fcmToken);
  console.log('✅ Has companyLocation:', !!upgradedData?.userData?.companyLocation);
  console.log('✅ Tracking Mode:', upgradedData?.userData?.trackingMode);
  console.log('❌ Has nearOffice field:', !!upgradedData?.nearOffice);
  console.log('✅ Onboarding complete:', upgradedData?.userData?.onboardingComplete);
  console.log('✅ Platform:', upgradedData?.platform);
  console.log('✅ Device Model:', upgradedData?.deviceModel);
  console.log('✅ OS Version:', upgradedData?.osVersion);
  
  if (upgradedData?.nearOffice) {
    console.log('\n📍 Upgraded nearOffice data:');
    console.log(JSON.stringify(upgradedData.nearOffice, null, 2));
  }
  
  console.log('\n\n🔍 KEY DIFFERENCES');
  console.log('='.repeat(80));
  
  // Check if both have company location coordinates
  const freshCoords = freshData?.userData?.companyLocation;
  const upgradedCoords = upgradedData?.userData?.companyLocation;
  
  if (freshCoords && upgradedCoords) {
    console.log('\n📍 Company Location Coordinates:');
    console.log('Fresh:    ', JSON.stringify(freshCoords));
    console.log('Upgraded: ', JSON.stringify(upgradedCoords));
    console.log('Match:', JSON.stringify(freshCoords) === JSON.stringify(upgradedCoords) ? '✅' : '❌');
  }
  
  // Check FCM token format
  console.log('\n🔔 FCM Token Format:');
  console.log('Fresh:    ', freshData?.fcmToken?.substring(0, 30) + '...');
  console.log('Upgraded: ', upgradedData?.fcmToken?.substring(0, 30) + '...');
  
  // Check data structure differences
  console.log('\n📊 Data Structure:');
  console.log('Fresh root keys:    ', Object.keys(freshData || {}).sort());
  console.log('Upgraded root keys: ', Object.keys(upgradedData || {}).sort());
  
  // Check if upgraded user has old settings structure
  console.log('\n⚙️ Settings Structure:');
  console.log('Fresh has settings node:    ', !!freshData?.settings);
  console.log('Upgraded has settings node: ', !!upgradedData?.settings);
  
  if (upgradedData?.settings) {
    console.log('\n⚠️ FOUND OLD SETTINGS STRUCTURE IN UPGRADED USER!');
    console.log('Settings:', JSON.stringify(upgradedData.settings, null, 2));
  }
  
  // Check userData structure
  console.log('\n👤 userData Structure:');
  const freshUserDataKeys = Object.keys(freshData?.userData || {}).sort();
  const upgradedUserDataKeys = Object.keys(upgradedData?.userData || {}).sort();
  
  console.log('Fresh userData keys:    ', freshUserDataKeys);
  console.log('Upgraded userData keys: ', upgradedUserDataKeys);
  
  // Find keys that are different
  const missingInFresh = upgradedUserDataKeys.filter(k => !freshUserDataKeys.includes(k));
  const missingInUpgraded = freshUserDataKeys.filter(k => !upgradedUserDataKeys.includes(k));
  
  if (missingInUpgraded.length > 0) {
    console.log('\n❌ Keys MISSING in upgraded user:', missingInUpgraded);
  }
  if (missingInFresh.length > 0) {
    console.log('\n⚠️ Extra keys in upgraded user:', missingInFresh);
  }
  
  // Check attendance records (could indicate app usage)
  const freshAttendance = freshData?.attendance || {};
  const upgradedAttendance = upgradedData?.attendance || {};
  
  console.log('\n📅 Attendance Records:');
  console.log('Fresh:    ', Object.keys(freshAttendance).length, 'days');
  console.log('Upgraded: ', Object.keys(upgradedAttendance).length, 'days');
  
  // Check last app update timestamp
  console.log('\n⏰ FCM Token Updates:');
  console.log('Fresh updated:    ', freshData?.fcmTokenUpdatedAt ? new Date(freshData.fcmTokenUpdatedAt).toLocaleString() : 'Never');
  console.log('Upgraded updated: ', upgradedData?.fcmTokenUpdatedAt ? new Date(upgradedData.fcmTokenUpdatedAt).toLocaleString() : 'Never');
  
  console.log('\n\n💡 HYPOTHESIS:');
  console.log('='.repeat(80));
  
  if (!upgradedData?.nearOffice && freshData?.nearOffice) {
    console.log('❌ Upgraded user never triggered geofencing');
    console.log('✅ Fresh user successfully triggered geofencing');
    console.log('\nPossible causes:');
    console.log('1. App never opened after upgrade (geofencing not started)');
    console.log('2. Location permissions not granted after upgrade');
    console.log('3. User hasn\'t physically entered office since upgrade');
    console.log('4. Geofencing registration failed silently on upgrade');
    console.log('5. AsyncStorage corruption preventing geofence registration');
  }
  
  // Check if there's a migration flag
  console.log('\n🔄 Migration Status:');
  console.log('Fresh has migration flag:    ', !!freshData?.userData?.migrationCompleted);
  console.log('Upgraded has migration flag: ', !!upgradedData?.userData?.migrationCompleted);
  
  if (upgradedData?.userData?.migrationCompleted) {
    console.log('Migration timestamp:', new Date(upgradedData.userData.migrationCompleted).toLocaleString());
  }
  
  process.exit(0);
}

compareUsers().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function listAllUsers() {
  const snapshot = await db.ref('users').once('value');
  const users = snapshot.val();
  
  if (!users) {
    console.log('❌ No users found');
    return;
  }
  
  console.log(`📊 Found ${Object.keys(users).length} users:\n`);
  
  for (const [userId, userData] of Object.entries(users)) {
    console.log('─'.repeat(80));
    console.log(`👤 User: ${userId}`);
    console.log(`   Device: ${userData.deviceModel || 'Unknown'}`);
    console.log(`   Platform: ${userData.platform || 'Unknown'}`);
    console.log(`   Tracking Mode: ${userData.userData?.trackingMode || 'Not set'}`);
    console.log(`   FCM Token: ${userData.fcmToken ? userData.fcmToken.substring(0, 30) + '...' : 'None'}`);
    console.log(`   Has nearOffice: ${!!userData.nearOffice ? '✅ YES' : '❌ NO'}`);
    console.log(`   Onboarding Complete: ${userData.userData?.onboardingComplete || 'Unknown'}`);
    console.log(`   Last FCM Update: ${userData.fcmTokenUpdatedAt ? new Date(userData.fcmTokenUpdatedAt).toLocaleString() : 'Never'}`);
    
    if (userData.nearOffice) {
      console.log(`   📍 nearOffice data: ${JSON.stringify(userData.nearOffice)}`);
    }
    
    const attendanceCount = userData.attendanceData ? Object.keys(userData.attendanceData).length : 0;
    console.log(`   Attendance Records: ${attendanceCount} days`);
  }
  
  console.log('\n' + '='.repeat(80));
  
  process.exit(0);
}

listAllUsers().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

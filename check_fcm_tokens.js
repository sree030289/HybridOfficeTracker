const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function checkFCMTokens() {
  console.log('🔍 Checking FCM tokens for all users...\n');
  
  const snapshot = await db.ref('users').once('value');
  const users = snapshot.val();
  
  if (!users) {
    console.log('❌ No users found');
    return;
  }
  
  let totalUsers = 0;
  let manualModeUsers = 0;
  let usersWithTokens = 0;
  let manualUsersWithTokens = 0;
  let manualUsersWithoutTokens = [];
  
  const today = new Date().toISOString().split('T')[0];
  
  console.log('📊 FCM Token Analysis:\n');
  console.log('═'.repeat(80));
  
  for (const [userId, userData] of Object.entries(users)) {
    totalUsers++;
    const trackingMode = userData.userData?.trackingMode;
    const fcmToken = userData.fcmToken;
    const hasLoggedToday = userData.attendanceData?.[today];
    
    if (trackingMode === 'manual') {
      manualModeUsers++;
      
      if (fcmToken && fcmToken.startsWith('ExponentPushToken')) {
        manualUsersWithTokens++;
        usersWithTokens++;
        console.log(`✅ ${userId.substring(0, 30)}...`);
        console.log(`   Mode: ${trackingMode} | Token: ${fcmToken.substring(0, 40)}...`);
        console.log(`   Logged today: ${hasLoggedToday ? '✅ YES' : '❌ NO'}`);
        console.log('');
      } else {
        manualUsersWithoutTokens.push({ userId, fcmToken });
        console.log(`⚠️  ${userId.substring(0, 30)}...`);
        console.log(`   Mode: ${trackingMode} | Token: ${fcmToken || 'MISSING'}`);
        console.log(`   Logged today: ${hasLoggedToday ? 'YES' : 'NO'}`);
        console.log('');
      }
    } else if (fcmToken && fcmToken.startsWith('ExponentPushToken')) {
      usersWithTokens++;
    }
  }
  
  console.log('═'.repeat(80));
  console.log('\n📈 SUMMARY:\n');
  console.log(`Total Users: ${totalUsers}`);
  console.log(`Users with FCM Tokens: ${usersWithTokens}`);
  console.log(`\nManual Mode Users: ${manualModeUsers}`);
  console.log(`Manual users WITH valid tokens: ${manualUsersWithTokens}`);
  console.log(`Manual users WITHOUT tokens: ${manualUsersWithoutTokens.length}`);
  
  if (manualUsersWithoutTokens.length > 0) {
    console.log('\n⚠️  MANUAL MODE USERS WITHOUT TOKENS:');
    manualUsersWithoutTokens.forEach(u => {
      console.log(`   - ${u.userId} (token: ${u.fcmToken || 'NONE'})`);
    });
  }
  
  console.log('\n💡 CLOUD FUNCTION BEHAVIOR:');
  console.log(`   - send10AMReminder should notify ${manualUsersWithTokens} users at 10 AM`);
  console.log(`   - send1PMReminder should notify ${manualUsersWithTokens} users at 1 PM`);
  console.log(`   - send4PMReminder should notify ${manualUsersWithTokens} users at 4 PM`);
  console.log(`   - (Only if they haven't logged attendance yet)`);
  
  console.log('\n🌏 TIMEZONE:');
  console.log(`   - Cloud Functions run in: Australia/Sydney (AEST/AEDT)`);
  console.log(`   - Current time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
  
  process.exit(0);
}

checkFCMTokens().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

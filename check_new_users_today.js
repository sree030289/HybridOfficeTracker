const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function checkNewUsersToday() {
  console.log('🔍 Checking new users who installed the app today (Jan 22, 2026)...\n');
  
  const snapshot = await db.ref('users').once('value');
  const users = snapshot.val();
  
  if (!users) {
    console.log('❌ No users found');
    return;
  }
  
  // Today's date in YYYY-MM-DD format
  const today = '2026-01-22';
  const todayStart = new Date('2026-01-22T00:00:00Z').getTime();
  const todayEnd = new Date('2026-01-23T00:00:00Z').getTime();
  
  const newUsersToday = [];
  const existingUsers = [];
  
  for (const [userId, userData] of Object.entries(users)) {
    // Extract timestamp from user ID (format: DeviceModel_TIMESTAMP_randomid)
    const parts = userId.split('_');
    let userCreatedTimestamp = null;
    
    // Find the timestamp part (13 digits)
    for (const part of parts) {
      if (part.length === 13 && !isNaN(part)) {
        userCreatedTimestamp = parseInt(part);
        break;
      }
    }
    
    if (userCreatedTimestamp) {
      const userCreatedDate = new Date(userCreatedTimestamp).toISOString().split('T')[0];
      
      if (userCreatedTimestamp >= todayStart && userCreatedTimestamp < todayEnd) {
        newUsersToday.push({
          userId,
          timestamp: userCreatedTimestamp,
          createdDate: userCreatedDate,
          createdTime: new Date(userCreatedTimestamp).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
          deviceModel: parts[0],
          platform: userData.userData?.platform || (userId.includes('iPhone') || userId.includes('iPad') ? 'ios' : 'android'),
          trackingMode: userData.userData?.trackingMode || 'unknown',
          companyName: userData.userData?.companyName || 'Not set',
          country: userData.userData?.country || 'Not set',
          hasFCMToken: !!userData.fcmToken,
          hasAttendance: !!(userData.attendanceData && Object.keys(userData.attendanceData).length > 0)
        });
      } else {
        existingUsers.push(userId);
      }
    }
  }
  
  // Sort by timestamp (most recent first)
  newUsersToday.sort((a, b) => b.timestamp - a.timestamp);
  
  // Count by platform
  const iosUsers = newUsersToday.filter(u => u.platform === 'ios');
  const androidUsers = newUsersToday.filter(u => u.platform === 'android');
  
  console.log('📊 NEW USERS INSTALLED TODAY (Jan 22, 2026)');
  console.log('═'.repeat(100));
  console.log(`Total: ${newUsersToday.length} new installations`);
  console.log(`iOS: ${iosUsers.length} users`);
  console.log(`Android: ${androidUsers.length} users`);
  console.log('');
  
  if (newUsersToday.length === 0) {
    console.log('❌ No new installations today yet.');
    console.log('   Last installation was before Jan 22, 2026');
    console.log('');
  } else {
    console.log('📱 NEW iOS USERS:');
    console.log('─'.repeat(100));
    iosUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.deviceModel}`);
      console.log(`   User ID: ${user.userId}`);
      console.log(`   Installed: ${user.createdTime}`);
      console.log(`   Company: ${user.companyName}`);
      console.log(`   Mode: ${user.trackingMode}`);
      console.log(`   FCM Token: ${user.hasFCMToken ? '✅' : '❌'}`);
      console.log(`   Has logged attendance: ${user.hasAttendance ? '✅' : '❌'}`);
      console.log('');
    });
    
    console.log('🤖 NEW ANDROID USERS:');
    console.log('─'.repeat(100));
    if (androidUsers.length === 0) {
      console.log('   No Android installations yet');
      console.log('');
    } else {
      androidUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.deviceModel}`);
        console.log(`   User ID: ${user.userId}`);
        console.log(`   Installed: ${user.createdTime}`);
        console.log(`   Company: ${user.companyName}`);
        console.log(`   Mode: ${user.trackingMode}`);
        console.log(`   FCM Token: ${user.hasFCMToken ? '✅' : '❌'}`);
        console.log(`   Has logged attendance: ${user.hasAttendance ? '✅' : '❌'}`);
        console.log('');
      });
    }
  }
  
  console.log('📈 TRACKING MODE BREAKDOWN:');
  console.log('─'.repeat(100));
  const manualMode = newUsersToday.filter(u => u.trackingMode === 'manual').length;
  const autoMode = newUsersToday.filter(u => u.trackingMode === 'auto').length;
  const unknown = newUsersToday.filter(u => u.trackingMode === 'unknown').length;
  console.log(`Manual Mode: ${manualMode} users`);
  console.log(`Auto Mode: ${autoMode} users`);
  console.log(`Not configured yet: ${unknown} users`);
  console.log('');
  
  console.log('🔔 NOTIFICATION STATUS:');
  console.log('─'.repeat(100));
  const withTokens = newUsersToday.filter(u => u.hasFCMToken).length;
  const withoutTokens = newUsersToday.filter(u => !u.hasFCMToken).length;
  console.log(`Ready to receive notifications: ${withTokens} users`);
  console.log(`Not yet registered: ${withoutTokens} users`);
  console.log('');
  
  console.log('📊 OVERALL STATS:');
  console.log('─'.repeat(100));
  console.log(`Total users in database: ${Object.keys(users).length}`);
  console.log(`Existing users (before today): ${existingUsers.length}`);
  console.log(`New users today: ${newUsersToday.length}`);
  console.log(`Growth rate: ${((newUsersToday.length / existingUsers.length) * 100).toFixed(2)}% daily growth`);
  
  process.exit(0);
}

checkNewUsersToday().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

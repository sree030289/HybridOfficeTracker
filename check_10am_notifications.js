const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function check10AMNotifications() {
  try {
    console.log('\n📊 Checking 10 AM Notification Stats for January 14, 2026...\n');
    
    // Get all users
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('No users found in database');
      return;
    }
    
    const today = new Date('2026-01-14');
    const todayDateStr = today.toISOString().split('T')[0]; // 2026-01-14
    
    let totalUsers = 0;
    let iosUsers = 0;
    let iosManualModeUsers = 0;
    let iosManualWithToken = 0;
    let iosManualLoggedToday = 0;
    let iosManualEligibleFor10AM = 0;
    
    const eligibleUsers = [];
    const loggedBeforeNotification = [];
    
    for (const [userId, userData] of Object.entries(users)) {
      totalUsers++;
      
      // Check if iOS (by platform field, deviceModel, or userId)
      const isIOS = userData.platform === 'ios' || 
                    (userData.deviceModel && (
                      userData.deviceModel.toLowerCase().includes('iphone') || 
                      userData.deviceModel.toLowerCase().includes('ipad')
                    )) ||
                    userId.includes('iPhone') || 
                    userId.includes('iPad');
      
      if (!isIOS) continue;
      
      iosUsers++;
      
      // Check tracking mode
      const trackingMode = userData.userData?.trackingMode;
      if (trackingMode !== 'manual') continue;
      
      iosManualModeUsers++;
      
      // Check FCM token
      const hasFCMToken = !!userData.fcmToken;
      if (hasFCMToken) {
        iosManualWithToken++;
      }
      
      // Check if logged today
      const attendanceRecords = userData.attendanceRecords || {};
      const todayRecord = attendanceRecords[todayDateStr];
      
      if (todayRecord) {
        iosManualLoggedToday++;
        
        // Check if logged before 10 AM (which is 23:00 UTC on Jan 13)
        const logTime = todayRecord.timestamp;
        if (logTime) {
          const logDate = new Date(logTime);
          const tenAMSydney = new Date('2026-01-14T10:00:00+11:00'); // 10 AM AEDT
          
          if (logDate < tenAMSydney) {
            loggedBeforeNotification.push({
              userId: userId.substring(0, 30),
              deviceModel: userData.deviceModel || 'Unknown',
              logTime: logDate.toISOString(),
              status: todayRecord.status
            });
          }
        }
      }
      
      // User is eligible for 10 AM notification if:
      // 1. Manual mode
      // 2. Has FCM token (updated to 3.0.0)
      // 3. NOT logged before 10 AM
      const loggedBefore10AM = todayRecord && todayRecord.timestamp && 
                               new Date(todayRecord.timestamp) < new Date('2026-01-14T10:00:00+11:00');
      
      if (hasFCMToken && !loggedBefore10AM) {
        iosManualEligibleFor10AM++;
        eligibleUsers.push({
          userId: userId.substring(0, 30),
          deviceModel: userData.deviceModel || 'Unknown',
          fcmToken: userData.fcmToken ? '✅' : '❌',
          loggedToday: todayRecord ? '✅' : '❌',
          loggedBefore10AM: loggedBefore10AM ? '✅' : '❌'
        });
      }
    }
    
    console.log('=== iOS User Statistics ===');
    console.log(`Total Users: ${totalUsers}`);
    console.log(`iOS Users: ${iosUsers}`);
    console.log(`iOS Manual Mode Users: ${iosManualModeUsers}`);
    console.log(`iOS Manual with FCM Token (v3.0.0): ${iosManualWithToken}`);
    console.log(`iOS Manual Logged Today: ${iosManualLoggedToday}`);
    console.log(`iOS Manual Logged BEFORE 10 AM: ${loggedBeforeNotification.length}`);
    console.log(`\n🎯 iOS Manual Eligible for 10 AM Notification: ${iosManualEligibleFor10AM}`);
    
    if (eligibleUsers.length > 0) {
      console.log('\n=== Eligible Users (should receive 10 AM notification) ===');
      eligibleUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.deviceModel}`);
        console.log(`   User ID: ${user.userId}...`);
        console.log(`   FCM Token: ${user.fcmToken}`);
        console.log(`   Logged Today: ${user.loggedToday}`);
        console.log(`   Logged Before 10AM: ${user.loggedBefore10AM}`);
      });
    }
    
    if (loggedBeforeNotification.length > 0) {
      console.log('\n=== Users Who Logged BEFORE 10 AM (skipped notification) ===');
      loggedBeforeNotification.forEach((user, index) => {
        console.log(`${index + 1}. ${user.deviceModel}`);
        console.log(`   User ID: ${user.userId}...`);
        console.log(`   Logged at: ${new Date(user.logTime).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
        console.log(`   Status: ${user.status}`);
      });
    }
    
    console.log('\n📝 Summary:');
    console.log(`Expected notifications sent: ${iosManualEligibleFor10AM}`);
    console.log(`Users who logged before 10 AM (skipped): ${loggedBeforeNotification.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

check10AMNotifications();

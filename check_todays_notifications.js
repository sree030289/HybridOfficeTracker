const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function checkNotificationsSentToday() {
  try {
    console.log('\n📊 Checking notifications sent today (January 15, 2026)...\n');
    
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found');
      process.exit(0);
      return;
    }
    
    const today = '2026-01-15';
    const now = new Date();
    const currentHour = now.getHours();
    
    // 10 AM is 23:00 UTC (Jan 14) in AEDT (UTC+11)
    // 1 PM is 02:00 UTC (Jan 15) in AEDT
    const tenAMSydney = new Date('2026-01-15T10:00:00+11:00');
    const onePMSydney = new Date('2026-01-15T13:00:00+11:00');
    
    let totalUsers = 0;
    let iosUsers = 0;
    let manualModeUsers = 0;
    let manualWithFCM = 0;
    
    let eligible10AM = 0;
    let eligible1PM = 0;
    let loggedBefore10AM = 0;
    let loggedBefore1PM = 0;
    
    const eligible10AMUsers = [];
    const eligible1PMUsers = [];
    const loggedUsers = [];
    
    for (const [userId, userData] of Object.entries(users)) {
      totalUsers++;
      
      // Check if iOS
      const isIOS = userData.platform === 'ios' || 
                    (userData.deviceModel && (
                      userData.deviceModel.toLowerCase().includes('iphone') || 
                      userData.deviceModel.toLowerCase().includes('ipad')
                    )) ||
                    userId.includes('iPhone') || 
                    userId.includes('iPad');
      
      if (isIOS) iosUsers++;
      
      // Check tracking mode (now everyone should have userData after repair)
      const trackingMode = userData.userData?.trackingMode || userData.settings?.trackingMode;
      
      if (trackingMode === 'manual') {
        manualModeUsers++;
        
        if (userData.fcmToken) {
          manualWithFCM++;
          
          // Check if logged today
          const todayRecord = userData.attendanceData?.[today];
          
          if (todayRecord) {
            const logTime = todayRecord.timestamp ? new Date(todayRecord.timestamp) : null;
            
            loggedUsers.push({
              userId: userId.substring(0, 30),
              deviceModel: userData.deviceModel || 'Unknown',
              logTime: logTime ? logTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'unknown',
              status: todayRecord.status || todayRecord,
              loggedBefore10AM: logTime ? logTime < tenAMSydney : false,
              loggedBefore1PM: logTime ? logTime < onePMSydney : false
            });
            
            if (logTime && logTime < tenAMSydney) {
              loggedBefore10AM++;
            }
            if (logTime && logTime < onePMSydney) {
              loggedBefore1PM++;
            }
          }
          
          // Eligible for 10 AM if not logged before 10 AM
          const loggedBefore10 = todayRecord && todayRecord.timestamp && 
                                 new Date(todayRecord.timestamp) < tenAMSydney;
          
          if (!loggedBefore10) {
            eligible10AM++;
            eligible10AMUsers.push({
              userId: userId.substring(0, 30),
              deviceModel: userData.deviceModel || 'Unknown',
              fcmToken: userData.fcmToken.substring(0, 30) + '...',
              logged: todayRecord ? '✅' : '❌',
              companyName: userData.userData?.companyName || 'Not set'
            });
          }
          
          // Eligible for 1 PM if not logged before 1 PM
          const loggedBefore1 = todayRecord && todayRecord.timestamp && 
                                new Date(todayRecord.timestamp) < onePMSydney;
          
          if (!loggedBefore1) {
            eligible1PM++;
            eligible1PMUsers.push({
              userId: userId.substring(0, 30),
              deviceModel: userData.deviceModel || 'Unknown',
              fcmToken: userData.fcmToken.substring(0, 30) + '...',
              logged: todayRecord ? '✅' : '❌',
              companyName: userData.userData?.companyName || 'Not set'
            });
          }
        }
      }
    }
    
    console.log('=== User Statistics ===');
    console.log(`Total Users: ${totalUsers}`);
    console.log(`iOS Users: ${iosUsers}`);
    console.log(`Manual Mode Users: ${manualModeUsers}`);
    console.log(`Manual Mode with FCM Token (v3.0.0): ${manualWithFCM}`);
    
    console.log('\n=== Today\'s Activity (Jan 15, 2026) ===');
    console.log(`Users logged today: ${loggedUsers.length}`);
    console.log(`Logged before 10 AM: ${loggedBefore10AM}`);
    console.log(`Logged before 1 PM: ${loggedBefore1PM}`);
    
    console.log('\n=== 10 AM Notification (scheduled for 10:00 AM AEDT) ===');
    console.log(`✅ Should have been sent to: ${eligible10AM} users`);
    console.log(`⏭️  Skipped (already logged): ${loggedBefore10AM} users`);
    console.log(`📤 Expected notifications sent: ${eligible10AM} users`);
    
    if (eligible10AMUsers.length > 0) {
      console.log('\n📋 Users who should receive 10 AM notification:');
      eligible10AMUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.deviceModel}`);
        console.log(`      User: ${user.userId}...`);
        console.log(`      FCM: ${user.fcmToken}`);
        console.log(`      Company: ${user.companyName}`);
        console.log(`      Logged today: ${user.logged}`);
      });
    }
    
    console.log('\n=== 1 PM Notification (scheduled for 1:00 PM AEDT) ===');
    console.log(`Current time: ${now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} AEDT`);
    
    if (currentHour >= 13 || (currentHour === 2 && now.getMinutes() >= 0)) {
      console.log(`✅ Should have been sent to: ${eligible1PM} users`);
      console.log(`⏭️  Skipped (already logged): ${loggedBefore1PM} users`);
      console.log(`📤 Expected notifications sent: ${eligible1PM} users`);
      
      if (eligible1PMUsers.length > 0) {
        console.log('\n📋 Users who should receive 1 PM notification:');
        eligible1PMUsers.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.deviceModel}`);
          console.log(`      User: ${user.userId}...`);
          console.log(`      FCM: ${user.fcmToken}`);
          console.log(`      Company: ${user.companyName}`);
          console.log(`      Logged today: ${user.logged}`);
        });
      }
    } else {
      console.log('⏰ Not yet triggered (scheduled for 1:00 PM AEDT)');
    }
    
    if (loggedUsers.length > 0) {
      console.log('\n\n=== Users Who Logged Today ===');
      loggedUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.deviceModel}`);
        console.log(`   User: ${user.userId}...`);
        console.log(`   Logged at: ${user.logTime}`);
        console.log(`   Status: ${user.status}`);
        console.log(`   Before 10AM: ${user.loggedBefore10AM ? '✅' : '❌'}`);
        console.log(`   Before 1PM: ${user.loggedBefore1PM ? '✅' : '❌'}`);
        console.log('');
      });
    }
    
    console.log('\n\n💡 Notes:');
    console.log('   - Cloud Functions run on schedule automatically');
    console.log('   - Functions skip users without company data (empty companyName)');
    console.log('   - Only users with FCM tokens receive notifications');
    console.log('   - Users who logged before notification time are skipped');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkNotificationsSentToday();

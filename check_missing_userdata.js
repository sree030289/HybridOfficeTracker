const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function checkMissingUserData() {
  try {
    console.log('\n🔍 Scanning all users for missing userData sections...\n');
    
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found in database');
      process.exit(0);
      return;
    }
    
    let totalUsers = 0;
    let missingUserData = 0;
    let emptyUserData = 0;
    let hasUserData = 0;
    let iosUsers = 0;
    let iosMissingUserData = 0;
    
    const usersWithMissingData = [];
    
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
      
      if (isIOS) {
        iosUsers++;
      }
      
      // Check userData section
      if (!userData.userData) {
        missingUserData++;
        if (isIOS) {
          iosMissingUserData++;
        }
        
        usersWithMissingData.push({
          userId: userId.substring(0, 35),
          deviceModel: userData.deviceModel || 'Unknown',
          platform: userData.platform || 'not set',
          fcmToken: userData.fcmToken ? '✅' : '❌',
          attendanceRecords: userData.attendanceData ? Object.keys(userData.attendanceData).length : 0,
          lastUpdated: userData.lastUpdated ? new Date(userData.lastUpdated).toISOString().split('T')[0] : 'never',
          isIOS: isIOS
        });
      } else if (Object.keys(userData.userData).length === 0) {
        emptyUserData++;
        usersWithMissingData.push({
          userId: userId.substring(0, 35),
          deviceModel: userData.deviceModel || 'Unknown',
          platform: userData.platform || 'not set',
          fcmToken: userData.fcmToken ? '✅' : '❌',
          attendanceRecords: userData.attendanceData ? Object.keys(userData.attendanceData).length : 0,
          lastUpdated: userData.lastUpdated ? new Date(userData.lastUpdated).toISOString().split('T')[0] : 'never',
          isIOS: isIOS,
          isEmpty: true
        });
      } else {
        hasUserData++;
      }
    }
    
    console.log('=== Summary ===');
    console.log(`Total Users: ${totalUsers}`);
    console.log(`iOS Users: ${iosUsers}`);
    console.log(`\n=== userData Section Status ===`);
    console.log(`✅ Has userData: ${hasUserData} (${Math.round(hasUserData/totalUsers*100)}%)`);
    console.log(`❌ Missing userData: ${missingUserData} (${Math.round(missingUserData/totalUsers*100)}%)`);
    console.log(`⚠️  Empty userData: ${emptyUserData} (${Math.round(emptyUserData/totalUsers*100)}%)`);
    console.log(`\n🍎 iOS Missing userData: ${iosMissingUserData} out of ${iosUsers} iOS users (${Math.round(iosMissingUserData/iosUsers*100)}%)`);
    
    if (usersWithMissingData.length > 0) {
      console.log(`\n\n=== Users with Missing/Empty userData (${usersWithMissingData.length} total) ===\n`);
      
      // Sort by attendance records (most active users first)
      usersWithMissingData.sort((a, b) => b.attendanceRecords - a.attendanceRecords);
      
      usersWithMissingData.forEach((user, index) => {
        console.log(`${index + 1}. ${user.deviceModel} ${user.isIOS ? '🍎' : '🤖'} ${user.isEmpty ? '(EMPTY)' : '(MISSING)'}`);
        console.log(`   User ID: ${user.userId}...`);
        console.log(`   Platform: ${user.platform}`);
        console.log(`   FCM Token: ${user.fcmToken}`);
        console.log(`   Attendance Records: ${user.attendanceRecords} days`);
        console.log(`   Last Updated: ${user.lastUpdated}`);
        console.log('');
      });
      
      // Show breakdown by platform
      const iosMissing = usersWithMissingData.filter(u => u.isIOS);
      const androidMissing = usersWithMissingData.filter(u => !u.isIOS);
      
      console.log('\n=== Platform Breakdown ===');
      console.log(`iOS: ${iosMissing.length}`);
      console.log(`Android: ${androidMissing.length}`);
      
      // Show users with most data (potential crash risks)
      const activeUsers = usersWithMissingData.filter(u => u.attendanceRecords > 0);
      if (activeUsers.length > 0) {
        console.log(`\n⚠️  ${activeUsers.length} active users (with attendance data) are missing userData section!`);
        console.log('These users are most likely to experience crashes.');
      }
      
      // Show users with FCM tokens
      const withTokens = usersWithMissingData.filter(u => u.fcmToken === '✅');
      if (withTokens.length > 0) {
        console.log(`\n🔔 ${withTokens.length} users have FCM tokens but missing userData`);
        console.log('Cloud Functions may fail when sending notifications to these users.');
      }
    } else {
      console.log('\n✅ All users have userData section!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMissingUserData();

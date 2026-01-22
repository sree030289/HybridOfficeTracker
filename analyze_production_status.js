const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function analyzeProductionStatus() {
  console.log('📊 Analyzing Production Deployment Status\n');
  console.log('App Store publish date: Yesterday night (Jan 13, 2026)');
  console.log('Current date:', new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' }));
  console.log('='.repeat(80));
  
  const usersSnapshot = await db.ref('users').once('value');
  const allUsers = usersSnapshot.val();
  
  if (!allUsers) {
    console.log('❌ No users found');
    return;
  }
  
  let totalUsers = 0;
  let iosUsers = 0;
  let iosAutoModeUsers = 0;
  let iosAutoModeWithNearOffice = 0;
  let iosAutoModeWithoutNearOffice = 0;
  let iosUsersWithFcmToken = 0;
  
  const autoModeUsersWithNearOffice = [];
  const autoModeUsersWithoutNearOffice = [];
  
  for (const [userId, userData] of Object.entries(allUsers)) {
    const platform = userData.platform;
    
    // ONLY analyze iOS users (3.0.0 was only released for iOS)
    if (platform !== 'ios') {
      continue;
    }
    
    totalUsers++;
    iosUsers++;
    
    const trackingMode = userData.userData?.trackingMode;
    const hasNearOffice = !!userData.nearOffice;
    const hasFcmToken = !!userData.fcmToken;
    const deviceModel = userData.deviceModel;
    const fcmTokenUpdated = userData.fcmTokenUpdatedAt;
    
    if (hasFcmToken) {
      iosUsersWithFcmToken++;
    }
    
    if (trackingMode === 'auto') {
      iosAutoModeUsers++;
      
      if (hasNearOffice) {
        iosAutoModeWithNearOffice++;
        autoModeUsersWithNearOffice.push({
          userId,
          deviceModel,
          nearOfficeDate: userData.nearOffice.date,
          nearOfficeTimestamp: new Date(userData.nearOffice.timestamp).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
          fcmTokenUpdated: fcmTokenUpdated ? new Date(fcmTokenUpdated).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Never'
        });
      } else {
        iosAutoModeWithoutNearOffice++;
        autoModeUsersWithoutNearOffice.push({
          userId,
          deviceModel,
          fcmTokenUpdated: fcmTokenUpdated ? new Date(fcmTokenUpdated).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Never'
        });
      }
    }
  }
  
  console.log('\n📱 iOS USERS STATISTICS (3.0.0 Release)');
  console.log('-'.repeat(80));
  console.log('Total iOS Users:', totalUsers);
  console.log('iOS Users with FCM Token:', iosUsersWithFcmToken, `(${totalUsers > 0 ? Math.round(iosUsersWithFcmToken/totalUsers*100) : 0}%)`);
  
  console.log('\n🔄 iOS AUTO MODE ANALYSIS');
  console.log('-'.repeat(80));
  console.log('Total iOS Auto Mode Users:', iosAutoModeUsers);
  console.log('✅ With nearOffice field:', iosAutoModeWithNearOffice, `(${iosAutoModeUsers > 0 ? Math.round(iosAutoModeWithNearOffice/iosAutoModeUsers*100) : 0}%)`);
  console.log('❌ Without nearOffice field:', iosAutoModeWithoutNearOffice, `(${iosAutoModeUsers > 0 ? Math.round(iosAutoModeWithoutNearOffice/iosAutoModeUsers*100) : 0}%)`);
  
  if (iosAutoModeWithNearOffice > 0) {
    console.log('\n✅ AUTO MODE USERS WITH GEOFENCING WORKING:');
    console.log('-'.repeat(80));
    autoModeUsersWithNearOffice.forEach((user, index) => {
      console.log(`${index + 1}. ${user.deviceModel || user.userId}`);
      console.log(`   User ID: ${user.userId}`);
      console.log(`   NearOffice Date: ${user.nearOfficeDate}`);
      console.log(`   Triggered At: ${user.nearOfficeTimestamp}`);
      console.log(`   FCM Token Updated: ${user.fcmTokenUpdated}`);
      console.log('');
    });
  }
  
  if (iosAutoModeWithoutNearOffice > 0) {
    console.log('\n❌ AUTO MODE USERS WITHOUT GEOFENCING (Needs Investigation):');
    console.log('-'.repeat(80));
    autoModeUsersWithoutNearOffice.slice(0, 10).forEach((user, index) => {
      console.log(`${index + 1}. ${user.deviceModel || user.userId}`);
      console.log(`   User ID: ${user.userId}`);
      console.log(`   FCM Token Updated: ${user.fcmTokenUpdated}`);
      console.log('');
    });
    
    if (autoModeUsersWithoutNearOffice.length > 10) {
      console.log(`... and ${autoModeUsersWithoutNearOffice.length - 10} more users`);
    }
  }
  
  console.log('\n💡 INSIGHTS');
  console.log('='.repeat(80));
  
  if (iosAutoModeWithNearOffice === 0 && iosAutoModeUsers > 0) {
    console.log('⚠️  NO iOS users have triggered geofencing yet!');
    console.log('   Possible reasons:');
    console.log('   - Users haven\'t updated to 3.0.0 yet');
    console.log('   - Users haven\'t opened the app since update');
    console.log('   - Users haven\'t physically entered office since update');
  } else if (iosAutoModeWithNearOffice > 0) {
    const successRate = Math.round(iosAutoModeWithNearOffice/iosAutoModeUsers*100);
    console.log(`✅ ${successRate}% of iOS auto mode users have working geofencing!`);
    
    if (successRate < 50) {
      console.log('⚠️  Less than 50% success rate - some users may not have visited office yet');
    } else if (successRate < 100) {
      console.log('📝 Some users may not have visited office since updating');
    } else {
      console.log('🎉 Perfect! All iOS auto mode users have geofencing working!');
    }
  }
  
  // Check for recent updates (last 24 hours) - iOS ONLY
  const yesterday = Date.now() - (24 * 60 * 60 * 1000);
  let recentlyUpdated = 0;
  
  for (const [userId, userData] of Object.entries(allUsers)) {
    if (userData.platform === 'ios' && userData.fcmTokenUpdatedAt && userData.fcmTokenUpdatedAt > yesterday) {
      recentlyUpdated++;
    }
  }
  
  console.log('\n📈 iOS ADOPTION RATE');
  console.log('-'.repeat(80));
  console.log('iOS users updated in last 24h:', recentlyUpdated, `(${totalUsers > 0 ? Math.round(recentlyUpdated/totalUsers*100) : 0}%)`);
  
  if (recentlyUpdated < totalUsers * 0.5) {
    console.log('⏳ App is still rolling out - check again in 24-48 hours');
  } else {
    console.log('✅ Good adoption rate - most iOS users have the new version');
  }
  
  console.log('\n' + '='.repeat(80));
  process.exit(0);
}

analyzeProductionStatus().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

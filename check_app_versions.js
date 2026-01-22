const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function checkAppVersions() {
  try {
    console.log('\n📱 Checking app versions in Firebase...\n');
    
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found');
      process.exit(0);
      return;
    }
    
    const versionStats = {};
    const usersWithVersion = [];
    const usersWithoutVersion = [];
    
    for (const [userId, userData] of Object.entries(users)) {
      // Check if iOS
      const isIOS = userData.platform === 'ios' || 
                    (userData.deviceModel && (
                      userData.deviceModel.toLowerCase().includes('iphone') || 
                      userData.deviceModel.toLowerCase().includes('ipad')
                    )) ||
                    userId.includes('iPhone') || 
                    userId.includes('iPad');
      
      if (!isIOS) continue; // Only check iOS users
      
      if (userData.appVersion) {
        const version = userData.appVersion;
        versionStats[version] = (versionStats[version] || 0) + 1;
        
        usersWithVersion.push({
          userId: userId.substring(0, 30),
          deviceModel: userData.deviceModel || 'Unknown',
          platform: userData.platform || 'not set',
          osVersion: userData.osVersion || 'unknown',
          appVersion: userData.appVersion,
          lastActive: userData.lastActive ? new Date(userData.lastActive).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'never'
        });
      } else {
        usersWithoutVersion.push({
          userId: userId.substring(0, 30),
          deviceModel: userData.deviceModel || 'Unknown',
          platform: userData.platform || 'not set',
          fcmToken: !!userData.fcmToken
        });
      }
    }
    
    console.log('=== iOS App Version Statistics ===\n');
    
    const sortedVersions = Object.entries(versionStats).sort((a, b) => b[1] - a[1]);
    sortedVersions.forEach(([version, count]) => {
      const percentage = Math.round(count / usersWithVersion.length * 100);
      console.log(`${version}: ${count} users (${percentage}%)`);
    });
    
    console.log(`\nTotal with version info: ${usersWithVersion.length}`);
    console.log(`Total without version info: ${usersWithoutVersion.length}`);
    
    if (usersWithVersion.length > 0) {
      console.log('\n\n=== Users with App Version (Most Recent) ===\n');
      
      // Sort by last active
      usersWithVersion.sort((a, b) => {
        const dateA = new Date(a.lastActive);
        const dateB = new Date(b.lastActive);
        return dateB - dateA;
      });
      
      usersWithVersion.slice(0, 10).forEach((user, index) => {
        console.log(`${index + 1}. ${user.deviceModel}`);
        console.log(`   User: ${user.userId}...`);
        console.log(`   Version: ${user.appVersion}`);
        console.log(`   OS: ${user.osVersion}`);
        console.log(`   Last Active: ${user.lastActive}`);
        console.log('');
      });
    }
    
    if (usersWithoutVersion.length > 0) {
      console.log('\n=== Users WITHOUT App Version ===');
      console.log(`${usersWithoutVersion.length} iOS users don't have version info yet\n`);
      
      usersWithoutVersion.slice(0, 5).forEach((user, index) => {
        console.log(`${index + 1}. ${user.deviceModel}`);
        console.log(`   User: ${user.userId}...`);
        console.log(`   Platform: ${user.platform}`);
        console.log(`   FCM: ${user.fcmToken ? '✅' : '❌'}`);
        console.log('');
      });
      
      console.log('📝 Note: Version info will be added when users open the app with v3.0.1+');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAppVersions();

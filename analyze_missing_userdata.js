const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function analyzeActiveUsersWithoutUserData() {
  try {
    console.log('\n🔍 Analyzing active users missing userData section...\n');
    
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found in database');
      process.exit(0);
      return;
    }
    
    const activeUsersWithMissingData = [];
    
    for (const [userId, userData] of Object.entries(users)) {
      // Only check users with attendance data (active users)
      const hasAttendance = userData.attendanceData && Object.keys(userData.attendanceData).length > 0;
      
      // Check if userData section is missing
      const missingUserData = !userData.userData || Object.keys(userData.userData).length === 0;
      
      if (hasAttendance && missingUserData) {
        // Try to determine tracking mode from settings or other indicators
        let trackingMode = 'unknown';
        
        if (userData.settings?.trackingMode) {
          trackingMode = userData.settings.trackingMode;
        } else if (userData.nearOffice) {
          // If they have nearOffice data, likely auto mode
          trackingMode = 'likely auto';
        } else {
          // Default to manual for safety
          trackingMode = 'likely manual';
        }
        
        // Check if iOS
        const isIOS = userData.platform === 'ios' || 
                      (userData.deviceModel && (
                        userData.deviceModel.toLowerCase().includes('iphone') || 
                        userData.deviceModel.toLowerCase().includes('ipad')
                      )) ||
                      userId.includes('iPhone') || 
                      userId.includes('iPad');
        
        activeUsersWithMissingData.push({
          userId: userId,
          shortId: userId.substring(0, 35),
          deviceModel: userData.deviceModel || 'Unknown',
          platform: userData.platform || 'not set',
          fcmToken: !!userData.fcmToken,
          attendanceRecords: Object.keys(userData.attendanceData).length,
          lastUpdated: userData.lastUpdated ? new Date(userData.lastUpdated).toISOString().split('T')[0] : 'never',
          isIOS: isIOS,
          trackingMode: trackingMode,
          hasSettings: !!userData.settings,
          hasNearOffice: !!userData.nearOffice,
          hasPlannedDays: userData.plannedDays ? Object.keys(userData.plannedDays).length : 0,
          hasCachedHolidays: !!userData.cachedHolidays,
          monthlyTarget: userData.settings?.monthlyTarget || 'not set',
          targetMode: userData.settings?.targetMode || 'not set'
        });
      }
    }
    
    // Sort by attendance records
    activeUsersWithMissingData.sort((a, b) => b.attendanceRecords - a.attendanceRecords);
    
    console.log(`=== ${activeUsersWithMissingData.length} Active Users Missing userData ===\n`);
    
    let autoModeCount = 0;
    let manualModeCount = 0;
    let unknownModeCount = 0;
    
    activeUsersWithMissingData.forEach((user, index) => {
      console.log(`${index + 1}. ${user.deviceModel} ${user.isIOS ? '🍎' : '🤖'}`);
      console.log(`   User ID: ${user.shortId}...`);
      console.log(`   Tracking Mode: ${user.trackingMode}`);
      console.log(`   FCM Token: ${user.fcmToken ? '✅' : '❌'}`);
      console.log(`   Attendance Records: ${user.attendanceRecords} days`);
      console.log(`   Last Updated: ${user.lastUpdated}`);
      console.log(`   Has Settings: ${user.hasSettings ? '✅' : '❌'}`);
      console.log(`   Has nearOffice: ${user.hasNearOffice ? '✅' : '❌'}`);
      console.log(`   Planned Days: ${user.hasPlannedDays}`);
      console.log(`   Monthly Target: ${user.monthlyTarget}`);
      console.log('');
      
      if (user.trackingMode.includes('auto')) autoModeCount++;
      else if (user.trackingMode.includes('manual')) manualModeCount++;
      else unknownModeCount++;
    });
    
    console.log('\n=== Tracking Mode Summary ===');
    console.log(`Auto Mode: ${autoModeCount}`);
    console.log(`Manual Mode: ${manualModeCount}`);
    console.log(`Unknown: ${unknownModeCount}`);
    
    console.log('\n\n=== Recommended Fix Strategy ===\n');
    
    console.log('✅ SAFE APPROACH: Set all to Manual Mode with dummy data');
    console.log('   - Safest option for all users');
    console.log('   - Users can update their company info later');
    console.log('   - Will receive manual notifications (10AM, 1PM, 4PM)');
    console.log('   - No location tracking required');
    console.log('');
    console.log('📝 Dummy userData structure:');
    console.log('   {');
    console.log('     companyName: "",');
    console.log('     companyAddress: "",');
    console.log('     companyLocation: null,');
    console.log('     trackingMode: "manual",');
    console.log('     country: "australia"');
    console.log('   }');
    console.log('');
    console.log('🔧 This will:');
    console.log('   ✓ Prevent app crashes immediately');
    console.log('   ✓ Allow Cloud Functions to work (skip if no company data)');
    console.log('   ✓ Users can complete setup when they open app');
    console.log('   ✓ No risk of incorrect location tracking');
    
    // Show which users will need the fix
    console.log('\n\n=== Users to Repair ===\n');
    activeUsersWithMissingData.forEach((user, index) => {
      console.log(`${index + 1}. ${user.shortId}... (${user.attendanceRecords} days)`);
    });
    
    console.log(`\n📊 Total users to repair: ${activeUsersWithMissingData.length}`);
    console.log('🔔 Users with FCM tokens:', activeUsersWithMissingData.filter(u => u.fcmToken).length);
    console.log('🍎 iOS users:', activeUsersWithMissingData.filter(u => u.isIOS).length);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeActiveUsersWithoutUserData();

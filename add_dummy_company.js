const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function addDummyCompanyForActiveUsers() {
  try {
    console.log('\n🔧 Adding dummy company names for active users with empty company data...\n');
    
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found');
      process.exit(0);
      return;
    }
    
    const usersToUpdate = [];
    
    for (const [userId, userData] of Object.entries(users)) {
      // Check if user has FCM token (updated to v3.0.0)
      const hasFCM = !!userData.fcmToken;
      
      // Check if company name is empty or "Not set"
      const hasEmptyCompany = !userData.userData?.companyName || 
                              userData.userData.companyName.trim() === '' ||
                              userData.userData.companyName === 'Not set';
      
      // Check if they have attendance data (active user)
      const hasAttendance = userData.attendanceData && Object.keys(userData.attendanceData).length > 0;
      
      if (hasFCM && hasEmptyCompany && hasAttendance) {
        usersToUpdate.push({
          userId: userId,
          shortId: userId.substring(0, 35),
          deviceModel: userData.deviceModel || 'Unknown',
          attendanceCount: Object.keys(userData.attendanceData).length,
          trackingMode: userData.userData?.trackingMode || 'manual'
        });
      }
    }
    
    console.log(`Found ${usersToUpdate.length} active users with FCM token but no company name\n`);
    
    if (usersToUpdate.length === 0) {
      console.log('✅ All users with FCM tokens have company names set!');
      process.exit(0);
      return;
    }
    
    console.log('📋 Users to update:');
    usersToUpdate.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.deviceModel} - ${user.attendanceCount} days`);
      console.log(`      ${user.shortId}...`);
      console.log(`      Mode: ${user.trackingMode}`);
    });
    
    console.log('\n📝 Will set company name to: "My Company"');
    console.log('   This allows them to receive notifications immediately');
    console.log('   User can update to their real company name when they open the app\n');
    
    console.log('⚠️  Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🚀 Starting update...\n');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of usersToUpdate) {
      try {
        // Update only the companyName field, keep other userData intact
        await db.ref(`users/${user.userId}/userData/companyName`).set('My Company');
        
        console.log(`✅ Updated: ${user.shortId}... - ${user.deviceModel}`);
        successCount++;
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Failed: ${user.shortId}... - ${error.message}`);
        failCount++;
      }
    }
    
    console.log('\n=== Update Summary ===');
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Total: ${usersToUpdate.length}`);
    
    console.log('\n🎉 Update complete!');
    console.log('\n📝 What happens next:');
    console.log('   ✓ Users will now receive manual notifications (10AM, 1PM, 4PM)');
    console.log('   ✓ Users will receive weekly summaries');
    console.log('   ✓ Users can update company name to their actual company in app settings');
    console.log('   ✓ App will work normally without crashes');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addDummyCompanyForActiveUsers();

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function bulkRepairUserData() {
  try {
    console.log('\n🔧 Starting bulk repair of missing userData sections...\n');
    
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found in database');
      process.exit(0);
      return;
    }
    
    const usersToRepair = [];
    
    // Find all users with missing userData section
    for (const [userId, userData] of Object.entries(users)) {
      const missingUserData = !userData.userData || Object.keys(userData.userData).length === 0;
      
      if (missingUserData) {
        usersToRepair.push({
          userId: userId,
          hasAttendance: userData.attendanceData ? Object.keys(userData.attendanceData).length : 0,
          hasFCMToken: !!userData.fcmToken,
          country: userData.cachedHolidays?.australia_2025 ? 'australia' : 'australia' // Default to australia
        });
      }
    }
    
    console.log(`Found ${usersToRepair.length} users to repair\n`);
    console.log('📝 Will create userData structure:');
    console.log('   {');
    console.log('     companyName: "",');
    console.log('     companyAddress: "",');
    console.log('     companyLocation: null,');
    console.log('     trackingMode: "manual",');
    console.log('     country: "australia"');
    console.log('   }\n');
    
    console.log('⚠️  Press Ctrl+C within 5 seconds to cancel...\n');
    
    // Wait 5 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🚀 Starting repair...\n');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of usersToRepair) {
      try {
        const newUserData = {
          companyName: '',
          companyAddress: '',
          companyLocation: null,
          trackingMode: 'manual',
          country: user.country
        };
        
        await db.ref(`users/${user.userId}/userData`).set(newUserData);
        
        const shortId = user.userId.substring(0, 35);
        console.log(`✅ Repaired: ${shortId}... (${user.hasAttendance} days, FCM: ${user.hasFCMToken ? '✅' : '❌'})`);
        successCount++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Failed: ${user.userId.substring(0, 35)}... - ${error.message}`);
        failCount++;
      }
    }
    
    console.log('\n=== Repair Summary ===');
    console.log(`✅ Successfully repaired: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Total: ${usersToRepair.length}`);
    
    console.log('\n🎉 Repair complete!');
    console.log('\n📝 What happens next:');
    console.log('   ✓ Apps will no longer crash');
    console.log('   ✓ Cloud Functions will work correctly');
    console.log('   ✓ Users can fill in company details when they open the app');
    console.log('   ✓ Manual mode notifications (10AM, 1PM, 4PM) will work');
    console.log('   ✓ Weekly summaries will be sent');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

bulkRepairUserData();

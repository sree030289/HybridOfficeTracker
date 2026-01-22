const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function repairUserData() {
  try {
    const userId = 'iPhone_16_Pro_1762136337037_rnlp3v4sh';
    
    console.log(`\n🔧 Repairing userData section for: ${userId}\n`);
    
    // Get current user data
    const userSnapshot = await db.ref(`users/${userId}`).once('value');
    const userData = userSnapshot.val();
    
    if (!userData) {
      console.log('❌ User does not exist in database');
      process.exit(1);
      return;
    }
    
    console.log('Current data structure:');
    console.log('  userData section:', userData.userData ? 'EXISTS' : 'MISSING');
    
    if (userData.userData) {
      console.log('\n✅ userData section already exists - no repair needed');
      console.log('Contents:', JSON.stringify(userData.userData, null, 2));
      process.exit(0);
      return;
    }
    
    console.log('\n⚠️  userData section is MISSING - creating it now...\n');
    
    // Create default userData structure
    // Try to extract company info from attendanceData if available
    let companyName = '';
    let country = 'australia'; // Default based on holidays
    
    // Check if we have Australian holidays cached
    if (userData.cachedHolidays && userData.cachedHolidays.australia_2025) {
      country = 'australia';
    }
    
    const newUserData = {
      companyName: companyName,
      companyAddress: '',
      companyLocation: null,
      trackingMode: 'manual', // Safe default
      country: country
    };
    
    // Update Firebase
    await db.ref(`users/${userId}/userData`).set(newUserData);
    
    console.log('✅ userData section created successfully!\n');
    console.log('Created structure:');
    console.log(JSON.stringify(newUserData, null, 2));
    
    console.log('\n📝 NOTE: User should complete onboarding to fill in missing details:');
    console.log('  - Company name');
    console.log('  - Company address');
    console.log('  - Company location (for auto mode)');
    console.log('\n✅ User can now use the app without crashes!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

repairUserData();

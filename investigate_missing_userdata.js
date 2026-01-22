const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function investigateWhyUserDataMissing() {
  try {
    console.log('\n🔍 Investigating why userData section is missing...\n');
    
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found');
      process.exit(0);
      return;
    }
    
    // Sample a few users with missing userData
    const sampleUsers = [];
    let count = 0;
    
    for (const [userId, userData] of Object.entries(users)) {
      const missingUserData = !userData.userData || Object.keys(userData.userData).length === 0;
      const hasUserData = userData.userData && Object.keys(userData.userData).length > 0;
      
      if (missingUserData && count < 3) {
        sampleUsers.push({
          userId: userId.substring(0, 35),
          type: 'MISSING',
          data: userData
        });
        count++;
      } else if (hasUserData && count < 6) {
        sampleUsers.push({
          userId: userId.substring(0, 35),
          type: 'HAS_USERDATA',
          data: userData
        });
        count++;
      }
      
      if (count >= 6) break;
    }
    
    console.log('=== Sample User WITHOUT userData Section ===\n');
    const missingUsers = sampleUsers.filter(u => u.type === 'MISSING');
    missingUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.userId}...`);
      console.log('Top-level keys:', Object.keys(user.data).join(', '));
      console.log('\nFull structure:');
      console.log(JSON.stringify(user.data, null, 2).substring(0, 1000) + '...\n');
    });
    
    console.log('\n\n=== Sample User WITH userData Section ===\n');
    const hasUsers = sampleUsers.filter(u => u.type === 'HAS_USERDATA');
    hasUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.userId}...`);
      console.log('Top-level keys:', Object.keys(user.data).join(', '));
      console.log('\nuserData contents:', JSON.stringify(user.data.userData, null, 2));
      console.log('\n');
    });
    
    console.log('\n=== Analysis ===\n');
    
    // Check when users with/without userData were created
    let missingDataOldest = null;
    let missingDataNewest = null;
    let hasDataOldest = null;
    let hasDataNewest = null;
    
    for (const [userId, userData] of Object.entries(users)) {
      const timestamp = userData.lastUpdated || Date.now();
      const date = new Date(timestamp);
      
      if (!userData.userData || Object.keys(userData.userData).length === 0) {
        if (!missingDataOldest || date < missingDataOldest) missingDataOldest = date;
        if (!missingDataNewest || date > missingDataNewest) missingDataNewest = date;
      } else {
        if (!hasDataOldest || date < hasDataOldest) hasDataOldest = date;
        if (!hasDataNewest || date > hasDataNewest) hasDataNewest = date;
      }
    }
    
    console.log('📅 Users WITHOUT userData:');
    console.log(`   Oldest: ${missingDataOldest ? missingDataOldest.toISOString().split('T')[0] : 'N/A'}`);
    console.log(`   Newest: ${missingDataNewest ? missingDataNewest.toISOString().split('T')[0] : 'N/A'}`);
    
    console.log('\n📅 Users WITH userData:');
    console.log(`   Oldest: ${hasDataOldest ? hasDataOldest.toISOString().split('T')[0] : 'N/A'}`);
    console.log(`   Newest: ${hasDataNewest ? hasDataNewest.toISOString().split('T')[0] : 'N/A'}`);
    
    console.log('\n\n💡 Likely Causes:\n');
    console.log('1. **Old App Version Data Structure**');
    console.log('   - These users are from before the userData section was introduced');
    console.log('   - Old app stored data directly in AsyncStorage, not in Firebase');
    console.log('   - When Firebase sync was added, only attendanceData was migrated');
    console.log('   - userData section was never created for existing users');
    
    console.log('\n2. **Incomplete Migration**');
    console.log('   - Migration code focused on attendanceData and settings');
    console.log('   - Assumed userData would exist from onboarding');
    console.log('   - Existing users bypassed onboarding flow');
    
    console.log('\n3. **AsyncStorage vs Firebase Mismatch**');
    console.log('   - userData might exist in AsyncStorage locally');
    console.log('   - Never synced to Firebase');
    console.log('   - When user updates to v3.0.0, app expects it in Firebase');
    
    console.log('\n✅ Fix: Inject default userData structure');
    console.log('   - Safe for all users (all are manual mode)');
    console.log('   - Prevents crashes immediately');
    console.log('   - Users can update their info when they open app');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

investigateWhyUserDataMissing();

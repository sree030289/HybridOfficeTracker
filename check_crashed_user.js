const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function checkCrashedUser() {
  try {
    const userId = 'iPhone_16_Pro_1762136337037_rnlp3v4sh';
    
    console.log(`\n🔍 Checking crashed user: ${userId}\n`);
    
    // Get user data
    const userSnapshot = await db.ref(`users/${userId}`).once('value');
    const userData = userSnapshot.val();
    
    if (!userData) {
      console.log('❌ User does not exist');
      process.exit(0);
      return;
    }
    
    console.log('=== Current Firebase Data Structure ===\n');
    console.log('Top-level keys:', Object.keys(userData).join(', '));
    
    console.log('\n📱 Device Info:');
    console.log('  Platform:', userData.platform || 'NOT SET');
    console.log('  Device Model:', userData.deviceModel || 'NOT SET');
    console.log('  OS Version:', userData.osVersion || 'NOT SET');
    console.log('  App Version:', userData.appVersion || 'NOT SET');
    console.log('  Last Active:', userData.lastActive ? new Date(userData.lastActive).toISOString() : 'NOT SET');
    
    console.log('\n🔔 FCM Token:', userData.fcmToken ? '✅ EXISTS' : '❌ MISSING');
    if (userData.fcmToken) {
      console.log('  Token:', userData.fcmToken.substring(0, 30) + '...');
    }
    
    console.log('\n👤 userData section:', userData.userData ? '✅ EXISTS' : '❌ MISSING');
    if (userData.userData) {
      console.log('  Keys:', Object.keys(userData.userData).join(', '));
      console.log('  Full contents:');
      console.log(JSON.stringify(userData.userData, null, 2));
    }
    
    console.log('\n⚙️ settings section:', userData.settings ? '✅ EXISTS' : '❌ MISSING');
    if (userData.settings) {
      console.log('  Contents:', JSON.stringify(userData.settings, null, 2));
    }
    
    console.log('\n📅 attendanceData:', userData.attendanceData ? `✅ ${Object.keys(userData.attendanceData).length} records` : '❌ MISSING');
    console.log('📅 plannedDays:', userData.plannedDays ? `✅ ${Object.keys(userData.plannedDays).length} records` : '❌ MISSING');
    
    console.log('\n📊 Production Logs:');
    const logsSnapshot = await db.ref(`logs/${userId}`).limitToLast(10).once('value');
    const logs = logsSnapshot.val();
    
    if (logs) {
      const logEntries = Object.values(logs);
      logEntries.forEach(log => {
        const timestamp = new Date(log.timestamp).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
        console.log(`  [${timestamp}] ${log.level}: ${log.message}`);
        if (log.data) {
          console.log('    Data:', JSON.stringify(log.data, null, 2));
        }
      });
    } else {
      console.log('  No logs found');
    }
    
    console.log('\n\n⚠️ ANALYSIS:\n');
    
    if (!userData.userData || Object.keys(userData.userData).length === 0) {
      console.log('❌ PROBLEM: userData section is still missing or empty!');
      console.log('   This will cause crashes when the app tries to access userData properties.');
    } else if (!userData.userData.companyName || userData.userData.companyName === '') {
      console.log('⚠️  WARNING: companyName is empty');
      console.log('   App might have issues if it expects a company name.');
    } else {
      console.log('✅ userData section looks good');
    }
    
    if (!userData.settings) {
      console.log('⚠️  WARNING: settings section is missing');
      console.log('   App expects settings.monthlyTarget and settings.targetMode');
    }
    
    console.log('\n📝 Recommended Actions:');
    console.log('1. Check Production Logger logs in Firebase Console');
    console.log('2. Verify userData section has all required fields');
    console.log('3. Check if migration completed or failed');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkCrashedUser();

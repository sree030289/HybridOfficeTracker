const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function checkUserData() {
  try {
    const userId = 'iPhone_16_Pro_1762136337037_rnlp3v4sh';
    
    console.log(`\n🔍 Checking data for user: ${userId}\n`);
    
    // Get user data
    const userSnapshot = await db.ref(`users/${userId}`).once('value');
    const userData = userSnapshot.val();
    
    if (!userData) {
      console.log('❌ User does not exist in database');
      process.exit(0);
      return;
    }
    
    console.log('=== User Data Structure ===\n');
    console.log('Top-level keys:', Object.keys(userData).join(', '));
    console.log('\n');
    
    // Check each section
    console.log('📱 Device Info:');
    console.log('  Platform:', userData.platform || 'NOT SET');
    console.log('  Device Model:', userData.deviceModel || 'NOT SET');
    console.log('  OS Version:', userData.osVersion || 'NOT SET');
    console.log('  App Version:', userData.appVersion || 'NOT SET');
    console.log('  Last Active:', userData.lastActive ? new Date(userData.lastActive).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'NOT SET');
    
    console.log('\n🔔 FCM Token:', userData.fcmToken ? '✅ EXISTS' : '❌ MISSING');
    
    console.log('\n👤 userData section:', userData.userData ? '✅ EXISTS' : '❌ MISSING');
    if (userData.userData) {
      console.log('  Keys in userData:', Object.keys(userData.userData).join(', '));
      console.log('  Tracking Mode:', userData.userData.trackingMode || 'NOT SET');
      console.log('  User Name:', userData.userData.userName || 'NOT SET');
      console.log('  Company Name:', userData.userData.companyName || 'NOT SET');
      console.log('  Monthly Target:', userData.userData.monthlyTarget || 'NOT SET');
    }
    
    console.log('\n🏢 Company Info:', userData.companyInfo ? '✅ EXISTS' : '❌ MISSING');
    if (userData.companyInfo) {
      console.log('  Keys:', Object.keys(userData.companyInfo).join(', '));
    }
    
    console.log('\n📅 Attendance Records:', userData.attendanceRecords ? '✅ EXISTS' : '❌ MISSING');
    if (userData.attendanceRecords) {
      const records = Object.keys(userData.attendanceRecords);
      console.log(`  Total records: ${records.length}`);
      console.log(`  Date range: ${records[0]} to ${records[records.length - 1]}`);
    }
    
    console.log('\n📍 Near Office:', userData.nearOffice ? '✅ EXISTS' : '❌ MISSING');
    if (userData.nearOffice) {
      console.log('  Keys:', Object.keys(userData.nearOffice).join(', '));
    }
    
    console.log('\n🗓️ Planned Days:', userData.plannedDays ? '✅ EXISTS' : '❌ MISSING');
    if (userData.plannedDays) {
      console.log('  Total planned:', Object.keys(userData.plannedDays).length);
    }
    
    console.log('\n📊 Full User Object (for debugging):\n');
    console.log(JSON.stringify(userData, null, 2));
    
    console.log('\n\n⚠️ POTENTIAL CRASH CAUSES:\n');
    if (!userData.userData) {
      console.log('❌ CRITICAL: userData section is missing!');
      console.log('   This will cause crashes when accessing:');
      console.log('   - userData.userData.trackingMode');
      console.log('   - userData.userData.userName');
      console.log('   - userData.userData.companyName');
      console.log('   - userData.userData.monthlyTarget');
    }
    
    if (!userData.fcmToken) {
      console.log('⚠️  WARNING: FCM token missing (won\'t receive notifications)');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserData();

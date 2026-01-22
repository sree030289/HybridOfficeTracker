const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function checkNotifications() {
  const userId = 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb';
  
  console.log('🔍 Checking notification status for iPhone 17 Pro Max\n');
  console.log('=' .repeat(80));
  
  // Get user data
  const userSnapshot = await db.ref(`users/${userId}`).once('value');
  const userData = userSnapshot.val();
  
  if (!userData) {
    console.log('❌ User not found!');
    return;
  }
  
  console.log('\n👤 USER INFO');
  console.log('-'.repeat(80));
  console.log('Device:', userData.deviceModel);
  console.log('Tracking Mode:', userData.userData?.trackingMode);
  console.log('FCM Token:', userData.fcmToken ? userData.fcmToken.substring(0, 40) + '...' : 'None');
  console.log('FCM Token Updated:', userData.fcmTokenUpdatedAt ? new Date(userData.fcmTokenUpdatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Never');
  console.log('Company Location:', userData.userData?.companyLocation ? '✅ Set' : '❌ Not set');
  console.log('Has nearOffice:', !!userData.nearOffice);
  
  // Check today's attendance
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
  const todayAttendance = userData.attendanceData?.[today];
  
  console.log('\n📅 TODAY\'S ATTENDANCE (' + today + ')');
  console.log('-'.repeat(80));
  if (todayAttendance) {
    console.log('Status:', todayAttendance.status);
    console.log('Check-in time:', todayAttendance.checkInTime ? new Date(todayAttendance.checkInTime).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Not checked in');
  } else {
    console.log('❌ No attendance record for today');
  }
  
  // Check nearOffice status
  if (userData.nearOffice) {
    console.log('\n📍 NEAR OFFICE STATUS');
    console.log('-'.repeat(80));
    console.log('Detected:', userData.nearOffice.detected);
    console.log('Date:', userData.nearOffice.date);
    console.log('Timestamp:', new Date(userData.nearOffice.timestamp).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  }
  
  // Check when tracking mode was last updated
  console.log('\n⏰ TIMELINE');
  console.log('-'.repeat(80));
  console.log('Current Sydney time:', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  console.log('Last data update:', userData.lastUpdated ? new Date(userData.lastUpdated).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Unknown');
  
  // Simulate Cloud Function logic for 10 AM manual reminder
  console.log('\n🔔 10 AM NOTIFICATION CHECK');
  console.log('-'.repeat(80));
  
  const trackingMode = userData.userData?.trackingMode;
  const hasFcmToken = !!userData.fcmToken;
  const hasAttendanceToday = !!todayAttendance;
  
  console.log('1. Is Manual Mode:', trackingMode === 'manual' ? '✅ YES' : '❌ NO (mode: ' + trackingMode + ')');
  console.log('2. Has FCM Token:', hasFcmToken ? '✅ YES' : '❌ NO');
  console.log('3. Already logged today:', hasAttendanceToday ? '⚠️ YES (notification skipped)' : '✅ NO (should send)');
  
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
  console.log('4. Is Weekend:', isWeekend ? '⚠️ YES (notification skipped)' : '✅ NO (should send)');
  
  if (trackingMode === 'manual' && hasFcmToken && !hasAttendanceToday && !isWeekend) {
    console.log('\n✅ USER SHOULD RECEIVE 10 AM NOTIFICATION');
  } else {
    console.log('\n❌ USER SHOULD NOT RECEIVE 10 AM NOTIFICATION');
    console.log('\nReasons:');
    if (trackingMode !== 'manual') console.log('  - Not in manual mode');
    if (!hasFcmToken) console.log('  - No FCM token');
    if (hasAttendanceToday) console.log('  - Already logged attendance today');
    if (isWeekend) console.log('  - Weekend (no notifications)');
  }
  
  console.log('\n' + '='.repeat(80));
  process.exit(0);
}

checkNotifications().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

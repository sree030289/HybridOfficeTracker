const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();
const userId = 'iPhone_17_Pro_Max_1764234466969';

async function checkUser() {
  console.log(`🔍 Checking user: ${userId}\n`);
  
  const snapshot = await db.ref(`users/${userId}`).once('value');
  const userData = snapshot.val();
  
  if (!userData) {
    console.log('❌ User not found');
    return;
  }
  
  console.log('📱 USER DATA:');
  console.log('═'.repeat(80));
  console.log('FCM Token:', userData.fcmToken || 'MISSING');
  console.log('Tracking Mode:', userData.userData?.trackingMode || 'MISSING');
  console.log('Notifications Enabled:', userData.userData?.notificationsEnabled);
  console.log('Company Name:', userData.userData?.companyName || 'MISSING');
  console.log('Country:', userData.userData?.country || 'MISSING');
  
  const today = new Date().toISOString().split('T')[0];
  const hasLoggedToday = userData.attendanceData?.[today];
  console.log('\nToday\'s Attendance:', hasLoggedToday || 'NOT LOGGED');
  
  console.log('\n🔧 SETTINGS NODE:');
  console.log(JSON.stringify(userData.settings || {}, null, 2));
  
  console.log('\n📊 RECENT ATTENDANCE:');
  const attendance = userData.attendanceData || {};
  const recentDates = Object.keys(attendance).sort().slice(-5);
  recentDates.forEach(date => {
    console.log(`   ${date}: ${attendance[date]}`);
  });
  
  // Check if the Cloud Functions should notify this user
  const shouldNotify = userData.userData?.trackingMode === 'manual' 
                       && userData.fcmToken 
                       && !hasLoggedToday;
  
  console.log('\n💡 CLOUD FUNCTION ELIGIBILITY:');
  console.log('═'.repeat(80));
  console.log(`Should receive 10AM/1PM/4PM reminders: ${shouldNotify ? '✅ YES' : '❌ NO'}`);
  
  if (!shouldNotify) {
    console.log('\n⚠️  Reasons for NOT receiving:');
    if (userData.userData?.trackingMode !== 'manual') {
      console.log('   ❌ Not in manual mode');
    }
    if (!userData.fcmToken) {
      console.log('   ❌ No FCM token');
    }
    if (hasLoggedToday) {
      console.log('   ✅ Already logged today (correct behavior)');
    }
  }
  
  console.log('\n🌍 TIMEZONE INFO:');
  const sydneyTime = new Date().toLocaleString('en-AU', { 
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  console.log(`Current time in Sydney: ${sydneyTime}`);
  console.log('Cloud Functions run at: 10:00, 13:00, 16:00 Sydney time');
  
  process.exit(0);
}

checkUser().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

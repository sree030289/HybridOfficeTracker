const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function simulate10AMFunction() {
  console.log('🔍 Simulating 10 AM Cloud Function execution...\n');
  console.log('Current Sydney time:', new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
  console.log('='.repeat(80));
  
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  console.log('Today:', today);
  console.log('Day of week:', dayOfWeek, isWeekend ? '(WEEKEND)' : '(WEEKDAY)');
  
  // Get all users
  const usersSnapshot = await db.ref('users').once('value');
  const allUsers = usersSnapshot.val();
  
  if (!allUsers) {
    console.log('❌ No users found');
    return;
  }
  
  console.log(`\n📊 Found ${Object.keys(allUsers).length} total users`);
  console.log('\n🔍 Filtering for eligible users...\n');
  
  let eligibleCount = 0;
  let skippedReasons = {
    noToken: 0,
    notManual: 0,
    alreadyLogged: 0,
    weekend: 0
  };
  
  for (const [userId, userData] of Object.entries(allUsers)) {
    const fcmToken = userData.fcmToken;
    const trackingMode = userData.userData?.trackingMode;
    const attendanceData = userData.attendanceData || {};
    const todayAttendance = attendanceData[today];
    
    // Log iPhone 17 Pro Max specifically
    if (userId === 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb') {
      console.log('📱 CHECKING iPhone 17 Pro Max:');
      console.log('  User ID:', userId);
      console.log('  FCM Token:', fcmToken ? '✅ EXISTS' : '❌ MISSING');
      console.log('  Tracking Mode:', trackingMode || 'undefined');
      console.log('  Today Attendance:', todayAttendance ? '✅ EXISTS' : '❌ NONE');
      console.log('  Is Weekend:', isWeekend);
      console.log('');
    }
    
    // Skip if no FCM token
    if (!fcmToken) {
      skippedReasons.noToken++;
      continue;
    }
    
    // Skip if not manual mode
    if (trackingMode !== 'manual') {
      skippedReasons.notManual++;
      if (userId === 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb') {
        console.log('  ❌ SKIPPED: Not in manual mode (mode: ' + trackingMode + ')');
      }
      continue;
    }
    
    // Skip if already logged today
    if (todayAttendance) {
      skippedReasons.alreadyLogged++;
      if (userId === 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb') {
        console.log('  ❌ SKIPPED: Already logged today');
      }
      continue;
    }
    
    // Skip weekends
    if (isWeekend) {
      skippedReasons.weekend++;
      if (userId === 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb') {
        console.log('  ❌ SKIPPED: Weekend');
      }
      continue;
    }
    
    eligibleCount++;
    
    if (userId === 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb') {
      console.log('  ✅ ELIGIBLE for notification!');
      console.log('');
    }
  }
  
  console.log('\n📊 SUMMARY');
  console.log('='.repeat(80));
  console.log('Total users:', Object.keys(allUsers).length);
  console.log('Eligible for 10 AM notification:', eligibleCount);
  console.log('\nSkipped reasons:');
  console.log('  - No FCM token:', skippedReasons.noToken);
  console.log('  - Not manual mode:', skippedReasons.notManual);
  console.log('  - Already logged today:', skippedReasons.alreadyLogged);
  console.log('  - Weekend:', skippedReasons.weekend);
  
  console.log('\n' + '='.repeat(80));
  
  if (isWeekend) {
    console.log('\n⚠️  PROBLEM FOUND: Today is Sunday (weekend)!');
    console.log('The Cloud Function skips ALL users on weekends.');
    console.log('iPhone 17 Pro Max would NOT receive notification even in manual mode.');
  }
  
  process.exit(0);
}

simulate10AMFunction().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

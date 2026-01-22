const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function findUser() {
  console.log('🔍 Searching for iPhone_17_Pro_Max users...\n');
  
  const snapshot = await db.ref('users').once('value');
  const users = snapshot.val();
  
  for (const [userId, userData] of Object.entries(users)) {
    if (userId.includes('iPhone_17_Pro_Max_17642344')) {
      console.log(`✅ FOUND: ${userId}`);
      console.log('═'.repeat(80));
      console.log('FCM Token:', userData.fcmToken?.substring(0, 50) || 'MISSING');
      console.log('Tracking Mode:', userData.userData?.trackingMode || 'MISSING');
      console.log('Company:', userData.userData?.companyName || 'MISSING');
      console.log('Country:', userData.userData?.country || 'MISSING');
      
      const today = new Date().toISOString().split('T')[0];
      const hasLoggedToday = userData.attendanceData?.[today];
      console.log('Logged Today:', hasLoggedToday || 'NO');
      
      console.log('\n📊 RECENT ATTENDANCE:');
      const attendance = userData.attendanceData || {};
      const recentDates = Object.keys(attendance).sort().slice(-7);
      recentDates.forEach(date => {
        console.log(`   ${date}: ${attendance[date]}`);
      });
      
      console.log('\n');
    }
  }
  
  process.exit(0);
}

findUser().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const userId = 'iPhone_11_Pro_Max_1767877443924_k2aocjo2x';
const today = new Date().toISOString().split('T')[0];

admin.database().ref(`users/${userId}`).once('value')
  .then(snapshot => {
    const data = snapshot.val();
    console.log('\n=== User Data Analysis ===');
    console.log('User ID:', userId);
    console.log('Today:', today);
    console.log('\n📱 FCM Token:', data.fcmToken);
    console.log('🔧 Tracking Mode:', data.settings?.trackingMode || data.userData?.trackingMode);
    console.log('�� Near Office:', JSON.stringify(data.nearOffice, null, 2));
    console.log('📅 Attendance Today:', data.attendanceData?.[today] || 'NOT LOGGED');
    console.log('\n=== Geofence Notification Check ===');
    
    // Check conditions for geofence notification
    if (!data.fcmToken) {
      console.log('❌ FAIL: No FCM token');
    } else {
      console.log('✅ PASS: FCM token exists');
    }
    
    if (data.attendanceData?.[today]) {
      console.log('❌ FAIL: Already logged today - notification would be skipped');
    } else {
      console.log('✅ PASS: Not logged today - should send notification');
    }
    
    if (data.nearOffice?.detected && data.nearOffice?.date === today) {
      console.log('✅ PASS: nearOffice detected for today');
    } else {
      console.log('❌ FAIL: nearOffice not detected or wrong date');
    }
    
    console.log('\n=== 6 PM Notification Check ===');
    const trackingMode = data.settings?.trackingMode || data.userData?.trackingMode;
    if (trackingMode === 'auto') {
      console.log('✅ PASS: User is in AUTO mode');
    } else {
      console.log('❌ FAIL: User is in', trackingMode, 'mode (needs AUTO)');
    }
    
    if (!data.attendanceData?.[today]) {
      console.log('✅ PASS: Not logged today - should send 6 PM reminder');
    } else {
      console.log('❌ FAIL: Already logged - no 6 PM reminder needed');
    }
    
    // Check if today is weekend
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('❌ INFO: Today is weekend - notifications skipped');
    } else {
      console.log('✅ PASS: Today is weekday');
    }
    
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

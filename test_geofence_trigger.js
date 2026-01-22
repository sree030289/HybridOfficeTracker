const admin = require('firebase-admin');
const https = require('https');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const userId = 'iPhone_11_Pro_Max_1767877443924_k2aocjo2x';
const today = new Date().toISOString().split('T')[0];

console.log('Testing geofence notification manually...');
console.log('User:', userId);
console.log('Date:', today);

admin.database().ref(`users/${userId}`).once('value')
  .then(snapshot => {
    const userData = snapshot.val();
    
    if (!userData.fcmToken) {
      console.log('❌ No FCM token');
      process.exit(1);
    }
    
    if (userData.attendanceData?.[today]) {
      console.log('⚠️ Already logged today');
    }
    
    const expoPushToken = userData.fcmToken;
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: '📍 Near Office Detected - TEST',
      body: 'Tap to confirm office attendance, or use buttons to change.',
      data: { 
        type: 'location_confirmation',
        date: today,
        userId: userId,
        autoLog: 'office',
        trackingMode: 'auto'
      },
      categoryId: 'ATTENDANCE_CATEGORY'
    };
    
    const postData = JSON.stringify(message);
    const options = {
      hostname: 'exp.host',
      port: 443,
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('Response status:', res.statusCode);
        console.log('Response:', data);
        process.exit(0);
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
    
    req.write(postData);
    req.end();
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

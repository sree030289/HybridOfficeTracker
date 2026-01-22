const https = require('https');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

async function sendExpoPushNotification(expoPushToken, { title, body, data }) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data || {},
    priority: 'high'
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

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (result.data && result.data.status === 'ok') {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: result });
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function test6PMReminder() {
  const today = new Date().toISOString().split('T')[0];
  const db = admin.database();
  const usersRef = db.ref('users');
  const snapshot = await usersRef.once('value');
  const users = snapshot.val();

  console.log('Testing 6 PM Auto Reminder...');
  console.log('Today:', today);
  console.log('Total users:', Object.keys(users).length);

  let eligible = 0;
  let sent = 0;

  for (const [userId, userData] of Object.entries(users)) {
    if (userData.userData?.trackingMode === 'auto' && userData.fcmToken) {
      const attendance = userData.attendanceData?.[today];
      if (!attendance) {
        eligible++;
        console.log(`\n✅ Eligible: ${userId}`);
        console.log('  - Tracking mode: auto');
        console.log('  - FCM token: ${userData.fcmToken}');
        console.log('  - Attendance today: NOT LOGGED');
        
        try {
          const result = await sendExpoPushNotification(userData.fcmToken, {
            title: '🏢 Location Not Logged - TEST',
            body: 'Your location wasn\'t detected today. Please open the app to manually log your attendance.',
            data: {
              type: 'auto_reminder',
              time: '6:00 PM',
              action: 'open_app'
            }
          });
          
          if (result.success) {
            sent++;
            console.log('  ✅ Notification sent successfully');
          } else {
            console.log('  ❌ Failed:', result.error);
          }
        } catch (error) {
          console.log('  ❌ Error:', error.message);
        }
      }
    }
  }

  console.log(`\n📊 Summary: ${eligible} eligible users, ${sent} notifications sent`);
  process.exit(0);
}

test6PMReminder().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

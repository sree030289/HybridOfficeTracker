const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const https = require('https');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

// Simulate the exact Cloud Function logic
async function testCloudFunctionLogic() {
  console.log('🧪 SIMULATING CLOUD FUNCTION LOGIC\n');
  console.log('This replicates what send10AMReminder does...\n');
  
  const db = admin.database();
  const usersRef = db.ref('users');
  const snapshot = await usersRef.once('value');
  const users = snapshot.val();
  
  const today = new Date().toISOString().split('T')[0];
  const notifications = [];
  
  console.log('📊 Scanning all users...\n');
  
  // Find users in manual mode who haven't logged today
  let totalManual = 0;
  let withTokens = 0;
  let eligible = 0;
  
  for (const [userId, userData] of Object.entries(users)) {
    if (userData.userData?.trackingMode === 'manual') {
      totalManual++;
      
      if (userData.fcmToken) {
        withTokens++;
        
        const hasLoggedToday = userData.attendanceData?.[today];
        const isHoliday = userData.cachedHolidays?.[today];
        
        if (!hasLoggedToday && !isHoliday) {
          eligible++;
          notifications.push({
            userId,
            token: userData.fcmToken,
            company: userData.userData?.companyName
          });
          
          if (userId === 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb') {
            console.log('✅ YOUR DEVICE FOUND IN ELIGIBLE LIST!');
            console.log(`   Token: ${userData.fcmToken}`);
            console.log(`   Logged today: ${hasLoggedToday || 'NO'}`);
            console.log(`   Holiday today: ${isHoliday || 'NO'}`);
            console.log('');
          }
        }
      }
    }
  }
  
  console.log(`📈 RESULTS:`);
  console.log(`   Total manual mode users: ${totalManual}`);
  console.log(`   With FCM tokens: ${withTokens}`);
  console.log(`   Eligible for notifications: ${eligible}`);
  console.log('');
  
  if (notifications.length === 0) {
    console.log('❌ No users to notify (this is why you got nothing!)');
    return;
  }
  
  console.log(`🚀 Would send ${notifications.length} notifications\n`);
  
  // Find your notification
  const yourNotif = notifications.find(n => n.userId === 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb');
  
  if (yourNotif) {
    console.log('📬 Testing notification to YOUR device...\n');
    
    const message = {
      to: yourNotif.token,
      sound: 'default',
      title: '🌅 Morning Check-in',
      body: 'Good morning! Remember to log your work location for today.',
      data: {
        type: 'manual_reminder',
        time: '10:00 AM',
        action: 'open_app'
      },
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
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          console.log('📬 Expo Push Response:');
          console.log('═'.repeat(80));
          console.log(data);
          console.log('');
          
          try {
            const result = JSON.parse(data);
            if (result.data && result.data[0]) {
              const ticket = result.data[0];
              if (ticket.status === 'ok') {
                console.log('✅ SUCCESS! Check your phone for notification!');
              } else if (ticket.status === 'error') {
                console.log('❌ ERROR:', ticket.message);
                console.log('   Details:', JSON.stringify(ticket.details || {}, null, 2));
              }
            }
          } catch (e) {
            console.log('Could not parse response');
          }
          
          resolve();
        });
      });
      
      req.on('error', (error) => {
        console.error('❌ Request Error:', error);
        reject(error);
      });
      
      req.write(postData);
      req.end();
    });
  } else {
    console.log('❌ YOUR DEVICE NOT IN ELIGIBLE LIST - this is why you got no notification!');
  }
}

testCloudFunctionLogic()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

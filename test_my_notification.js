const https = require('https');

const expoPushToken = 'ExponentPushToken[gR5RzvCajfJQXkhI59yvGb]';

async function sendTestNotification() {
  console.log('🚀 Testing Expo Push Notification to your device...\n');
  console.log(`Token: ${expoPushToken}\n`);
  
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: '🧪 Test Notification from Cloud Functions',
    body: 'If you see this, Expo Push works! Cloud Functions should work too.',
    data: {
      type: 'test',
      timestamp: Date.now()
    }
  };
  
  const postData = JSON.stringify(message);
  
  const options = {
    hostname: 'exp.host',
    port: 443,
    path: '/--/api/v2/push/send',
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': postData.length
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('📬 Expo Push Response:');
        console.log('═'.repeat(80));
        try {
          const response = JSON.parse(data);
          console.log(JSON.stringify(response, null, 2));
          
          if (response.data) {
            const ticket = response.data[0];
            if (ticket.status === 'ok') {
              console.log('\n✅ SUCCESS! Notification sent successfully.');
              console.log('   Check your device - you should see a notification!');
            } else if (ticket.status === 'error') {
              console.log('\n❌ ERROR! Failed to send notification:');
              console.log(`   Reason: ${ticket.message || 'Unknown'}`);
              console.log(`   Details: ${ticket.details || 'None'}`);
            }
          }
        } catch (e) {
          console.log(data);
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
}

sendTestNotification()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

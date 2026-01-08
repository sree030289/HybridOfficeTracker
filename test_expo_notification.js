#!/usr/bin/env node

const https = require('https');

const expoPushToken = 'ExponentPushToken[HwjhW8IVqDO0xcM_3O60x3]';

const message = {
  to: expoPushToken,
  sound: 'default',
  title: '🔔 Test Notification',
  body: 'Your FCM setup is working! You will receive reminders at 10 AM, 1 PM, and 4 PM.',
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
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('📤 Sending test notification via Expo Push Service...');
console.log('Token:', expoPushToken);

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n📥 Response:');
    console.log(data);
    
    try {
      const response = JSON.parse(data);
      if (response.data && response.data[0].status === 'ok') {
        console.log('\n✅ Notification sent successfully!');
        console.log('Check your iPhone for the notification.');
      } else {
        console.log('\n❌ Error sending notification:', response.data[0]);
      }
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error);
});

req.write(postData);
req.end();

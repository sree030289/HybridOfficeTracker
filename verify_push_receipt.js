const https = require('https');

// This checks if the Expo Push Service successfully delivered the notification
const message = {
  to: 'ExponentPushToken[HwjhW8IVqDO0xcM_3O60x3]',
  sound: 'default',
  title: '✅ Verification Test',
  body: 'If you see this, the FCM migration is working perfectly!',
  data: { type: 'verification' },
  priority: 'high'
};

const data = JSON.stringify(message);

const options = {
  hostname: 'exp.host',
  port: 443,
  path: '/--/api/v2/push/send',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', JSON.stringify(JSON.parse(body), null, 2));
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();

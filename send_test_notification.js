const https = require('https');

const token = 'ExponentPushToken[HwjhW8IVqDO0xcM_3O60x3]';

const message = {
  to: token,
  sound: 'default',
  title: '🧪 Test Notification',
  body: 'Testing FCM notification for existing user!',
  data: { type: 'test' },
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
  console.log(`Status: ${res.statusCode}`);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', body);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
  });
}

const userId = 'iPhone_11_Pro_Max_1767876371895_g1utmmdou';
const db = admin.database();

(async () => {
  try {
    console.log('Checking user data...\n');
    
    const rootSnapshot = await db.ref(`users/${userId}`).get();
    if (rootSnapshot.exists()) {
      const data = rootSnapshot.val();
      console.log('Root level keys:', Object.keys(data));
      console.log('FCM Token:', data.fcmToken || '❌ MISSING');
      console.log('Platform:', data.platform || 'Not set');
      console.log('Device:', data.deviceModel || 'Not set');
      console.log('\nNested users node exists:', !!data.users);
      
      if (data.users) {
        console.log('Nested users content:', JSON.stringify(data.users, null, 2));
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();

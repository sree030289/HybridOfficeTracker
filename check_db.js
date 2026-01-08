const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
  });
}

const userId = 'iPhone_11_Pro_Max_1767823534066_jnb18y3j1';
const db = admin.database();

(async () => {
  try {
    console.log('Checking database structure...\n');
    
    // Check root level
    const rootSnapshot = await db.ref(`users/${userId}`).get();
    if (rootSnapshot.exists()) {
      const data = rootSnapshot.val();
      console.log('Root level keys:', Object.keys(data));
      console.log('FCM Token at root:', data.fcmToken || '❌ Not found');
      console.log();
    }
    
    // Check nested level
    const nestedSnapshot = await db.ref(`users/${userId}/users`).get();
    if (nestedSnapshot.exists()) {
      console.log('⚠️  Nested "users" node exists!');
      const nestedData = nestedSnapshot.val();
      console.log('Nested structure:', JSON.stringify(nestedData, null, 2));
      
      // Move the token if found
      if (nestedData[userId]) {
        const tokenData = nestedData[userId];
        console.log('\n📝 Moving token to root...');
        
        await db.ref(`users/${userId}`).update({
          fcmToken: tokenData.fcmToken,
          fcmTokenUpdatedAt: tokenData.fcmTokenUpdatedAt || Date.now(),
          platform: tokenData.platform,
          deviceModel: tokenData.deviceModel,
          osVersion: tokenData.osVersion
        });
        
        console.log('✅ Token moved to root');
        
        // Remove nested structure
        await db.ref(`users/${userId}/users`).remove();
        console.log('✅ Deleted nested users node');
      }
    } else {
      console.log('✅ No nested users node found');
    }
    
    // Verify final state
    console.log('\n--- Final State ---');
    const finalSnapshot = await db.ref(`users/${userId}`).get();
    if (finalSnapshot.exists()) {
      const data = finalSnapshot.val();
      console.log('FCM Token:', data.fcmToken || '❌ Not found');
      console.log('Platform:', data.platform || 'Not set');
      console.log('Device:', data.deviceModel || 'Not set');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();

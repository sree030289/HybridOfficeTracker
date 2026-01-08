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
    // Get nested token data
    const nestedRef = db.ref(`users/${userId}/users/${userId}`);
    const snapshot = await nestedRef.get();
    
    if (snapshot.exists()) {
      const tokenData = snapshot.val();
      console.log('Found nested token data:', tokenData);
      
      // Move to correct location
      const rootRef = db.ref(`users/${userId}`);
      await rootRef.update({
        fcmToken: tokenData.fcmToken,
        fcmTokenUpdatedAt: tokenData.fcmTokenUpdatedAt,
        platform: tokenData.platform,
        deviceModel: tokenData.deviceModel,
        osVersion: tokenData.osVersion
      });
      console.log('✅ Moved token to correct location');
      
      // Delete nested structure
      await db.ref(`users/${userId}/users`).remove();
      console.log('✅ Deleted nested users node');
      console.log('\n✨ Token path fixed! Try the curl command again.');
    } else {
      console.log('❌ No nested data found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();

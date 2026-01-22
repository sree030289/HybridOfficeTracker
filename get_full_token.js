const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

async function getFullToken() {
  const snapshot = await db.ref('users/iPhone_17_Pro_Max_1764234466966_kcm2cx7cb').once('value');
  const userData = snapshot.val();
  
  console.log('🔍 FULL FCM TOKEN:');
  console.log('═'.repeat(80));
  console.log(userData.fcmToken);
  console.log('');
  console.log('Token length:', userData.fcmToken?.length || 0);
  console.log('Starts with ExponentPushToken:', userData.fcmToken?.startsWith('ExponentPushToken'));
  
  process.exit(0);
}

getFullToken().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

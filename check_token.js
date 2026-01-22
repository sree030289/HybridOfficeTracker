const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const userId = 'iPhone_11_Pro_Max_1767877443924_k2aocjo2x';

admin.database().ref(`users/${userId}`).once('value')
  .then(snapshot => {
    const data = snapshot.val();
    console.log('User data:', JSON.stringify(data, null, 2));
    console.log('\n📱 FCM Token:', data?.fcmToken);
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

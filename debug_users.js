const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const userId = 'iPhone_11_Pro_Max_1767877443924_k2aocjo2x';

admin.database().ref(`users/${userId}`).once('value')
  .then(snapshot => {
    const userData = snapshot.val();
    
    console.log('\n=== Debug User Data Structure ===');
    console.log('User ID:', userId);
    console.log('\n1. settings object:', JSON.stringify(userData.settings, null, 2));
    console.log('\n2. userData object:', JSON.stringify(userData.userData, null, 2));
    console.log('\n3. trackingMode from settings:', userData.settings?.trackingMode);
    console.log('4. trackingMode from userData:', userData.userData?.trackingMode);
    console.log('\n5. fcmToken:', userData.fcmToken);
    console.log('\n6. Condition checks:');
    console.log('   - Has settings?.trackingMode === "auto"?', userData.settings?.trackingMode === 'auto');
    console.log('   - Has userData?.trackingMode === "auto"?', userData.userData?.trackingMode === 'auto');
    console.log('   - Has fcmToken?', !!userData.fcmToken);
    
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

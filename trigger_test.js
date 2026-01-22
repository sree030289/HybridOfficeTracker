const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const userId = 'iPhone_11_Pro_Max_1767877443924_k2aocjo2x';

console.log('Testing database trigger by updating nearOffice...\n');

// First, read current value
admin.database().ref(`users/${userId}/nearOffice`).once('value')
  .then(snapshot => {
    console.log('Current nearOffice:', JSON.stringify(snapshot.val(), null, 2));
    
    // Now update it to trigger the function
    console.log('\nUpdating nearOffice.detected to false, then back to true...');
    
    return admin.database().ref(`users/${userId}/nearOffice`).update({
      detected: false,
      timestamp: Date.now()
    });
  })
  .then(() => {
    console.log('✅ Set to false');
    return new Promise(resolve => setTimeout(resolve, 2000));
  })
  .then(() => {
    console.log('Now setting to true (should trigger Cloud Function)...');
    const today = new Date().toISOString().split('T')[0];
    return admin.database().ref(`users/${userId}/nearOffice`).update({
      detected: true,
      timestamp: Date.now(),
      date: today
    });
  })
  .then(() => {
    console.log('✅ Set to true');
    console.log('\n📱 Check your iPhone for notification in the next 5-10 seconds!');
    console.log('If no notification arrives, the Cloud Function trigger is not working.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

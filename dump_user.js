const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const userId = 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb';

admin.database().ref(`users/${userId}`).once('value')
  .then(snapshot => {
    const data = snapshot.val();
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

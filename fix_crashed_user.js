const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();
const userId = 'iPhone_16_Pro_1762136337037_rnlp3v4sh';

console.log(`Setting migrationCompleted flag for user: ${userId}`);

db.ref(`users/${userId}/migrationCompleted`).set(true)
  .then(() => {
    console.log('✅ Migration flag set to TRUE!');
    console.log('✅ User should stop crashing immediately when they next open the app.');
    console.log('   No new app build needed - the current app will check this flag.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error setting migration flag:', error);
    process.exit(1);
  });

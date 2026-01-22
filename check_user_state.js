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
    
    console.log('\n=== User State Analysis ===');
    console.log('User ID:', userId);
    
    console.log('\n📊 Settings:');
    console.log('  monthlyTarget:', data.settings?.monthlyTarget || 'MISSING');
    console.log('  targetMode:', data.settings?.targetMode || 'MISSING');
    
    console.log('\n👤 User Data:');
    console.log('  companyName:', data.userData?.companyName || 'MISSING');
    console.log('  companyAddress:', data.userData?.companyAddress || 'MISSING');
    console.log('  trackingMode:', data.userData?.trackingMode || 'MISSING');
    console.log('  companyLocation:', data.userData?.companyLocation ? '✅ EXISTS' : '❌ MISSING');
    
    console.log('\n📅 Attendance Data:');
    const attendanceCount = Object.keys(data.attendanceData || {}).length;
    console.log('  Total entries:', attendanceCount);
    
    console.log('\n📍 Geofencing:');
    console.log('  nearOffice field:', data.nearOffice ? '✅ EXISTS' : '❌ MISSING');
    
    console.log('\n🔧 Onboarding Status:');
    const hasSettings = data.settings?.monthlyTarget && data.settings?.targetMode;
    const hasCompany = data.userData?.companyName && data.userData?.companyLocation;
    const hasTracking = data.userData?.trackingMode;
    
    if (hasSettings && hasCompany && hasTracking) {
      console.log('  ✅ COMPLETE - User should have geofencing enabled');
      
      if (data.userData.trackingMode === 'auto') {
        console.log('\n📍 AUTO MODE - Geofencing should be active');
        console.log('  Expected: nearOffice field appears when entering office');
        console.log('  Actual: nearOffice field', data.nearOffice ? 'EXISTS' : 'MISSING ❌');
        
        if (!data.nearOffice) {
          console.log('\n⚠️ PROBLEM: User is in AUTO mode but nearOffice never triggered!');
          console.log('Possible causes:');
          console.log('  1. Location permissions not granted (need "Always Allow")');
          console.log('  2. App was never opened after onboarding');
          console.log('  3. Geofencing failed to start (check app logs)');
          console.log('  4. User never actually entered the office geofence (100m radius)');
        }
      } else {
        console.log('\n📱 MANUAL MODE - Geofencing disabled');
      }
    } else {
      console.log('  ❌ INCOMPLETE - Onboarding not finished');
      if (!hasSettings) console.log('    - Missing settings (monthlyTarget, targetMode)');
      if (!hasCompany) console.log('    - Missing company data');
      if (!hasTracking) console.log('    - Missing trackingMode');
    }
    
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

/**
 * Check Firebase Database for Existing Push Tokens
 * 
 * This script checks if your current users (on old versions) have any
 * push notification tokens stored in Firebase from Expo's automatic registration.
 * 
 * Usage: node check_existing_tokens.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
  const serviceAccount = require('./serviceAccountKey.json');
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
  
  console.log('✅ Firebase Admin initialized successfully\n');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  process.exit(1);
}

async function checkExistingTokens() {
  try {
    console.log('🔍 Checking Firebase database for existing tokens...\n');
    
    const db = admin.database();
    const usersRef = db.ref('users');
    
    // Get all users
    const snapshot = await usersRef.once('value');
    const users = snapshot.val();
    
    if (!users) {
      console.log('⚠️  No users found in database');
      return;
    }
    
    const userCount = Object.keys(users).length;
    console.log(`📊 Total users in database: ${userCount}\n`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    let usersWithFcmToken = 0;
    let usersWithExpoPushToken = 0;
    let usersWithNotificationToken = 0;
    let usersWithAnyToken = 0;
    
    const tokensByField = {
      fcmToken: [],
      expoPushToken: [],
      notificationToken: [],
      pushToken: [],
      token: []
    };
    
    // Check each user for various token field names
    Object.entries(users).forEach(([userId, userData]) => {
      let hasToken = false;
      
      // Check for fcmToken (our new implementation)
      if (userData.fcmToken) {
        usersWithFcmToken++;
        tokensByField.fcmToken.push({ userId, token: userData.fcmToken });
        hasToken = true;
      }
      
      // Check for expoPushToken (common Expo field name)
      if (userData.expoPushToken) {
        usersWithExpoPushToken++;
        tokensByField.expoPushToken.push({ userId, token: userData.expoPushToken });
        hasToken = true;
      }
      
      // Check for notificationToken
      if (userData.notificationToken) {
        usersWithNotificationToken++;
        tokensByField.notificationToken.push({ userId, token: userData.notificationToken });
        hasToken = true;
      }
      
      // Check for pushToken
      if (userData.pushToken) {
        tokensByField.pushToken.push({ userId, token: userData.pushToken });
        hasToken = true;
      }
      
      // Check for generic token
      if (userData.token) {
        tokensByField.token.push({ userId, token: userData.token });
        hasToken = true;
      }
      
      if (hasToken) {
        usersWithAnyToken++;
      }
    });
    
    // Display results
    console.log('📊 Token Analysis:\n');
    console.log(`   Users with fcmToken:           ${usersWithFcmToken}`);
    console.log(`   Users with expoPushToken:      ${usersWithExpoPushToken}`);
    console.log(`   Users with notificationToken:  ${usersWithNotificationToken}`);
    console.log(`   Users with pushToken:          ${tokensByField.pushToken.length}`);
    console.log(`   Users with token:              ${tokensByField.token.length}`);
    console.log(`   ─────────────────────────────────────────────────`);
    console.log(`   Users with ANY token:          ${usersWithAnyToken}`);
    console.log(`   Users WITHOUT tokens:          ${userCount - usersWithAnyToken}\n`);
    
    // Show sample tokens if found
    console.log('═══════════════════════════════════════════════════════\n');
    
    if (usersWithAnyToken > 0) {
      console.log('✅ GOOD NEWS! Found existing tokens:\n');
      
      Object.entries(tokensByField).forEach(([fieldName, tokens]) => {
        if (tokens.length > 0) {
          console.log(`📱 ${fieldName} (${tokens.length} users):`);
          tokens.slice(0, 2).forEach(({ userId, token }) => {
            console.log(`   User: ${userId.substring(0, 8)}...`);
            console.log(`   Token: ${token.substring(0, 50)}...`);
            console.log('');
          });
        }
      });
      
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('✨ You can send notifications to these users NOW!\n');
      console.log('💡 Next steps:');
      console.log('   1. Update send_update_notification.js to check ALL token fields');
      console.log('   2. Run: node send_update_notification.js --now\n');
      
    } else {
      console.log('❌ No tokens found in database.\n');
      console.log('💡 Possible reasons:');
      console.log('   1. Old app versions never registered push tokens');
      console.log('   2. Users never granted notification permissions');
      console.log('   3. Tokens are stored elsewhere or with different field names\n');
      console.log('💡 Solutions:');
      console.log('   1. Check AsyncStorage on devices (tokens might be local only)');
      console.log('   2. Release v2.2.1 with FCM registration code');
      console.log('   3. Use alternative notification methods (email, in-app banner)\n');
    }
    
    // Export tokens to JSON file for manual inspection
    if (usersWithAnyToken > 0) {
      const fs = require('fs');
      const allTokens = {};
      
      Object.entries(tokensByField).forEach(([fieldName, tokens]) => {
        if (tokens.length > 0) {
          allTokens[fieldName] = tokens;
        }
      });
      
      fs.writeFileSync('existing_tokens.json', JSON.stringify(allTokens, null, 2));
      console.log('💾 Tokens exported to: existing_tokens.json\n');
    }
    
  } catch (error) {
    console.error('❌ Error checking tokens:', error);
    throw error;
  }
}

// Run the check
console.log('═══════════════════════════════════════════════════════');
console.log('   Token Discovery Tool - OfficeTrack');
console.log('═══════════════════════════════════════════════════════\n');

checkExistingTokens()
  .then(() => {
    console.log('✅ Token check complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });

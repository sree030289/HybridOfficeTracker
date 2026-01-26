const admin = require('firebase-admin');
const https = require('https');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

// Google Places API Key (same as in App.js)
const GOOGLE_PLACES_API_KEY = 'AIzaSyBsAxs-hOPqsrmMZ2SvcUW0zhm2RHbvtW0';

// Legacy country mapping for users without address
const LEGACY_COUNTRY_MAP = {
  'australia': { country: 'AU', countryCode: 'AU', countryName: 'Australia' },
  'india': { country: 'IN', countryCode: 'IN', countryName: 'India' },
  'usa': { country: 'US', countryCode: 'US', countryName: 'United States' },
  'uk': { country: 'GB', countryCode: 'GB', countryName: 'United Kingdom' },
  'canada': { country: 'CA', countryCode: 'CA', countryName: 'Canada' }
};

// Geocode address to get country
async function detectCountryFromAddress(address) {
  return new Promise((resolve, reject) => {
    if (!address || address.trim().length === 0) {
      resolve({ country: 'AU', countryCode: 'AU', countryName: 'Australia' });
      return;
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_PLACES_API_KEY}`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.status === 'OK' && result.results && result.results.length > 0) {
            const addressComponents = result.results[0].address_components;
            const countryComponent = addressComponents.find(comp => comp.types.includes('country'));
            
            if (countryComponent) {
              resolve({
                country: countryComponent.short_name,
                countryCode: countryComponent.short_name,
                countryName: countryComponent.long_name
              });
              return;
            }
          }
          
          resolve({ country: 'AU', countryCode: 'AU', countryName: 'Australia' });
        } catch (error) {
          console.error('Error parsing geocode result:', error);
          resolve({ country: 'AU', countryCode: 'AU', countryName: 'Australia' });
        }
      });
    }).on('error', (error) => {
      console.error('Error fetching geocode:', error);
      resolve({ country: 'AU', countryCode: 'AU', countryName: 'Australia' });
    });
  });
}

// Sleep helper to avoid rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function migrateCountryCodes() {
  console.log('🚀 Starting country code migration...\n');
  
  try {
    // Get all users
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found in database');
      return;
    }
    
    const userIds = Object.keys(users);
    console.log(`📊 Found ${userIds.length} users to process\n`);
    
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let geocodedCount = 0;
    let legacyMappedCount = 0;
    
    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const userData = users[userId].userData;
      
      console.log(`\n[${i + 1}/${userIds.length}] Processing user: ${userId.substring(0, 30)}...`);
      
      if (!userData) {
        console.log('  ⚠️  No userData section, skipping...');
        skippedCount++;
        continue;
      }
      
      // Check if needs migration
      // Strategy: If user has an address, always re-geocode to ensure accuracy
      // This handles both new migrations and fixing incorrect AU assignments
      const hasAddress = userData.companyAddress && userData.companyAddress.trim().length > 0;
      const needsMigration = hasAddress;
      
      if (!needsMigration) {
        if (userData.countryCode) {
          console.log(`  ✅ No address, keeping existing (countryCode: ${userData.countryCode})`);
        } else {
          console.log('  ⚠️  No address or country data, skipping...');
        }
        skippedCount++;
        continue;
      }
      
      console.log(`  🔄 Re-geocoding address to ensure correct country...`);
      
      try {
        let detectedCountry;
        
        // Try geocoding from address first
        if (userData.companyAddress && userData.companyAddress.trim().length > 0) {
          console.log(`  📍 Geocoding address: "${userData.companyAddress}"`);
          detectedCountry = await detectCountryFromAddress(userData.companyAddress);
          console.log(`  ✅ Detected: ${detectedCountry.countryName} (${detectedCountry.countryCode})`);
          geocodedCount++;
          
          // Rate limiting: wait 200ms between geocoding requests
          await sleep(200);
        } else {
          // Fallback to legacy mapping
          console.log(`  📋 No address, using legacy mapping for: ${userData.country}`);
          detectedCountry = LEGACY_COUNTRY_MAP[userData.country.toLowerCase()] || 
                           { country: 'AU', countryCode: 'AU', countryName: 'Australia' };
          console.log(`  ✅ Mapped to: ${detectedCountry.countryName} (${detectedCountry.countryCode})`);
          legacyMappedCount++;
        }
        
        // Update userData in Firebase
        const updates = {
          country: detectedCountry.country,
          countryCode: detectedCountry.countryCode,
          countryName: detectedCountry.countryName
        };
        
        await db.ref(`users/${userId}/userData`).update(updates);
        console.log(`  💾 Updated Firebase with new country code`);
        
        successCount++;
        
      } catch (error) {
        console.error(`  ❌ Error processing user:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users processed: ${userIds.length}`);
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`   - Via geocoding: ${geocodedCount}`);
    console.log(`   - Via legacy mapping: ${legacyMappedCount}`);
    console.log(`⚠️  Skipped (already migrated or no data): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));
    console.log('\n✅ Migration completed!\n');
    
  } catch (error) {
    console.error('❌ Fatal error during migration:', error);
  } finally {
    // Close Firebase connection
    await db.goOffline();
    process.exit(0);
  }
}

// Run migration
migrateCountryCodes();

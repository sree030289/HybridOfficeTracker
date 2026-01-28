/**
 * Migration script: Add countryName to all users based on their companyAddress
 * 
 * This populates userData.countryName (e.g., "New Zealand", "Australia")
 * so the app UI can display it without relying on COUNTRY_DATA
 * 
 * DRY RUN: node migrate_country_names.js --dry-run
 * LIVE:    node migrate_country_names.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const GOOGLE_API_KEY = 'AIzaSyBsAxs-hOPqsrmMZ2SvcUW0zhm2RHbvtW0';

const dryRun = process.argv.includes('--dry-run');

// Map ISO code to normalized country code for cache keys
const countryCodeMap = {
  'AU': 'australia',
  'NZ': 'nz',
  'GB': 'uk',
  'IN': 'india',
  'US': 'usa',
  'CA': 'canada',
  'SG': 'singapore'
};

// Map ISO code to full country name for display
const countryNameMap = {
  'AU': 'Australia',
  'NZ': 'New Zealand',
  'GB': 'United Kingdom',
  'IN': 'India',
  'US': 'United States',
  'CA': 'Canada',
  'SG': 'Singapore',
  'MY': 'Malaysia',
  'ID': 'Indonesia',
  'TH': 'Thailand',
  'PH': 'Philippines',
  'VN': 'Vietnam',
  'JP': 'Japan',
  'KR': 'South Korea',
  'CN': 'China',
  'DE': 'Germany',
  'FR': 'France',
  'IT': 'Italy',
  'ES': 'Spain',
  'NL': 'Netherlands',
  'BE': 'Belgium',
  'CH': 'Switzerland',
  'AT': 'Austria',
  'SE': 'Sweden',
  'NO': 'Norway',
  'DK': 'Denmark',
  'FI': 'Finland',
  'IE': 'Ireland',
  'PT': 'Portugal',
  'PL': 'Poland',
  'CZ': 'Czech Republic',
  'GR': 'Greece',
  'BR': 'Brazil',
  'MX': 'Mexico',
  'AR': 'Argentina',
  'CL': 'Chile',
  'CO': 'Colombia',
  'ZA': 'South Africa',
  'AE': 'United Arab Emirates',
  'SA': 'Saudi Arabia',
  'IL': 'Israel',
  'EG': 'Egypt',
  'NG': 'Nigeria',
  'KE': 'Kenya',
  'RU': 'Russia',
  'TR': 'Turkey',
  'UA': 'Ukraine'
};

async function detectCountryFromAddress(address) {
  const encodedAddress = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_API_KEY}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status === 'OK' && data.results && data.results[0]) {
    const addressComponents = data.results[0].address_components;
    for (const component of addressComponents) {
      if (component.types.includes('country')) {
        return {
          isoCode: component.short_name,
          fullName: component.long_name
        };
      }
    }
  }
  return null;
}

async function migrate() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔄 MIGRATION: Add countryName to all users`);
  console.log(`   Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '🔴 LIVE (will modify data)'}`);
  console.log(`${'='.repeat(70)}\n`);
  
  const db = admin.database();
  const usersRef = db.ref('users');
  const snapshot = await usersRef.once('value');
  const users = snapshot.val();
  
  if (!users) {
    console.log('❌ No users found');
    process.exit(1);
  }
  
  const stats = {
    total: 0,
    updated: 0,
    skipped: 0,
    noAddress: 0,
    alreadyHas: 0,
    failed: 0
  };
  
  console.log(`👥 Found ${Object.keys(users).length} users to process\n`);
  
  for (const [userId, userData] of Object.entries(users)) {
    stats.total++;
    
    const shortId = userId.substring(0, 35) + (userId.length > 35 ? '...' : '');
    
    // Skip if already has countryName
    if (userData.userData?.countryName) {
      stats.alreadyHas++;
      continue;
    }
    
    // Skip if no company address
    if (!userData.userData?.companyAddress) {
      stats.noAddress++;
      continue;
    }
    
    const address = userData.userData.companyAddress;
    
    try {
      // Detect country from address
      const countryInfo = await detectCountryFromAddress(address);
      
      if (!countryInfo) {
        console.log(`⚠️  [${stats.total}] ${shortId}: Could not detect country`);
        stats.failed++;
        continue;
      }
      
      const { isoCode, fullName } = countryInfo;
      const normalizedCountry = countryCodeMap[isoCode] || isoCode.toLowerCase();
      const countryName = countryNameMap[isoCode] || fullName;
      
      console.log(`📍 [${stats.total}] ${shortId}`);
      console.log(`   Address: "${address.substring(0, 50)}..."`);
      console.log(`   Detected: ${isoCode} → country: ${normalizedCountry}, countryName: ${countryName}`);
      
      if (!dryRun) {
        await db.ref(`users/${userId}/userData`).update({
          country: normalizedCountry,
          countryName: countryName
        });
        console.log(`   ✅ Updated`);
      } else {
        console.log(`   🔍 Would update (dry run)`);
      }
      
      stats.updated++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.log(`❌ [${stats.total}] ${shortId}: ${error.message}`);
      stats.failed++;
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Total users: ${stats.total}`);
  console.log(`   ${dryRun ? 'Would update' : 'Updated'}: ${stats.updated}`);
  console.log(`   Already has countryName: ${stats.alreadyHas}`);
  console.log(`   No company address: ${stats.noAddress}`);
  console.log(`   Failed: ${stats.failed}`);
  
  if (dryRun) {
    console.log(`\n⚠️  This was a DRY RUN - no data was changed`);
    console.log(`🚀 To apply changes, run: node migrate_country_names.js`);
  } else {
    console.log(`\n✅ Migration complete!`);
  }
  
  console.log(`${'='.repeat(70)}\n`);
  
  process.exit(0);
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

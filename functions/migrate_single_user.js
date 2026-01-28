/**
 * Migrate single user - detect country from address and update userData.country
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const GOOGLE_API_KEY = 'AIzaSyBsAxs-hOPqsrmMZ2SvcUW0zhm2RHbvtW0';

const countryCodeMap = {
  'AU': 'australia',
  'NZ': 'nz',
  'GB': 'uk',
  'IN': 'india',
  'US': 'usa',
  'CA': 'canada',
  'SG': 'singapore'
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
        return component.short_name; // Returns ISO code like 'NZ', 'AU', etc.
      }
    }
  }
  return null;
}

async function fetchHolidaysFromAPI(countryCode, year) {
  try {
    const nagerUrl = `https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`;
    const nagerResponse = await fetch(nagerUrl);
    
    if (nagerResponse.ok) {
      const data = await nagerResponse.json();
      const holidays = {};
      data.forEach(holiday => {
        holidays[holiday.date] = holiday.localName || holiday.name;
      });
      return holidays;
    }
  } catch (error) {
    console.log(`Nager.Date failed: ${error.message}`);
  }
  return {};
}

async function migrate() {
  const userId = 'iPhone_11_Pro_Max_1769603114833_gv919swyz';
  const db = admin.database();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 Migrating user: ${userId}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Get user data
  const snapshot = await db.ref(`users/${userId}`).once('value');
  const userData = snapshot.val();
  
  if (!userData) {
    console.log('❌ User not found');
    process.exit(1);
  }
  
  console.log('📋 Current state:');
  console.log(`   userData.country: ${userData.userData?.country}`);
  console.log(`   userData.companyAddress: ${userData.userData?.companyAddress}`);
  console.log(`   cachedHolidays keys: ${Object.keys(userData.cachedHolidays || {}).join(', ')}`);
  
  // Detect country from address
  const address = userData.userData?.companyAddress;
  if (!address) {
    console.log('❌ No company address found');
    process.exit(1);
  }
  
  console.log(`\n🌍 Detecting country from address...`);
  const isoCode = await detectCountryFromAddress(address);
  console.log(`   ISO code: ${isoCode}`);
  
  const normalizedCountry = countryCodeMap[isoCode] || isoCode?.toLowerCase();
  console.log(`   Normalized: ${normalizedCountry}`);
  
  // Fetch holidays
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  console.log(`\n📅 Fetching holidays for ${isoCode}...`);
  const holidays2026 = await fetchHolidaysFromAPI(isoCode, currentYear);
  const holidays2027 = await fetchHolidaysFromAPI(isoCode, nextYear);
  
  console.log(`   ${currentYear}: ${Object.keys(holidays2026).length} holidays`);
  console.log(`   ${nextYear}: ${Object.keys(holidays2027).length} holidays`);
  
  // Build updates
  const cachedHolidays = {};
  const holidayLastUpdated = {};
  
  if (Object.keys(holidays2026).length > 0) {
    cachedHolidays[`${normalizedCountry}_${currentYear}`] = holidays2026;
    holidayLastUpdated[`${normalizedCountry}_${currentYear}`] = Date.now();
  }
  if (Object.keys(holidays2027).length > 0) {
    cachedHolidays[`${normalizedCountry}_${nextYear}`] = holidays2027;
    holidayLastUpdated[`${normalizedCountry}_${nextYear}`] = Date.now();
  }
  
  console.log(`\n📝 Applying updates...`);
  
  // Update root level
  await db.ref(`users/${userId}`).update({
    cachedHolidays: cachedHolidays,
    holidayLastUpdated: holidayLastUpdated
  });
  console.log(`   ✅ Updated cachedHolidays (keys: ${Object.keys(cachedHolidays).join(', ')})`);
  
  // Update userData.country
  await db.ref(`users/${userId}/userData`).update({
    country: normalizedCountry
  });
  console.log(`   ✅ Updated userData.country: ${userData.userData?.country} → ${normalizedCountry}`);
  
  // Verify
  const verifySnapshot = await db.ref(`users/${userId}`).once('value');
  const verifyData = verifySnapshot.val();
  
  console.log(`\n📋 After migration:`);
  console.log(`   userData.country: ${verifyData.userData?.country}`);
  console.log(`   cachedHolidays keys: ${Object.keys(verifyData.cachedHolidays || {}).join(', ')}`);
  
  console.log(`\n✅ Migration complete!`);
  console.log(`${'='.repeat(60)}\n`);
  
  process.exit(0);
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

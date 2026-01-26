// OfficeTrack MVP - Ready to Launch Next Week
// Free tier features as requested

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  StatusBar as RNStatusBar,
  FlatList,
  Dimensions,
  Platform,
  Linking,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import * as Application from 'expo-application';
import { moveAsync, documentDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import firebaseService from './services/firebaseService';
import fcmService from './services/fcmService';
import productionLogger from './services/productionLogger';

// Error Boundary to catch render crashes and prevent white screen
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    productionLogger.error('React Error Boundary caught error', error, {
      componentStack: errorInfo.componentStack
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 20 }}>
          <Text style={{ fontSize: 24, color: '#FFD700', marginBottom: 16, fontWeight: 'bold' }}>⚠️ Oops!</Text>
          <Text style={{ fontSize: 16, color: '#FFFFFF', marginBottom: 24, textAlign: 'center' }}>
            Something went wrong. Don't worry, your data is safe.
          </Text>
          <TouchableOpacity
            onPress={this.handleRetry}
            style={{ backgroundColor: '#FFD700', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 }}
          >
            <Text style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 'bold' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const OFFICE_GEOFENCE_TASK = 'OFFICE_GEOFENCE_TASK';
const OFFICE_GEOFENCE_REGION_ID = 'office_region';
const OFFICE_GEOFENCE_CONFIG_KEY = 'officetrack_office_geofence_config_v1';
const CACHE_KEY_ATTENDANCE = 'officetrack_attendance_cache_v1';

const startOfficeGeofencingAsync = async (companyLocation) => {
  if (Platform.OS === 'web') return;
  if (!companyLocation?.latitude || !companyLocation?.longitude) return;

  try {
    const existingConfigRaw = await AsyncStorage.getItem(OFFICE_GEOFENCE_CONFIG_KEY);
    const existingConfig = existingConfigRaw ? JSON.parse(existingConfigRaw) : null;
    const nextConfig = {
      latitude: companyLocation.latitude,
      longitude: companyLocation.longitude,
      radius: 100,
    };

    const alreadyStarted = await Location.hasStartedGeofencingAsync(OFFICE_GEOFENCE_TASK);
    const isSameConfig =
      existingConfig &&
      existingConfig.latitude === nextConfig.latitude &&
      existingConfig.longitude === nextConfig.longitude &&
      existingConfig.radius === nextConfig.radius;

    if (alreadyStarted && isSameConfig) {
      return;
    }

    // Ensure permissions (background required for closed-app arrival)
    const fg = await Location.getForegroundPermissionsAsync();
    console.log('📍 Foreground permission status:', fg.status);
    productionLogger.info('Checking foreground location permission', { status: fg.status });
    
    if (fg.status !== 'granted') {
      console.log('ℹ️ Geofencing not started: foreground location permission not granted');
      productionLogger.warn('Geofencing blocked: foreground permission not granted', { status: fg.status });
      return;
    }

    const bg = await Location.getBackgroundPermissionsAsync();
    console.log('📍 Background permission status:', bg.status);
    productionLogger.info('Checking background location permission', { status: bg.status });
    
    if (bg.status !== 'granted') {
      console.log('ℹ️ Geofencing not started: background location permission not granted');
      productionLogger.warn('Geofencing blocked: background permission not granted', { status: bg.status });
      return;
    }

    if (alreadyStarted) {
      await Location.stopGeofencingAsync(OFFICE_GEOFENCE_TASK);
    }

    const regions = [
      {
        identifier: OFFICE_GEOFENCE_REGION_ID,
        latitude: companyLocation.latitude,
        longitude: companyLocation.longitude,
        radius: 100,
        notifyOnEnter: true,
        notifyOnExit: false,
      },
    ];

    await Location.startGeofencingAsync(OFFICE_GEOFENCE_TASK, regions);
    await AsyncStorage.setItem(OFFICE_GEOFENCE_CONFIG_KEY, JSON.stringify(nextConfig));
    console.log('✅ Office geofencing started successfully');
    console.log('📍 Geofence details:', {
      latitude: companyLocation.latitude,
      longitude: companyLocation.longitude,
      radius: 100
    });
    console.log('🔧 Geofence will trigger when entering office radius');
    
    // Log to Firebase for remote debugging
    productionLogger.info('Geofencing started', {
      latitude: companyLocation.latitude,
      longitude: companyLocation.longitude,
      radius: 100
    });

    // CRITICAL: Check if user is already inside the geofence (for upgraded users)
    // This handles the case where user updates app while already at office
    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const distance = calculateDistance(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
        companyLocation.latitude,
        companyLocation.longitude
      );
      
      console.log(`📍 Current distance from office: ${Math.round(distance)}m`);
      productionLogger.info('Initial location check', { 
        distance: Math.round(distance),
        isInside: distance <= 100 
      });
      
      if (distance <= 100) {
        console.log('🏢 User is already inside office geofence - triggering notification');
        productionLogger.info('User already inside geofence on startup');
        
        // Manually trigger the same logic as geofence ENTER
        const todayISO = new Date().toISOString();
        const today = todayISO ? todayISO.split('T')[0] : null;
        if (!today) {
          console.warn("⚠️ Failed to get today's date");
          return;
        }
        const userId = await AsyncStorage.getItem('userId');
        
        if (userId) {
          // Update Firebase
          await firebaseService.initialize(userId);
          await firebaseService.updateData('nearOffice', {
            detected: true,
            timestamp: Date.now(),
            date: today
          });
          
          // Call Cloud Function
          await fetch('https://us-central1-hybridofficetracker.cloudfunctions.net/sendNearOfficeNotification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          });
          
          console.log('✅ Initial geofence notification sent');
          productionLogger.info('Initial geofence notification sent', { date: today });
        }
      }
    } catch (locationError) {
      console.log('ℹ️ Could not check initial location:', locationError.message);
      productionLogger.warn('Initial location check failed', { error: locationError.message });
    }
  } catch (error) {
    console.error('❌ Failed to start office geofencing:', error);
    console.error('Error details:', error.message);
  }
};

const stopOfficeGeofencingAsync = async () => {
  if (Platform.OS === 'web') return;
  try {
    const started = await Location.hasStartedGeofencingAsync(OFFICE_GEOFENCE_TASK);
    if (started) {
      await Location.stopGeofencingAsync(OFFICE_GEOFENCE_TASK);
      console.log('🛑 Office geofencing stopped');
    }
    await AsyncStorage.removeItem(OFFICE_GEOFENCE_CONFIG_KEY);
  } catch (error) {
    console.error('❌ Failed to stop office geofencing:', error);
  }
};

// Utility function to get proper local date without timezone issues
const getLocalDate = (dateString = null) => {
  if (dateString) {
    // Parse date string as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  }
  // For current date, use device's local time
  return new Date();
};

// Utility function to format date as YYYY-MM-DD string consistently in local timezone
const getLocalDateString = (date = null) => {
  const localDate = date || new Date();
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Utility function to get today's date string consistently
const getTodayString = () => {
  return getLocalDateString(new Date());
};

// Utility function to check if a date is weekend in local timezone
const isWeekendDate = (dateString) => {
  const date = getLocalDate(dateString);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
};

// Define the geofencing task at module scope (required by expo-task-manager)
if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(OFFICE_GEOFENCE_TASK, async ({ data, error }) => {
      console.log('🚨 GEOFENCE TASK TRIGGERED!', { data, error });
      
      // Log to Firebase for remote debugging
      productionLogger.info('Geofence task triggered', { 
        eventType: data?.eventType,
        hasError: !!error,
        errorMessage: error?.message
      });
      
      if (error) {
        console.error('❌ Geofence task error:', error);
        productionLogger.error('Geofence task error', error);
        return;
      }

      const eventType = data?.eventType;
      const region = data?.region;
      console.log('📍 Geofence event:', { eventType, region });
      
      if (!region) return;

      if (eventType !== Location.GeofencingEventType.Enter) {
        console.log('ℹ️ Ignoring geofence exit event');
        return;
      }

      console.log('✅ Geofence ENTER detected!');
      productionLogger.info('Geofence ENTER detected');
      
      try {
        // Ensure auto mode is still enabled (safety check)
        const localData = await firebaseService.getLocalData();
        const trackingMode = localData?.userData?.trackingMode;
        if (trackingMode !== 'auto') {
          return;
        }

        const today = getTodayString();
        
        // Skip if weekend or holiday
        if (isWeekendDate(today)) {
          console.log('ℹ️ Geofence enter ignored: weekend');
          return;
        }
        const publicHols = localData?.publicHolidays || {};
        if (publicHols[today]) {
          console.log(`ℹ️ Geofence enter ignored: holiday (${publicHols[today]})`);
          return;
        }

        const existingFromFirebaseCache = localData?.attendanceData?.[today];

        const cachedAttendanceRaw = await AsyncStorage.getItem(CACHE_KEY_ATTENDANCE);
        const cachedAttendance = cachedAttendanceRaw ? JSON.parse(cachedAttendanceRaw) : {};
        const existingFromAttendanceCache = cachedAttendance?.[today];

        if (existingFromFirebaseCache || existingFromAttendanceCache) {
          return;
        }

        const userId = await AsyncStorage.getItem('userId');
        if (!userId) {
          console.log('ℹ️ Geofence enter ignored: missing userId');
          return;
        }

        // Update Firebase to indicate user is near office
        await firebaseService.initialize(userId);
        await firebaseService.updateData('nearOffice', {
          detected: true,
          timestamp: Date.now(),
          date: today
        });
        console.log('✅ nearOffice flag updated in Firebase');
        productionLogger.info('nearOffice flag updated', { userId, date: today });

        // Call Cloud Function directly to send notification (more reliable than database trigger)
        try {
          console.log('📤 Calling sendNearOfficeNotification endpoint...');
          const response = await fetch('https://us-central1-hybridofficetracker.cloudfunctions.net/sendNearOfficeNotification', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId: userId })
          });
          const result = await response.json();
          console.log('✅ Geofence notification sent:', result);
          productionLogger.info('Geofence notification sent', result);
        } catch (notifError) {
          console.error('❌ Failed to send geofence notification:', notifError);
          productionLogger.error('Failed to send geofence notification', notifError);
        }

        console.log('📍 Geofence enter: Completed all actions for', today);
        productionLogger.info('Geofence enter completed', { date: today });
      } catch (taskError) {
        console.error('❌ Geofence enter handler failed:', taskError);
      }
    });
  } catch (defineError) {
    console.error('❌ Failed to define geofence task:', defineError);
  }
}

// TaskManager is available for future use if needed
// Currently using smart notifications with location check on demand

// Configure notifications (only on native platforms)
let isSettingUpNotifications = false;

if (Platform.OS !== 'web') {
  try {
    // Set up Android notification channels FIRST (before any other notification setup)
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Default Notifications',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
        sound: 'default',
        enableVibrate: true,
      }).then(() => console.log('✅ Android default channel created'));

      Notifications.setNotificationChannelAsync('reminders', {
        name: 'Daily Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF9800',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      }).then(() => console.log('✅ Android reminders channel created'));

      Notifications.setNotificationChannelAsync('planned_days', {
        name: 'Planned Office Days',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      }).then(() => console.log('✅ Android planned_days channel created'));
    }

    if (Notifications && Notifications.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
  } catch (error) {
    console.log('Notification setup error:', error);
  }
}

// Helper function to safely send notifications
const sendNotification = async (title, body, data = {}) => {
  if (Platform.OS === 'web') {
    console.log('Notification skipped on web:', title);
    return;
  }
  
  try {
    // Use scheduleNotificationAsync since presentNotificationAsync is undefined
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data,
        ...(Platform.OS === 'android' && { channelId: 'default' }) // Android channel
      },
      trigger: null, // Show immediately
    });
    console.log('✅ Notification sent successfully:', title);
  } catch (error) {
    console.log('❌ Notification failed:', error);
  }
};

// Firebase configuration
const FIREBASE_URL = 'https://officetracker-mvp-default-rtdb.firebaseio.com/';

// Google API Configuration (TODO: Move to secure environment variables in production)
const GOOGLE_PLACES_API_KEY = 'AIzaSyBsAxs-hOPqsrmMZ2SvcUW0zhm2RHbvtW0';

// Fetch with timeout to prevent UI freeze on slow networks
const fetchWithTimeout = (url, timeout = 10000) => {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout - please check your internet connection')), timeout)
    )
  ]);
};

// Dynamic public holidays and companies based on user's location
const COUNTRY_DATA = {
  australia: {
    name: 'Australia',
    publicHolidays: [
      '2024-01-01', '2024-01-26', '2024-03-29', '2024-04-01', '2024-04-25', 
      '2024-06-10', '2024-12-25', '2024-12-26',
      '2025-01-01', '2025-01-27', '2025-04-18', '2025-04-21', '2025-04-25',
      '2025-06-09', '2025-12-25', '2025-12-26'
    ],
    popularCompanies: [
  'Commonwealth Bank of Australia','CBA', 'Westpac Banking Corporation', 'Australia and New Zealand Banking Group','ANZ', 'National Australia Bank','NAB', 'Macquarie Group',
  'BHP Group', 'Rio Tinto', 'Wesfarmers', 'Woolworths Group', 'Coles Group','NBN',
  'Telstra Corporation', 'TPG Telecom', 'Optus (SingTel Australia)', 'Qantas Airways', 'Scentre Group',
  'Goodman Group', 'Transurban Group', 'Mirvac Group', 'Stockland Corporation', 'AMP Limited',
  'Insurance Australia Group', 'QBE Insurance Group', 'Suncorp Group', 'IAG (Insurance Australia Group)', 'Medibank Private',
  'Ramsay Health Care', 'CSL Limited', 'Cochlear Limited', 'ResMed Inc.', 'NIB Holdings',
  'Atlassian Corporation', 'Canva', 'Xero', 'WiseTech Global', 'TechnologyOne',
  'Iress Limited', 'Appen Limited', 'NEXTDC', 'Afterpay', 'Zip Co',
  'REA Group', 'Seek Limited', 'Carsales.com.au', 'Envato', 'SafetyCulture',
  'Culture Amp', 'Airwallex', 'Deputy Group', 'Pin Payments', 'Customer Holdings (Australia)',
  'Infomedia Ltd', 'Ansarada', 'Elmo Software', 'Harrison.ai', 'Pro Medicus',
  'Bitdefender Australia', 'Cohesity Australia', 'Redbubble', 'BoxTree Systems', 'Geeks2U',
  'Microsoft Australia', 'IBM Australia', 'Accenture Australia', 'Capgemini Australia', 'Deloitte Digital Australia',
  'PwC Australia', 'EY Australia', 'KPMG Australia', 'SAP Australia', 'Oracle Australia',
  'Salesforce Australia', 'ServiceNow Australia', 'Workday Australia', 'VMware Australia', 'Telstra Purple',
  'DXC Technology Australia', 'JB Hi-Fi', 'Harvey Norman', 'Bendigo and Adelaide Bank', 'Bank of Queensland',
  'Medibank (again for emphasis)', 'Newcrest Mining', 'South32', 'BlueScope Steel', 'Santos Limited',
  'Aurizon Holdings', 'Fortescue Metals Group', 'Woodside Energy Group', 'Origin Energy', 'Ampol Limited',
  'Seven Group Holdings', 'Brambles Limited', 'Metcash Limited', 'CBH Group', 'Flight Centre Travel Group',
  'Nine Entertainment Co.', 'Lottery Corporation (The)', 'ARS-Group (Australia)', 'A2 Milk Company', 'Aristocrat Leisure',
  'Bendigo Bank', 'Bank of Queensland']
  },
  india: {
    name: 'India',
    publicHolidays: [
      '2024-01-26', '2024-08-15', '2024-10-02', '2024-10-24', '2024-11-12',
      '2025-01-26', '2025-08-15', '2025-10-02', '2025-10-23', '2025-11-01'
    ],
    popularCompanies: [
    'Reliance Industries', 'Tata Consultancy Services (TCS)', 'Infosys', 'HDFC Bank', 'ICICI Bank',
    'State Bank of India', 'Bharti Airtel', 'Hindustan Unilever', 'ITC Limited', 'Wipro',
    'Larsen & Toubro (L&T)', 'Adani Enterprises', 'Adani Ports', 'Adani Green Energy', 'Adani Power',
    'Axis Bank', 'Kotak Mahindra Bank', 'Bajaj Finance', 'HCL Technologies', 'Maruti Suzuki',
    'Mahindra & Mahindra', 'Tata Motors', 'Tata Steel', 'JSW Steel', 'UltraTech Cement',
    'Sun Pharma', 'Dr. Reddy’s Laboratories', 'Cipla', 'Nestlé India', 'Britannia Industries',
    'Godrej Consumer Products', 'Asian Paints', 'Eicher Motors', 'Hero MotoCorp', 'Hindalco',
    'Coal India', 'ONGC', 'NTPC', 'Power Grid Corporation', 'IndusInd Bank',
    'Zomato', 'Paytm', 'Byju’s', 'Swiggy', 'PhonePe',
    'Flipkart', 'Ola Cabs', 'MakeMyTrip', 'Delhivery', 'Nykaa','Infosys','Wipro','TCS','Accenture','CTS','CAPGemini'
  ]
  },
  usa: {
    name: 'United States',
    publicHolidays: [
      '2024-01-01', '2024-07-04', '2024-11-28', '2024-12-25',
      '2025-01-01', '2025-07-04', '2025-11-27', '2025-12-25'
    ],
    popularCompanies: [
    'Apple', 'Microsoft', 'Amazon', 'Google (Alphabet)', 'Meta (Facebook)',
    'Tesla', 'Berkshire Hathaway', 'JPMorgan Chase', 'Walmart', 'ExxonMobil',
    'Johnson & Johnson', 'Procter & Gamble', 'Visa', 'Mastercard', 'Pfizer',
    'Coca-Cola', 'PepsiCo', 'Intel', 'IBM', 'Netflix',
    'Nike', 'Disney', 'Oracle', 'Salesforce', 'Adobe',
    'Comcast', 'Cisco', 'Qualcomm', 'Uber', 'Airbnb',
    'Ford', 'General Motors', 'Boeing', 'Lockheed Martin', 'Goldman Sachs',
    'Morgan Stanley', 'American Express', 'Chevron', 'AT&T', 'Verizon',
    '3M', 'Dell', 'HP', 'Starbucks', 'Costco',
    'Home Depot', 'CVS Health', 'AbbVie', 'Caterpillar', 'PayPal'
  ]
  },
  uk: {
    name: 'United Kingdom',
    publicHolidays: [
      '2024-01-01', '2024-03-29', '2024-04-01', '2024-05-06', '2024-05-27',
      '2024-08-26', '2024-12-25', '2024-12-26',
      '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26',
      '2025-08-25', '2025-12-25', '2025-12-26'
    ],
    popularCompanies: [
    'BP', 'Shell', 'HSBC', 'Barclays', 'Lloyds Banking Group',
    'NatWest Group', 'Tesco', 'Unilever', 'AstraZeneca', 'GSK',
    'British American Tobacco', 'Vodafone', 'BT Group', 'Rolls-Royce', 'BAE Systems',
    'Prudential', 'Aviva', 'Diageo', 'Reckitt Benckiser', 'Glencore',
    'Rio Tinto', 'Anglo American', 'Imperial Brands', 'Experian', 'WPP',
    'Next', 'Marks & Spencer', 'Sainsbury’s', 'Morrisons', 'Burberry',
    'Associated British Foods', 'easyJet', 'British Airways (IAG)', 'Tesco Bank', 'Legal & General',
    'Schroders', 'HSBC UK', 'Barclaycard', 'Nationwide', 'Standard Chartered',
    'RELX', 'Smith & Nephew', 'BAE Systems Maritime', 'Bunzl', 'SEGRO',
    'Ocado', 'Persimmon', 'Taylor Wimpey', 'Kingfisher', 'ARM Holdings'
  ]
  },
  canada: {
    name: 'Canada',
    publicHolidays: [
      '2024-01-01', '2024-07-01', '2024-09-02', '2024-10-14', '2024-12-25',
      '2025-01-01', '2025-07-01', '2025-09-01', '2025-10-13', '2025-12-25'
    ],
    popularCompanies: [
    'Royal Bank of Canada', 'Toronto-Dominion Bank', 'Bank of Nova Scotia', 'Bank of Montreal', 'Canadian Imperial Bank of Commerce',
    'Brookfield Corporation', 'Shopify', 'Enbridge', 'Suncor Energy', 'Canadian Natural Resources',
    'Manulife Financial', 'Sun Life Financial', 'BCE (Bell Canada)', 'Rogers Communications', 'Telus',
    'Thomson Reuters', 'Magna International', 'Loblaw Companies', 'George Weston', 'CN (Canadian National Railway)',
    'CPKC (Canadian Pacific Kansas City)', 'Bombardier', 'CAE', 'Nutrien', 'TC Energy',
    'Power Corporation', 'Great-West Lifeco', 'Alimentation Couche-Tard', 'Dollarama', 'OpenText',
    'Intact Financial', 'Cenovus Energy', 'Teck Resources', 'Barrick Gold', 'Agnico Eagle Mines',
    'Hydro One', 'Fortis', 'CGI Inc.', 'Imperial Oil', 'Husky Energy',
    'Cameco', 'First Quantum Minerals', 'Air Canada', 'WestJet', 'Canfor',
    'Maple Leaf Foods', 'Fairfax Financial', 'Manitoba Hydro', 'Petro-Canada', 'Aurora Cannabis'
  ]
  }
};

// Backward compatibility - will be replaced with dynamic data
const PUBLIC_HOLIDAYS = {
  australia: COUNTRY_DATA.australia.publicHolidays,
  india: COUNTRY_DATA.india.publicHolidays,
  usa: COUNTRY_DATA.usa.publicHolidays,
  uk: COUNTRY_DATA.uk.publicHolidays,
  canada: COUNTRY_DATA.canada.publicHolidays
};

// Country code mapping for Nager.Date API
const COUNTRY_CODE_MAPPING = {
  australia: 'AU',
  india: 'IN',
  usa: 'US',
  uk: 'GB',
  canada: 'CA'
};

// Dynamic popular companies based on location
const getPopularCompanies = (country = 'australia') => {
  return COUNTRY_DATA[country]?.popularCompanies || COUNTRY_DATA.australia.popularCompanies;
};

// Dynamic public holidays fetching from Nager.Date API (supports 100+ countries)
const fetchPublicHolidays = async (countryIdentifier, year = new Date().getFullYear()) => {
  // Support both country codes (AU, IN, US) and country names (australia, india, usa)
  let countryCode = countryIdentifier;
  
  // If it's a country name, try to map it to a code
  if (countryIdentifier.length > 2) {
    countryCode = COUNTRY_CODE_MAPPING[countryIdentifier.toLowerCase()];
  }
  
  // If still no code, use it as-is (might already be a valid 2-letter code)
  countryCode = countryCode || countryIdentifier.toUpperCase();
  
  try {
    console.log(`Fetching holidays for ${countryIdentifier} (${countryCode}) year ${year}`);
    const response = await fetchWithTimeout(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`, 8000);
    
    if (response.ok) {
      const holidays = await response.json();
      // Extract dates and names for 'Public' type holidays
      const holidayData = holidays
        .filter(holiday => holiday.types && holiday.types.includes('Public'))
        .reduce((acc, holiday) => {
          acc[holiday.date] = holiday.name;
          return acc;
        }, {});
      
      console.log(`✅ Fetched ${Object.keys(holidayData).length} public holidays for ${countryCode} ${year}`);
      return holidayData;
    } else if (response.status === 404) {
      console.warn(`⚠️ Country code ${countryCode} not supported by Nager.Date API`);
      return null;
    } else {
      console.warn(`Failed to fetch holidays for ${countryCode}: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching holidays for ${countryCode}:`, error);
    return null;
  }
};

// Cache key for holidays
const getHolidayCacheKey = (country, year) => `${country}_${year}`;

// Check if cached holidays are still valid (updated within last 30 days)
const isCacheValid = (country, year, holidayLastUpdated) => {
  const cacheKey = getHolidayCacheKey(country, year);
  const lastUpdate = holidayLastUpdated[cacheKey];
  if (!lastUpdate) return false;
  
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  return lastUpdate > thirtyDaysAgo;
};

// Static fallback function for when dynamic data isn't available
const getStaticPublicHolidays = (country = 'australia') => {
  return COUNTRY_DATA[country]?.publicHolidays || COUNTRY_DATA.australia.publicHolidays;
};

function App() {
  const [screen, setScreen] = useState('loading');
  const [userData, setUserData] = useState({
    userId: null,
    companyName: '',
    companyLocation: null,
    companyAddress: '',
    trackingMode: 'manual',
    country: 'AU',  // Now uses country code directly
    countryCode: 'AU',
    countryName: 'Australia'
  });
  
  const [attendanceData, setAttendanceData] = useState({});
  const [plannedDays, setPlannedDays] = useState({});
  const [monthlyTarget, setMonthlyTarget] = useState(15);
  const [targetMode, setTargetMode] = useState('days'); // 'days' or 'percentage'
  const [selectedDay, setSelectedDay] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsView, setStatsView] = useState('month'); // 'month', 'quarter', 'year'
  const [statsMonth, setStatsMonth] = useState(new Date());
  const [planView, setPlanView] = useState('monthly'); // 'monthly', 'weekly'
  const [homeView, setHomeView] = useState('single'); // 'single', 'calendar'
  const [selectedDates, setSelectedDates] = useState([]); // For multi-select
  const [currentWeek, setCurrentWeek] = useState(new Date()); // For weekly navigation
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'plan', 'analytics', 'settings'
  const [selectedLogDate, setSelectedLogDate] = useState(() => getTodayString());
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerMonth, setPlannerMonth] = useState(new Date());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionMode, setSelectionMode] = useState('office'); // 'office' or 'clear'
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetInputMode, setTargetInputMode] = useState(''); // 'days' or 'percentage'
  const [targetInputValue, setTargetInputValue] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [homeCalendarMonth, setHomeCalendarMonth] = useState(new Date());
  const [locationCheckInterval, setLocationCheckInterval] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [companySearchText, setCompanySearchText] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  
  // Company info edit modal
  const [showEditCompanyModal, setShowEditCompanyModal] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanyAddress, setEditCompanyAddress] = useState('');
  
  // Loading state for country detection
  const [isDetectingCountry, setIsDetectingCountry] = useState(false);
  
  // Ref to track if we're currently syncing from Firebase (to prevent save loop)
  const isSyncingFromFirebase = useRef(false);
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [addressSearchText, setAddressSearchText] = useState('');
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [locationSet, setLocationSet] = useState(false);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [addressSearchTimeout, setAddressSearchTimeout] = useState(null);
  
  // Holiday caching state
  const [cachedHolidays, setCachedHolidays] = useState({}); // {country_year: [dates]}
  const [holidayLastUpdated, setHolidayLastUpdated] = useState({}); // {country_year: timestamp}
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);



  // Load cached holidays from storage
  const loadCachedHolidays = async () => {
    try {
      // Try loading from Firebase first (persistent across devices)
      const firebaseData = await firebaseService.getAllData();
      
      if (firebaseData.cachedHolidays && Object.keys(firebaseData.cachedHolidays).length > 0) {
        console.log('📅 Loaded holidays from Firebase');
        setCachedHolidays(firebaseData.cachedHolidays);
        if (firebaseData.holidayLastUpdated) {
          setHolidayLastUpdated(firebaseData.holidayLastUpdated);
        }
        return;
      }
      
      // Fallback to AsyncStorage (for migration)
      const cached = await AsyncStorage.getItem('cachedHolidays');
      const timestamps = await AsyncStorage.getItem('holidayLastUpdated');
      
      if (cached) {
        console.log('📅 Loaded holidays from AsyncStorage (migrating to Firebase)');
        const parsedHolidays = JSON.parse(cached);
        setCachedHolidays(parsedHolidays);
        
        // Migrate to Firebase
        await firebaseService.updateData('cachedHolidays', parsedHolidays);
      }
      if (timestamps) {
        const parsedTimestamps = JSON.parse(timestamps);
        setHolidayLastUpdated(parsedTimestamps);
        await firebaseService.updateData('holidayLastUpdated', parsedTimestamps);
      }
    } catch (error) {
      console.error('Error loading cached holidays:', error);
    }
  };

  // Save holidays to Firebase (primary) and AsyncStorage (backup)
  const saveCachedHolidays = async (newCachedHolidays, newTimestamps) => {
    try {
      setCachedHolidays(newCachedHolidays);
      setHolidayLastUpdated(newTimestamps);
      
      // Save to Firebase (primary storage - persistent across devices)
      await firebaseService.updateData('cachedHolidays', newCachedHolidays);
      await firebaseService.updateData('holidayLastUpdated', newTimestamps);
      
      // Also save to AsyncStorage as backup
      await AsyncStorage.setItem('cachedHolidays', JSON.stringify(newCachedHolidays));
      await AsyncStorage.setItem('holidayLastUpdated', JSON.stringify(newTimestamps));
      
      console.log('✅ Holidays saved to Firebase and local storage');
    } catch (error) {
      console.error('Error saving cached holidays:', error);
    }
  };

  // Update holidays for a specific country and year
  const updateHolidaysForCountry = async (country, year) => {
    const cacheKey = getHolidayCacheKey(country, year);
    
    // Skip if already updated recently
    if (isCacheValid(country, year, holidayLastUpdated)) {
      console.log(`Holidays for ${country} ${year} are already up to date`);
      return;
    }

    console.log(`Updating holidays for ${country} ${year}...`);
    setIsLoadingHolidays(true);

    const newHolidays = await fetchPublicHolidays(country, year);
    
    if (newHolidays) {
      const newCachedHolidays = { ...cachedHolidays, [cacheKey]: newHolidays };
      const newTimestamps = { ...holidayLastUpdated, [cacheKey]: Date.now() };
      
      // Update React state immediately so UI reflects changes
      setCachedHolidays(newCachedHolidays);
      setHolidayLastUpdated(newTimestamps);
      
      await saveCachedHolidays(newCachedHolidays, newTimestamps);
      console.log(`Successfully updated holidays for ${country} ${year}`);
      
      // Show success message only for manual updates (not automatic ones)
      if (country === userData.country) {
        const countryName = COUNTRY_DATA[country]?.name || country;
        const count = Array.isArray(newHolidays) ? newHolidays.length : Object.keys(newHolidays).length;
        console.log(`✅ Updated ${count} public holidays for ${countryName} ${year}`);
      }
    } else {
      console.warn(`Failed to update holidays for ${country} ${year}, using static data`);
    }
    
    setIsLoadingHolidays(false);
  };

  // Update holidays for current and next year
  const updateCurrentYearHolidays = async (country) => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    // Update both current and next year holidays
    await Promise.all([
      updateHolidaysForCountry(country, currentYear),
      updateHolidaysForCountry(country, nextYear)
    ]);
  };

  // Detect country from company address using geocoding
  const detectCountryFromAddress = async (address) => {
    if (!address || address.trim().length === 0) {
      return { country: 'AU', countryCode: 'AU', countryName: 'Australia' }; // Default fallback
    }
    
    try {
      console.log(`🌍 Detecting country from address: "${address}"`);
      
      // Use Google Maps Geocoding API to get country (with 10s timeout)
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_PLACES_API_KEY}`;
      const response = await fetchWithTimeout(geocodeUrl, 10000);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0 && data.results[0]?.address_components) {
        const addressComponents = data.results[0].address_components;
        
        // Find the country component
        const countryComponent = addressComponents.find(component => 
          component.types.includes('country')
        );
        
        if (countryComponent) {
          const countryCode = countryComponent.short_name; // e.g., "AU", "IN", "US", "JP", "DE"
          const countryName = countryComponent.long_name;  // e.g., "Australia", "India", "Japan"
          
          console.log(`✅ Detected country: ${countryName} (${countryCode})`);
          
          // Return countryCode as the primary identifier (works for all countries)
          return { country: countryCode, countryCode, countryName };
        }
      }
      
      console.warn('⚠️ Could not detect country from address, using default');
      return { country: 'AU', countryCode: 'AU', countryName: 'Australia' };
      
    } catch (error) {
      console.error('Error detecting country:', error);
      return { country: 'AU', countryCode: 'AU', countryName: 'Australia' };
    }
  };

  // Update company info (from settings)
  const updateCompanyInfo = async (newCompanyName, newCompanyAddress) => {
    try {
      // Detect country from address using geocoding
      const { country: detectedCountry, countryCode, countryName } = await detectCountryFromAddress(newCompanyAddress);
      
      const updatedUserData = {
        ...userData,
        companyName: newCompanyName.trim() || '',
        companyAddress: newCompanyAddress.trim() || '',
        country: detectedCountry,
        countryCode: countryCode,
        countryName: countryName
      };
      
      setUserData(updatedUserData);
      await firebaseService.updateData('userData', updatedUserData);
      
      // Refresh holidays for the detected country
      if (detectedCountry !== userData.country) {
        console.log(`Country changed from ${userData.country} to ${detectedCountry}, refreshing holidays...`);
        await updateCurrentYearHolidays(detectedCountry);
      }
      
      Alert.alert(
        '✅ Company Info Updated',
        `Company: ${newCompanyName || 'Not set'}\nAddress: ${newCompanyAddress || 'Not set'}\n\nDetected country: ${countryName} (${countryCode})\n\nHolidays will be updated automatically.`
      );
      
      return true;
    } catch (error) {
      console.error('Error updating company info:', error);
      Alert.alert('Error', 'Failed to update company information. Please try again.');
      return false;
    }
  };

  // Get public holidays with caching (component version that can access state)
  const getPublicHolidays = (country = 'australia', year = new Date().getFullYear()) => {
    const cacheKey = getHolidayCacheKey(country, year);
    
    // Return cached holidays if available and valid
    if (cachedHolidays[cacheKey] && isCacheValid(country, year, holidayLastUpdated)) {
      const cached = cachedHolidays[cacheKey];
      // Handle both object format (new) and array format (old)
      return Array.isArray(cached) ? cached : Object.keys(cached);
    }
    
    // Return static fallback data while loading new data
    return getStaticPublicHolidays(country);
  };

  // Get holiday name for a specific date
  const getHolidayName = (dateStr, country = 'australia', year = new Date().getFullYear()) => {
    const cacheKey = getHolidayCacheKey(country, year);
    
    // Check cached holidays for name
    if (cachedHolidays[cacheKey] && isCacheValid(country, year, holidayLastUpdated)) {
      const cached = cachedHolidays[cacheKey];
      if (!Array.isArray(cached) && cached[dateStr]) {
        return cached[dateStr];
      }
    }
    
    // Fallback to generic "Public Holiday" for static data
    return 'Public Holiday';
  };

  useEffect(() => {
    initializeApp();
    
    return () => {
      if (locationCheckInterval) {
        clearInterval(locationCheckInterval);
      }
    };
  }, []);

  // Monitor year changes and update holidays
  useEffect(() => {
    // Only run after Firebase is initialized and data is loaded
    if (!dataLoaded) return;
    
    const checkYearChange = () => {
      const currentYear = new Date().getFullYear();
      const storedYear = AsyncStorage.getItem('lastHolidayYear');
      
      if (storedYear && parseInt(storedYear) !== currentYear) {
        console.log('Year changed, updating holidays...');
        if (userData.country) {
          updateCurrentYearHolidays(userData.country);
        }
        AsyncStorage.setItem('lastHolidayYear', currentYear.toString());
      } else if (!storedYear) {
        AsyncStorage.setItem('lastHolidayYear', currentYear.toString());
      }
    };

    // Check immediately and set up interval
    checkYearChange();
    const yearCheckInterval = setInterval(checkYearChange, 24 * 60 * 60 * 1000); // Check daily

    return () => clearInterval(yearCheckInterval);
  }, [userData.country, dataLoaded]);

  // Update holidays when user's country changes
  useEffect(() => {
    // Only run after Firebase is initialized and data is loaded
    if (!dataLoaded) return;
    
    if (userData.country) {
      console.log(`Country changed to ${userData.country}, updating holidays...`);
      updateCurrentYearHolidays(userData.country);
    }
  }, [userData.country, dataLoaded]);

  // Auto-advance to next month when current month ends
  useEffect(() => {
    const now = new Date();
    const currentDisplayMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const actualCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // If we're displaying a past month and it's past the end of that month, advance to current month
    if (currentDisplayMonth < actualCurrentMonth) {
      setCurrentMonth(now);
    }
  }, [currentMonth]);

  // Save data when app state changes and check location on foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      console.log('App state changed to:', nextAppState);
      if (nextAppState === 'active') {
        // App has come to the foreground, run location check
        if (dataLoaded && userData.companyLocation) {
          console.log('App is active, running location check regardless of mode.');
          await checkLocationAndLogAttendance(userData.companyLocation, true);
        }
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('App going to background/inactive - saving all data');
        if (dataLoaded) {
          saveAllData();
        } else {
          console.log('Data not loaded yet, skipping background save');
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, [attendanceData, plannedDays, monthlyTarget, targetMode, userData, dataLoaded]);

  // Auto-save data periodically and when key data changes (only after initial load)
  useEffect(() => {
    if (!dataLoaded) {
      console.log('Skipping auto-save - data not loaded yet');
      return;
    }
    
    // Skip auto-save if data change came from Firebase sync (prevent infinite loop)
    if (isSyncingFromFirebase.current) {
      console.log('Skipping auto-save - data synced from Firebase');
      isSyncingFromFirebase.current = false; // Reset flag
      return;
    }
    
    const autoSaveTimer = setTimeout(() => {
      console.log('Auto-save triggered after data changes');
      saveAllData();
    }, 5000); // Auto-save every 5 seconds

    return () => clearTimeout(autoSaveTimer);
  }, [attendanceData, plannedDays, monthlyTarget, targetMode, dataLoaded]);

  // Validate data consistency on load and periodically (only after data is loaded)
  useEffect(() => {
    if (!dataLoaded) {
      return; // Skip validation until data is loaded
    }
    
    const validateData = async () => {
      try {
        const storedAttendance = await AsyncStorage.getItem('attendanceData');
        const storedPlanned = await AsyncStorage.getItem('plannedDays');
        const storedUserData = await AsyncStorage.getItem('userData');
        
        if (storedAttendance) {
          const parsedAttendance = JSON.parse(storedAttendance);
          const currentKeys = Object.keys(attendanceData);
          const storedKeys = Object.keys(parsedAttendance);
          
          if (currentKeys.length !== storedKeys.length && storedKeys.length > 0) {
            console.warn('Data inconsistency detected - attendance data mismatch');
            console.log('Current keys:', currentKeys.length, 'Stored keys:', storedKeys.length);
            // Only reload if stored data has more entries (prevents loading empty data)
            if (storedKeys.length > currentKeys.length) {
              console.log('Reloading from storage - stored data has more entries');
              setAttendanceData(parsedAttendance);
            }
          }
        }
      } catch (error) {
        console.error('Data validation error:', error);
      }
    };

    const validationTimer = setTimeout(validateData, 2000); // Check after 2 seconds
    return () => clearTimeout(validationTimer);
  }, []); // Run only once on mount

  // Auto-mark unlogged days as WFH after 6am next day
  useEffect(() => {
    const checkUnloggedDays = async () => {
      const now = new Date();
      const currentHour = now.getHours();
      
      // Only run this check after 6am
      if (currentHour >= 6) {
        // Skip if user is still in setup/onboarding screens
        if (screen === 'loading' || screen === 'welcome' || screen === 'companySetup' || screen === 'trackingMode' || screen === 'setupComplete') {
          console.log('Skipping auto-WFH check during onboarding/setup');
          return;
        }

        // Check if user has any existing attendance data (to avoid notifications for new users)
        const hasExistingData = Object.keys(attendanceData).length > 0;
        
        // Also check stored attendance data to be extra sure
        const storedAttendance = await AsyncStorage.getItem('attendanceData');
        const storedHasData = storedAttendance && Object.keys(JSON.parse(storedAttendance)).length > 0;
        
        // Check if this is a fresh installation (no company name means brand new user)
        const hasCompanyData = userData.companyName && userData.companyName.trim() !== '';
        
        // Don't auto-mark for new users or users without existing data
        if (!hasExistingData && !storedHasData) {
          console.log('Skipping auto-WFH check for new user with no existing attendance data');
          return;
        }
        
        // Don't auto-mark within first 24 hours of setup completion
        const setupTime = await AsyncStorage.getItem('setupCompletedTime');
        if (setupTime) {
          const setupDate = new Date(parseInt(setupTime));
          const timeSinceSetup = now.getTime() - setupDate.getTime();
          const hoursSinceSetup = timeSinceSetup / (1000 * 60 * 60);
          
          if (hoursSinceSetup < 24) {
            console.log(`Skipping auto-WFH check - only ${Math.round(hoursSinceSetup)} hours since setup`);
            return;
          }
        }
        
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterday);
        
        // Check if yesterday was a weekday (not weekend)
        const isWeekday = !isWeekendDate(yesterdayStr);
        
        // If yesterday was a weekday and not logged, mark as WFH
        if (isWeekday && !attendanceData[yesterdayStr]) {
          markAttendance(yesterdayStr, 'wfh', true);
          console.log(`Auto-marked ${yesterdayStr} as WFH (unlogged weekday)`);
          
          // Send notification about auto-WFH marking
          sendNotification(
            '🏠 WFH Attendance Auto-Logged',
            `We've automatically logged ${yesterday.toLocaleDateString()} as Work From Home since no attendance was recorded.`,
            { 
              type: 'auto_wfh_log',
              date: yesterdayStr,
              status: 'wfh'
            }
          );
        }
      }
    };
    
    // Check immediately only if we're on the main calendar screen (not during onboarding)
    if (screen === 'calendar' || (screen === 'home' && activeTab === 'home')) {
      checkUnloggedDays();
    }
    
    // Set up daily check at 6:01 AM
    const scheduleDailyCheck = () => {
      const now = new Date();
      const nextCheck = new Date(now);
      nextCheck.setDate(nextCheck.getDate() + 1);
      nextCheck.setHours(6, 1, 0, 0); // 6:01 AM next day
      
      const timeUntilCheck = nextCheck.getTime() - now.getTime();
      
      setTimeout(() => {
        checkUnloggedDays();
        // Set up recurring daily checks
        setInterval(checkUnloggedDays, 24 * 60 * 60 * 1000); // Every 24 hours
      }, timeUntilCheck);
    };
    
    scheduleDailyCheck();
  }, [screen]); // Only run when screen changes (after setup is complete)

  const clearSession = async () => {
    try {
      // Clear Firebase data first (needs userId to be set)
      await firebaseService.clearAllData();
      
      // Stop real-time sync
      firebaseService.stopRealtimeSync();
      
      // Reset firebaseService userId so it doesn't hold old userId in memory
      firebaseService.userId = null;
      
      // Clear ALL stored data including all possible keys
      const allKeys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(allKeys);
      
      // Clear holiday cache
      setCachedHolidays({});
      setHolidayLastUpdated({});
      
      // Cancel all notifications (only on native platforms)
      if (Platform.OS !== 'web') {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
      
      // Clear intervals
      if (locationCheckInterval) {
        clearInterval(locationCheckInterval);
        setLocationCheckInterval(null);
      }
      
      // Reset ALL state variables to initial values
      setUserData({
        userId: null,
        companyName: '',
        companyLocation: null,
        companyAddress: '',
        trackingMode: 'manual',
        country: 'australia'
      });
      setAttendanceData({});
      setPlannedDays({});
      setMonthlyTarget(15);
      setTargetMode('days');
      setSelectedDay(null);
      setSelectedDates([]);
      setSelectedLogDate(getTodayString());
      setShowModal(false);
      setShowStats(false);
      setShowPlanner(false);
      setCurrentMonth(new Date());
      setCurrentWeek(new Date());
      setPlannerMonth(new Date());
      setStatsMonth(new Date());
      setActiveTab('home');
      setDataLoaded(false);
      setHomeView('single');
      setPlanView('monthly');
      setStatsView('month');
      setIsSelecting(false);
      setSelectionMode('office');
      setCompanySearchText('');
      setAddressSearchText('');
      setShowCompanyDropdown(false);
      setShowAddressDropdown(false);
      setCompanySuggestions([]);
      setAddressSuggestions([]);
      setLocationSet(false);
      setIsLoadingCompanies(false);
      setIsLoadingAddresses(false);
      
      // Navigate to welcome screen
      setScreen('welcome');
      
      Alert.alert('🧹 Complete Reset', 'All data, settings, and preferences have been completely cleared. Starting fresh with a clean slate!');
    } catch (error) {
      console.error('Clear session error:', error);
      Alert.alert('Error', 'Failed to clear session data. Please try again or restart the app.');
    }
  };

  const requestNotificationPermissions = async () => {
    // Skip notification permissions on web platform
    if (Platform.OS === 'web') {
      console.log('Skipping notification permissions on web platform');
      return;
    }
    
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Notification permission not granted');
        return false;
      }
      
      console.log('Notification permissions granted');
      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  };

  // FCM token registration is now handled by fcmService

  const initializeApp = async () => {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('App initialization timeout')), 45000)
    );

    const initPromise = (async () => {
      try {
        // Keep splash screen visible for 1500ms
        await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Request notification permissions first
      const permissionGranted = await requestNotificationPermissions();
      
      // Create unique user ID from device info
      const userId = await getOrCreateUserId();
      
      // Register FCM token if permissions granted
      if (permissionGranted && Platform.OS !== 'web') {
        await fcmService.initialize(userId);
      }
      
      // Initialize Production Logger first
      productionLogger.initialize(userId);
      
      // Initialize Firebase service with user ID
      await firebaseService.initialize(userId);
      
      // Save app version and device info to Firebase
      const appVersion = Application.nativeApplicationVersion || '3.0.0';
      const buildNumber = Application.nativeBuildVersion || '5';
      const deviceModel = Device.modelName || Device.deviceName || 'Unknown';
      const osVersion = Device.osVersion || Platform.Version;
      
      await firebaseService.updateData('platform', Platform.OS);
      await firebaseService.updateData('deviceModel', deviceModel);
      await firebaseService.updateData('osVersion', osVersion);
      await firebaseService.updateData('appVersion', `${appVersion} (${buildNumber})`);
      await firebaseService.updateData('lastActive', Date.now());
      
      console.log(`📱 App Version: ${appVersion} (${buildNumber})`);
      console.log(`📱 Device: ${deviceModel} - ${Platform.OS} ${osVersion}`);
      
      // CRITICAL FIX: Check AsyncStorage FIRST before Firebase to prevent onboarding for existing users
      // This ensures users who update the app don't lose their data
      const localUserData = await AsyncStorage.getItem('userData');
      const hasLocalData = localUserData && JSON.parse(localUserData)?.companyName;
      
      // Load all data from Firebase (with local fallback) - includes holidays
      const allData = await firebaseService.getAllData();
      
      // Check if this is a migration (data exists locally but needs to be uploaded to Firebase)
      // CRITICAL FIX: Check Firebase flag first to allow manual override
      const migrationCompleted = allData.migrationCompleted === true;
      
      if (migrationCompleted) {
        console.log('✅ Migration already completed (flag set in Firebase), skipping...');
      }
      
      // Only trigger migration if:
      // 1. Migration flag is NOT set in Firebase (allows manual override)
      // 2. AND data exists in Firebase (attendance or planned days)
      // 3. AND lastUpdated is old or missing (indicating it came from AsyncStorage migration)
      const isDataFromFirebase = allData.lastUpdated && (Date.now() - allData.lastUpdated < 60000); // Within last minute
      const hasAttendanceInFirebase = allData.attendanceData && Object.keys(allData.attendanceData).length > 0;
      const hasPlannedInFirebase = allData.plannedDays && Object.keys(allData.plannedDays).length > 0;
      
      // Only run migration if data was loaded from AsyncStorage (not from Firebase) AND migration not completed
      const hasMigratedData = !migrationCompleted && (hasAttendanceInFirebase || hasPlannedInFirebase) && !isDataFromFirebase;
      
      // Check if user has completed setup - check LOCAL DATA FIRST, then Firebase
      const hasCompanyName = hasLocalData || (allData.userData?.companyName && allData.userData.companyName.trim() !== '');
      
      if (hasCompanyName) {
        // Existing user - load all data
        // CRITICAL: Merge with default userData values to prevent crashes when userData section is missing
        const defaultUserData = {
          userId: null,
          companyName: '',
          companyLocation: null,
          companyAddress: '',
          trackingMode: 'manual',
          country: 'australia'
        };
        
        const loadedUserData = {
          ...defaultUserData,  // Start with safe defaults
          ...allData.userData, // Override with Firebase data (may be empty object)
          userId,              // Always set current userId
          trackingMode: allData.userData?.trackingMode || 'manual' // Default to manual for existing users
        };
        setUserData(loadedUserData);
        setAttendanceData(allData.attendanceData || {});
        setPlannedDays(allData.plannedDays || {});
        setMonthlyTarget(allData.settings?.monthlyTarget || 15);
        setTargetMode(allData.settings?.targetMode || 'days');
        
        // CRITICAL FIX: If userData section is missing in Firebase, create it to prevent Cloud Function crashes
        if (!allData.userData || Object.keys(allData.userData).length === 0) {
          console.log('⚠️  WARNING: userData section missing in Firebase - creating it now');
          productionLogger.warn('Missing userData section detected, creating default structure');
          
          const repairData = {
            companyName: loadedUserData.companyName || '',
            companyAddress: loadedUserData.companyAddress || '',
            companyLocation: loadedUserData.companyLocation || null,
            trackingMode: loadedUserData.trackingMode || 'manual',
            country: loadedUserData.country || 'australia'
          };
          
          await firebaseService.updateData('userData', repairData);
          console.log('✅ userData section repaired in Firebase');
          productionLogger.info('userData section repaired', repairData);
        }
        
        // CRITICAL FIX: Register FCM token for existing users who don't have one
        // This fixes users who onboarded before the FCM registration fix
        if (Platform.OS !== 'web' && permissionGranted) {
          const hasFcmToken = allData.settings?.fcmToken || allData.fcmToken;
          if (!hasFcmToken) {
            console.log('⚠️  WARNING: User missing FCM token - registering now');
            productionLogger.warn('Missing FCM token detected, registering retroactively');
            
            await fcmService.updateUserSettings({
              trackingMode: loadedUserData.trackingMode,
              notificationsEnabled: true,
              updatedAt: Date.now()
            });
            
            console.log('✅ FCM token registered retroactively');
            productionLogger.info('FCM token registered retroactively');
          }
        }
        
        // Set holidays from the data we already loaded
        if (allData.cachedHolidays && Object.keys(allData.cachedHolidays).length > 0) {
          setCachedHolidays(allData.cachedHolidays);
        }
        if (allData.holidayLastUpdated) {
          setHolidayLastUpdated(allData.holidayLastUpdated);
        }
        
        setDataLoaded(true);
        
        // If we have migrated data, immediately upload to Firebase
        if (hasMigratedData) {
          console.log('🚀 ============================================');
          console.log('🚀 AUTO-UPLOADING MIGRATED DATA TO FIREBASE');
          console.log('🚀 ============================================');
          // Log migration start
          const migrationStats = {
            attendanceCount: Object.keys(allData.attendanceData || {}).length,
            plannedCount: Object.keys(allData.plannedDays || {}).length,
            monthlyTarget: allData.settings?.monthlyTarget || 15,
            targetMode: allData.settings?.targetMode || 'days',
          };
          
          productionLogger.logMigration('started', migrationStats);
          
          // Ensure userData has all required fields before saving
          const completeUserData = {
            userId: userId,
            companyName: allData.userData?.companyName || loadedUserData.companyName || '',
            companyAddress: allData.userData?.companyAddress || loadedUserData.companyAddress || '',
            companyLocation: allData.userData?.companyLocation || loadedUserData.companyLocation || null,
            trackingMode: allData.userData?.trackingMode || loadedUserData.trackingMode || 'manual',
            country: allData.userData?.country || loadedUserData.country || 'australia'
          };
          
          const uploadSuccess = await firebaseService.saveAllData({
            attendanceData: allData.attendanceData || {},
            plannedDays: allData.plannedDays || {},
            userData: completeUserData,
            monthlyTarget: allData.settings?.monthlyTarget || 15,
            targetMode: allData.settings?.targetMode || 'days',
            cachedHolidays: allData.cachedHolidays || {},
            holidayLastUpdated: allData.holidayLastUpdated || {}
          });
          
          if (uploadSuccess) {
            console.log('✅ Migration complete! All data backed up to Firebase cloud');
            console.log('🔄 ============================================');
            
            // Log success
            productionLogger.logMigration('success', { ...migrationStats, success: true });
            
            // Store migration metadata permanently
            await productionLogger.storeMigrationMetadata({ ...migrationStats, success: true });
            
            productionLogger.info('Migration completed successfully', migrationStats);
          } else {
            console.log('⚠️  Upload queued for when internet is available');
            console.log('🔄 ============================================');
            
            productionLogger.warn('Migration upload queued (offline)', migrationStats);
          }
        }
        
        // CRITICAL FIX: Load holidays BEFORE showing calendar screen
        // This ensures holidays are displayed immediately without requiring manual refresh
        if (allData.cachedHolidays && Object.keys(allData.cachedHolidays).length > 0) {
          console.log('📅 Holidays loaded from Firebase');
          setCachedHolidays(allData.cachedHolidays);
          if (allData.holidayLastUpdated) {
            setHolidayLastUpdated(allData.holidayLastUpdated);
          }
        }
        
        // Auto-update holidays for user's country if not exists or outdated
        if (allData.userData?.country) {
          const currentYear = new Date().getFullYear();
          const cacheKey = getHolidayCacheKey(allData.userData.country, currentYear);
          
          // Only fetch if we don't have holidays or they're outdated
          if (!allData.cachedHolidays?.[cacheKey] || !isCacheValid(allData.userData.country, currentYear, allData.holidayLastUpdated || {})) {
            console.log('📅 Fetching latest holidays for', allData.userData.country);
            await updateCurrentYearHolidays(allData.userData.country);
          }
        }
        
        // Now show calendar screen with holidays loaded
        setScreen('calendar');
        
        // Setup real-time sync to keep data in sync across sessions
        firebaseService.setupRealtimeSync((syncedData) => {
          console.log('🔄 Syncing data from Firebase...');
          // Set flag to prevent auto-save loop
          isSyncingFromFirebase.current = true;
          setAttendanceData(syncedData.attendanceData || {});
          setPlannedDays(syncedData.plannedDays || {});
          setMonthlyTarget(syncedData.settings?.monthlyTarget || 15);
          setTargetMode(syncedData.settings?.targetMode || 'days');
        });
        
        // Setup notifications based on tracking mode
        if (allData.userData?.trackingMode === 'auto') {
          await setupAutoTracking(allData.userData);
        } else {
          await setupManualNotifications();
        }
        
        // Setup weekly summary notifications (works for both modes)
        await setupWeeklySummaryNotifications();
      } else {
        // New user or incomplete setup - show welcome screen
        setScreen('welcome');
      }
    } catch (error) {
      console.error('Init error:', error);
      
      // Log critical initialization error
      productionLogger.error('App initialization failed', error, {
        hasUserId: !!userId,
        hasFirebaseService: !!firebaseService,
      });
      
      setScreen('welcome');
    }
    })();

    // Race between initialization and timeout
    try {
      await Promise.race([initPromise, timeoutPromise]);
    } catch (error) {
      console.error('Initialization timeout or error:', error);
      productionLogger.error('App initialization timeout', error);
      Alert.alert(
        'Connection Issue',
        'Taking too long to load. Please check your internet connection and try again.',
        [{ text: 'Retry', onPress: () => initializeApp() }]
      );
      setScreen('welcome');
    }
  };

  const saveAllData = async () => {
    try {
      console.log('💾 Saving all app data to Firebase...');
      console.log('Attendance data entries to save:', Object.keys(attendanceData).length);
      console.log('Planned days entries to save:', Object.keys(plannedDays).length);
      
      // Don't save if we haven't loaded data yet (prevent overwriting with empty state)
      if (!dataLoaded) {
        console.warn('Skipping save - data not loaded yet');
        return;
      }
      
      // Save to Firebase (with local cache as backup)
      const success = await firebaseService.saveAllData({
        attendanceData,
        plannedDays,
        userData,
        monthlyTarget,
        targetMode,
        cachedHolidays,
        holidayLastUpdated
      });
      
      if (success) {
        console.log('✅ All data saved to Firebase successfully');
      } else {
        console.log('⚠️ Data saved locally, will sync when online');
      }
    } catch (error) {
      console.error('❌ Save data error:', error);
    }
  };

  const loadAllData = async () => {
    try {
      console.log('📥 Loading all app data from Firebase...');
      
      // Load from Firebase (with local cache fallback)
      const allData = await firebaseService.getAllData();
      
      setAttendanceData(allData.attendanceData || {});
      setPlannedDays(allData.plannedDays || {});
      setMonthlyTarget(allData.settings?.monthlyTarget || 15);
      setTargetMode(allData.settings?.targetMode || 'days');
      
      console.log('✅ Loaded data:');
      console.log('  - Attendance entries:', Object.keys(allData.attendanceData || {}).length);
      console.log('  - Planned days:', Object.keys(allData.plannedDays || {}).length);
      console.log('  - Target:', allData.settings?.monthlyTarget, allData.settings?.targetMode);
      
      setDataLoaded(true);
      
      setDataLoaded(true);
      console.log('Data loading completed - dataLoaded flag set to true');
    } catch (error) {
      console.error('Load data error:', error);
      setDataLoaded(true); // Set flag even on error to prevent infinite loading
    }
  };

  const getOrCreateUserId = async () => {
    let userId = await AsyncStorage.getItem('userId');
    if (!userId) {
      const deviceInfo = await Device.getDeviceTypeAsync();
      const deviceName = Device.modelName || 'unknown';
      userId = `${deviceName.replace(/\s/g, '_')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('userId', userId);
    }
    return userId;
  };

  const setupManualNotifications = async () => {
    if (Platform.OS === 'web') return;

    console.log('📱 Setting up manual mode with Firebase Cloud Messaging...');
    
    // Update user settings in Firebase so Cloud Functions know this user is in manual mode
    // Cloud Functions will automatically send reminders at 10 AM, 1 PM, and 4 PM
    await fcmService.updateUserSettings({
      trackingMode: 'manual',
      notificationsEnabled: true,
      updatedAt: Date.now()
    });
    
    console.log('✅ Manual mode configured - notifications will be sent by Firebase Cloud Functions');
    console.log('   📅 Reminders scheduled for: 10 AM, 1 PM, 4 PM daily');
  };

  // Setup weekly summary notifications (Monday and Friday at 9am)
  const setupWeeklySummaryNotifications = async () => {
    if (Platform.OS === 'web') return;

    console.log('📊 Setting up weekly summary notifications via Firebase...');
    
    // Firebase Cloud Functions will automatically send weekly summaries
    // on Monday and Friday at 9 AM to all users with FCM tokens
    console.log('✅ Weekly summaries will be sent by Firebase Cloud Functions');
    console.log('   📅 Monday & Friday at 9:00 AM');
  };

  // This function should be called whenever attendance is marked
  const cancelManualRemindersForToday = async () => {
    if (Platform.OS === 'web') return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    let cancelledCount = 0;
    for (const notif of scheduled) {
      if (notif.content.data?.type === 'manual_reminder') {
        // Check if the notification is for today
        const scheduledAtMs = notif.content?.data?.scheduledAtMs;
        const triggerDate = typeof scheduledAtMs === 'number'
          ? new Date(scheduledAtMs)
          : new Date(notif.trigger.date * 1000);
        if (triggerDate.toDateString() === new Date().toDateString()) {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
          cancelledCount++;
        }
      }
    }
    if (cancelledCount > 0) {
      console.log(`🚫 Cancelled ${cancelledCount} pending manual reminders for today.`);
    }
  };

  const saveToFirebase = async (path, data) => {

    // Set up notification categories with actions
    try {
      await Notifications.setNotificationCategoryAsync('MANUAL_CHECKIN', [
        { 
          identifier: 'office', 
          buttonTitle: '🏢 Office', 
          options: { 
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          } 
        },
        { 
          identifier: 'wfh', 
          buttonTitle: '🏠 WFH', 
          options: { 
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          } 
        },
        { 
          identifier: 'leave', 
          buttonTitle: '🏖️ Leave', 
          options: { 
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          } 
        }
      ]);

      // Set up planned office day category
      await Notifications.setNotificationCategoryAsync('PLANNED_OFFICE_DAY', [
        { 
          identifier: 'confirm_office', 
          buttonTitle: '✅ Confirm Office', 
          options: { 
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          } 
        },
        { 
          identifier: 'change_wfh', 
          buttonTitle: '🏠 Changed to WFH', 
          options: { 
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          } 
        }
      ]);

      // Set up location fallback category (for auto-tracking without background permission)
      await Notifications.setNotificationCategoryAsync('LOCATION_FALLBACK', [
        {
          identifier: 'enable_location',
          buttonTitle: '📍 Enable Location',
          options: {
            opensAppToForeground: true,
            isAuthenticationRequired: false,
            isDestructive: false
          }
        },
        {
          identifier: 'log_office',
          buttonTitle: '🏢 Office',
          options: {
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          }
        },
        {
          identifier: 'log_wfh',
          buttonTitle: '🏠 WFH',
          options: {
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          }
        }
      ]);

      // Attendance Confirmation category (for geofencing detection)
      await Notifications.setNotificationCategoryAsync('ATTENDANCE_CATEGORY', [
        {
          identifier: 'log_office',
          buttonTitle: '🏢 In Office',
          options: {
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          }
        },
        {
          identifier: 'log_wfh',
          buttonTitle: '🏠 Working from Home',
          options: {
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          }
        }
      ]);

      // Auto Location Check category (Smart Auto Tracking)
      // iOS shows max 2 buttons when collapsed, 4 when expanded
      await Notifications.setNotificationCategoryAsync('AUTO_LOCATION_CHECK', [
        {
          identifier: 'check_location',
          buttonTitle: '📍 Check Location',
          options: {
            opensAppToForeground: true,
            isAuthenticationRequired: false,
            isDestructive: false
          }
        },
        {
          identifier: 'office',
          buttonTitle: '🏢 Office',
          options: {
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          }
        },
        {
          identifier: 'wfh',
          buttonTitle: '🏠 WFH',
          options: {
            opensAppToForeground: false,
            isAuthenticationRequired: false,
            isDestructive: false
          }
        }
      ], {
        // iOS-specific options
        previewPlaceholder: 'Check your work location',
        categorySummaryFormat: '%u new location reminders',
        customDismissAction: true,
        allowInCarPlay: false,
        allowAnnouncement: true,
        ...(Platform.OS === 'ios' && {
          intentIdentifiers: [],
          hiddenPreviewsBodyPlaceholder: 'Location Check',
          hiddenPreviewsShowTitle: true,
          hiddenPreviewsShowSubtitle: false
        })
      });

      console.log('Notification categories set up successfully');
    } catch (error) {
      console.error('Error setting up notification category:', error);
    }
    
    // Re-enable notifications after setup is complete
    setTimeout(() => {
      isSettingUpNotifications = false;
      console.log('Manual notification setup complete - notifications re-enabled');
    }, 1000);
  };

  // Enhanced prominent disclosure for location permission (Google Play compliance)
  const showLocationPermissionDisclosure = async () => {
    return new Promise((resolve) => {
      Alert.alert(
        'LOCATION DATA DISCLOSURE',
        'LOCATION DATA ACCESS & COLLECTION NOTICE:\n\n' +
        'LOCATION DATA ACCESSED:\n' +
        '• Your precise GPS coordinates (latitude/longitude)\n' +
        '• Current location during app use and scheduled background checks\n\n' +
        'LOCATION DATA COLLECTED & STORED:\n' +
        '• Office proximity status (within 200m = office attendance)\n' +
        '• Daily attendance records (office/home dates only)\n' +
        '• NO GPS coordinates stored permanently\n' +
        '• NO location history or movement tracking data\n\n' +
        'PURPOSE & USAGE:\n' +
        '• Automatically detect when you arrive at office\n' +
        '• Scheduled background checks: 10am, 1pm, 3pm weekdays only\n' +
        '• Generate work location insights and productivity summaries\n' +
        '• Reduce manual daily logging effort for hybrid workers\n\n' +
        '� STORAGE: Data stays on your device only\n' +
        '� SHARING: Location data is never shared with third parties\n\n' +
        '✅ You can opt out anytime by switching to Manual mode in Settings',
        [
          {
            text: 'Privacy Details',
            onPress: () => {
              Alert.alert(
                'COMPLETE LOCATION DATA POLICY & PRIVACY',
                'LOCATION DATA ACCESSED:\n' +
                '• Precise GPS coordinates (latitude/longitude)\n' +
                '• Current location when app is open (foreground)\n' +
                '• Scheduled background location checks (10am, 1pm, 3pm weekdays)\n\n' +
                'LOCATION DATA COLLECTED & STORED:\n' +
                '• Office proximity determination (within 200m radius)\n' +
                '• Daily attendance status (office/home/leave dates only)\n' +
                '• NO GPS coordinates stored permanently\n' +
                '• NO location history, routes, or movement patterns\n\n' +
                'PURPOSE OF LOCATION DATA USAGE:\n' +
                '• Automatically detect office arrival for attendance logging\n' +
                '• Generate work location analytics and productivity insights\n' +
                '• Provide location-aware productivity notifications\n' +
                '• Reduce manual daily attendance logging effort\n\n' +
                'DATA PROTECTION MEASURES:\n' +
                '• All data stored locally on device using secure local storage\n' +
                '• NO transmission to external servers or cloud services\n' +
                '• NO sharing with third parties under any circumstances\n' +
                '• Data encrypted using device security features\n\n' +
                'YOUR RIGHTS & CONTROL:\n' +
                '• Revoke location permission anytime in device Settings\n' +
                '• Switch to Manual Entry mode to disable all location access\n' +
                '• Complete app functionality available without location\n' +
                '• Delete all data using in-app Reset option\n' +
                '• Uninstall removes all data permanently from device\n\n' +
                'COMPLIANCE: Meets app store location policy requirements for legitimate business use case of hybrid work attendance automation.',
                [{ text: 'I Understand & Consent to Location Usage', onPress: resolve }]
              );
            }
          },
          {
            text: 'Deny Location Access',
            style: 'cancel',
            onPress: resolve
          },
          {
            text: 'I Consent - Allow Location',
            onPress: resolve
          }
        ]
      );
    });
  };

  const setupAutoTracking = async (userConfig) => {
    // Cancel only auto-tracking notifications (not manual reminders)
    if (Platform.OS !== 'web') {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const autoNotifs = scheduled.filter(n => n.content.data?.type === 'auto_location_check');
      console.log(`🗑️ Canceling ${autoNotifs.length} existing auto-tracking notifications...`);
      for (const notif of autoNotifs) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    // Check if we have location permissions
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('⚠️ setupAutoTracking called without location permission');
      return;
    }

    // Check if we have BACKGROUND location permission (for when app is closed)
    let backgroundStatus = null;
    try {
      const bgPermission = await Location.getBackgroundPermissionsAsync();
      backgroundStatus = bgPermission.status;
      console.log(`📍 Background location permission: ${backgroundStatus}`);
    } catch (error) {
      console.log('⚠️ Unable to check background location permission:', error);
    }

    // ALWAYS register FCM token for auto mode users (even without location)
    if (Platform.OS !== 'web') {
      console.log('📱 Registering FCM token for auto-tracking mode...');
      await fcmService.updateUserSettings({
        trackingMode: 'auto',
        notificationsEnabled: true,
        updatedAt: Date.now()
      });
    }

    // Set up smart notifications (works reliably on all devices)
    if (Platform.OS !== 'web' && userConfig.companyLocation) {
      console.log('📍 Setting up location-based notifications...');
      await setupSmartAutoTrackingNotifications(userConfig.companyLocation);

      // Don't block setup - check location in background after setup completes
      setTimeout(() => {
        checkLocationAndLogAttendance(userConfig.companyLocation, true).catch(err => {
          console.log('⚠️ Initial location check failed (will retry later):', err);
        });
      }, 1000);
    } else if (!userConfig.companyLocation) {
      console.log('⚠️ No company location set - location tracking disabled');
    }
  };

  const setupSmartAutoTrackingNotifications = async (officeLocation) => {
    if (Platform.OS === 'web') return;

    console.log('� Setting up auto-tracking mode with Firebase Cloud Messaging...');
    
    // Update user settings in Firebase so Cloud Functions know this user is in auto mode
    // In auto mode, users won't get the manual reminders
    await fcmService.updateUserSettings({
      trackingMode: 'auto',
      notificationsEnabled: true,
      updatedAt: Date.now()
    });
    
    console.log('✅ Auto-tracking mode configured');
    console.log('   📍 Geofencing active for automatic attendance logging');
  };

  // Schedule notification for a specific planned office day
  const scheduleSpecificOfficeDayReminder = async (dateStr) => {
    if (Platform.OS === 'web') return;
    
    console.log('📅 Scheduling notification for specific office day:', dateStr);
    
    try {
      // Parse date properly using local timezone
      const [year, month, day] = dateStr.split('-').map(Number);
      const planDate = new Date(year, month - 1, day); // month is 0-indexed
      
      // Schedule for 8am on the planned day (if in future)
      const reminderTime = new Date(planDate);
      reminderTime.setHours(8, 0, 0, 0);
      
      const nowTime = new Date();
      const timeDiff = reminderTime.getTime() - nowTime.getTime();
      const hoursFromNow = timeDiff / (1000 * 60 * 60);
      
      console.log('📅 Reminder time:', reminderTime.toLocaleString());
      console.log('📅 Time difference in hours:', hoursFromNow);
      
      // Only schedule if it's more than 1 hour in the future
      if (hoursFromNow > 1) {
        const secondsUntilTrigger = (reminderTime.getTime() - nowTime.getTime()) / 1000;
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: "📅 Planned Office Day",
            body: `Today is a planned office day. Remember to check-in when you arrive!`,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
            categoryIdentifier: 'PLANNED_OFFICE_DAY',
            data: {
              type: 'planned_office_day',
              date: dateStr,
              scheduledAtMs: reminderTime.getTime(),
            },
            ...(Platform.OS === 'android' && { channelId: 'planned_days' }) // Android channel
          },
          trigger: { type: 'date', date: reminderTime }
        });
        
        console.log('📅 Scheduled notification for:', dateStr, 'at', reminderTime.toLocaleString(), 'ID:', notificationId);
      } else {
        console.log('📅 Skipping notification for', dateStr, '- too close to current time');
      }
    } catch (error) {
      console.error('📅 Error scheduling notification for:', dateStr, error);
    }
  };
  
  // Cancel notification for a specific day
  const cancelSpecificOfficeDayReminder = async (dateStr) => {
    if (Platform.OS === 'web') return;
    
    console.log('❌ Canceling notification for specific office day:', dateStr);
    
    try {
      const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
      const dayNotifications = allScheduled.filter(notif => 
        notif.content?.data?.type === 'planned_office_day' && 
        notif.content?.data?.date === dateStr
      );
      
      for (const notif of dayNotifications) {
        console.log('❌ Canceling notification ID:', notif.identifier);
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    } catch (error) {
      console.error('❌ Error canceling notification for:', dateStr, error);
    }
  };

  // Clean up old planned days (older than 7 days ago)
  const cleanupOldPlannedDays = () => {
    const todayStr = getLocalDateString();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = getLocalDateString(sevenDaysAgo);

    const cleaned = {};
    let removedCount = 0;

    for (const [dateStr, type] of Object.entries(plannedDays)) {
      if (dateStr >= sevenDaysAgoStr) {
        cleaned[dateStr] = type;
      } else {
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} old planned days`);
      setPlannedDays(cleaned);
      saveDataToFirebase('plannedDays', cleaned);
    }
  };

  // Add debounce for scheduling to prevent rapid successive calls
  const schedulingInProgress = React.useRef(false);

  const scheduleOfficeDayReminders = async () => {
    // Prevent concurrent calls
    if (schedulingInProgress.current) {
      console.log('🔔 scheduleOfficeDayReminders already in progress, skipping...');
      return;
    }
    
    schedulingInProgress.current = true;
    console.log('🔔 Starting to schedule office day reminders...');
    
    // Skip notifications on web platform
    if (Platform.OS === 'web') {
      console.log('Skipping office day reminders on web platform');
      schedulingInProgress.current = false;
      return;
    }
    
    // Schedule planned office day notifications for both Smart Auto and Manual modes
    console.log('🔔 Scheduling office day reminders for all tracking modes...');
    
    // Cancel existing office day reminders to prevent duplicates
    const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const officeReminders = existingNotifications.filter(n => 
      n.content.data?.type === 'auto' || n.content.data?.type === 'planned'
    );
    
    console.log(`Found ${officeReminders.length} existing planned notifications to cancel`);
    
    for (const reminder of officeReminders) {
      await Notifications.cancelScheduledNotificationAsync(reminder.identifier);
    }
    
    const now = new Date();
    const todayStr = getLocalDateString();  // Use consistent date string format

    console.log(`Current planned days:`, plannedDays);
    console.log(`Today: ${todayStr}, Current time: ${now.toLocaleString()}`);

    // Only schedule for future office days (never for today to avoid immediate notifications)
    const schedulingPromises = [];

    for (const [dateStr, type] of Object.entries(plannedDays)) {
      if (type === 'office') {
        // Skip today's date entirely - no notification needed if it's already today
        if (dateStr === todayStr) {
          console.log(`⏭️ Skipping ${dateStr} - it's today, no reminder needed`);
          continue;
        }

        // Parse date properly
        const [year, month, day] = dateStr.split('-').map(Number);
        const planDate = new Date(year, month - 1, day, 0, 0, 0); // midnight of that day

        // Calculate days from now
        const daysDiff = Math.floor((planDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        console.log(`Checking ${dateStr}: ${daysDiff} days from now`);

        // Only schedule if 1-30 days in the future
        if (daysDiff >= 1 && daysDiff <= 30) {
          // Create reminder time for 7am on the planned date
          const reminderTime = new Date(year, month - 1, day, 7, 0, 0);

          console.log(`✅ Scheduling notification for ${dateStr} at ${reminderTime.toLocaleString()}`);

          const secondsUntilTrigger = (reminderTime.getTime() - now.getTime()) / 1000;

          const promise = Notifications.scheduleNotificationAsync({
            content: {
              title: '🏢 Planned Office Day',
              body: 'You planned to go to office today. Remember to check in!',
              sound: 'default',
              priority: Notifications.AndroidNotificationPriority.HIGH,
              data: {
                type: 'planned_office_day',
                date: dateStr,
                scheduledAtMs: reminderTime.getTime(),
              },
              categoryIdentifier: 'PLANNED_OFFICE_DAY',
              ...(Platform.OS === 'android' && { channelId: 'planned_days' })
            },
            trigger: { type: 'date', date: reminderTime },
          }).then(() => {
            console.log(`✔️ Successfully scheduled notification for ${dateStr}`);
          }).catch((error) => {
            console.error(`❌ Failed to schedule notification for ${dateStr}:`, error);
          });

          schedulingPromises.push(promise);
        } else if (daysDiff < 1) {
          console.log(`⏭️ Skipping ${dateStr} - in the past or today`);
        } else {
          console.log(`⏭️ Skipping ${dateStr} - more than 30 days away`);
        }
      }
    }
    
    try {
      await Promise.all(schedulingPromises);
      
      console.log('✅ Finished scheduling office day reminders');
      
      // Log what's now scheduled
      const updatedNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const plannedNotifications = updatedNotifications.filter(n => n.content.data?.type === 'planned_office_day');
      console.log(`Now have ${plannedNotifications.length} planned notifications scheduled:`, 
        plannedNotifications.map(n => ({
          date: n.content.data?.date,
          triggerDate: n.trigger?.date ? new Date(n.trigger.date * 1000).toISOString() : 'immediate'
        }))
      );
    } finally {
      schedulingInProgress.current = false;
    }
  };

  // Debug function to log all scheduled notifications
  const logScheduledNotifications = async () => {
    if (Platform.OS === 'web') return;

    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      console.log('📋 ==========================================');
      console.log(`📋 Currently scheduled notifications: ${scheduled.length}`);
      console.log('📋 ==========================================');
      scheduled.forEach((notif, index) => {
        const scheduledAtMs = notif.content?.data?.scheduledAtMs;
        const triggerInfo = notif.trigger?.hour !== undefined
          ? `Daily at ${notif.trigger.hour}:${String(notif.trigger.minute || 0).padStart(2, '0')}`
          : typeof scheduledAtMs === 'number'
            ? `Once at ${new Date(scheduledAtMs).toLocaleString()}`
            : notif.trigger?.date
              ? `Once at ${new Date(notif.trigger.date * 1000).toLocaleString()}`
              : notif.trigger?.seconds !== undefined
                ? `In ${notif.trigger.seconds}s`
                : 'Immediate/Unknown';
        console.log(`${index + 1}. ${notif.content.title}`);
        console.log(`   Type: ${notif.content.data?.type || 'unknown'}`);
        console.log(`   Trigger: ${triggerInfo}`);
        console.log(`   ID: ${notif.identifier}`);
      });
      console.log('📋 ==========================================');
      return scheduled;
    } catch (error) {
      console.error('❌ Error checking scheduled notifications:', error);
      return [];
    }
  };

  const checkLocationAndLogAttendance = async (officeLocation, isManualCheck = false) => {
    const today = getTodayString();
    
    // Skip if weekend or holiday
    if (isWeekendDate(today)) {
      console.log(`✓ Today is weekend (${today}), skipping location check`);
      return;
    }
    if (publicHolidays[today]) {
      console.log(`✓ Today is a holiday (${publicHolidays[today]}), skipping location check`);
      return;
    }
    
    // Check if attendance is already logged (check both state and cache for reliability)
    const cachedData = await AsyncStorage.getItem(CACHE_KEY_ATTENDANCE);
    const parsedCache = cachedData ? JSON.parse(cachedData) : {};
    const existingAttendance = attendanceData[today] || parsedCache[today];
    
    if (existingAttendance) {
      if (isManualCheck) {
        console.log(`✓ Manual check: Already logged attendance for today (${existingAttendance}), skipping location check`);
      } else {
        console.log(`✓ Scheduled check: Already logged attendance for today (${existingAttendance}), skipping location check`);
      }
      return; // Don't proceed with location check or notification
    }

    try {
      console.log(`${isManualCheck ? '📍 Manual' : '⏰ Scheduled'} location check for auto-attendance...`);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const distance = calculateDistance(
        location.coords.latitude,
        location.coords.longitude,
        officeLocation.latitude,
        officeLocation.longitude
      );

      console.log(`Distance to office: ${distance.toFixed(3)}km`);

      // Double-check attendance wasn't logged while we were getting location
      const recheckData = await AsyncStorage.getItem(CACHE_KEY_ATTENDANCE);
      const recheckCache = recheckData ? JSON.parse(recheckData) : {};
      if (attendanceData[today] || recheckCache[today]) {
        console.log('✓ Attendance was logged while checking location, skipping');
        return;
      }

      // If within 100m of office and not already logged, mark as office day
      if (distance < 0.1) {
        await markAttendance(today, 'office', true);
        
        // Since attendance is now logged, cancel any other pending auto-track reminders for today
        await cancelAutoTrackRemindersForToday();
        
        // Show alert/notification about auto-detection
        const message = `Your location shows you're at the office today. We've automatically logged your attendance for ${new Date().toLocaleDateString()}.`;
        
        // Show immediate alert to user
        Alert.alert(
          '🏢 Office Attendance Auto-Logged',
          message,
          [{ text: 'OK', style: 'default' }]
        );
        
        // Also send a notification (will show if app is in background)
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '🏢 Office Attendance Auto-Logged',
              body: message,
              sound: 'default',
              data: { 
                type: 'auto_office_log',
                date: today,
                status: 'office'
              },
              ...(Platform.OS === 'android' && { channelId: 'default' })
            },
            trigger: null, // Immediate
          });
        } catch (notifError) {
          console.log('Notification error (non-critical):', notifError);
        }
        
        console.log('✅ Auto-logged office attendance based on location');
      } else {
        console.log('Not close enough to office for auto-logging');
      }
    } catch (error) {
      console.log('Location check error:', error);
    }
  };

  const setupScheduledLocationChecks = (officeLocation) => {
    // Skip location checking on web platform
    if (Platform.OS === 'web') {
      console.log('Skipping scheduled location checks on web platform');
      return;
    }

    console.log('Setting up scheduled location checks for 10am, 1pm, 4pm...');

    // Schedule location checks at 10am, 1pm, 4pm
    const scheduleLocationCheck = (hour) => {
      const scheduleDaily = () => {
        const now = new Date();
        const nextCheck = new Date();
        nextCheck.setHours(hour, 0, 0, 0);
        
        // If time has passed today, schedule for tomorrow
        if (nextCheck <= now) {
          nextCheck.setDate(nextCheck.getDate() + 1);
        }
        
        const timeUntilCheck = nextCheck.getTime() - now.getTime();
        
        setTimeout(() => {
          // Check if it's a weekday and user hasn't logged yet
          const checkDay = new Date();
          const isWeekday = checkDay.getDay() >= 1 && checkDay.getDay() <= 5;
          
          if (isWeekday) {
            checkLocationAndLogAttendance(officeLocation, false);
          }
          
          // Schedule the next check for same time tomorrow
          scheduleDaily();
        }, timeUntilCheck);
        
        console.log(`Next ${hour}:00 location check scheduled for ${nextCheck.toLocaleString()}`);
      };
      
      scheduleDaily();
    };

    // Schedule all three daily checks
    scheduleLocationCheck(10); // 10am
    scheduleLocationCheck(13); // 1pm  
    scheduleLocationCheck(16); // 4pm
  };

  const startHourlyLocationCheck = (officeLocation) => {
    // New approach: scheduled checks + manual checks when app opens
    setupScheduledLocationChecks(officeLocation);
    
    // Also check immediately when app opens (manual check)
    checkLocationAndLogAttendance(officeLocation, true);
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Android-friendly target setting functions
  const openTargetModal = (mode) => {
    setTargetInputMode(mode);
    setTargetInputValue(monthlyTarget.toString());
    setShowTargetModal(true);
  };

  const handleTargetSave = async () => {
    const value = parseInt(targetInputValue);
    
    if (targetInputMode === 'days') {
      if (value > 0 && value <= 31) {
        setMonthlyTarget(value);
        setTargetMode('days');
        
        // Save to Firebase
        await firebaseService.updateData('settings', {
          monthlyTarget: value,
          targetMode: 'days'
        });
        
        setShowTargetModal(false);
        Alert.alert('✅ Target Set', `Monthly target set to ${value} office days`);
      } else {
        Alert.alert('Invalid Input', 'Please enter a number between 1 and 31');
      }
    } else if (targetInputMode === 'percentage') {
      if (value > 0 && value <= 100) {
        setMonthlyTarget(value);
        setTargetMode('percentage');
        
        // Save to Firebase
        await firebaseService.updateData('settings', {
          monthlyTarget: value,
          targetMode: 'percentage'
        });
        
        setShowTargetModal(false);
        Alert.alert('✅ Target Set', `Monthly target set to ${value}% of working days`);
      } else {
        Alert.alert('Invalid Input', 'Please enter a percentage between 1 and 100');
      }
    }
  };

  const showTargetSelectionDialog = () => {
    Alert.alert(
      '🎯 Set Monthly Target',
      'Choose your target type:',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Days Target', 
          onPress: () => {
            // Use setTimeout to prevent Android Alert stacking issues
            setTimeout(() => openTargetModal('days'), 100);
          }
        },
        { 
          text: 'Percentage Target', 
          onPress: () => {
            // Use setTimeout to prevent Android Alert stacking issues
            setTimeout(() => openTargetModal('percentage'), 100);
          }
        }
      ]
    );
  };

  // API Functions
  const searchCompanies = async (query) => {
    if (query.length < 2) return [];
    
    setIsLoadingCompanies(true);
    try {
      // Create country filter for API based on user's location
      let countryCode = '';
      const userCountry = userData.country || 'australia';
      
      // Map our country codes to API compatible codes
      const countryMapping = {
        australia: 'au',
        india: 'in', 
        usa: 'us',
        uk: 'gb',
        canada: 'ca'
      };
      
      countryCode = countryMapping[userCountry] || 'au';
      
      // Using OpenCorporates API with country filtering
      const apiUrl = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query)}&jurisdiction_code=${countryCode}&per_page=15&format=json`;
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const data = await response.json();
        const companies = data.results?.companies?.map(item => ({
          name: item.company.name,
          jurisdiction: item.company.jurisdiction_code
        })) || [];
        setIsLoadingCompanies(false);
        return companies.slice(0, 10);
      }
    } catch (error) {
      console.log('Company API error:', error);
    }
    
    setIsLoadingCompanies(false);
    // Fallback to popular companies based on user's location if API fails
    const popularCompanies = getPopularCompanies(userData.country);
    return popularCompanies.filter(company =>
      company.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10);
  };

  const searchAddresses = async (query) => {
    if (query.length < 3) return [];
    
    setIsLoadingAddresses(true);
    
    try {
      // Use a timeout for faster response
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      // Try multiple APIs for better reliability
      const apiPromises = [
        // Primary: Nominatim with better parameters for faster response
        fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=8&countrycodes=au,us,in,gb,ca&addressdetails=1&q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'OfficeTracker/1.0'
          }
        }),
        
        // Fallback: A simpler request format
        fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`, {
          signal: controller.signal
        })
      ];
      
      // Use Promise.race to get the fastest response
      const response = await Promise.race(apiPromises);
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        let addresses = [];
        
        // Handle Nominatim response format
        if (data.length > 0 && data[0].display_name) {
          addresses = data.map(item => ({
            address: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            country: item.address?.country || '',
            city: item.address?.city || item.address?.town || item.address?.village || ''
          }));
        }
        // Handle Photon response format
        else if (data.features && data.features.length > 0) {
          addresses = data.features.map(item => ({
            address: [
              item.properties?.name,
              item.properties?.street,
              item.properties?.city || item.properties?.state,
              item.properties?.country
            ].filter(Boolean).join(', '),
            lat: item.geometry?.coordinates?.[1] || 0,
            lon: item.geometry?.coordinates?.[0] || 0,
            country: item.properties?.country || '',
            city: item.properties?.city || ''
          }));
        }
        
        setIsLoadingAddresses(false);
        return addresses.slice(0, 8); // Limit to 8 results for better performance
      }
    } catch (error) {
      console.log('Address API error:', error);
      
      // Provide some common office locations as fallback
      const fallbackAddresses = [
        { address: `${query} - Business District`, lat: 0, lon: 0, country: '', city: '' },
        { address: `${query} - Office Complex`, lat: 0, lon: 0, country: '', city: '' },
        { address: `${query} - Corporate Center`, lat: 0, lon: 0, country: '', city: '' }
      ];
      
      setIsLoadingAddresses(false);
      return fallbackAddresses;
    }
    
    setIsLoadingAddresses(false);
    return [];
  };

  const markAttendance = async (date, type, autoDetected = false) => {
    console.log(`📅 Marking attendance: ${date} as ${type}`);
    const newData = { ...attendanceData, [date]: type };
    setAttendanceData(newData);

    // Keep a fast local cache for "already logged" checks (used by notifications/background tasks)
    try {
      const cachedData = await AsyncStorage.getItem(CACHE_KEY_ATTENDANCE);
      const parsedCache = cachedData ? JSON.parse(cachedData) : {};
      await AsyncStorage.setItem(
        CACHE_KEY_ATTENDANCE,
        JSON.stringify({ ...parsedCache, [date]: type })
      );
    } catch (error) {
      console.log('⚠️ Failed to update attendance cache:', error);
    }

    // If attendance is marked for today, cancel any pending reminders
    if (date === getTodayString()) {
      await cancelManualRemindersForToday();
      await cancelAutoTrackRemindersForToday();
      // Update weekly summary notifications with new progress
      await setupWeeklySummaryNotifications();
    }
    
    // Save to Firebase - single update is more efficient
    await firebaseService.updateAttendance(date, type);

    if (!autoDetected) {
      setSelectedDay(null);
      setShowModal(false);
    }
  };

  const clearAttendance = async (date) => {
    console.log(`🗑️ Clearing attendance for: ${date}`);
    const newData = { ...attendanceData };
    delete newData[date];
    setAttendanceData(newData);

    // Update fast local cache
    try {
      const cachedData = await AsyncStorage.getItem(CACHE_KEY_ATTENDANCE);
      const parsedCache = cachedData ? JSON.parse(cachedData) : {};
      delete parsedCache[date];
      await AsyncStorage.setItem(CACHE_KEY_ATTENDANCE, JSON.stringify(parsedCache));
    } catch (error) {
      console.log('⚠️ Failed to update attendance cache:', error);
    }
    
    // Delete from Firebase
    await firebaseService.deleteAttendance(date);
    
    // Close modal and show success
    setSelectedDay(null);
    setShowModal(false);
    
    // Optional: Show brief success message
    Alert.alert('✅ Cleared', 'Attendance entry removed successfully.');
  };

  const markMultipleAttendance = async (type) => {
    if (selectedDates.length === 0) {
      Alert.alert('No Days Selected', 'Please select at least one day to log attendance.');
      return;
    }

    Alert.alert(
      'Confirm Bulk Attendance',
      `Mark ${selectedDates.length} selected days as ${type.toUpperCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            const newData = { ...attendanceData };
            selectedDates.forEach(date => {
              newData[date] = type;
            });
            
            setAttendanceData(newData);

            // Update fast local cache
            try {
              const cachedData = await AsyncStorage.getItem(CACHE_KEY_ATTENDANCE);
              const parsedCache = cachedData ? JSON.parse(cachedData) : {};
              const merged = { ...parsedCache, ...newData };
              await AsyncStorage.setItem(CACHE_KEY_ATTENDANCE, JSON.stringify(merged));
            } catch (error) {
              console.log('⚠️ Failed to update attendance cache:', error);
            }
            
            // Save all attendance data to Firebase
            await firebaseService.updateData('attendanceData', newData);
            
            setSelectedDates([]);
            Alert.alert('Success', `Marked ${selectedDates.length} days as ${type.toUpperCase()}`);
          }
        }
      ]
    );
  };

  const clearMultipleAttendance = async () => {
    if (selectedDates.length === 0) {
      Alert.alert('No Days Selected', 'Please select at least one day to clear attendance.');
      return;
    }

    // Filter selected dates to only those that have attendance
    const datesWithAttendance = selectedDates.filter(date => attendanceData[date]);
    
    if (datesWithAttendance.length === 0) {
      Alert.alert('No Attendance', 'None of the selected days have attendance logged.');
      return;
    }

    Alert.alert(
      'Clear Attendance',
      `Clear attendance for ${datesWithAttendance.length} selected ${datesWithAttendance.length === 1 ? 'day' : 'days'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const newData = { ...attendanceData };
            datesWithAttendance.forEach(date => {
              delete newData[date];
            });
            
            setAttendanceData(newData);

            // Update fast local cache
            try {
              const cachedData = await AsyncStorage.getItem(CACHE_KEY_ATTENDANCE);
              const parsedCache = cachedData ? JSON.parse(cachedData) : {};
              datesWithAttendance.forEach(date => {
                delete parsedCache[date];
              });
              await AsyncStorage.setItem(CACHE_KEY_ATTENDANCE, JSON.stringify(parsedCache));
            } catch (error) {
              console.log('⚠️ Failed to update attendance cache:', error);
            }
            
            // Save all attendance data to Firebase
            await firebaseService.updateData('attendanceData', newData);
            
            setSelectedDates([]);
            Alert.alert('✅ Cleared', `Removed attendance for ${datesWithAttendance.length} ${datesWithAttendance.length === 1 ? 'day' : 'days'}`);
          }
        }
      ]
    );
  };

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = getTodayString();

    const days = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, isEmpty: true });
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      // Create date string without timezone issues
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      days.push({
        day,
        date: dateStr,
        isToday: dateStr === today,
        isWeekend: isWeekendDate(dateStr), // Use the proper weekend detection function
        isHoliday: getPublicHolidays(userData.country).includes(dateStr),
        type: attendanceData[dateStr],
        planned: plannedDays[dateStr]
      });
    }

    // Add empty cells to complete the last week (ensure 7 days per row)
    const totalCells = Math.ceil(days.length / 7) * 7;
    while (days.length < totalCells) {
      days.push({ day: null, isEmpty: true });
    }

    return days;
  };

  const getDayStyle = (item) => {
    if (item.isEmpty) return { backgroundColor: 'transparent' };
    
    let backgroundColor = '#F3F4F6'; // Default gray
    
    if (item.isHoliday) backgroundColor = '#EF4444'; // Red for holidays
    else if (item.isWeekend) backgroundColor = '#9CA3AF'; // Gray for weekends
    else if (item.type === 'office') backgroundColor = '#10B981'; // Green for office
    else if (item.type === 'wfh') backgroundColor = '#3B82F6'; // Blue for WFH
    else if (item.type === 'leave') backgroundColor = '#F59E0B'; // Orange for leave
    else if (item.planned === 'office') backgroundColor = '#A7F3D0'; // Light green for planned
    
    return {
      backgroundColor,
      borderWidth: item.isToday ? 3 : 0,
      borderColor: item.isToday ? '#4F46E5' : 'transparent'
    };
  };

  const getTextColor = (item) => {
    if (item.isEmpty) return 'transparent';
    return (item.type || item.isHoliday || item.isWeekend) ? 'white' : '#374151';
  };

  const calculateStats = (period = 'month') => {
    const now = new Date();
    let startDate, endDate;

    if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
    } else {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31);
    }

    const entries = Object.entries(attendanceData).filter(([date]) => {
      const d = new Date(date + 'T00:00:00');
      return d >= startDate && d <= endDate;
    });

    const office = entries.filter(([, type]) => type === 'office').length;
    const wfh = entries.filter(([, type]) => type === 'wfh').length;
    const leave = entries.filter(([, type]) => type === 'leave').length;

    return { office, wfh, leave, total: entries.length };
  };

  const calculateWorkingDays = (year, month) => {
    const totalDays = new Date(year, month + 1, 0).getDate();
    let actualWorkingDays = 0; // Days available for work (excludes weekends, holidays, leaves)
    let weekends = 0;
    let holidays = 0;
    let personalLeaves = 0;

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

      // Check if weekend
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekends++;
        continue;
      }

      // Check if public holiday
      const publicHolidays = getPublicHolidays(userData.country);
      if (publicHolidays.includes(dateStr)) {
        holidays++;
        continue;
      }

      // Check if personal leave (check ACTUAL attendanceData, not plannedDays)
      // plannedDays are just reminders, attendanceData is the actual logged data
      if (attendanceData[dateStr] === 'leave') {
        personalLeaves++;
        continue;
      }

      actualWorkingDays++;
    }

    // Calculate working days before leaves (for display purposes)
    const workingDays = totalDays - weekends - holidays;

    return {
      totalDays,
      workingDays, // Total - Weekends - Holidays (before subtracting leaves)
      actualWorkingDays, // Working days - Leaves (actual available days)
      weekends,
      holidays,
      personalLeaves,
      nonWorkingDays: weekends + holidays + personalLeaves
    };
  };

  const getTargetColorStyle = (percentage) => {
    if (percentage >= 80) {
      return { color: '#22C55E' }; // Green
    } else if (percentage >= 50) {
      return { color: '#F59E0B' }; // Orange  
    } else {
      return { color: '#EF4444' }; // Red
    }
  };

  const calculateTargetProgress = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    
    // Calculate working days for the month
    const workingDaysInfo = calculateWorkingDays(year, month);
    const { workingDays, actualWorkingDays, weekends, holidays, personalLeaves } = workingDaysInfo;
    
    // Debug logging
    console.log('📊 Target Calculation Debug:', {
      totalDays: workingDaysInfo.totalDays,
      weekends,
      holidays,
      personalLeaves,
      workingDays, // Before subtracting leaves
      actualWorkingDays // After subtracting leaves
    });
    
    // workingDays = totalDays - weekends - holidays (before leaves)
    // actualWorkingDays = workingDays - personalLeaves (actual available days for work)
    
    // Calculate adjusted target based on ACTUAL working days (after subtracting leaves) and target mode
    let adjustedTarget;
    if (targetMode === 'percentage') {
      // Percentage of actual working days (after leaves)
      adjustedTarget = Math.max(1, Math.round(actualWorkingDays * (monthlyTarget / 100)));
    } else {
      // Days mode - use the target directly, but cap at actual working days
      adjustedTarget = Math.min(monthlyTarget, actualWorkingDays);
    }
    
    // Count office days this month (only count up to today)
    let officeDays = 0;
    let workingDaysPassed = 0;
    
    for (let day = 1; day <= today; day++) {
      const date = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Skip weekends and holidays for working days count
      if (!isWeekendDate(dateStr)) {
        const publicHolidays = getPublicHolidays(userData.country);
        if (!publicHolidays.includes(dateStr) && plannedDays[dateStr] !== 'leave') {
          workingDaysPassed++;
        }
      }
      
      if (attendanceData[dateStr] === 'office') {
        officeDays++;
      }
    }

    const percentage = adjustedTarget > 0 ? Math.round((officeDays / adjustedTarget) * 100) : 0;
    const remaining = Math.max(0, adjustedTarget - officeDays);
    const remainingWorkingDays = workingDays - workingDaysPassed;

    let suggestion = '';
    if (remaining <= 0) {
      suggestion = '🎉 Target achieved! Great job!';
    } else if (remaining > remainingWorkingDays) {
      suggestion = `⚠️ Need ${remaining} more days but only ${remainingWorkingDays} working days left`;
    } else {
      suggestion = `📊 Need ${remaining} more office days this month`;
    }

    return {
      progress: officeDays,
      percentage,
      suggestion,
      remaining,
      remainingWorkingDays,
      adjustedTarget,
      workingDaysInfo
    };
  };

  // Handle notification responses
  useEffect(() => {
    // Skip notification listeners on web platform
    if (Platform.OS === 'web') {
      return () => {}; // Return empty cleanup function
    }
    
    // Handle notification responses (when user taps action buttons)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      console.log('Notification response received:', response);
      const action = response.actionIdentifier;
      // Use consistent local date formatting
      const today = getTodayString();
      
      // Check if this is a location fallback notification
      const notificationType = response.notification.request.content.data?.type;
      const isLocationFallback = notificationType === 'location_fallback';
      
      // Handle app update notifications
      if (notificationType === 'app_update') {
        console.log('App update notification tapped');
        const storeUrl = Platform.OS === 'ios' 
          ? response.notification.request.content.data?.iosUrl || 'https://apps.apple.com/app/hybrid-office-tracker/id6754510381'
          : response.notification.request.content.data?.androidUrl || 'https://play.google.com/store/apps/details?id=com.officetrack.app';
        
        Linking.openURL(storeUrl).catch(err => {
          console.error('Failed to open store URL:', err);
          Alert.alert('Update Available', 'Please update the app from your app store.', [{ text: 'OK' }]);
        });
        return;
      }
      
      // Handle auto location check notifications (when user taps the notification)
      if (notificationType === 'auto_location_check') {
        console.log('Auto location check notification tapped - checking location now...');
        const officeLocationData = response.notification.request.content.data?.officeLocation;
        if (officeLocationData && userData.companyLocation) {
          await checkLocationAndLogAttendance(userData.companyLocation, true);
        } else {
          Alert.alert('Location Check', 'Unable to check location. Please ensure location permissions are enabled.');
        }
        return;
      }

      // Handle geofence attendance confirmation (from ATTENDANCE_CATEGORY)
      if (action === 'log_office' || action === 'log_wfh') {
        const dateToLog = response.notification.request.content.data?.date || today;
        const userIdFromNotif = response.notification.request.content.data?.userId;
        
        if (userIdFromNotif) {
          await firebaseService.initialize(userIdFromNotif);
        }
        
        const location = action === 'log_office' ? 'office' : 'wfh';
        console.log(`Logging attendance as ${location} for:`, dateToLog);
        markAttendance(dateToLog, location);
        
        const emoji = location === 'office' ? '🏢' : '🏠';
        const label = location === 'office' ? 'Office' : 'WFH';
        Alert.alert(`${emoji} ${label} Logged!`, `✅ Attendance recorded for ${dateToLog}`, [{ text: 'OK' }]);
        return;
      }
      
      // Check if day is already logged (but allow location fallback to proceed)
      if (attendanceData[today] && !isLocationFallback) {
        console.log('Day already logged, ignoring notification response');
        Alert.alert('Already Logged', `You've already logged attendance for today as ${attendanceData[today].toUpperCase()}`);
        return;
      }
      
      console.log('Action identifier:', action);
      
      if (action === 'office') {
        console.log('Marking attendance as office for:', today);
        markAttendance(today, 'office');
        Alert.alert('🏢 Office Day Logged!', `✅ Attendance recorded for ${today}`, [{ text: 'OK' }]);
      } else if (action === 'wfh') {
        console.log('Marking attendance as WFH for:', today);
        markAttendance(today, 'wfh');
        Alert.alert('🏠 WFH Day Logged!', `✅ Attendance recorded for ${today}`, [{ text: 'OK' }]);
      } else if (action === 'leave') {
        console.log('Marking attendance as Leave for:', today);
        markAttendance(today, 'leave');
        Alert.alert('🏖️ Leave Day Logged!', `✅ Attendance recorded for ${today}`, [{ text: 'OK' }]);
      } else if (action === 'confirm_office') {
        console.log('Confirming planned office day for:', today);
        markAttendance(today, 'office');
        Alert.alert('🏢 Office Confirmed', `Great! Enjoy your office day on ${today}`);
      } else if (action === 'change_wfh') {
        console.log('Changed planned office day to WFH for:', today);
        markAttendance(today, 'wfh');
        Alert.alert('🏠 Changed to WFH', `No worries! Marked as WFH for ${today}`);
      } else if (action === 'enable_location') {
        console.log('✅ User tapped Enable Location from notification - showing permission flow');
        
        // Use setTimeout to ensure app is fully loaded before showing dialogs
        setTimeout(() => {
          Alert.alert(
            '📍 Enable Background Location',
            'To automatically track your office attendance, we need permission to access your location in the background.\n\n' +
            'This allows us to:\n' +
            '• Check your location at 10am, 1pm, and 4pm (weekdays only)\n' +
            "• Automatically log office attendance when you're at work\n" +
            '• Reduce manual logging effort\n\n' +
            'Choose an option below:',
            [
              {
                text: '📍 Enable Location Access',
                onPress: async () => {
                  console.log('User chose to enable location access');
                  try {
                    // First check if we already have foreground permission
                    const foregroundStatus = await Location.getForegroundPermissionsAsync();
                    console.log('Current foreground permission:', foregroundStatus.status);
                    
                    if (foregroundStatus.status !== 'granted') {
                      // Need to request foreground first
                      console.log('Requesting foreground permission first...');
                      const foregroundResult = await Location.requestForegroundPermissionsAsync();
                      if (foregroundResult.status !== 'granted') {
                        Alert.alert(
                          '⚠️ Location Permission Required',
                          'Please enable location permission in Settings to use automatic tracking.',
                          [
                            { text: 'Open Settings', onPress: () => Linking.openSettings() },
                            { text: 'Cancel', style: 'cancel' }
                          ]
                        );
                        return;
                      }
                    }
                    
                    // Now request background permission
                    console.log('Requesting background location permission...');
                    const { status } = await Location.requestBackgroundPermissionsAsync();
                    console.log('Background permission result:', status);
                    
                    if (status === 'granted') {
                      Alert.alert('✅ Background Location Enabled', "Automatic tracking is now active! We'll check your location at 10am, 1pm, and 4pm on weekdays.");
                      // Re-setup auto tracking with background permission
                      if (userData.companyLocation) {
                        console.log('Re-setting up auto tracking with background permission');
                        await setupAutoTracking(userData);
                      }
                    } else {
                      Alert.alert(
                        '⚠️ Background Location Not Granted',
                        'For automatic tracking to work, you need to grant "Always Allow" location access.\n\nGo to: Settings > Privacy > Location Services > OfficeTracker > "Always"',
                        [
                          { text: 'Open Settings', onPress: () => Linking.openSettings() },
                          { text: 'Cancel', style: 'cancel' }
                        ]
                      );
                    }
                  } catch (error) {
                    console.error('Error requesting background location:', error);
                    Alert.alert(
                      'Error',
                      'Could not request location permission. Please enable it manually in Settings.',
                      [
                        { text: 'Open Settings', onPress: () => Linking.openSettings() },
                        { text: 'OK', style: 'cancel' }
                      ]
                    );
                  }
                }
              },
              {
                text: '✋ Log Manually Instead',
                onPress: () => {
                  // Show quick log dialog
                  Alert.alert(
                    'Quick Log Attendance',
                    'Where are you working today?',
                    [
                      { 
                        text: '🏢 Office', 
                        onPress: () => {
                          markAttendance(today, 'office');
                          Alert.alert('✅ Logged', 'Office day recorded!');
                        }
                      },
                      { 
                        text: '🏠 WFH', 
                        onPress: () => {
                          markAttendance(today, 'wfh');
                          Alert.alert('✅ Logged', 'WFH day recorded!');
                        }
                      },
                      { text: 'Cancel', style: 'cancel' }
                    ]
                  );
                }
              },
              { text: 'Maybe Later', style: 'cancel' }
            ]
          );
        }, 500); // Small delay to ensure app UI is ready
      } else if (action === 'check_location') {
        console.log('✅ User tapped Check Location from auto-tracking notification');

        // Get office location from notification data
        const officeLocationStr = response.notification.request.content.data?.officeLocation;
        if (!officeLocationStr) {
          console.error('❌ No office location in notification data');
          Alert.alert('Error', 'Office location not found. Please set up your office location in settings.');
          return;
        }

        const officeLocation = JSON.parse(officeLocationStr);
        console.log('📍 Office location:', officeLocation);

        // Check location asynchronously
        setTimeout(async () => {
          try {
            // If today's attendance is already logged, do NOT request GPS
            const today = getTodayString();
            try {
              const cachedData = await AsyncStorage.getItem(CACHE_KEY_ATTENDANCE);
              const parsedCache = cachedData ? JSON.parse(cachedData) : {};
              const existingAttendance = attendanceData[today] || parsedCache[today];
              if (existingAttendance) {
                Alert.alert('✅ Already Logged', `Attendance for today is already set to ${existingAttendance}.`);
                return;
              }
            } catch (error) {
              console.log('⚠️ Failed reading attendance cache:', error);
            }

            // Show loading alert only if we actually intend to check GPS
            Alert.alert('📍 Checking Location...', 'Getting your current location...', [], { cancelable: false });

            // Check if location permission is granted
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert(
                '⚠️ Location Permission Required',
                'Please allow location access to use auto-detection',
                [
                  { text: 'Open Settings', onPress: () => Linking.openSettings() },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
              return;
            }

            // Get current location
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });

            // Calculate distance
            const distance = calculateDistance(
              location.coords.latitude,
              location.coords.longitude,
              officeLocation.latitude,
              officeLocation.longitude
            );

            console.log(`📏 Distance to office: ${distance.toFixed(3)}km`);

            // Check if within 100m (0.1km)
            if (distance < 0.1) {
              // At office - auto log
              markAttendance(today, 'office');
              Alert.alert(
                '🏢 Office Detected!',
                `You're at the office (${Math.round(distance * 1000)}m away). Attendance logged automatically!`,
                [{ text: 'Great!' }]
              );
            } else {
              // Not at office - show options
              Alert.alert(
                '📍 Not At Office',
                `You're ${(distance * 1000).toFixed(0)}m away from office. Where are you working?`,
                [
                  {
                    text: '🏢 Office (Manual)',
                    onPress: () => {
                      markAttendance(today, 'office');
                      Alert.alert('✅ Logged', 'Office day recorded!');
                    }
                  },
                  {
                    text: '🏠 WFH',
                    onPress: () => {
                      markAttendance(today, 'wfh');
                      Alert.alert('✅ Logged', 'WFH day recorded!');
                    }
                  },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
            }
          } catch (error) {
            console.error('❌ Error checking location:', error);
            Alert.alert(
              '⚠️ Location Error',
              'Could not get your location. Log manually?',
              [
                {
                  text: '🏢 Office',
                  onPress: () => {
                    markAttendance(today, 'office');
                    Alert.alert('✅ Logged', 'Office day recorded!');
                  }
                },
                {
                  text: '🏠 WFH',
                  onPress: () => {
                    markAttendance(today, 'wfh');
                    Alert.alert('✅ Logged', 'WFH day recorded!');
                  }
                },
                { text: 'Cancel', style: 'cancel' }
              ]
            );
          }
        }, 100);
      } else if (action === 'log_office') {
        console.log('Quick log office from fallback notification');
        markAttendance(today, 'office');
        Alert.alert('🏢 Office Day Logged!', `✅ Attendance recorded for ${today}`);
      } else if (action === 'log_wfh') {
        console.log('Quick log WFH from fallback notification');
        markAttendance(today, 'wfh');
        Alert.alert('🏠 WFH Day Logged!', `✅ Attendance recorded for ${today}`);
      } else if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // User tapped the notification body (not an action button)
        console.log('Default notification tap received');
        console.log('Full notification data:', JSON.stringify(response.notification.request.content.data, null, 2));
        
        // Check if this is a location fallback notification
        const notificationType = response.notification.request.content.data?.type;
        const autoLogType = response.notification.request.content.data?.autoLog;
        const trackingMode = response.notification.request.content.data?.trackingMode;
        
        console.log('Notification type:', notificationType);
        console.log('Auto log type:', autoLogType);
        console.log('Tracking mode:', trackingMode);
        
        // Auto-log if autoLog flag is present (from geofence in auto mode)
        if (autoLogType && trackingMode === 'auto') {
          console.log(`Auto-logging as ${autoLogType} from notification tap`);
          const dateToLog = response.notification.request.content.data?.date || today;
          markAttendance(dateToLog, autoLogType);
          const emoji = autoLogType === 'office' ? '🏢' : '🏠';
          const label = autoLogType === 'office' ? 'Office' : 'WFH';
          Alert.alert(`${emoji} ${label} Logged!`, `✅ Attendance recorded for ${dateToLog}`, [{ text: 'OK' }]);
          return;
        }
        
        console.log('Is location fallback?', notificationType === 'location_fallback');
        
        if (notificationType === 'location_fallback') {
          // For location fallback, show Enable Location dialog
          console.log('Location fallback notification - showing enable location dialog');
          
          // Check if already logged
          const alreadyLogged = attendanceData[today];
          const loggedMessage = alreadyLogged 
            ? `\n✅ Today is already logged as ${alreadyLogged.toUpperCase()}, but you can still enable auto-tracking for future days.`
            : '\n\nOr you can log manually for today.';
          
          setTimeout(() => {
            Alert.alert(
              '📍 Enable Automatic Tracking',
              'Would you like to enable automatic location tracking? This will:\n\n' +
              '• Check your location at 10am, 1pm, and 4pm (weekdays only)\n' +
              "• Automatically log office attendance when you're at work\n" +
              '• Reduce manual logging effort' +
              loggedMessage,
              [
                {
                  text: '📍 Enable Location Access',
                  onPress: async () => {
                    console.log('User chose to enable location access');
                    try {
                      // First check if we already have foreground permission
                      const foregroundStatus = await Location.getForegroundPermissionsAsync();
                      console.log('Current foreground permission:', foregroundStatus.status);
                      
                      if (foregroundStatus.status !== 'granted') {
                        // Need to request foreground first
                        console.log('Requesting foreground permission first...');
                        const foregroundResult = await Location.requestForegroundPermissionsAsync();
                        if (foregroundResult.status !== 'granted') {
                          Alert.alert(
                            '⚠️ Location Permission Required',
                            'Please enable location permission in Settings to use automatic tracking.',
                            [
                              { text: 'Open Settings', onPress: () => Linking.openSettings() },
                              { text: 'Cancel', style: 'cancel' }
                            ]
                          );
                          return;
                        }
                      }
                      
                      // Now request background permission
                      console.log('Requesting background location permission...');
                      const { status } = await Location.requestBackgroundPermissionsAsync();
                      console.log('Background permission result:', status);
                      
                      if (status === 'granted') {
                        Alert.alert('✅ Background Location Enabled', "Automatic tracking is now active! We'll check your location at 10am, 1pm, and 4pm on weekdays.");
                        // Re-setup auto tracking with background permission
                        if (userData.companyLocation) {
                          console.log('Re-setting up auto tracking with background permission');
                          await setupAutoTracking(userData);
                        }
                      } else {
                        Alert.alert(
                          '⚠️ Background Permission Needed',
                          'Please go to Settings → OfficeHybridTracker → Location and select "Always" to enable automatic tracking.',
                          [
                            { text: 'Open Settings', onPress: () => Linking.openSettings() },
                            { text: 'Cancel', style: 'cancel' }
                          ]
                        );
                      }
                    } catch (error) {
                      console.error('Error requesting location permission:', error);
                      Alert.alert('Error', 'Failed to request location permission. Please try enabling it in Settings.', [
                        { text: 'Open Settings', onPress: () => Linking.openSettings() },
                        { text: 'OK', style: 'cancel' }
                      ]);
                    }
                  }
                },
                {
                  text: alreadyLogged ? '� OK' : '�📝 Log Manually for Today',
                  onPress: () => {
                    if (alreadyLogged) {
                      // Already logged, just dismiss
                      console.log('Already logged, dismissing dialog');
                      return;
                    }
                    // Show quick action dialog
                    Alert.alert(
                      '📱 Quick Log Attendance',
                      `Choose your attendance for today (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}):`,
                      [
                        {
                          text: '🏢 Office',
                          onPress: () => {
                            markAttendance(today, 'office');
                            Alert.alert('🏢 Office Day Logged!', `✅ Attendance recorded for ${today}`);
                          }
                        },
                        {
                          text: '🏠 WFH',
                          onPress: () => {
                            markAttendance(today, 'wfh');
                            Alert.alert('🏠 WFH Day Logged!', `✅ Attendance recorded for ${today}`);
                          }
                        },
                        {
                          text: '🏖️ Leave',
                          onPress: () => {
                            markAttendance(today, 'leave');
                            Alert.alert('🏖️ Leave Day Logged!', `✅ Attendance recorded for ${today}`);
                          }
                        },
                        {
                          text: 'Cancel',
                          style: 'cancel'
                        }
                      ]
                    );
                  }
                },
                {
                  text: 'Not Now',
                  style: 'cancel'
                }
              ]
            );
          }, 500);
        } else {
          // Regular notification - show quick action dialog
          console.log('Regular notification - showing quick action dialog');
          Alert.alert(
            '📱 Quick Log Attendance',
            `Choose your attendance for today (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}):`,
            [
              {
                text: '🏢 Office',
                onPress: () => {
                  markAttendance(today, 'office');
                  Alert.alert('🏢 Office Day Logged!', `✅ Attendance recorded for ${today}`);
                }
              },
              {
                text: '🏠 WFH',
                onPress: () => {
                  markAttendance(today, 'wfh');
                  Alert.alert('🏠 WFH Day Logged!', `✅ Attendance recorded for ${today}`);
                }
              },
              {
                text: '🏖️ Leave',
                onPress: () => {
                  markAttendance(today, 'leave');
                  Alert.alert('🏖️ Leave Day Logged!', `✅ Attendance recorded for ${today}`);
                }
              },
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => setScreen('home')
              }
            ],
            { cancelable: true }
          );
        }
      } else {
        console.log('Unknown action identifier:', action);
      }
    });

    // Handle notifications when app is in foreground - check if already logged
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received while app is open:', notification);
      // Use consistent local date formatting
      const today = getTodayString();
      
      // If notification has checkLogged flag and day is already logged, don't show
      if (notification.request.content.data?.checkLogged && attendanceData[today]) {
        console.log('Day already logged, suppressing notification');
        return;
      }
      
      // Show in-app notification for unlogged days
      if (notification.request.content.data?.type === 'manual' && !attendanceData[today]) {
        // Could show a subtle in-app reminder here
        console.log('Showing notification for unlogged day');
      }
    });

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [attendanceData, userData]);

  // Re-schedule notifications when app loads or tracking mode changes
  useEffect(() => {
    if (!dataLoaded || Platform.OS === 'web') {
      return;
    }

    const rescheduleNotifications = async () => {
      console.log('🔔 Checking notifications on app load...');
      console.log('Current tracking mode:', userData.trackingMode);

      // Only check location in auto mode - notifications are already scheduled in initializeApp
      if (userData.trackingMode === 'auto' && userData.companyLocation) {
        console.log('📍 Auto tracking mode - checking location...');
        // Check location immediately when app opens (AUTO MODE ONLY)
        await checkLocationAndLogAttendance(userData.companyLocation, true);
        console.log('✅ Location check completed');
      }

      // Always schedule planned office day reminders if there are any
      if (Object.keys(plannedDays).length > 0) {
        console.log('📅 Setting up planned office day reminders...');
        await scheduleOfficeDayReminders();
      }

      // Log what's scheduled for debugging (wait longer for iOS to register)
      setTimeout(() => {
        logScheduledNotifications();
      }, 2000);
    };

    // Delay to ensure app is fully initialized
    const timer = setTimeout(rescheduleNotifications, 2000);
    return () => clearTimeout(timer);
  }, [dataLoaded, userData.trackingMode]);

  // Background arrival detection (geofencing) - auto mode only
  useEffect(() => {
    if (!dataLoaded || Platform.OS === 'web') {
      return;
    }

    const manageOfficeGeofence = async () => {
      if (userData.trackingMode === 'auto' && userData.companyLocation) {
        await startOfficeGeofencingAsync(userData.companyLocation);
      } else {
        await stopOfficeGeofencingAsync();
      }
    };

    manageOfficeGeofence();
  }, [dataLoaded, userData.trackingMode, userData.companyLocation]);

  // Clean up old planned days once on app load
  useEffect(() => {
    if (!dataLoaded || Platform.OS === 'web') {
      return;
    }

    // Run cleanup once after data loads
    cleanupOldPlannedDays();
  }, [dataLoaded]);

  // Schedule office day reminders whenever plannedDays changes
  useEffect(() => {
    if (!dataLoaded || Platform.OS === 'web') {
      return;
    }

    const updatePlannedReminders = async () => {
      console.log('📅 Planned days changed, updating reminders...');
      await scheduleOfficeDayReminders();

      // Log what's scheduled for debugging (wait longer for iOS to register)
      setTimeout(() => {
        logScheduledNotifications();
      }, 2000);
    };

    // Only run if there are planned days
    if (Object.keys(plannedDays).length > 0) {
      updatePlannedReminders();
    }
  }, [plannedDays, dataLoaded]);

  // Enhanced Stats Functions
  const calculateDetailedStats = (view, referenceDate = new Date()) => {
    let startDate, endDate;
    
    switch (view) {
      case 'month':
        startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        break;
      case 'year':
        startDate = new Date(referenceDate.getFullYear(), 0, 1);
        endDate = new Date(referenceDate.getFullYear(), 11, 31);
        break;
      default:
        return { office: 0, wfh: 0, leave: 0, total: 0, workingDays: 0, actualWorkingDays: 0, percentage: 0 };
    }
    
    let office = 0, wfh = 0, leave = 0;
    let totalDaysInPeriod = 0;
    let weekendDays = 0;
    let publicHolidayDays = 0;
    
    const publicHolidays = getPublicHolidays(userData.country || 'australia');
    
    // Count attendance and calculate working days correctly
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = getLocalDateString(d);
      const attendance = attendanceData[dateStr]; // Only check ACTUAL attendance, NOT plannedDays
      
      totalDaysInPeriod++;
      
      // Count weekends
      if (isWeekendDate(dateStr)) {
        weekendDays++;
      }
      
      // Count public holidays (only if not already a weekend)
      if (!isWeekendDate(dateStr) && publicHolidays.includes(dateStr)) {
        publicHolidayDays++;
      }
      
      // Count ACTUAL logged attendance (ignore plannedDays - they're just reminders!)
      if (attendance === 'office') office++;
      else if (attendance === 'wfh') wfh++;
      else if (attendance === 'leave') leave++;
    }
    
    // Formula: Working Days = Total Days - Weekends - Public Holidays - Leave Days
    // This gives the ACTUAL days available to work office/WFH
    const totalWorkingDays = totalDaysInPeriod - weekendDays - publicHolidayDays;
    const actualWorkingDays = totalWorkingDays - leave; // Subtract leave from available work days
    
    const total = office + wfh + leave; // Total logged days
    const officePercentage = actualWorkingDays > 0 ? Math.round((office / actualWorkingDays) * 100) : 0;
    
    return {
      office,
      wfh,
      leave,
      total,
      workingDays: totalWorkingDays, // Total - Weekends - Public Holidays
      actualWorkingDays, // Working days - Leave days
      officePercentage,
      wfhPercentage: actualWorkingDays > 0 ? Math.round((wfh / actualWorkingDays) * 100) : 0,
      leavePercentage: totalWorkingDays > 0 ? Math.round((leave / totalWorkingDays) * 100) : 0,
      loggedPercentage: actualWorkingDays > 0 ? Math.round(((office + wfh) / actualWorkingDays) * 100) : 0,
      weekendDays,
      publicHolidayDays,
      totalDaysInPeriod
    };
  };

  const exportStatsAsText = (view, referenceDate) => {
    const stats = calculateDetailedStats(view, referenceDate);
    const periodName = view === 'month' 
      ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${referenceDate.getFullYear()}`;
    
    const reportDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    return `📊 Office Attendance Report - ${periodName}
Generated on: ${reportDate}
Company: ${userData.companyName || 'Not specified'}

📈 SUMMARY STATISTICS
• Working Days in Period: ${stats.workingDays}
• Days Logged: ${stats.total}
• Logging Percentage: ${stats.loggedPercentage}%

🏢 OFFICE ATTENDANCE
• Office Days: ${stats.office}
• Office Percentage: ${stats.officePercentage}%

🏠 WORK FROM HOME
• WFH Days: ${stats.wfh}
• WFH Percentage: ${stats.wfhPercentage}%

🏖️ LEAVE TAKEN
• Leave Days: ${stats.leave}
• Leave Percentage: ${stats.leavePercentage}%

Generated by OfficeTracker - Your Hybrid Work Companion`;
  };

  const exportStatsToPDF = async (view, referenceDate) => {
    try {
      const stats = calculateDetailedStats(view, referenceDate);
      const periodName = view === 'month' 
        ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : `${referenceDate.getFullYear()}`;
      
      const reportDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Create HTML content for PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
                onPress={() => {
                  Alert.alert(
                    '⚠️ Reset All Data',
                    'This will permanently delete:\n• All attendance records\n• Planned days\n• Monthly targets\n• Company information\n\nThis cannot be undone. Consider exporting your data first.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Export First',
                        onPress: () => {
                          Alert.alert(
                            'Export Feature',
                            'Export feature will be available soon. For now, take a screenshot of your calendar.'
                          );
                        },
                      },
                      { text: 'Reset Now', style: 'destructive', onPress: clearSession },
                    ]
                  );
                }}
                      {
                        text: 'Export First',
                        onPress: () => {
                          Alert.alert(
                            'Export Feature',
                            'Export feature will be available soon. For now, take a screenshot of your calendar.'
                          );
                        },
                      },
                      { text: 'Reset Now', style: 'destructive', onPress: clearSession },
                    ]
                  );
                }}
            <div class="section">
              <div class="section-title">🏠 Work From Home</div>
              <div class="stat-row">
                <span class="stat-label">WFH Days:</span>
                <span class="stat-value">${stats.wfh} days</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill wfh" style="width: ${stats.wfhPercentage}%"></div>
              </div>
              <div class="percentage-text">${stats.wfhPercentage}% of working days</div>
            </div>

            <div class="section">
              <div class="section-title">🏖️ Leave Taken</div>
              <div class="stat-row">
                <span class="stat-label">Leave Days:</span>
                <span class="stat-value">${stats.leave} days</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill leave" style="width: ${stats.leavePercentage}%"></div>
              </div>
              <div class="percentage-text">${stats.leavePercentage}% of working days</div>
            </div>

            ${monthlyTarget > 0 && view === 'month' ? `
            <div class="section target-section">
              <div class="section-title">🎯 Target Progress</div>
              <div class="stat-row">
                <span class="stat-label">Monthly Target:</span>
                <span class="stat-value">${targetMode === 'percentage' ? `${monthlyTarget}%` : `${monthlyTarget} days`}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Current Progress:</span>
                <span class="stat-value">${targetMode === 'percentage' ? `${stats.officePercentage}%` : `${stats.office} days`}</span>
              </div>
            </div>` : ''}

            <div class="footer">
              Generated by OfficeTracker - Your Hybrid Work Companion<br>
              Report Date: ${reportDate}
            </div>
          </body>
        </html>
      `;

      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false
      });

      // Create a filename with current date and period
      const fileName = `OfficeTracker_Report_${periodName.replace(/\s+/g, '_')}_${getTodayString()}.pdf`;
      
      // Move to a permanent location
      const permanentUri = `${documentDirectory}${fileName}`;
      await moveAsync({
        from: uri,
        to: permanentUri
      });

      // Show brief success toast and directly open share dialog
      Alert.alert(
        '✅ PDF Generated!',
        `Report saved as "${fileName}"`,
        [{ text: 'OK' }],
        { cancelable: true }
      );

      // Directly open share dialog
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(permanentUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share ${fileName}`,
          UTI: 'com.adobe.pdf'
        });
      } else {
        Alert.alert('📁 PDF Saved', 'Report saved to documents folder');
      }

    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert('Export Error', `Failed to generate PDF report: ${error.message}\n\nPlease try again.`);
    }
  };

  // renderDetailedStats removed - now inlined in renderAnalyticsScreen

  const renderStatsInsights = (stats, periodName) => {
    const insights = [];
    
    if (stats.officePercentage > 60) {
      insights.push({ emoji: '🏢', text: `You're spending most of your time in the office this ${statsView}.` });
    } else if (stats.wfhPercentage > 60) {
      insights.push({ emoji: '🏠', text: `You're primarily working from home this ${statsView}.` });
    } else {
      insights.push({ emoji: '⚖️', text: `You have a good balance between office and home this ${statsView}.` });
    }
    
    if (stats.loggedPercentage < 80) {
      insights.push({ emoji: '📝', text: 'Consider logging your attendance more consistently.' });
    } else if (stats.loggedPercentage >= 95) {
      insights.push({ emoji: '⭐', text: 'Excellent attendance logging! Keep it up!' });
    }
    
    if (monthlyTarget > 0 && statsView === 'month') {
      const targetProgress = targetMode === 'percentage' 
        ? (stats.officePercentage / monthlyTarget) * 100
        : (stats.office / monthlyTarget) * 100;
      
      if (targetProgress >= 100) {
        insights.push({ emoji: '🎉', text: "Congratulations! You've achieved your office target!" });
      } else if (targetProgress >= 80) {
        insights.push({ emoji: '🎯', text: "You're very close to reaching your office target!" });
      }
    }
    
    return insights.map((insight, index) => (
      <View key={index} style={styles.statsInsightItem}>
        <Text style={styles.statsInsightEmoji}>{insight.emoji}</Text>
        <Text style={styles.statsInsightText}>{insight.text}</Text>
      </View>
    ));
  };

  // Enhanced Planner Functions
  const renderPlannerCalendarGrid = () => {
    const year = plannerMonth.getFullYear();
    const month = plannerMonth.getMonth();
    const today = new Date();
    // Use consistent date formatting
    const todayStr = getTodayString();
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Go to Sunday of first week
    
    const weeks = [];
    let currentDate = new Date(startDate);
    
    // Generate 6 weeks (42 days) to fill calendar grid
    for (let week = 0; week < 6; week++) {
      const days = [];
      for (let day = 0; day < 7; day++) {
        // Use consistent date formatting
        const dateStr = getLocalDateString(currentDate);
        const isCurrentMonth = currentDate.getMonth() === month;
        const isPast = currentDate < today && dateStr !== todayStr;
        const isWeekend = isWeekendDate(dateStr);
        const isHoliday = getPublicHolidays(userData.country || 'australia').includes(dateStr);
        const isPlanned = plannedDays[dateStr] === 'office';
        const isWFHPlanned = plannedDays[dateStr] === 'wfh';
        // Allow holidays to be selectable, only disable weekends and past/future months
        const isDisabled = !isCurrentMonth || isPast || isWeekend;
        
        days.push({
          date: new Date(currentDate),
          dateStr,
          dayNumber: currentDate.getDate(),
          isCurrentMonth,
          isPast,
          isWeekend,
          isHoliday,
          isPlanned,
          isWFHPlanned,
          isDisabled,
          isToday: dateStr === todayStr
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push(days);
    }
    
    return weeks.map((week, weekIndex) => (
      <View key={weekIndex} style={styles.calendarWeek}>
        {week.map((dayData, dayIndex) => (
          <TouchableOpacity
            key={`${weekIndex}-${dayIndex}`}
            style={[
              styles.plannerCalendarDay,
              !dayData.isCurrentMonth && styles.plannerDayOutside,
              dayData.isToday && styles.plannerDayToday,
              dayData.isPlanned && styles.plannerDaySelected,
              dayData.isWFHPlanned && styles.plannerDayWFH,
              dayData.isDisabled && styles.plannerDayDisabled,
              dayData.isWeekend && styles.plannerDayWeekend,
              dayData.isHoliday && styles.plannerDayHoliday
            ]}
            onPress={() => handlePlannerDayPress(dayData)}
            onPressIn={() => setIsSelecting(true)}
            onPressOut={() => setIsSelecting(false)}
          >
            <Text style={[
              styles.plannerDayNumber,
              !dayData.isCurrentMonth && styles.plannerDayNumberOutside,
              dayData.isToday && styles.plannerDayNumberToday,
              dayData.isDisabled && styles.plannerDayNumberDisabled,
              dayData.isPlanned && styles.plannerDayNumberSelected
            ]}>
              {dayData.dayNumber}
            </Text>
            {dayData.isHoliday && <Text style={styles.holidayIndicator}>�</Text>}
            {dayData.isPlanned && <Text style={styles.plannedIndicator}>🏢</Text>}
          </TouchableOpacity>
        ))}
      </View>
    ));
  };

  const handlePlannerDayPress = async (dayData) => {
    // Block weekends
    if (dayData.isWeekend) {
      Alert.alert('🏖️ Weekend', 'You cannot plan attendance on weekends.');
      return;
    }
    
    // Allow holidays with confirmation
    if (dayData.isHoliday) {
      const holidayName = getHolidayName(dayData.dateStr, userData.country);
      Alert.alert(
        '🌲 Public Holiday', 
        `${holidayName}\n\nThis is a public holiday. Are you sure you want to plan attendance?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Yes, Plan Anyway', 
            onPress: () => proceedWithPlanning(dayData)
          }
        ]
      );
      return;
    }
    
    // If past or not current month, still check isDisabled
    if (dayData.isDisabled && !dayData.isHoliday) {
      return;
    }
    
    // Proceed with planning
    await proceedWithPlanning(dayData);
  };
  
  const proceedWithPlanning = async (dayData) => {
    
    const newPlanned = { ...plannedDays };
    
    if (selectionMode === 'office') {
      if (dayData.isPlanned) {
        // Already planned, remove it
        delete newPlanned[dayData.dateStr];
      } else {
        // Not planned, add it
        newPlanned[dayData.dateStr] = 'office';
      }
    } else if (selectionMode === 'wfh') {
      if (newPlanned[dayData.dateStr] === 'wfh') {
        // Already planned as WFH, remove it
        delete newPlanned[dayData.dateStr];
      } else {
        // Not planned as WFH, add it
        newPlanned[dayData.dateStr] = 'wfh';
      }
    } else if (selectionMode === 'clear') {
      // Clear mode - always remove
      delete newPlanned[dayData.dateStr];
    }
    
    setPlannedDays(newPlanned);
    
    // Save to Firebase
    await firebaseService.updateData('plannedDays', newPlanned);
    
    // Handle notification for this specific day only
    if (dayData.type === 'office' && dayData.isPlanned) {
      // Schedule notification for this planned office day
      await scheduleSpecificOfficeDayReminder(dayData.dateStr);
    } else {
      // Cancel notification for this day (if it was previously planned)
      await cancelSpecificOfficeDayReminder(dayData.dateStr);
    }
  };

  // HOME SCREEN
  const renderHomeScreen = () => {
    // Use consistent local date calculations
    const today = new Date();
    const todayStr = getTodayString();
    const selectedDate = getLocalDate(selectedLogDate);
    const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    
    // Use utility function for proper weekend detection
    const isWeekend = isWeekendDate(selectedLogDate);
    const isToday = selectedLogDate === todayStr;
    const currentAttendance = attendanceData[selectedLogDate];
    const todayAttendance = attendanceData[todayStr];
    
    return (
      <ScrollView style={styles.homeContainer} showsVerticalScrollIndicator={false}>
        {/* Quick Log for Today Section */}
        {isToday && (
          <View style={styles.quickLogContainer}>
            <Text style={styles.quickLogTitle}>⚡ Quick Log for Today</Text>
            <Text style={styles.quickLogDate}>{today.toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric' 
            })}</Text>
            
            {todayAttendance ? (
              <View style={styles.todayLoggedContainer}>
                <Text style={styles.todayLoggedIcon}>✅</Text>
                <Text style={styles.todayLoggedText}>
                  Already logged as {todayAttendance === 'office' ? '🏢 Office' : 
                                   todayAttendance === 'wfh' ? '🏠 Work From Home' : '🏖️ Leave'}
                </Text>
                <View style={styles.logActionButtons}>
                  <TouchableOpacity
                    style={styles.changeLogButton}
                    onPress={() => {
                      Alert.alert(
                        "Change Today's Log",
                        'What would you like to change it to?',
                        [
                          { text: '🏢 Office', onPress: () => markAttendance(todayStr, 'office') },
                          { text: '🏠 WFH', onPress: () => markAttendance(todayStr, 'wfh') },
                          { text: '🏖️ Leave', onPress: () => markAttendance(todayStr, 'leave') },
                          { text: 'Cancel', style: 'cancel' }
                        ]
                      );
                    }}
                  >
                    <Text style={styles.changeLogText}>Change</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.clearLogButton}
                    onPress={() => {
                      Alert.alert(
                        "Clear Today's Log",
                        'Are you sure you want to remove this attendance entry? This action cannot be undone.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { 
                            text: 'Clear Log', 
                            style: 'destructive', 
                            onPress: () => clearAttendance(todayStr)
                          }
                        ]
                      );
                    }}
                  >
                    <Text style={styles.clearLogText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : isWeekendDate(todayStr) ? (
              <View style={styles.todayWeekendContainer}>
                <Text style={styles.todayWeekendText}>🌴 Weekend - No logging needed</Text>
              </View>
            ) : (
              <View style={styles.quickLogButtons}>
                <TouchableOpacity
                  style={[styles.quickLogButton, styles.quickOfficeButton]}
                  onPress={() => markAttendance(todayStr, 'office')}
                >
                  <Text style={styles.quickLogIcon}>🏢</Text>
                  <Text
                    style={styles.quickLogButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.75}
                  >
                    Office
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.quickLogButton, styles.quickWfhButton]}
                  onPress={() => markAttendance(todayStr, 'wfh')}
                >
                  <Text style={styles.quickLogIcon}>🏠</Text>
                  <Text
                    style={styles.quickLogButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.75}
                  >
                    WFH
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.quickLogButton, styles.quickLeaveButton]}
                  onPress={() => markAttendance(todayStr, 'leave')}
                >
                  <Text style={styles.quickLogIcon}>🏖️</Text>
                  <Text
                    style={styles.quickLogButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.75}
                  >
                    Leave
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        
                    <Text
                      style={styles.changeLogText}
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.75}
                    >
                      Change
                    </Text>
        {/* Monthly Target Progress - Moved to top for better UX */}
        {monthlyTarget > 0 && (
          <View style={styles.targetProgressContainer}>
            <Text style={styles.sectionTitle}>🎯 Monthly Target</Text>
            <View style={styles.targetProgressCard}>
              <View style={styles.targetProgressHeader}>
                <Text style={styles.targetLabel}>
                  Target: {targetMode === 'percentage' ? `${monthlyTarget}%` : `${monthlyTarget} days`}
                </Text>
                <TouchableOpacity
                  onPress={showTargetSelectionDialog}
                >
                  <Text style={styles.editTargetText}>Edit</Text>
                </TouchableOpacity>
              </View>
              {(() => {
                const targetProgress = calculateTargetProgress();
                return (
                  <View style={styles.targetProgressInfo}>
                    <Text style={[styles.targetProgressText, getTargetColorStyle(targetProgress.percentage)]}>
                      {targetMode === 'days' 
                        ? `${targetProgress.progress}/${targetProgress.adjustedTarget} days (${targetProgress.percentage}%)`
                        : `${targetProgress.percentage}% of ${targetProgress.workingDaysInfo?.actualWorkingDays || 0} days`}
                    </Text>
                    <View style={styles.progressBarContainer}>
                      <View style={[styles.progressBar, getTargetColorStyle(targetProgress.percentage)]}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, targetProgress.percentage)}%` }]} />
                      </View>
                    </View>
                    <Text style={styles.targetSuggestionText}>{targetProgress.suggestion}</Text>
                  </View>
                );
              })()}
            </View>
          </View>
        )}

                    <Text
                      style={styles.clearLogText}
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.75}
                    >
                      Clear
                    </Text>
        <View style={styles.calendarMultiSelectContainer}>
          <Text style={styles.sectionTitle}>Select Days to Log</Text>
          <Text style={styles.multiSelectHint}>Tap days to select/deselect. Selected: {selectedDates.length}</Text>
          {renderHomeCalendar()}
          {selectedDates.length > 0 && (
            <View style={styles.selectionActionsContainer}>
              <TouchableOpacity 
                style={styles.clearSelectionButton}
                onPress={() => setSelectedDates([])}
              >
                <Text
                  style={styles.clearSelectionText}
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}
                  minimumFontScale={0.75}
                >
                  Clear Selection
                </Text>
              </TouchableOpacity>
              
              <Text
                style={styles.selectionCountText}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.75}
              >
                {selectedDates.length} {selectedDates.length === 1 ? 'day' : 'days'} selected
              </Text>
              
              <TouchableOpacity 
                style={styles.bulkLogButton}
                onPress={() => {
                  Alert.alert(
                    'Log Attendance',
                    'Select Office, WFH, or Leave below to apply to all selected dates.'
                  );
                }}
              >
                <Text
                  style={styles.bulkLogButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit={true}
                  minimumFontScale={0.75}
                >
                  Log Selected ↓
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>



        {/* Attendance Options */}
        <View style={styles.attendanceContainer}>
          {selectedDates.length > 0 ? (
            <View style={styles.bulkLogHeaderContainer}>
              <Text style={styles.bulkLogTitle}>📅 Bulk Log Attendance</Text>
              <Text style={styles.bulkLogSubtitle}>
                Apply the same status to {selectedDates.length} selected {selectedDates.length === 1 ? 'day' : 'days'}
              </Text>
            </View>
          ) : (
            <View style={styles.bulkLogHeaderContainer}>
              <Text style={styles.bulkLogHint}>Tap on calendar days above to select them for bulk logging</Text>
            </View>
          )}

          <View style={styles.attendanceButtons}>
            <TouchableOpacity
              style={[styles.attendanceButton, styles.officeButton]}
              onPress={() => markMultipleAttendance('office')}
            >
              <Text style={styles.attendanceIcon}>🏢</Text>
              <Text
                style={styles.attendanceText}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.75}
              >
                Office
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.attendanceButton, styles.wfhButton]}
              onPress={() => markMultipleAttendance('wfh')}
            >
              <Text style={styles.attendanceIcon}>🏠</Text>
              <Text
                style={styles.attendanceText}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.75}
              >
                WFH
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.attendanceButton, styles.leaveButton]}
              onPress={() => markMultipleAttendance('leave')}
            >
              <Text style={styles.attendanceIcon}>🏖️</Text>
              <Text
                style={styles.attendanceText}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.75}
              >
                Leave
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStatsContainer}>
          <Text style={styles.sectionTitle}>This Month</Text>
          <View style={styles.quickStatsGrid}>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>{calculateStats('month').office}</Text>
              <Text style={styles.quickStatLabel}>Office Days</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>{calculateStats('month').wfh}</Text>
              <Text style={styles.quickStatLabel}>WFH Days</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>{calculateStats('month').leave}</Text>
              <Text style={styles.quickStatLabel}>Leave Days</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  // PLAN SCREEN
  const renderWeeklyView = () => {
    const today = new Date();
    const startOfWeek = new Date(currentWeek);
    startOfWeek.setDate(currentWeek.getDate() - currentWeek.getDay() + 1); // Start from Monday
    
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      weekDays.push(date);
    }
    
    const weekRange = `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    
    return (
      <View style={styles.weeklyViewContainer}>
        {/* Week Navigation */}
        <View style={styles.weekNavigation}>
          <TouchableOpacity 
            style={styles.weekNavButton}
            onPress={() => {
              const prevWeek = new Date(currentWeek);
              prevWeek.setDate(currentWeek.getDate() - 7);
              setCurrentWeek(prevWeek);
            }}
          >
            <Text style={styles.weekNavText}>‹</Text>
          </TouchableOpacity>
          
          <Text style={styles.weekRangeText}>{weekRange}</Text>
          
          <TouchableOpacity 
            style={styles.weekNavButton}
            onPress={() => {
              const nextWeek = new Date(currentWeek);
              nextWeek.setDate(currentWeek.getDate() + 7);
              setCurrentWeek(nextWeek);
            }}
          >
            <Text style={styles.weekNavText}>›</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.weeklyDaysContainer}>
          {weekDays.map((date, index) => {
            // Use manual formatting to avoid timezone issues
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = date.getDate();
            const isWeekend = isWeekendDate(dateStr);
            const isToday = dateStr === todayStr;
            const isPlanned = plannedDays[dateStr] === 'office';
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.weeklyDayCard,
                  isToday && styles.weeklyDayCardToday,
                  isPlanned && styles.weeklyDayCardPlanned,
                  isWeekend && styles.weeklyDayCardWeekend
                ]}
                onPress={() => handlePlannerDayPress({ 
                  dateStr, 
                  isPlanned, 
                  isDisabled: false 
                })}
              >
                <Text style={[styles.weeklyDayName, isToday && styles.weeklyDayNameToday]}>{dayName}</Text>
                <Text style={[styles.weeklyDayNumber, isToday && styles.weeklyDayNumberToday]}>{dayNum}</Text>
                <View style={styles.weeklyDayStatus}>
                  {isWeekend ? (
                    <Text style={styles.weeklyStatusText}>🌴</Text>
                  ) : isPlanned ? (
                    <Text style={styles.weeklyStatusText}>🏢</Text>
                  ) : (
                    <Text style={styles.weeklyStatusText}>🏠</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const handleShareWeeklyPlan = async () => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Start from Monday
    
    let weeklyPlan = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateISO = date.toISOString();
      const dateStr = dateISO ? dateISO.split('T')[0] : null;
      if (!dateStr) continue;
      
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      
      if (plannedDays[dateStr] === 'office') {
        weeklyPlan.push(`${dayName} - 🏢 Office`);
      } else if (isWeekendDate(dateStr)) {
        weeklyPlan.push(`${dayName} - 🌴 Weekend`);
      } else {
        weeklyPlan.push(`${dayName} - 🏠 WFH`);
      }
    }
    
    const weekRange = `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const shareMessage = `📅 My Office Schedule for ${weekRange}\n\n${weeklyPlan.join('\n')}\n\nGenerated by OfficeTracker 🏢`;
    
    try {
      if (await Sharing.isAvailableAsync()) {
        const fileName = `weekly-plan-${new Date().getTime()}.txt`;
        const fileUri = documentDirectory + fileName;
        await writeAsStringAsync(fileUri, shareMessage);
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/plain',
          dialogTitle: 'Share Weekly Plan'
        });
      } else {
        Alert.alert('Share Weekly Plan', shareMessage, [
          { text: 'OK', style: 'cancel' },
          {
            text: 'Copy to Clipboard',
            onPress: () => {
              // For now, just show an alert. In production, use Clipboard API
              Alert.alert('📋 Copied!', 'Weekly plan copied to clipboard');
            }
          }
        ]);
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Share Error', 'Could not share the plan. Please try again.');
    }
  };

  const renderPlanScreen = () => {
    return (
      <View style={styles.planContainer}>
        <Text style={styles.planTitle}>📅 {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - Plan Your Office Days</Text>
        <Text style={styles.planSubtitle}>Share your weekly schedule with friends</Text>
        
        {/* View Toggle */}
        <View style={styles.planViewToggle}>
          <TouchableOpacity 
            style={[styles.planViewButton, planView === 'monthly' && styles.planViewButtonActive]}
            onPress={() => setPlanView('monthly')}
          >
            <Text style={[styles.planViewButtonText, planView === 'monthly' && styles.planViewButtonTextActive]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.planViewButton, planView === 'weekly' && styles.planViewButtonActive]}
            onPress={() => setPlanView('weekly')}
          >
            <Text style={[styles.planViewButtonText, planView === 'weekly' && styles.planViewButtonTextActive]}>Weekly</Text>
          </TouchableOpacity>
        </View>

        {/* Calendar/Weekly View */}
        {planView === 'weekly' ? renderWeeklyView() : (
          <View style={styles.planCalendarContainer}>
            <View style={styles.plannerCalendarHeader}>
              <TouchableOpacity 
                onPress={() => setPlannerMonth(new Date(plannerMonth.getFullYear(), plannerMonth.getMonth() - 1, 1))}
                style={styles.monthNavButton}
              >
                <Text style={styles.monthNavText}>‹</Text>
              </TouchableOpacity>
              
              <Text style={styles.plannerMonthTitle}>
                {plannerMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              
              <TouchableOpacity 
                onPress={() => setPlannerMonth(new Date(plannerMonth.getFullYear(), plannerMonth.getMonth() + 1, 1))}
                style={styles.monthNavButton}
              >
                <Text style={styles.monthNavText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.plannerCalendar}>
              <View style={styles.dayHeaders}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <Text key={day} style={styles.dayHeader}>{day}</Text>
                ))}
              </View>
              {renderPlannerCalendarGrid()}
            </View>
          </View>
        )}

        {/* Share Button */}
        <TouchableOpacity 
          style={styles.shareButton}
          onPress={handleShareWeeklyPlan}
        >
          <Text style={styles.shareButtonText}>📤 Share This Week's Plan</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ANALYTICS SCREEN
  const renderHomeCalendar = () => {
    const today = new Date();
    const currentMonth = homeCalendarMonth.getMonth();
    const currentYear = homeCalendarMonth.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const days = [];
    const weeks = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    // Add empty cells to complete the last week (ensure 7 days per row)
    const totalCells = Math.ceil(days.length / 7) * 7;
    while (days.length < totalCells) {
      days.push(null);
    }
    
    // Group days into weeks
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    
    return (
      <View style={styles.homeCalendar}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity 
            onPress={() => setHomeCalendarMonth(new Date(homeCalendarMonth.getFullYear(), homeCalendarMonth.getMonth() - 1, 1))}
            style={styles.monthNavButton}
          >
            <Text style={styles.monthNavText}>‹</Text>
          </TouchableOpacity>
          
          <Text style={styles.calendarMonthTitle}>
            {homeCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          
          <TouchableOpacity 
            onPress={() => setHomeCalendarMonth(new Date(homeCalendarMonth.getFullYear(), homeCalendarMonth.getMonth() + 1, 1))}
            style={styles.monthNavButton}
          >
            <Text style={styles.monthNavText}>›</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.dayHeaders}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <Text key={day} style={styles.dayHeader}>{day}</Text>
          ))}
        </View>
        
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.calendarWeek}>
            {week.map((day, dayIndex) => {
              if (!day) return <View key={dayIndex} style={styles.calendarDayEmpty} />;
              
              const date = new Date(currentYear, currentMonth, day);
              // Use manual formatting to avoid timezone issues
              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const isWeekend = isWeekendDate(dateStr);
              const isHoliday = getPublicHolidays(userData.country || 'australia').includes(dateStr);
              const isSelected = selectedDates.includes(dateStr);
              const attendance = attendanceData[dateStr];
              
              return (
                <TouchableOpacity
                  key={dayIndex}
                  style={[
                    styles.calendarDay,
                    isToday && styles.calendarDayToday,
                    isSelected && styles.calendarDaySelected,
                    isWeekend && styles.calendarDayWeekend,
                    isHoliday && styles.calendarDayHoliday,
                    attendance === 'office' && styles.calendarDayOffice,
                    attendance === 'wfh' && styles.calendarDayWFH,
                    attendance === 'leave' && styles.calendarDayLeave,
                  ]}
                  onPress={() => {
                    if (isWeekend) {
                      Alert.alert('🏖️ Weekend', 'You cannot select weekends.');
                    } else if (isHoliday) {
                      // Allow selecting holidays with confirmation
                      const holidayName = getHolidayName(dateStr, userData.country);
                      Alert.alert(
                        '🌲 Public Holiday',
                        `${holidayName}\n\nThis is a public holiday. Are you sure you want to select it?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Yes, Select',
                            onPress: () => {
                              if (isSelected) {
                                setSelectedDates(selectedDates.filter(d => d !== dateStr));
                              } else {
                                setSelectedDates([...selectedDates, dateStr]);
                              }
                            }
                          }
                        ]
                      );
                    } else {
                      if (isSelected) {
                        setSelectedDates(selectedDates.filter(d => d !== dateStr));
                      } else {
                        setSelectedDates([...selectedDates, dateStr]);
                      }
                    }
                  }}
                >
                  <Text style={[
                    styles.calendarDayText,
                    isToday && styles.calendarDayTextToday,
                    isSelected && styles.calendarDayTextSelected,
                    isWeekend && styles.calendarDayTextWeekend,
                    isHoliday && styles.calendarDayTextHoliday,
                  ]}>
                    {day}
                  </Text>
                  {isHoliday && (
                    <Text style={styles.calendarHolidayIndicator}>🌲</Text>
                  )}
                  {attendance && !isHoliday && (
                    <Text style={styles.calendarDayAttendance}>
                      {attendance === 'office' ? '🏢' : attendance === 'wfh' ? '🏠' : '🌴'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  // renderAttendanceChart removed - duplicate of Attendance Breakdown in renderAnalyticsScreen

  const renderAnalyticsScreen = () => {
    const referenceDate = statsView === 'month' ? statsMonth : new Date();
    const stats = calculateDetailedStats(statsView, referenceDate);
    
    const periodName = statsView === 'month' 
      ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${referenceDate.getFullYear()}`;
    
    return (
      <ScrollView style={styles.analyticsContainer}>
        <View style={styles.analyticsHeader}>
          <Text style={styles.analyticsTitle}>📊 Analytics</Text>
          
          {/* Export Button */}
          <TouchableOpacity 
            style={styles.cornerExportButton}
            onPress={() => exportStatsToPDF(statsView, referenceDate)}
          >
            <Text style={styles.cornerExportButtonText}>⬇</Text>
          </TouchableOpacity>
        </View>
        
        {/* View Toggle: Month or Year ONLY */}
        <View style={styles.statsViewToggle}>
          {['month', 'year'].map(view => (
            <TouchableOpacity
              key={view}
              style={[
                styles.statsViewButton,
                statsView === view && styles.statsViewButtonActive
              ]}
              onPress={() => setStatsView(view)}
            >
              <Text style={[
                styles.statsViewButtonText,
                statsView === view && styles.statsViewButtonTextActive
              ]}>
                {view === 'month' ? '📅 Month' : '📆 Year'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Month Selector (only show if statsView is 'month') */}
        {statsView === 'month' && (
          <View style={styles.monthSelectorContainer}>
            <TouchableOpacity 
              style={styles.monthNavButton}
              onPress={() => {
                const newMonth = new Date(statsMonth);
                newMonth.setMonth(newMonth.getMonth() - 1);
                setStatsMonth(newMonth);
              }}
            >
              <Text style={styles.monthNavButtonText}>‹</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.currentMonthButton}
              onPress={() => setStatsMonth(new Date())} // Reset to current month
            >
              <Text style={styles.currentMonthText}>{periodName}</Text>
              <Text style={styles.currentMonthSubtext}>Tap to go to current month</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.monthNavButton}
              onPress={() => {
                const newMonth = new Date(statsMonth);
                newMonth.setMonth(newMonth.getMonth() + 1);
                setStatsMonth(newMonth);
              }}
            >
              <Text style={styles.monthNavButtonText}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Insights at TOP */}
        <View style={styles.statsInsightsCard}>
          <Text style={styles.statsCardTitle}>💡 Insights</Text>
          {renderStatsInsights(stats, periodName)}
        </View>

        {/* Current Month Tracker - Summary Card */}
        <View style={styles.statsSummaryCard}>
          <Text style={styles.statsSummaryTitle}>{periodName} Summary</Text>
          <View style={styles.statsSummaryGrid}>
            <View style={styles.statsSummaryItem}>
              <Text style={styles.statsSummaryValue}>{stats.actualWorkingDays}</Text>
              <Text style={styles.statsSummaryLabel}>Available Days</Text>
            </View>
            <View style={styles.statsSummaryItem}>
              <Text style={styles.statsSummaryValue}>{stats.office + stats.wfh}</Text>
              <Text style={styles.statsSummaryLabel}>Days Logged</Text>
            </View>
            <View style={styles.statsSummaryItem}>
              <Text style={styles.statsSummaryValue}>{stats.loggedPercentage}%</Text>
              <Text style={styles.statsSummaryLabel}>Completion</Text>
            </View>
          </View>
          <Text style={styles.statsSummaryFormula}>
            Available Days: {stats.totalDaysInPeriod} - {stats.weekendDays} weekends - {stats.publicHolidayDays} holidays - {stats.leave} leaves
          </Text>
        </View>

        {/* Attendance Breakdown - Single section (removed duplicate) */}
        <View style={styles.statsBreakdownCard}>
          <Text style={styles.statsCardTitle}>📊 Attendance Breakdown</Text>
          
          <View style={styles.statsBreakdownItem}>
            <View style={styles.statsBreakdownHeader}>
              <Text style={styles.statsBreakdownLabel}>🏢 Office Days</Text>
              <Text style={styles.statsBreakdownValue}>{stats.office} days</Text>
            </View>
            <View style={styles.statsProgressBar}>
              <View style={[styles.statsProgressFill, { 
                width: `${stats.officePercentage}%`, 
                backgroundColor: '#4CAF50' 
              }]} />
            </View>
            <Text style={styles.statsBreakdownPercentage}>{stats.officePercentage}% of available working days</Text>
          </View>

          <View style={styles.statsBreakdownItem}>
            <View style={styles.statsBreakdownHeader}>
              <Text style={styles.statsBreakdownLabel}>🏠 Work From Home</Text>
              <Text style={styles.statsBreakdownValue}>{stats.wfh} days</Text>
            </View>
            <View style={styles.statsProgressBar}>
              <View style={[styles.statsProgressFill, { 
                width: `${stats.wfhPercentage}%`, 
                backgroundColor: '#2196F3' 
              }]} />
            </View>
            <Text style={styles.statsBreakdownPercentage}>{stats.wfhPercentage}% of available working days</Text>
          </View>

          <View style={styles.statsBreakdownItem}>
            <View style={styles.statsBreakdownHeader}>
              <Text style={styles.statsBreakdownLabel}>🏖️ Leave Days</Text>
              <Text style={styles.statsBreakdownValue}>{stats.leave} days</Text>
            </View>
            <View style={styles.statsProgressBar}>
              <View style={[styles.statsProgressFill, { 
                width: `${stats.leavePercentage}%`, 
                backgroundColor: '#FF9800' 
              }]} />
            </View>
            <Text style={styles.statsBreakdownPercentage}>{stats.leavePercentage}% of total working days (before leave)</Text>
          </View>
        </View>

        {/* Target Progress (if target is set) */}
        {monthlyTarget > 0 && statsView === 'month' && (
          <View style={styles.statsTargetCard}>
            <Text style={styles.statsCardTitle}>🎯 Target Progress</Text>
            <View style={styles.statsTargetContent}>
              <Text style={styles.statsTargetLabel}>
                Monthly Target: {targetMode === 'percentage' ? `${monthlyTarget}%` : `${monthlyTarget} days`}
              </Text>
              <Text style={styles.statsTargetProgress}>
                Current: {targetMode === 'percentage' 
                  ? `${stats.officePercentage}%` 
                  : `${stats.office} days`}
              </Text>
              <View style={styles.statsProgressBar}>
                <View style={[styles.statsProgressFill, { 
                  width: `${Math.min(100, targetMode === 'percentage' 
                    ? (stats.officePercentage / monthlyTarget) * 100
                    : (stats.office / monthlyTarget) * 100)}%`, 
                  backgroundColor: getTargetColorStyle(stats, referenceDate).backgroundColor 
                }]} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  // SETTINGS SCREEN
  const renderSettingsScreen = () => {
    return (
      <ScrollView 
        style={styles.settingsContainer}
        contentContainerStyle={styles.settingsScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.settingsTitle}>⚙️ Settings</Text>
        
        {/* Pro Version Banner */}
        <View style={styles.proVersionBanner}>
          <Text style={styles.proVersionTitle}>⚡ Office Hybrid Tracker Pro</Text>
          <Text style={styles.proVersionSubtitle}>Coming Soon</Text>
          <Text style={styles.proVersionDescription}>
            Advanced analytics, team collaboration, and more!
          </Text>
        </View>

        {/* Settings Options */}
        <View style={styles.settingsSection}>
          {/* Company Info */}
          <TouchableOpacity 
            style={styles.settingsItem}
            onPress={() => {
              setEditCompanyName(userData.companyName || '');
              setEditCompanyAddress(userData.companyAddress || '');
              setShowEditCompanyModal(true);
            }}
          >
            <Text style={styles.settingsItemIcon}>🏢</Text>
            <View style={styles.settingsItemContent}>
              <Text style={styles.settingsItemText}>Company Info</Text>
              <Text style={styles.settingsItemSubtext}>
                {userData.companyName || 'Not set'} • {userData.companyAddress || 'Not set'}
              </Text>
            </View>
            <Text style={styles.settingsItemArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingsItem}
            onPress={() => {
              Alert.alert(
                '📤 Export Options',
                'Choose what to export:',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'This Month', 
                    onPress: () => exportStatsToPDF('month', new Date())
                  },
                  { 
                    text: 'This Year', 
                    onPress: () => exportStatsToPDF('year', new Date())
                  }
                ]
              );
            }}
          >
            <Text style={styles.settingsItemIcon}>📤</Text>
            <Text style={styles.settingsItemText}>Export Options</Text>
            <Text style={styles.settingsItemArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsItem}
            onPress={async () => {
              Alert.alert(
                '🔔 Notification Management',
                'Choose an option:',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: '🔔 Re-schedule All Notifications',
                    onPress: async () => {
                      try {
                        console.log('🔄 User manually re-scheduling notifications...');

                        // Cancel all existing notifications
                        await Notifications.cancelAllScheduledNotificationsAsync();
                        console.log('✅ Cancelled all existing notifications');

                        // Re-schedule based on tracking mode
                        if (userData.trackingMode === 'manual') {
                          await setupManualNotifications();
                        }

                        // Re-schedule planned office days
                        if (Object.keys(plannedDays).length > 0) {
                          await scheduleOfficeDayReminders();
                        }

                        // Log what's scheduled
                        setTimeout(async () => {
                          const scheduled = await logScheduledNotifications();
                          Alert.alert(
                            '✅ Notifications Re-scheduled',
                            `Successfully set up ${scheduled.length} notification${scheduled.length !== 1 ? 's' : ''}.\n\nCheck your console logs for details.`,
                            [{ text: 'OK' }]
                          );
                        }, 1000);
                      } catch (error) {
                        console.error('Error re-scheduling notifications:', error);
                        Alert.alert('❌ Error', 'Failed to re-schedule notifications. Please try again.');
                      }
                    }
                  },
                  {
                    text: '📋 View Scheduled Notifications',
                    onPress: async () => {
                      const scheduled = await logScheduledNotifications();
                      Alert.alert(
                        '📋 Scheduled Notifications',
                        scheduled.length > 0
                          ? `You have ${scheduled.length} notification${scheduled.length !== 1 ? 's' : ''} scheduled.\n\nCheck console logs for details.`
                          : 'No notifications currently scheduled.',
                        [{ text: 'OK' }]
                      );
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.settingsItemIcon}>🔔</Text>
            <Text style={styles.settingsItemText}>Notifications</Text>
            <Text style={styles.settingsItemArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingsItem}
            onPress={showTargetSelectionDialog}
          >
            <Text style={styles.settingsItemIcon}>🎯</Text>
            <Text style={styles.settingsItemText}>Monthly Target</Text>
            <Text style={styles.settingsItemValue}>{monthlyTarget} {targetMode === 'percentage' ? '%' : 'days'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingsItem}
            onPress={() => {
              Alert.alert(
                '📱 Tracking Mode',
                'Choose your tracking mode:',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: '✋ Manual Entry', 
                    onPress: async () => {
                      const updatedData = { ...userData, trackingMode: 'manual' };
                      setUserData(updatedData);
                      
                      // Save to Firebase
                      await firebaseService.updateData('userData', updatedData);
                      
                      // Small delay to prevent rapid successive calls during mode switching
                      await new Promise(resolve => setTimeout(resolve, 500));
                      
                      // Setup manual notifications
                      await setupManualNotifications();
                      
                      Alert.alert(
                        '✅ Switched to Manual', 
                        "You'll now receive 3 daily reminders on weekdays:\n• 10am: Morning check-in\n• 1pm: Afternoon check-in\n• 4pm: End of day reminder"
                      );
                    }
                  },
                  { 
                    text: '🤖 Smart Auto', 
                    onPress: async () => {
                      // Check if location permission is already granted
                      const currentPermissions = await Location.getForegroundPermissionsAsync();
                      
                      let permissionStatus = currentPermissions.status;
                      
                      // Only show disclosure and request permission if not already granted
                      if (permissionStatus !== 'granted') {
                        // Show prominent disclosure before requesting location permission
                        await showLocationPermissionDisclosure();

                        // Request location permission
                        const { status } = await Location.requestForegroundPermissionsAsync();
                        permissionStatus = status;
                      }
                      
                      if (permissionStatus !== 'granted') {
                        Alert.alert(
                          'Location Required',
                          "Auto mode needs location permission to detect when you're at office. Please enable location access in your device settings."
                        );
                        return;
                      }
                      
                      const updatedData = { ...userData, trackingMode: 'auto' };
                      setUserData(updatedData);
                      
                      // Save to Firebase
                      await firebaseService.updateData('userData', updatedData);
                      
                      // Small delay to prevent rapid successive calls during mode switching
                      await new Promise(resolve => setTimeout(resolve, 500));
                      
                      // Setup auto tracking
                      await setupAutoTracking(updatedData);
                      
                      Alert.alert(
                        '✅ Switched to Smart Auto', 
                        "Location-based tracking is now active. The app will automatically detect when you're at office."
                      );
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.settingsItemIcon}>📱</Text>
            <Text style={styles.settingsItemText}>Tracking Mode</Text>
            <Text style={styles.settingsItemValue}>{userData.trackingMode === 'auto' ? 'Smart Auto' : 'Manual Entry'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingsItem}
            onPress={() => {
              const countryData = COUNTRY_DATA[userData.country || 'australia'];
              const currentYear = new Date().getFullYear();
              const cacheKey = getHolidayCacheKey(userData.country || 'australia', currentYear);
              const lastUpdate = holidayLastUpdated[cacheKey];
              const isValid = isCacheValid(userData.country || 'australia', currentYear, holidayLastUpdated);
              
              let statusText = '';
              if (lastUpdate) {
                const updateDate = new Date(lastUpdate).toLocaleDateString();
                statusText = `\nHolidays last updated: ${updateDate}${isValid ? ' ✅' : ' (outdated)'}`;
              } else {
                statusText = '\nHolidays: Using static data 📋';
              }
              
              Alert.alert(
                '🌍 Location & Holidays',
                `Detected Country: ${countryData.name}\n\nPublic holidays and company suggestions are customized for ${countryData.name}.${statusText}`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: '🔄 Refresh Holidays', 
                    onPress: () => {
                      updateCurrentYearHolidays(userData.country || 'australia');
                      Alert.alert('Holiday Update', 'Refreshing public holidays data...');
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.settingsItemIcon}>🌍</Text>
            <Text style={styles.settingsItemText}>Location & Holidays</Text>
            <View style={styles.settingsItemRightContainer}>
              <Text style={styles.settingsItemValue}>{COUNTRY_DATA[userData.country || 'australia']?.name || 'Australia'}</Text>
              {isLoadingHolidays && <Text style={styles.settingsItemBadge}>Updating...</Text>}
            </View>
          </TouchableOpacity>

          {/* App Version Info */}
          <TouchableOpacity 
            style={styles.settingsItem}
            onPress={() => {
              const appVersion = Application.nativeApplicationVersion || '3.0.0';
              const buildNumber = Application.nativeBuildVersion || '5';
              const deviceModel = Device.modelName || Device.deviceName || 'Unknown';
              const osVersion = Device.osVersion || Platform.Version;
              
              Alert.alert(
                'App Information',
                `Version: ${appVersion} (Build ${buildNumber})\n\nDevice: ${deviceModel}\nOS: ${Platform.OS} ${osVersion}\n\nUser ID: ${userData.userId?.substring(0, 30)}...`,
                [{ text: 'OK' }]
              );
            }}
          >
            <Text style={styles.settingsItemIcon}>ℹ️</Text>
            <Text style={styles.settingsItemText}>App Version</Text>
            <Text style={styles.settingsItemValue}>
              {Application.nativeApplicationVersion || '3.0.0'} ({Application.nativeBuildVersion || '5'})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Reset Button */}
        <View style={styles.resetSection}>
          <TouchableOpacity 
            style={styles.resetButton}
            onPress={() => {
              Alert.alert(
                '🧹 Complete Data Reset',
                'This will permanently delete ALL your data:\n\n• All attendance records\n• All planned days\n• Company details and settings\n• Monthly targets and preferences\n• All app configurations\n\nThis action cannot be undone!\n\nWould you like to export your data first?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: '📄 Export First', 
                    onPress: () => {
                      exportStatsToPDF('year', new Date());
                      setTimeout(() => {
                        Alert.alert(
                          'Ready to Reset?',
                          'Your data has been exported. Now proceed with complete reset?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: '🧹 Reset Everything', style: 'destructive', onPress: clearSession }
                          ]
                        );
                      }, 1000);
                    }
                  },
                  { 
                    text: '🧹 Reset Now', 
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert(
                        '⚠️ Final Confirmation',
                        'Are you absolutely sure? This will erase EVERYTHING and cannot be undone.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'YES, ERASE ALL', style: 'destructive', onPress: clearSession }
                        ]
                      );
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.resetButtonText}>🗑️ Erase & Reset</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // BOTTOM NAVIGATION
  const renderBottomNavigation = () => {
    const tabs = [
      { id: 'home', icon: '⌂', label: 'Home' },
      { id: 'plan', icon: '◐', label: 'Plan' },
      { id: 'analytics', icon: '◈', label: 'Analytics' },
      { id: 'settings', icon: '◉', label: 'Settings' }
    ];

    return (
      <View style={styles.bottomNavigation}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.bottomNavTab,
              activeTab === tab.id && styles.bottomNavTabActive
            ]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[
              styles.bottomNavIcon,
              activeTab === tab.id && styles.bottomNavIconActive
            ]}>
              {tab.icon}
            </Text>
            <Text style={[
              styles.bottomNavLabel,
              activeTab === tab.id && styles.bottomNavLabelActive
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.8}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };



  // MAIN RENDER
  const renderMainApp = () => {
    return (
      <View style={styles.mainContainer}>
        <RNStatusBar barStyle="light-content" backgroundColor="#000000" />
        
        {/* Content Area */}
        <View style={styles.contentArea}>
          {activeTab === 'home' && renderHomeScreen()}
          {activeTab === 'plan' && renderPlanScreen()}
          {activeTab === 'analytics' && renderAnalyticsScreen()}
          {activeTab === 'settings' && renderSettingsScreen()}
        </View>

        {/* Bottom Navigation */}
        {renderBottomNavigation()}



        {/* Modals */}
        {showStats && (
          <Modal visible={showStats} animationType="slide" presentationStyle="fullScreen">
            {/* Keep existing detailed stats modal content */}
            <View style={styles.detailedStatsContainer}>
              <View style={styles.detailedStatsHeader}>
                <View style={styles.statsHeaderSpacer} />
                <Text style={styles.detailedStatsTitle}>📊 Detailed Analytics</Text>
                <TouchableOpacity 
                  style={styles.statsExportButton}
                  onPress={() => exportStatsToPDF(statsView, statsMonth)}
                >
                  <Text style={styles.detailedStatsExportButtonText}>PDF</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.statsCloseButtonContainer}>
                <TouchableOpacity 
                  style={styles.statsCloseButton}
                  onPress={() => setShowStats(false)}
                >
                  <Text style={styles.detailedStatsCloseButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.statsViewToggle}>
                {['month', 'quarter', 'year'].map(view => (
                  <TouchableOpacity
                    key={view}
                    style={[
                      styles.statsViewButton,
                      statsView === view && styles.statsViewButtonActive
                    ]}
                    onPress={() => setStatsView(view)}
                  >
                    <Text style={[
                      styles.statsViewButtonText,
                      statsView === view && styles.statsViewButtonTextActive
                    ]}>
                      {view.charAt(0).toUpperCase() + view.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {statsView === 'month' && (
                <View style={styles.statsNavigationContainer}>
                  <TouchableOpacity 
                    onPress={() => setStatsMonth(new Date(statsMonth.getFullYear(), statsMonth.getMonth() - 1, 1))}
                    style={styles.statsNavButton}
                  >
                    <Text style={styles.statsNavText}>‹ Previous</Text>
                  </TouchableOpacity>
                  
                  <Text style={styles.statsPeriodTitle}>
                    {statsMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </Text>
                  
                  <TouchableOpacity 
                    onPress={() => setStatsMonth(new Date(statsMonth.getFullYear(), statsMonth.getMonth() + 1, 1))}
                    style={styles.statsNavButton}
                  >
                    <Text style={styles.statsNavText}>Next ›</Text>
                  </TouchableOpacity>
                </View>
              )}

              <ScrollView style={styles.detailedStatsContent}>
                {renderDetailedStats()}
              </ScrollView>
            </View>
          </Modal>
        )}

        {/* Target Input Modal - Android friendly */}
        <Modal 
          visible={showTargetModal} 
          animationType="slide" 
          presentationStyle="overFullScreen"
          transparent={true}
        >
          <View style={styles.targetModalOverlay}>
            <View style={styles.targetModalContainer}>
              <Text style={styles.targetModalTitle}>
                {targetInputMode === 'days' ? '📅 Set Days Target' : '📊 Set Percentage Target'}
              </Text>
              <Text style={styles.targetModalSubtitle}>
                {targetInputMode === 'days' 
                  ? 'How many office days per month?' 
                  : 'What percentage of working days should be office days?'}
              </Text>
              
              <TextInput
                style={styles.targetModalInput}
                value={targetInputValue}
                onChangeText={setTargetInputValue}
                placeholder={targetInputMode === 'days' ? 'e.g. 15' : 'e.g. 75'}
                placeholderTextColor="#666666"
                keyboardType="numeric"
                selectTextOnFocus={true}
                autoFocus={true}
              />
              
              <View style={styles.targetModalButtons}>
                <TouchableOpacity 
                  style={[styles.targetModalButton, styles.targetModalCancelButton]}
                  onPress={() => setShowTargetModal(false)}
                >
                  <Text style={styles.targetModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.targetModalButton, styles.targetModalSaveButton]}
                  onPress={handleTargetSave}
                >
                  <Text style={styles.targetModalSaveText}>Set Target</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Edit Company Info Modal */}
        <Modal 
          visible={showEditCompanyModal} 
          animationType="slide" 
          presentationStyle="overFullScreen"
          transparent={true}
        >
          <View style={styles.targetModalOverlay}>
            <View style={styles.targetModalContainer}>
              <Text style={styles.targetModalTitle}>🏢 Edit Company Info</Text>
              <Text style={styles.targetModalSubtitle}>
                Update your company name and address
              </Text>
              
              <View style={{ position: 'relative', zIndex: 2000 }}>
                <TextInput
                  style={styles.targetModalInput}
                  value={editCompanyName}
                  onChangeText={async (text) => {
                    setEditCompanyName(text);
                    
                    if (text.length >= 2) {
                      const suggestions = await searchCompanies(text);
                      setCompanySuggestions(suggestions);
                      setShowCompanyDropdown(true);
                    } else {
                      setShowCompanyDropdown(false);
                      setCompanySuggestions([]);
                    }
                  }}
                  placeholder="Company Name (e.g., Microsoft Australia)"
                  placeholderTextColor="#666666"
                  autoCapitalize="words"
                  selectTextOnFocus={true}
                  autoFocus={true}
                />
                
                {showCompanyDropdown && companySuggestions.length > 0 && (
                  <View style={[styles.dropdown, { maxHeight: 200, zIndex: 2001 }]}>
                    <ScrollView 
                      style={styles.dropdownScroll}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                    >
                      {companySuggestions.slice(0, 5).map((company, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.dropdownItem}
                          onPress={() => {
                            const companyName = typeof company === 'string' ? company : company.name;
                            setEditCompanyName(companyName);
                            setShowCompanyDropdown(false);
                            setCompanySuggestions([]);
                          }}
                        >
                          <Text style={styles.dropdownText} numberOfLines={1}>
                            {typeof company === 'string' ? company : company.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
              
              <View style={{ position: 'relative', zIndex: 1000 }}>
                <TextInput
                  style={[styles.targetModalInput, { marginTop: 12 }]}
                  value={editCompanyAddress}
                  onChangeText={(text) => {
                    setEditCompanyAddress(text);
                    handleAddressSearch(text);
                  }}
                  placeholder="Company Address (e.g., Sydney, NSW, Australia)"
                  placeholderTextColor="#666666"
                  autoCapitalize="words"
                  selectTextOnFocus={true}
                  multiline
                  numberOfLines={2}
                />
                
                {showAddressDropdown && addressSuggestions.length > 0 && (
                  <View style={[styles.dropdown, { maxHeight: 200 }]}>
                    <ScrollView 
                      style={styles.dropdownScroll}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                    >
                      {addressSuggestions.slice(0, 5).map((address, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setEditCompanyAddress(address.address);
                            setShowAddressDropdown(false);
                            setAddressSuggestions([]);
                          }}
                        >
                          <Text style={styles.dropdownText} numberOfLines={2}>
                            {address.address}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
              
              <Text style={styles.targetModalHint}>
                💡 Tip: We'll detect your country from the address to show relevant holidays
              </Text>
              
              <View style={styles.targetModalButtons}>
                <TouchableOpacity 
                  style={[styles.targetModalButton, styles.targetModalCancelButton]}
                  onPress={() => {
                    setShowEditCompanyModal(false);
                    setShowAddressDropdown(false);
                    setAddressSuggestions([]);
                  }}
                >
                  <Text style={styles.targetModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.targetModalButton, 
                    styles.targetModalSaveButton,
                    isDetectingCountry && styles.disabledButton
                  ]}
                  disabled={isDetectingCountry}
                  onPress={async () => {
                    setIsDetectingCountry(true);
                    setShowAddressDropdown(false);
                    setAddressSuggestions([]);
                    try {
                      const success = await updateCompanyInfo(editCompanyName, editCompanyAddress);
                      if (success) {
                        setShowEditCompanyModal(false);
                      }
                    } finally {
                      setIsDetectingCountry(false);
                    }
                  }}
                >
                  <Text style={styles.targetModalSaveText}>
                    {isDetectingCountry ? '🌍 Detecting...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  // SCREENS

  if (screen === 'loading') {
    return (
      <View style={styles.splashContainer}>
        <RNStatusBar barStyle="light-content" backgroundColor="#FFD700" />
        <Image 
          source={require('./assets/splash.png')} 
          style={styles.splashImage}
          resizeMode="cover"
        />
      </View>
    );
  }

  if (screen === 'welcome') {
    return (
      <ScrollView style={styles.containerBlack} contentContainerStyle={styles.welcomeContainer}>
        <RNStatusBar barStyle="light-content" backgroundColor="#000000" />
        
        <View style={styles.welcomeHeader}>
          <Image 
            source={require('./assets/icon.png')} 
            style={styles.welcomeLogo}
            resizeMode="contain"
          />
          <Text style={styles.welcomeTitle}>OFFICE HYBRID TRACKER</Text>
          <Text style={styles.welcomeSubtitle}>
            Your simple hybrid work attendance tracker
          </Text>
        </View>

        <View style={styles.welcomeFeatures}>
          <View style={styles.featuresCard}>
            <Text style={styles.featuresTitle}>What you get:</Text>
            <FeatureItem emoji="✅" text="Track office days effortlessly" />
            <FeatureItem emoji="📊" text="Monthly attendance insights" />
            <FeatureItem emoji="🎯" text="Set and achieve office day targets" />
            <FeatureItem emoji="📱" text="Smart notifications and reminders" />
            <FeatureItem emoji="🆓" text="Completely free to use" />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.greenButton} 
            onPress={() => setScreen('companySetup')}
          >
            <Text style={styles.greenButtonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (screen === 'companySetup') {


    const handleCompanySearch = async (text) => {
      setCompanySearchText(text);
      setUserData({ ...userData, companyName: text });
      
      if (text.length >= 2) {
        const suggestions = await searchCompanies(text);
        console.log('Company suggestions received:', suggestions);
        setCompanySuggestions(suggestions);
        setShowCompanyDropdown(true); // Always show dropdown when searching
      } else {
        setShowCompanyDropdown(false);
        setCompanySuggestions([]);
      }
    };

    const handleCompanySelect = (company) => {
      console.log('handleCompanySelect called with:', company);
      let companyName = '';
      
      if (typeof company === 'string') {
        companyName = company;
      } else if (company && company.name) {
        companyName = company.name;
      } else {
        companyName = company?.toString() || '';
      }
      
      console.log('Setting company name to:', companyName);
      setCompanySearchText(companyName);
      setUserData({ ...userData, companyName: companyName });
      setShowCompanyDropdown(false);
      setCompanySuggestions([]);
    };

    const handleAddressSearch = async (text) => {
      setAddressSearchText(text);
      
      // Clear previous timeout
      if (addressSearchTimeout) {
        clearTimeout(addressSearchTimeout);
      }
      
      if (text.length >= 3) {
        // Show loading immediately
        setIsLoadingAddresses(true);
        setShowAddressDropdown(true);
        
        // Debounce the actual search by 500ms
        const timeoutId = setTimeout(async () => {
          try {
            const suggestions = await searchAddresses(text);
            setAddressSuggestions(suggestions);
            setIsLoadingAddresses(false);
          } catch (error) {
            console.log('Address search error:', error);
            setIsLoadingAddresses(false);
            setAddressSuggestions([]);
          }
        }, 500);
        
        setAddressSearchTimeout(timeoutId);
      } else {
        setShowAddressDropdown(false);
        setAddressSuggestions([]);
        setIsLoadingAddresses(false);
      }
    };

    const handleAddressSelect = (address) => {
      setAddressSearchText(address.address);
      
      // Detect country for holiday calendar and company suggestions
      let country = 'australia'; // default
      const countryName = address.country?.toLowerCase() || '';
      
      if (countryName.includes('india')) country = 'india';
      else if (countryName.includes('united states') || countryName.includes('usa')) country = 'usa';
      else if (countryName.includes('united kingdom') || countryName.includes('uk') || countryName.includes('great britain')) country = 'uk';
      else if (countryName.includes('canada')) country = 'canada';
      else if (countryName.includes('australia')) country = 'australia';
      
      setUserData({
        ...userData,
        companyLocation: { latitude: address.lat, longitude: address.lon },
        companyAddress: address.address,
        country
      });
      setShowAddressDropdown(false);
      setAddressSuggestions([]);
    };

    const handleUseCurrentLocation = async () => {
      // Check if location permission is already granted
      const currentPermissions = await Location.getForegroundPermissionsAsync();
      
      let permissionStatus = currentPermissions.status;
      
      // Only show disclosure and request permission if not already granted
      if (permissionStatus !== 'granted') {
        // Show prominent disclosure before requesting location permission
        await showLocationPermissionDisclosure();
        
        const { status } = await Location.requestForegroundPermissionsAsync();
        permissionStatus = status;
      }
      if (permissionStatus !== 'granted') {
        Alert.alert('Permission Required', 'Please enable location to set office address');
        return;
      }

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        const address = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        });

        if (address && address[0]) {
          const addr = address[0] || {};
          const fullAddress = [
            addr.street,
            addr.city,
            addr.region,
            addr.country
          ].filter(Boolean).join(', ');
          
          // Detect country for holiday calendar and company suggestions
          let country = 'australia'; // default
          const countryName = addr.country?.toLowerCase() || '';
          
          if (countryName.includes('india')) country = 'india';
          else if (countryName.includes('united states') || countryName.includes('usa')) country = 'usa';
          else if (countryName.includes('united kingdom') || countryName.includes('uk') || countryName.includes('great britain')) country = 'uk';
          else if (countryName.includes('canada')) country = 'canada';
          else if (countryName.includes('australia')) country = 'australia';
          
          setAddressSearchText(fullAddress);
          setLocationSet(true);
          setUserData({
            ...userData,
            companyLocation: location.coords,
            companyAddress: fullAddress,
            country
          });
        }
      } catch (error) {
        Alert.alert('Error', 'Could not get your location. Please try again.');
      }
    };

    const closeAllDropdowns = () => {
      setShowCompanyDropdown(false);
      setShowAddressDropdown(false);
    };

    return (
        <ScrollView style={styles.containerBlack} contentContainerStyle={styles.setupContainer}>
          <RNStatusBar barStyle="light-content" backgroundColor="#000000" />
          
          <Text style={styles.setupTitle}>Company Details</Text>
          <Text style={styles.setupSubtitle}>Help us set up your workspace</Text>
        

        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Company Name</Text>
          <View style={{ position: 'relative', zIndex: 1000 }}>
            <TextInput
              style={styles.input}
              placeholder="Type your company name..."
              placeholderTextColor="#666666"
              value={companySearchText}
              onChangeText={handleCompanySearch}
              onFocus={() => setShowCompanyDropdown(companySuggestions.length > 0)}
            />
            
            {showCompanyDropdown && (
            <View style={styles.dropdown}>
              {isLoadingCompanies ? (
                <View style={styles.dropdownItem}>
                  <ActivityIndicator size="small" color="#FFD700" />
                  <Text style={styles.dropdownText}>Searching companies...</Text>
                </View>
              ) : companySuggestions.length > 0 ? (
                <FlatList
                  data={companySuggestions.slice(0, 5)}
                  keyExtractor={(item, index) => `company-${index}`}
                  scrollEnabled={false}
                  renderItem={({ item: company, index }) => {
                    const companyName = typeof company === 'string' ? company : (company?.name || company);
                    return (
                      <TouchableOpacity
                        style={[
                          styles.dropdownItem,
                          index === Math.min(companySuggestions.length, 5) - 1 && styles.lastDropdownItem
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          console.log('Company item pressed:', companyName);
                          setCompanySearchText(companyName);
                          setUserData(prev => ({ ...prev, companyName: companyName }));
                          setShowCompanyDropdown(false);
                          setCompanySuggestions([]);
                        }}
                        onTouchStart={() => {
                          console.log('Touch started on:', companyName);
                          setCompanySearchText(companyName);
                          setUserData(prev => ({ ...prev, companyName: companyName }));
                          setShowCompanyDropdown(false);
                          setCompanySuggestions([]);
                        }}
                      >
                        <Text style={styles.dropdownText}>{companyName}</Text>
                        {company.jurisdiction && (
                          <Text style={styles.dropdownSubtext}>{company.jurisdiction}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              ) : (
                <>
                  <View style={styles.dropdownItem}>
                    <Text style={styles.noResultsText}>No companies found</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      console.log('Manual entry pressed');
                      setShowCompanyDropdown(false);
                    }}
                  >
                    <Text style={styles.manualEntryText}>
                      ✏️ Use "{companySearchText}" as company name
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            )}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Office Address</Text>
          <Text style={styles.inputHint}>
            📍 Your address will help us customize public holidays and company suggestions for your region
          </Text>
          
          <TextInput
            style={styles.input}
            placeholder="Enter office address or use location below..."
            placeholderTextColor="#666666"
            value={addressSearchText}
            onChangeText={handleAddressSearch}
            multiline={true}
            numberOfLines={2}
            editable={true}
          />

          {showAddressDropdown && (
            <View style={styles.dropdown}>
              {isLoadingAddresses && (
                <View style={styles.dropdownItem}>
                  <ActivityIndicator size="small" color="#FFD700" />
                  <Text style={styles.dropdownText}>Searching addresses...</Text>
                </View>
              )}
              
              {!isLoadingAddresses && (
                <ScrollView 
                  style={styles.dropdownScroll}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {addressSuggestions.length > 0 ? (
                    addressSuggestions.slice(0, 6).map((address, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.dropdownItem,
                          index === Math.min(addressSuggestions.length, 6) - 1 && styles.lastDropdownItem
                        ]}
                        onPress={() => handleAddressSelect(address)}
                      >
                        <Text style={styles.dropdownText} numberOfLines={2}>
                          {address.address}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View>
                      <View style={styles.dropdownItem}>
                        <Text style={styles.noResultsText}>No addresses found</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        onPress={() => {
                          setShowAddressDropdown(false);
                          // Keep the current text as the address
                          setUserData({
                            ...userData,
                            companyAddress: addressSearchText
                          });
                        }}
                      >
                        <Text style={styles.manualEntryText}>
                          ✏️ Use current address manually
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.locationButton, locationSet && styles.locationButtonDisabled]}
            onPress={handleUseCurrentLocation}
            disabled={locationSet}
          >
            <Text style={[styles.locationButtonText, locationSet && styles.locationButtonTextDisabled]}>
              {locationSet ? '✅ Location Set' : '📍 Use Current Location'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton, 
            (!userData.companyName || !addressSearchText || isDetectingCountry) && styles.disabledButton
          ]}
          disabled={!userData.companyName || !addressSearchText || isDetectingCountry}
          onPress={async () => {
            try {
              // Detect country from address before proceeding
              setIsDetectingCountry(true);
              
              // Use Google Geocoding API to detect country
              const { country, countryCode, countryName } = await detectCountryFromAddress(addressSearchText);
              
              // Update userData with detected country
              const updatedData = {
                ...userData,
                country,
                countryCode,
                countryName
              };
              
              setUserData(updatedData);
              console.log(`✅ Country detected: ${countryName} (${countryCode})`);
              
              // Proceed to tracking mode selection
              setScreen('trackingMode');
            } catch (error) {
              console.error('Error detecting country:', error);
              // Don't block user if geocoding fails - use default
              setUserData({
                ...userData,
                country: 'AU',
                countryCode: 'AU',
                countryName: 'Australia'
              });
              setScreen('trackingMode');
            } finally {
              setIsDetectingCountry(false);
            }
          }}
        >
          <Text style={styles.primaryButtonText}>
            {isDetectingCountry ? '🌍 Detecting Country...' : 'Continue'}
          </Text>
        </TouchableOpacity>
        </ScrollView>
    );
  }



  if (screen === 'trackingMode') {
    return (
      <ScrollView style={styles.containerBlack} contentContainerStyle={styles.setupContainer}>
        <RNStatusBar barStyle="light-content" backgroundColor="#000000" />
        
        <Text style={styles.setupTitle}>How would you like to track?</Text>
        <Text style={styles.setupSubtitle}>Both options are completely free!</Text>

        <TouchableOpacity
          style={[
            styles.trackingCard,
            userData.trackingMode === 'manual' && styles.trackingCardSelected
          ]}
          onPress={() => setUserData({ ...userData, trackingMode: 'manual' })}
        >
          <View style={styles.trackingHeader}>
            <Text style={styles.trackingEmoji}>✋</Text>
            <View style={styles.trackingInfo}>
              <Text style={styles.trackingTitle}>Manual Entry</Text>
              <Text style={styles.freeTag}>FREE</Text>
            </View>
          </View>
          
          <Text style={styles.trackingDescription}>
            Perfect for complete control over your data
          </Text>
          
          <View style={styles.trackingFeatures}>
            <Text style={styles.featureText}>• 3 daily notifications (10am, 1pm, 4pm)</Text>
            <Text style={styles.featureText}>• Quick tap to mark your day</Text>
            <Text style={styles.featureText}>• No location tracking needed</Text>
            <Text style={styles.featureText}>• Maximum privacy</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.trackingCard,
            userData.trackingMode === 'auto' && styles.trackingCardSelected
          ]}
          onPress={() => setUserData({ ...userData, trackingMode: 'auto' })}
        >
          <View style={styles.trackingHeader}>
            <Text style={styles.trackingEmoji}>🤖</Text>
            <View style={styles.trackingInfo}>
              <Text style={styles.trackingTitle}>Auto Smart Detection</Text>
              <Text style={styles.freeTag}>FREE</Text>
            </View>
          </View>
          
          <Text style={styles.trackingDescription}>
            Let the app detect when you're at office
          </Text>
          
          <View style={styles.trackingFeatures}>
            <Text style={styles.featureText}>• Automatic office detection (hourly check)</Text>
            <Text style={styles.featureText}>• Location checked only when needed</Text>
            <Text style={styles.featureText}>• Morning reminders for planned days</Text>
            <Text style={styles.featureText}>• Hands-free tracking</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={async () => {
            // Function to proceed with setup after target is set or skipped
            const proceedWithSetup = async () => {
              // Request permissions based on selected mode
              if (userData.trackingMode === 'auto') {
                // Require FOREGROUND permission to enable auto-detection.
                // On Android, background permission is often a separate Settings flow;
                // do not block onboarding if background isn't granted yet.
                const currentFg = await Location.getForegroundPermissionsAsync();
                let fgStatus = currentFg;

                if (currentFg.status !== 'granted') {
                  await showLocationPermissionDisclosure();
                  fgStatus = await Location.requestForegroundPermissionsAsync();
                }

                if (fgStatus.status !== 'granted') {
                  Alert.alert(
                    'Location Permission Required',
                    "Auto mode needs location access to detect when you're at office. Would you like to continue with Manual mode instead?",
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Use Manual Mode', 
                        onPress: () => {
                          setUserData({ ...userData, trackingMode: 'manual' });
                          Alert.alert('Switched to Manual', 'You can always change to Auto mode later in settings when you enable location permissions.');
                        }
                      },
                      { text: 'Try Again', onPress: () => Location.requestForegroundPermissionsAsync() }
                    ]
                  );
                  return;
                }

                // Best-effort background permission request (non-blocking)
                try {
                  const bg = await Location.getBackgroundPermissionsAsync();
                  if (bg.status !== 'granted') {
                    if (Platform.OS === 'ios') {
                      await Location.requestBackgroundPermissionsAsync();
                    } else {
                      // Android: don't block onboarding; user can enable "Allow all the time" later.
                      console.log('ℹ️ Background permission not granted on Android (continuing)');
                    }
                  }
                } catch (e) {
                  console.log('⚠️ Background permission check/request failed (continuing):', e);
                }
              }

              // Request notification permission (only on native platforms)
              if (Platform.OS !== 'web') {
                const notifStatus = await Notifications.requestPermissionsAsync();
                if (notifStatus.status !== 'granted') {
                  Alert.alert(
                    'Notification Permission',
                    'We need notification permission to send you reminders. You can enable this in your phone settings later.'
                  );
                }
              }

              // Save user data and initialize
              const userId = await getOrCreateUserId();
              const finalUserData = { ...userData, userId };
              setUserData(finalUserData);
              
              // Register FCM token for push notifications (after user ID is created)
              if (Platform.OS !== 'web') {
                await fcmService.initialize(userId);
              }
              
              // Initialize Firebase service and save all setup data
              await firebaseService.initialize(userId);
              await firebaseService.saveAllData({
                userData: finalUserData,
                attendanceData: {},
                plannedDays: {},
                monthlyTarget,
                targetMode,
                cachedHolidays: {},
                holidayLastUpdated: {}
              });

              // Save setup completion timestamp locally
              await AsyncStorage.setItem('setupCompletedTime', Date.now().toString());

              // Set up tracking based on mode
              if (userData.trackingMode === 'manual') {
                await setupManualNotifications();
              } else {
                await setupAutoTracking(finalUserData);
              }
              
              // Setup real-time sync
              firebaseService.setupRealtimeSync((syncedData) => {
                console.log('🔄 Syncing data from Firebase...');
                // Set flag to prevent auto-save loop
                isSyncingFromFirebase.current = true;
                setAttendanceData(syncedData.attendanceData || {});
                setPlannedDays(syncedData.plannedDays || {});
                setMonthlyTarget(syncedData.settings?.monthlyTarget || 15);
                setTargetMode(syncedData.settings?.targetMode || 'days');
              });

              // Navigate to home screen - no sample data for new users
              setScreen('home');
              setActiveTab('home');
              
              // Show onboarding tutorial for new users

            };

            // First check if user has set a monthly target
            if (monthlyTarget === 0) {
              Alert.alert(
                '🎯 Set Your Monthly Target',
                "Before we get started, let's set your monthly office attendance goal to help track your progress!",
                [
                  { text: 'Skip for Now', style: 'cancel', onPress: () => proceedWithSetup() },
                  { text: 'Set Target', onPress: () => showTargetSelectionDialog() }
                ]
              );
              return;
            }

            await proceedWithSetup();
          }}
        >
          <Text style={styles.primaryButtonText}>
            Start {userData.trackingMode === 'auto' ? 'Auto' : 'Manual'} Tracking
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setScreen('companySetup')}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (screen === 'calendar') {
    return renderMainApp();
  }

  // Legacy calendar code (keeping for reference)
  if (screen === 'old-calendar') {
    const calendarDays = generateCalendarDays();
    const stats = calculateStats('month');
    const targetProgress = calculateTargetProgress();
    const monthName = currentMonth.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });

    return (
      <View style={styles.containerBlack}>
        <RNStatusBar barStyle="light-content" backgroundColor="#000000" />
        
        {/* Header */}
        <View style={styles.calendarHeader}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>OfficeTrack</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity onPress={() => setShowPlanner(true)}>
                <Text style={styles.planButton}>📅{new Date().getDate()}/{new Date().getMonth() + 1} Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => {
                  Alert.alert(
                    '⚠️ Reset All Data',
                    'This will permanently delete:\n• All attendance records\n• Planned days\n• Monthly targets\n• Company information\n\nThis cannot be undone. Consider exporting your data first.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Export First',
                        onPress: () => {
                          Alert.alert(
                            'Export Feature',
                            'Export feature will be available soon. For now, take a screenshot of your calendar.'
                          );
                        },
                      },
                      { text: 'Reset Now', style: 'destructive', onPress: clearSession },
                    ]
                  );
                }}
              >
                <Text style={styles.resetTextButton}>🔄 Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <Text style={styles.headerMonth}>{monthName}</Text>
          
          {/* Target Progress */}
          <View style={styles.targetCard}>
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Monthly Target:</Text>
              <TouchableOpacity 
                onPress={() => {
                  Alert.alert(
                    'Set Target',
                    'Choose your target type',
                    [
                      {
                        text: 'Days Target',
                        onPress: () => {
                          Alert.prompt(
                            'Set Target in Days',
                            'How many office days per month?',
                            async (text) => {
                              const target = parseInt(text);
                              if (target > 0 && target <= 25) {
                                setMonthlyTarget(target);
                                setTargetMode('days');
                                await AsyncStorage.setItem('monthlyTarget', text);
                                await AsyncStorage.setItem('targetMode', 'days');
                              }
                            },
                            'plain-text',
                            monthlyTarget.toString()
                          );
                        }
                      },
                      {
                        text: 'Percentage Target',
                        onPress: () => {
                          Alert.prompt(
                            'Set Target in Percentage',
                            'What percentage of working days should be office days?',
                            async (text) => {
                              const percentage = parseInt(text);
                              if (percentage > 0 && percentage <= 100) {
                                setMonthlyTarget(percentage);
                                setTargetMode('percentage');
                                await AsyncStorage.setItem('monthlyTarget', text);
                                await AsyncStorage.setItem('targetMode', 'percentage');
                              }
                            },
                            'plain-text',
                            targetMode === 'percentage' ? monthlyTarget.toString() : '50'
                          );
                        }
                      },
                      { text: 'Cancel', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Text style={[styles.targetValue, getTargetColorStyle(targetProgress.percentage)]}>
                  {targetMode === 'days' 
                    ? `${targetProgress.progress}/${targetProgress.adjustedTarget} (${targetProgress.percentage}%)`
                    : `${targetProgress.percentage}% of ${((targetProgress.workingDaysInfo?.workingDays || 0) - (targetProgress.workingDaysInfo?.personalLeaves || 0))} available days`
                  }
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.workingDaysRow}>
              <Text style={styles.workingDaysLabel}>
                Available Days: {(targetProgress.workingDaysInfo?.workingDays || 0) - (targetProgress.workingDaysInfo?.personalLeaves || 0)}
              </Text>
              <Text style={styles.workingDaysBreakdown}>
                ({targetProgress.workingDaysInfo?.totalDays || 0} - {targetProgress.workingDaysInfo?.weekends || 0} weekends - {targetProgress.workingDaysInfo?.holidays || 0} holidays - {targetProgress.workingDaysInfo?.personalLeaves || 0} leaves)
              </Text>
            </View>
            <Text style={styles.targetSuggestion}>{targetProgress.suggestion}</Text>
          </View>
        </View>

        <ScrollView style={styles.calendarContent}>
          {/* Month Navigation */}
          <View style={styles.monthNavigation}>
            <TouchableOpacity 
              onPress={() => {
                const newMonth = new Date(currentMonth);
                newMonth.setMonth(newMonth.getMonth() - 1);
                setCurrentMonth(newMonth);
              }}
            >
              <Text style={styles.navButton}>‹</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setCurrentMonth(new Date())}>
              <Text style={styles.monthYearButton}>{monthName}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => {
                const newMonth = new Date(currentMonth);
                newMonth.setMonth(newMonth.getMonth() + 1);
                setCurrentMonth(newMonth);
              }}
            >
              <Text style={styles.navButton}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Calendar */}
          <View style={styles.calendar}>
            {/* Week headers */}
            <View style={styles.weekHeader}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Text key={day} style={styles.weekHeaderText}>{day}</Text>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.calendarDay, getDayStyle(item)]}
                  disabled={item.isEmpty}
                  onPress={() => {
                    console.log('📅 Calendar day pressed:', {
                      isEmpty: item.isEmpty,
                      date: item.date,
                      isWeekend: item.isWeekend,
                      isHoliday: item.isHoliday,
                      type: item.type
                    });
                    
                    if (!item.isEmpty) {
                      if (item.isWeekend) {
                        console.log('⚠️ Weekend clicked');
                        Alert.alert('🏖️ Weekend', 'You cannot log attendance on weekends.');
                      } else if (item.isHoliday) {
                        console.log('⚠️ Holiday clicked');
                        // Allow logging on holidays but show confirmation
                        const holidayName = getHolidayName(item.date, userData.country);
                        Alert.alert(
                          '🌲 Public Holiday', 
                          `${holidayName}\n\nThis is a public holiday. Are you sure you want to log attendance?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { 
                              text: 'Yes, Log Attendance', 
                              onPress: () => {
                                console.log('✅ Opening modal for holiday');
                                setSelectedDay(item);
                                setShowModal(true);
                              }
                            }
                          ]
                        );
                      } else {
                        console.log('✅ Opening modal for regular day');
                        setSelectedDay(item);
                        setShowModal(true);
                      }
                    }
                  }}
                >
                  {!item.isEmpty && (
                    <View style={styles.calendarDayContent}>
                      <Text style={[styles.dayText, { color: getTextColor(item) }]}>
                        {item.day}
                      </Text>
                      {item.isHoliday && <Text style={styles.calendarHolidayIndicator}>🌲</Text>}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <LegendItem color="#10B981" label="Office" />
            <LegendItem color="#3B82F6" label="WFH" />
            <LegendItem color="#F59E0B" label="Leave" />
            <LegendItem color="#EF4444" label="Holiday" />
            <LegendItem color="#9CA3AF" label="Weekend" />
            <LegendItem color="#A7F3D0" label="Planned" />
          </View>

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <StatCard label="Office" value={stats.office} color="#10B981" />
            <StatCard label="WFH" value={stats.wfh} color="#3B82F6" />
            <StatCard label="Leave" value={stats.leave} color="#F59E0B" />
          </View>

          {/* Action Buttons */}
          <TouchableOpacity 
            style={styles.statsButton} 
            onPress={() => setShowStats(true)}
          >
            <Text style={styles.statsButtonText}>📊 View Detailed Stats</Text>
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>

        {/* Day Selection Modal */}
        <Modal visible={showModal} transparent animationType="slide">
          {(() => {
            console.log('🔍 Modal rendering - showModal:', showModal, 'selectedDay:', selectedDay?.date);
            
            // Check if day has attendance logged
            const currentAttendance = selectedDay ? (selectedDay.type || attendanceData[selectedDay?.date]) : null;
            const hasAttendance = !!currentAttendance;
            
            console.log('📋 Modal Debug:', {
              date: selectedDay?.date,
              selectedDayType: selectedDay?.type,
              attendanceDataLookup: selectedDay ? attendanceData[selectedDay.date] : null,
              currentAttendance,
              hasAttendance
            });
            
            return (
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>
                    {selectedDay ? new Date(selectedDay.date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric' 
                    }) : ''}
                  </Text>
                  
                  {/* Show current status if logged */}
                  {hasAttendance && (
                    <Text style={styles.modalCurrentStatus}>
                      Current: {currentAttendance === 'office' ? '🏢 Office' : currentAttendance === 'wfh' ? '🏠 WFH' : '🌴 Leave'}
                    </Text>
                  )}
              
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: '#10B981' }]}
                    onPress={() => markAttendance(selectedDay.date, 'office')}
                  >
                    <Text style={styles.modalButtonText}>🏢 Office Day</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: '#3B82F6' }]}
                    onPress={() => markAttendance(selectedDay.date, 'wfh')}
                  >
                    <Text style={styles.modalButtonText}>🏠 Work From Home</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: '#F59E0B' }]}
                    onPress={() => markAttendance(selectedDay.date, 'leave')}
                  >
                    <Text style={styles.modalButtonText}>🌴 Leave / Holiday</Text>
                  </TouchableOpacity>

                  {/* Show Clear button only if attendance is already logged */}
                  {hasAttendance && (
                    <TouchableOpacity
                      style={[styles.modalButton, { backgroundColor: '#EF4444' }]}
                      onPress={() => {
                        Alert.alert(
                          'Clear Attendance',
                          'Are you sure you want to clear this attendance entry?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Clear',
                              style: 'destructive',
                              onPress: () => clearAttendance(selectedDay.date)
                            }
                          ]
                        );
                      }}
                    >
                      <Text style={styles.modalButtonText}>🗑️ Clear Entry</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setShowModal(false)}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </Modal>

        {/* Enhanced Full-Screen Stats Modal */}
        <Modal visible={showStats} animationType="slide" presentationStyle="fullScreen">
          <View style={styles.detailedStatsContainer}>
            {/* Header */}
            <View style={styles.detailedStatsHeader}>
              <View style={styles.statsHeaderSpacer} />
              <Text style={styles.detailedStatsTitle}>📊 Detailed Analytics</Text>
              <TouchableOpacity 
                style={styles.statsExportButton}
                onPress={() => exportStatsToPDF(statsView, statsMonth)}
              >
                <Text style={styles.detailedStatsExportButtonText}>PDF</Text>
              </TouchableOpacity>
            </View>
            
            {/* Close button positioned lower on the left */}
            <View style={styles.statsCloseButtonContainer}>
              <TouchableOpacity 
                style={styles.statsCloseButton}
                onPress={() => setShowStats(false)}
              >
                <Text style={styles.detailedStatsCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* View Toggle */}
            <View style={styles.statsViewToggle}>
              {['month', 'quarter', 'year'].map(view => (
                <TouchableOpacity
                  key={view}
                  style={[
                    styles.statsViewButton,
                    statsView === view && styles.statsViewButtonActive
                  ]}
                  onPress={() => setStatsView(view)}
                >
                  <Text style={[
                    styles.statsViewButtonText,
                    statsView === view && styles.statsViewButtonTextActive
                  ]}>
                    {view.charAt(0).toUpperCase() + view.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Period Navigation (for month view) */}
            {statsView === 'month' && (
              <View style={styles.statsNavigationContainer}>
                <TouchableOpacity 
                  onPress={() => setStatsMonth(new Date(statsMonth.getFullYear(), statsMonth.getMonth() - 1, 1))}
                  style={styles.statsNavButton}
                >
                  <Text style={styles.statsNavText}>‹ Previous</Text>
                </TouchableOpacity>
                
                <Text style={styles.statsPeriodTitle}>
                  {statsMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                
                <TouchableOpacity 
                  onPress={() => setStatsMonth(new Date(statsMonth.getFullYear(), statsMonth.getMonth() + 1, 1))}
                  style={styles.statsNavButton}
                >
                  <Text style={styles.statsNavText}>Next ›</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Stats Content */}
            <ScrollView style={styles.detailedStatsContent}>
              {renderDetailedStats()}
            </ScrollView>
          </View>
        </Modal>

        {/* Enhanced Planner Modal */}
        <Modal visible={showPlanner} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.enhancedPlannerModal}>
              <Text style={styles.plannerTitle}>📅 Plan Your Office Days</Text>
              <Text style={styles.plannerSubtitle}>
                Drag to select multiple days. Weekends and holidays are disabled.
              </Text>
              
              {/* Calendar Header */}
              <View style={styles.plannerCalendarHeader}>
                <TouchableOpacity 
                  onPress={() => setPlannerMonth(new Date(plannerMonth.getFullYear(), plannerMonth.getMonth() - 1, 1))}
                  style={styles.monthNavButton}
                >
                  <Text style={styles.monthNavText}>‹</Text>
                </TouchableOpacity>
                
                <Text style={styles.plannerMonthTitle}>
                  {plannerMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                
                <TouchableOpacity 
                  onPress={() => setPlannerMonth(new Date(plannerMonth.getFullYear(), plannerMonth.getMonth() + 1, 1))}
                  style={styles.monthNavButton}
                >
                  <Text style={styles.monthNavText}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Selection Mode Toggle */}
              <View style={styles.selectionModeContainer}>
                <TouchableOpacity 
                  style={[styles.modeButton, selectionMode === 'office' && styles.modeButtonActive]}
                  onPress={() => setSelectionMode('office')}
                >
                  <Text style={[styles.modeButtonText, selectionMode === 'office' && styles.modeButtonTextActive]}>
                    🏢 Office Days
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modeButton, selectionMode === 'wfh' && styles.modeButtonActive]}
                  onPress={() => setSelectionMode('wfh')}
                >
                  <Text style={[styles.modeButtonText, selectionMode === 'wfh' && styles.modeButtonTextActive]}>
                    🏠 WFH Days
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modeButton, selectionMode === 'clear' && styles.modeButtonActive]}
                  onPress={() => setSelectionMode('clear')}
                >
                  <Text style={[styles.modeButtonText, selectionMode === 'clear' && styles.modeButtonTextActive]}>
                    🗑️ Clear
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Calendar Grid */}
              <View style={styles.plannerCalendar}>
                {/* Day Headers */}
                <View style={styles.dayHeaders}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <Text key={day} style={styles.dayHeader}>{day}</Text>
                  ))}
                </View>

                {/* Calendar Grid */}
                {renderPlannerCalendarGrid()}
              </View>

              {/* Action Buttons */}
              <View style={styles.plannerActions}>
                <TouchableOpacity
                  style={styles.plannerSecondaryButton}
                  onPress={() => {
                    setPlannerMonth(new Date()); // Reset to current month
                    setSelectionMode('office');
                    setIsSelecting(false);
                  }}
                >
                  <Text style={styles.plannerSecondaryButtonText}>Reset View</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.plannerPrimaryButton}
                  onPress={() => setShowPlanner(false)}
                >
                  <Text style={styles.plannerPrimaryButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Default case - render main app (home screen)
  return renderMainApp();
}

// Helper Components
function FeatureItem({ emoji, text }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureEmoji}>{emoji}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function LegendItem({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StatsSection({ title, stats }) {
  return (
    <View style={styles.statsSection}>
      <Text style={styles.statsSectionTitle}>{title}</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>Office: {stats.office} days</Text>
          <Text style={styles.statsText}>WFH: {stats.wfh} days</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>Leave: {stats.leave} days</Text>
          <Text style={styles.statsText}>Total: {stats.total} days</Text>
        </View>
        {stats.total > 0 && (
          <Text style={styles.statsPercentage}>
            Office Percentage: {Math.round((stats.office / stats.total) * 100)}%
          </Text>
        )}
      </View>
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  containerBlack: {
    flex: 1,
    backgroundColor: '#000000',
  },
  
  // Loading Screen
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#FFD700',
    marginTop: 16,
  },

  // Splash Screen
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFD700',
  },
  splashImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },

  // Welcome Screen
  welcomeContainer: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    paddingBottom: Platform.OS === 'android' ? 100 : 24,
    backgroundColor: '#000000',
  },
  buttonContainer: {
    paddingBottom: Platform.OS === 'android' ? 50 : 16,
    paddingTop: 20,
  },
  welcomeHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  welcomeLogo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 2,
  },
  welcomeSubtitle: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    opacity: 0.9,
    lineHeight: 24,
  },
  welcomeFeatures: {
    flex: 1,
    justifyContent: 'center',
  },
  featuresCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#333333',
    width: '96%',
    alignSelf: 'center',
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 16,
    textAlign: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  featureEmoji: {
    fontSize: 18,
    marginRight: 12,
    width: 25,
  },
  featureText: {
    fontSize: 14,
    color: 'white',
    flex: 1,
    lineHeight: 18,
  },

  // Setup Screens
  setupContainer: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  setupTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
  },
  setupSubtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 32,
  },

  // Form Components
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
  },
  dropdown: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    maxHeight: 250,
    marginTop: -1,
    zIndex: 9999,
    elevation: 20,
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dropdownItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    backgroundColor: '#1A1A1A',
    minHeight: 50,
    justifyContent: 'center',
  },
  dropdownItemPressed: {
    backgroundColor: '#2A2A2A',
  },
  dropdownText: {
    fontSize: 16,
    color: 'white',
  },
  locationButton: {
    backgroundColor: '#FFD700',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  locationButtonText: {
    color: 'black',
    fontSize: 14,
    fontWeight: '600',
  },
  locationButtonDisabled: {
    backgroundColor: '#22C55E',
    opacity: 0.7,
  },
  locationButtonTextDisabled: {
    color: 'white',
    fontSize: 14,
  },
  addressPreview: {
    fontSize: 14,
    color: '#CCCCCC',
    marginTop: 8,
    fontStyle: 'italic',
    paddingHorizontal: 4,
  },
  dropdownSubtext: {
    fontSize: 12,
    color: '#999999',
    marginTop: 2,
  },

  // Location Filters

  dropdownScroll: {
    maxHeight: 200,
  },
  noResultsText: {
    color: '#999999',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  manualEntryText: {
    color: '#22C55E',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Tracking Mode Cards
  trackingCard: {
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#333333',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  trackingCardSelected: {
    borderColor: '#FFD700',
    backgroundColor: '#2A2A0A',
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  trackingEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  trackingInfo: {
    flex: 1,
  },
  trackingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  freeTag: {
    backgroundColor: '#22C55E',
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  trackingDescription: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 16,
  },
  trackingFeatures: {
    paddingLeft: 8,
  },
  
  // Buttons
  primaryButton: {
    backgroundColor: '#FFD700',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: 'black',
    fontSize: 18,
    fontWeight: 'bold',
  },
  greenButton: {
    backgroundColor: '#22C55E',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: Platform.OS === 'android' ? 32 : 16,
    marginHorizontal: 8,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  greenButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  backButton: {
    fontSize: 16,
    color: '#FFD700',
    textAlign: 'center',
    fontWeight: '600',
  },

  // Calendar Header
  calendarHeader: {
    backgroundColor: '#000000',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  planButton: {
    fontSize: 14,
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resetTextButton: {
    fontSize: 14,
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerMonth: {
    fontSize: 18,
    color: 'white',
    opacity: 0.9,
    marginBottom: 16,
  },
  targetCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 16,
    borderRadius: 12,
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetLabel: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
  },
  targetValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  targetSuggestion: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  workingDaysRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  workingDaysLabel: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
    textAlign: 'center',
  },
  workingDaysBreakdown: {
    fontSize: 11,
    color: '#999999',
    textAlign: 'center',
    marginTop: 2,
  },

  // Calendar Content
  calendarContent: {
    flex: 1,
    padding: 16,
    backgroundColor: '#000000',
  },
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  navButton: {
    fontSize: 24,
    color: '#FFD700',
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  monthYearButton: {
    fontSize: 16,
    color: 'black',
    fontWeight: '600',
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },

  // Calendar Grid
  calendar: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  weekHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#FFD700',
    paddingVertical: 8,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: `${100/7}%`,
    aspectRatio: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 6,
    minHeight: 50,
  },
  dayText: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    fontWeight: '500',
  },

  // Quick Stats
  quickStats: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#333333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  statLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    marginTop: 4,
    fontWeight: '500',
  },

  // Stats Button
  statsButton: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  statsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: '#333333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 24,
    textAlign: 'center',
  },
  modalCurrentStatus: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  modalButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalCancelButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    color: '#CCCCCC',
    fontSize: 16,
    fontWeight: '500',
  },

  // Stats Modal
  statsModalContainer: {
    flex: 1,
  },
  statsModal: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: '80%',
    borderWidth: 1,
    borderColor: '#333333',
  },
  statsModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 24,
    textAlign: 'center',
  },
  statsSection: {
    backgroundColor: '#2A2A2A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  statsSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 12,
  },
  statsGrid: {
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsText: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  statsPercentage: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },

  // Planner Modal
  plannerModal: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#333333',
  },
  plannerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
    textAlign: 'center',
  },
  plannerSubtitle: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 24,
  },
  plannerList: {
    maxHeight: 400,
  },
  plannerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  plannerItemSelected: {
    backgroundColor: '#2A2A0A',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  plannerDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
  },
  plannerStatus: {
    fontSize: 14,
    color: '#CCCCCC',
    fontWeight: '500',
  },

  // Enhanced Planner Modal
  enhancedPlannerModal: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#333333',
  },
  plannerCalendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  plannerMonthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    flex: 1,
    textAlign: 'center',
  },
  monthNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  monthNavText: {
    fontSize: 18,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  selectionModeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#FFD700',
  },
  modeButtonText: {
    fontSize: 12,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
  plannerCalendar: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 20,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: '#888888',
    fontWeight: '600',
  },
  calendarWeek: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  plannerCalendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 1,
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
    position: 'relative',
  },
  plannerDayOutside: {
    opacity: 0.3,
  },
  plannerDayToday: {
    backgroundColor: '#FFD700',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  plannerDayNumberToday: {
    color: '#1A1A1A',
    fontWeight: 'bold',
  },
  plannerDaySelected: {
    backgroundColor: '#2A4A2A',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  plannerDayWFH: {
    backgroundColor: '#2A3A4A',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  plannerDayDisabled: {
    backgroundColor: '#1A1A1A',
    opacity: 0.3,
  },
  plannerDayWeekend: {
    backgroundColor: '#2A1A1A',
  },
  plannerDayHoliday: {
    backgroundColor: '#1A2A1A',
  },
  plannerDayNumber: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  plannerDayNumberOutside: {
    color: '#666666',
  },
  plannerDayNumberDisabled: {
    color: '#444444',
  },
  plannerDayNumberSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  holidayIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
    fontSize: 8,
  },
  plannedIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    fontSize: 8,
  },
  plannerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  plannerSecondaryButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 10,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444444',
    alignItems: 'center',
  },
  plannerSecondaryButtonText: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '500',
  },
  plannerPrimaryButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 10,
    borderRadius: 8,
    backgroundColor: '#FFD700',
    alignItems: 'center',
  },
  plannerPrimaryButtonText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Enhanced Detailed Stats Modal
  detailedStatsContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  detailedStatsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  statsHeaderSpacer: {
    width: 40,
  },
  detailedStatsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    flex: 1,
    textAlign: 'center',
  },
  statsExportButton: {
    width: 50,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  detailedStatsExportButtonText: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  statsCloseButtonContainer: {
    position: 'absolute',
    top: 90,
    left: 20,
    zIndex: 1000,
  },
  statsCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555555',
  },
  detailedStatsCloseButtonText: {
    fontSize: 18,
    color: '#CCCCCC',
    fontWeight: 'bold',
  },
  statsViewToggle: {
    flexDirection: 'row',
    margin: 20,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 4,
  },
  statsViewButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  statsViewButtonActive: {
    backgroundColor: '#FFD700',
  },
  statsViewButtonText: {
    fontSize: 14,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  statsViewButtonTextActive: {
    color: '#1A1A1A',
    fontWeight: 'bold',
  },
  monthSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 12,
  },
  monthNavButton: {
    width: 44,
    height: 44,
    backgroundColor: '#3A3A3A',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthNavButtonText: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
  },
  currentMonthButton: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  currentMonthText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  currentMonthSubtext: {
    fontSize: 11,
    color: '#888888',
  },
  statsSummaryHint: {
    fontSize: 10,
    color: '#888888',
    marginTop: 4,
    textAlign: 'center',
  },
  statsNavigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  statsNavButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333333',
  },
  statsNavText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '500',
  },
  statsPeriodTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  detailedStatsContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statsSummaryCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  statsSummaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsSummaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statsSummaryItem: {
    alignItems: 'center',
  },
  statsSummaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statsSummaryLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  statsSummaryFormula: {
    fontSize: 10,
    color: '#888888',
    textAlign: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  statsSummaryHint: {
    fontSize: 10,
    color: '#888888',
    marginTop: 4,
    textAlign: 'center',
  },
  statsBreakdownCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  statsCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 16,
  },
  statsBreakdownItem: {
    marginBottom: 20,
  },
  statsBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsBreakdownLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  statsBreakdownValue: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  statsProgressBar: {
    height: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 4,
    marginBottom: 4,
  },
  statsProgressFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 8,
  },
  statsBreakdownPercentage: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  statsTargetCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  statsTargetContent: {
    alignItems: 'center',
  },
  statsTargetLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  statsTargetProgress: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  statsInsightsCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#333333',
  },
  statsInsightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsInsightEmoji: {
    fontSize: 16,
    marginRight: 12,
  },
  statsInsightText: {
    fontSize: 14,
    color: '#CCCCCC',
    flex: 1,
  },

  // New App Structure
  mainContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    paddingBottom: Platform.OS === 'ios' ? 100 : 80,
  },
  contentArea: {
    flex: 1,
    paddingTop: 50,
  },

  // Bottom Navigation
  bottomNavigation: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    backdropFilter: 'blur(20px)',
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 215, 0, 0.2)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomNavTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  bottomNavTabActive: {
    // Active tab styling handled by icon/text colors
  },
  bottomNavIcon: {
    fontSize: 24,
    color: '#CCCCCC',
    marginBottom: 4,
  },
  bottomNavIconActive: {
    color: '#FFD700',
  },
  bottomNavLabel: {
    fontSize: 11,
    color: '#CCCCCC',
    fontWeight: '500',
    textAlign: 'center',
    flexShrink: 1,
  },
  bottomNavLabelActive: {
    color: '#FFD700',
    fontWeight: '600',
  },

  // Home Screen
  homeContainer: {
    flex: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 120 : 100,
  },
  homeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 8,
  },
  homeDate: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 20,
  },
  
  // Quick Log Styles
  quickLogContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  quickLogTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 8,
  },
  quickLogDate: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 20,
  },
  quickLogButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickLogButton: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#374151',
    borderRadius: 15,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  quickOfficeButton: {
    borderColor: '#10B981',
  },
  quickWfhButton: {
    borderColor: '#3B82F6',
  },
  quickLeaveButton: {
    borderColor: '#F59E0B',
  },
  quickLogIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  quickLogButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Today Already Logged
  todayLoggedContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  todayLoggedIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  todayLoggedText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  logActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  changeLogButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    flex: 1,
    alignItems: 'center',
  },
  changeLogText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '600',
  },
  clearLogButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    flex: 1,
    alignItems: 'center',
  },
  clearLogText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Today Weekend
  todayWeekendContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  todayWeekendText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontStyle: 'italic',
  },
  
  // Date Selection Header
  dateSelectionHeader: {
    marginBottom: 20,
  },
  weekendBadge: {
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'center',
    marginBottom: 20,
  },
  weekendText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  weekendRestrictionContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  weekendRestrictionIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  weekendRestrictionTitle: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  weekendRestrictionText: {
    color: '#CCCCCC',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Home View Toggle
  homeViewToggle: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 4,
    marginVertical: 16,
    alignSelf: 'center',
  },
  homeViewButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  homeViewButtonActive: {
    backgroundColor: '#FFD700',
  },
  homeViewButtonText: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '600',
  },
  homeViewButtonTextActive: {
    color: '#1A1A1A',
  },

  // Multi-select Calendar
  calendarMultiSelectContainer: {
    marginVertical: 16,
  },
  multiSelectHint: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  homeCalendar: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  calendarMonthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
  },
  calendarWeek: {
    flexDirection: 'row',
  },
  calendarDay: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
    position: 'relative',
  },
  calendarDayEmpty: {
    flex: 1,
    height: 44,
    margin: 1,
  },
  calendarDayToday: {
    backgroundColor: '#FFD700',
  },
  calendarDaySelected: {
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#81C784',
  },
  calendarDayWeekend: {
    backgroundColor: '#333333',
  },
  calendarDayHoliday: {
    backgroundColor: '#4A1A1A',
  },
  calendarDayOffice: {
    backgroundColor: '#4CAF50',
  },
  calendarDayWFH: {
    backgroundColor: '#2196F3',
  },
  calendarDayLeave: {
    backgroundColor: '#FF9800',
  },
  calendarDayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  calendarDayTextToday: {
    color: '#1A1A1A',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
  },
  calendarDayTextWeekend: {
    color: '#CCCCCC',
  },
  calendarDayTextHoliday: {
    color: '#FFCCCC',
  },
  calendarDayContent: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  calendarHolidayIndicator: {
    position: 'absolute',
    top: -8,
    right: -8,
    fontSize: 10,
  },
  calendarDayAttendance: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    fontSize: 8,
  },
  clearSelectionButton: {
    backgroundColor: '#FF5722',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'stretch',
  },
  clearSelectionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Selection Actions
  selectionActionsContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 10,
    marginTop: 16,
  },
  selectionCountText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  bulkLogButton: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
  },
  bulkLogButtonText: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '700',
  },
  
  // Bulk Log Header
  bulkLogHeaderContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  bulkLogTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 4,
  },
  bulkLogSubtitle: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  bulkLogHint: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  dateSelectorContainer: {
    marginBottom: 30,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  dateSelectorButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  dateNavText: {
    fontSize: 20,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  currentDateButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFD700',
    borderRadius: 8,
    marginHorizontal: 20,
  },
  currentDateText: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: 'bold',
  },
  currentStatusContainer: {
    marginBottom: 30,
  },
  currentStatusTitle: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  officeBadge: {
    backgroundColor: '#2A4A2A',
  },
  wfhBadge: {
    backgroundColor: '#2A3A4A',
  },
  leaveBadge: {
    backgroundColor: '#4A3A2A',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  attendanceContainer: {
    marginBottom: 30,
  },
  attendanceButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  attendanceButton: {
    flex: 1,
    minWidth: 100,
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  officeButton: {
    borderColor: '#4CAF50',
  },
  wfhButton: {
    borderColor: '#2196F3',
  },
  leaveButton: {
    borderColor: '#FF9800',
  },
  clearButton: {
    borderColor: '#EF4444',
  },
  selectedAttendance: {
    backgroundColor: '#333333',
  },
  attendanceIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  attendanceText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  quickStatsContainer: {
    marginBottom: 20,
  },
  quickStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickStatItem: {
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
  },

  // Target Progress Styles
  targetProgressContainer: {
    marginVertical: 20,
  },
  targetProgressCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  targetProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  targetLabel: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: '600',
  },
  editTargetText: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  targetProgressInfo: {
    alignItems: 'center',
  },
  targetProgressText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  targetSuggestionText: {
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Plan Screen
  planContainer: {
    flex: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 120 : 100,
  },
  planTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 8,
  },
  planSubtitle: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 20,
  },
  planViewToggle: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
  },
  planViewButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  planViewButtonActive: {
    backgroundColor: '#FFD700',
  },
  planViewButtonText: {
    fontSize: 14,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  planViewButtonTextActive: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
  planCalendarContainer: {
    flex: 1,
    marginBottom: 20,
  },
  shareButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Weekly View Styles
  weeklyViewContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  weekNavButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  weekNavText: {
    fontSize: 20,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  weekRangeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    flex: 1,
  },
  weeklyDaysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weeklyDayCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 8,
    marginHorizontal: 2,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'space-between',
  },
  weeklyDayCardToday: {
    backgroundColor: '#FFD700',
  },
  weeklyDayCardPlanned: {
    backgroundColor: '#4CAF50',
  },
  weeklyDayCardWeekend: {
    backgroundColor: '#333333',
  },
  weeklyDayName: {
    fontSize: 12,
    color: '#CCCCCC',
    fontWeight: '600',
  },
  weeklyDayNameToday: {
    color: '#1A1A1A',
  },
  weeklyDayNumber: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  weeklyDayNumberToday: {
    color: '#1A1A1A',
  },
  weeklyDayStatus: {
    marginTop: 4,
  },
  weeklyStatusText: {
    fontSize: 14,
  },

  // Analytics Screen
  analyticsContainer: {
    flex: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 120 : 100,
  },
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  analyticsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    flex: 1,
    textAlign: 'center',
  },
  cornerExportButton: {
    backgroundColor: '#FFD700',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cornerExportButtonText: {
    fontSize: 20,
    color: '#1A1A1A',
  },
  analyticsContent: {
    flex: 1,
  },

  // Chart Styles
  chartContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 16,
  },
  
  // Summary Stats Row
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryStatCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  summaryStatNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  summaryStatLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
  },

  // Attendance Cards Grid
  attendanceCardsGrid: {
    gap: 12,
  },
  attendanceCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  attendanceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  attendanceCardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  attendanceCardInfo: {
    flex: 1,
  },
  attendanceCardValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  attendanceCardLabel: {
    fontSize: 14,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  attendanceCardProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#333333',
    borderRadius: 3,
    marginRight: 12,
    overflow: 'hidden',
  },
  attendanceCardPercentage: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    minWidth: 45,
    textAlign: 'right',
  },
  exportButton: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  exportButtonText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },

  // Settings Screen
  settingsContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  settingsScrollContent: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 120 : 100,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 30,
  },
  proVersionBanner: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  proVersionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
  },
  proVersionSubtitle: {
    fontSize: 12,
    color: '#FF9800',
    marginBottom: 8,
    fontWeight: '600',
  },
  proVersionDescription: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  settingsSection: {
    marginBottom: 30,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    marginBottom: 8,
  },
  settingsItemIcon: {
    fontSize: 20,
    marginRight: 16,
  },
  settingsItemText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  settingsItemContent: {
    flex: 1,
  },
  settingsItemSubtext: {
    fontSize: 13,
    color: '#888888',
    marginTop: 4,
  },
  settingsItemArrow: {
    fontSize: 16,
    color: '#666666',
  },
  settingsItemBadge: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },
  settingsItemValue: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  settingsItemRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetSection: {
    marginTop: 30,
    paddingBottom: 40,
  },
  resetButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 52,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Target Modal - Android friendly
  targetModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  targetModalContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    borderWidth: 1,
    borderColor: '#333333',
  },
  targetModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 8,
  },
  targetModalSubtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  targetModalInput: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444444',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
  },
  targetModalHint: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  targetModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  targetModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  targetModalCancelButton: {
    backgroundColor: '#444444',
  },
  targetModalSaveButton: {
    backgroundColor: '#FFD700',
  },
  targetModalCancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  targetModalSaveText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: 'bold',
  },



  // Utilities
  bottomPadding: {
    height: 32,
  },
});

// Wrap main App in ErrorBoundary
export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
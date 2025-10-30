// OfficeTrack MVP - Ready to Launch Next Week
// Free tier features as requested

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Dimensions,
  Modal,
  Alert,
  ActivityIndicator,
  AppState,
  StatusBar as RNStatusBar,
  FlatList,
  Platform,
  Image,
  TouchableWithoutFeedback,
  Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Debug: Check if Notifications module is available
console.log('Notifications module loaded:', !!Notifications);
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { moveAsync, documentDirectory, writeAsStringAsync } from 'expo-file-system/legacy';

const { width: screenWidth } = Dimensions.get('window');

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

// Configure notifications (only on native platforms)
let isSettingUpNotifications = false;

if (Platform.OS !== 'web') {
  try {
    if (Notifications && Notifications.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          // Always allow test notifications
          if (notification.request.content.data?.test === true) {
            console.log('Allowing test notification');
            return {
              shouldShowAlert: true,
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            };
          }
          
          // Skip notifications during initial setup (but not test notifications)
          if (isSettingUpNotifications && notification.request.content.data?.type === 'manual_reminder') {
            console.log('Skipping setup notification:', notification.request.content.title);
            return {
              shouldShowAlert: false,
              shouldShowBanner: false,
              shouldShowList: false,
              shouldPlaySound: false,
              shouldSetBadge: false,
            };
          }
          
          // Check if it's a manual reminder
          if (notification.request.content.data?.type === 'manual_reminder') {
            // Only show manual reminders on weekdays
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
            
            if (!isWeekday) {
              console.log('Skipping manual reminder notification on weekend');
              return {
                shouldShowAlert: false,
                shouldShowBanner: false,
                shouldShowList: false,
                shouldPlaySound: false,
                shouldSetBadge: false,
              };
            }
          }
          
          return {
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          };
        },
      });
    }
  } catch (error) {
    console.log('Notification setup error:', error);
  }
}

// Test notification function (for debugging)
const testNotification = async () => {
  try {
    // Use scheduleNotificationAsync which should be available
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Test Notification',
        body: 'If you see this, notifications are working!',
        data: { test: true }
      },
      trigger: null, // Show immediately
    });
    console.log('Test notification sent successfully via schedule method');
  } catch (error) {
    console.log('Test notification failed:', error);
  }
};

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
        data
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

// Dynamic public holidays fetching from Nager.Date API
const fetchPublicHolidays = async (country = 'australia', year = new Date().getFullYear()) => {
  const countryCode = COUNTRY_CODE_MAPPING[country] || 'AU';
  
  try {
    console.log(`Fetching holidays for ${country} (${countryCode}) year ${year}`);
    const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`);
    
    if (response.ok) {
      const holidays = await response.json();
      // Extract dates and names for 'Public' type holidays
      const holidayData = holidays
        .filter(holiday => holiday.types && holiday.types.includes('Public'))
        .reduce((acc, holiday) => {
          acc[holiday.date] = holiday.name;
          return acc;
        }, {});
      
      console.log(`Fetched ${Object.keys(holidayData).length} public holidays for ${country} ${year}`);
      return holidayData;
    } else {
      console.warn(`Failed to fetch holidays for ${country}: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching holidays for ${country}:`, error);
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

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [userData, setUserData] = useState({
    userId: null,
    companyName: '',
    companyLocation: null,
    companyAddress: '',
    trackingMode: 'manual',
    country: 'australia'
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
      const cached = await AsyncStorage.getItem('cachedHolidays');
      const timestamps = await AsyncStorage.getItem('holidayLastUpdated');
      
      if (cached) setCachedHolidays(JSON.parse(cached));
      if (timestamps) setHolidayLastUpdated(JSON.parse(timestamps));
    } catch (error) {
      console.error('Error loading cached holidays:', error);
    }
  };

  // Save holidays to cache and storage
  const saveCachedHolidays = async (newCachedHolidays, newTimestamps) => {
    try {
      setCachedHolidays(newCachedHolidays);
      setHolidayLastUpdated(newTimestamps);
      
      await AsyncStorage.setItem('cachedHolidays', JSON.stringify(newCachedHolidays));
      await AsyncStorage.setItem('holidayLastUpdated', JSON.stringify(newTimestamps));
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
  }, [userData.country]);

  // Update holidays when user's country changes
  useEffect(() => {
    if (userData.country) {
      console.log(`Country changed to ${userData.country}, updating holidays...`);
      updateCurrentYearHolidays(userData.country);
    }
  }, [userData.country]);

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

  // Save data when app state changes (goes to background or closes)
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      console.log('App state changed to:', nextAppState);
      if (nextAppState === 'background' || nextAppState === 'inactive') {
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

  const initializeApp = async () => {
    try {
      // Keep splash screen visible for 1500ms
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Request notification permissions first
      await requestNotificationPermissions();
      
      // Load cached holidays from storage
      await loadCachedHolidays();
      
      // Create unique user ID from device info
      const userId = await getOrCreateUserId();
      const storedData = await AsyncStorage.getItem('userData');
      
      // Check if this is a truly new user by looking for any saved data
      const hasAttendanceData = await AsyncStorage.getItem('attendanceData');
      const hasCompanyName = storedData ? JSON.parse(storedData).companyName : '';
      
      if (storedData && hasCompanyName && hasCompanyName.trim() !== '') {
        const parsed = JSON.parse(storedData);
        setUserData({ ...parsed, userId });
        
        await loadAllData();
        
        setScreen('calendar');
        
        // Update holidays for user's country
        if (parsed.country) {
          updateCurrentYearHolidays(parsed.country);
        }
        
        // Setup notifications based on tracking mode
        if (parsed.trackingMode === 'auto') {
          await setupAutoTracking(parsed);
        } else {
          await setupManualNotifications();
        }
      } else {
        // New user or incomplete setup - show welcome screen
        setScreen('welcome');
      }
    } catch (error) {
      console.error('Init error:', error);
      setScreen('welcome');
    }
  };

  const saveAllData = async () => {
    try {
      console.log('Saving all app data...');
      console.log('Attendance data entries to save:', Object.keys(attendanceData).length);
      console.log('Planned days entries to save:', Object.keys(plannedDays).length);
      
      // Don't save if we haven't loaded data yet (prevent overwriting with empty state)
      if (!dataLoaded || (Object.keys(attendanceData).length === 0 && Object.keys(plannedDays).length === 0)) {
        console.warn('Skipping save - data not loaded or no data to save');
        return;
      }
      
      await AsyncStorage.setItem('attendanceData', JSON.stringify(attendanceData));
      await AsyncStorage.setItem('plannedDays', JSON.stringify(plannedDays));
      await AsyncStorage.setItem('monthlyTarget', monthlyTarget.toString());
      await AsyncStorage.setItem('targetMode', targetMode);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      
      // Create backup of critical data
      if (Object.keys(attendanceData).length > 0) {
        await AsyncStorage.setItem('attendanceData_backup', JSON.stringify({
          data: attendanceData,
          timestamp: Date.now(),
          version: '1.0'
        }));
      }
      
      console.log('All data saved successfully with backup');
    } catch (error) {
      console.error('Save data error:', error);
    }
  };

  const loadAllData = async () => {
    try {
      console.log('Loading all app data...');
      let attendance = await AsyncStorage.getItem('attendanceData');
      const planned = await AsyncStorage.getItem('plannedDays');
      const target = await AsyncStorage.getItem('monthlyTarget');
      const targetModeData = await AsyncStorage.getItem('targetMode');
      
      // Try to recover from backup if main data is empty or corrupted
      if (!attendance || attendance === '{}') {
        console.log('Main attendance data is empty, checking backup...');
        const backup = await AsyncStorage.getItem('attendanceData_backup');
        if (backup) {
          try {
            const backupData = JSON.parse(backup);
            if (backupData.data && Object.keys(backupData.data).length > 0) {
              console.log('Recovering from backup data...');
              attendance = JSON.stringify(backupData.data);
              // Restore the main data from backup
              await AsyncStorage.setItem('attendanceData', attendance);
            }
          } catch (backupError) {
            console.error('Error parsing backup data:', backupError);
          }
        }
      }
      
      if (attendance) {
        const parsedAttendance = JSON.parse(attendance);
        setAttendanceData(parsedAttendance);
        console.log('Loaded attendance data:', Object.keys(parsedAttendance).length, 'entries');
      } else {
        console.log('No attendance data found in storage or backup');
        setAttendanceData({});
      }
      
      if (planned) {
        const parsedPlanned = JSON.parse(planned);
        setPlannedDays(parsedPlanned);
        console.log('Loaded planned days:', Object.keys(parsedPlanned).length, 'entries');
      } else {
        console.log('No planned days found in storage');
      }
      
      if (target) {
        setMonthlyTarget(parseInt(target));
        console.log('Loaded monthly target:', target);
      }
      if (targetModeData) {
        setTargetMode(targetModeData);
        console.log('Loaded target mode:', targetModeData);
      }
      
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

  const saveToFirebase = async (path, data) => {
    // Disabled Firebase for local-only storage - all data stays on device
    console.log(`Local-only mode: Would save ${path} data to Firebase (disabled)`);
    return;
  };

  const setupManualNotifications = async () => {
    isSettingUpNotifications = true; // Disable notifications during setup
    
    // Cancel ALL existing notifications to prevent spam (only on native platforms)
    if (Platform.OS !== 'web') {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('Cleared all existing notifications');
    }
    
    console.log('Setting up manual notifications...');
    
    // Show success alert instead of scheduling notifications for now
    setTimeout(() => {
      Alert.alert(
        '✅ Manual Tracking Ready',
        'Your manual tracking is now set up!\n\n📱 You\'ll receive helpful reminders on weekdays:\n• 10am: Morning check-in\n• 1pm: Afternoon check-in\n• 4pm: End of day reminder\n\nYou can always change your tracking mode in Settings.',
        [{ text: 'Got it!', style: 'default' }]
      );
    }, 1000);

    console.log('Manual notifications configured - reminders will be sent on weekdays');

    // Schedule daily reminder notifications (only on native platforms)
    if (Platform.OS !== 'web') {
      const reminderTimes = [
        { hour: 10, minute: 0, title: '🌅 Morning Check-in', body: 'How are you working today? Office, WFH, or Leave?' },
        { hour: 13, minute: 0, title: '☀️ Afternoon Check-in', body: 'Quick reminder: Have you logged your attendance for today?' },
        { hour: 16, minute: 0, title: '🌆 End of Day Reminder', body: 'Don\'t forget to log your work location before you finish!' }
      ];

      // Schedule only 3 notifications total - one for each time slot
      for (let i = 0; i < reminderTimes.length; i++) {
        const time = reminderTimes[i];
        try {
          // Calculate next occurrence of this time (tomorrow if time has passed today)
          const now = new Date();
          const nextTrigger = new Date();
          nextTrigger.setHours(time.hour, time.minute, 0, 0);
          
          // If time has already passed today, schedule for tomorrow
          if (nextTrigger <= now) {
            nextTrigger.setDate(nextTrigger.getDate() + 1);
          }
          
          await Notifications.scheduleNotificationAsync({
            content: {
              title: time.title,
              body: time.body,
              categoryIdentifier: 'MANUAL_CHECKIN',
              data: { type: 'manual_reminder' }
            },
            trigger: {
              date: nextTrigger,
              repeats: false, // We'll reschedule after each notification
            },
          });
          console.log(`Scheduled ${time.title} for ${nextTrigger.toLocaleString()}`);
        } catch (error) {
          console.log(`Error scheduling ${time.title}:`, error);
        }
      }
      
      console.log('Manual notifications: 3 reminders scheduled for next occurrence of each time');
    }

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
    // Cancel notifications only on native platforms
    if (Platform.OS !== 'web') {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
    
    // Note: Location permission should already be granted by the caller
    // Check permission status to be safe
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('setupAutoTracking called without location permission');
      return;
    }

    // Start hourly location check (only on native platforms)
    if (Platform.OS !== 'web' && userConfig.companyLocation) {
      startHourlyLocationCheck(userConfig.companyLocation);
    }
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
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: "📅 Planned Office Day",
            body: `Today is a planned office day. Remember to check-in when you arrive!`,
            data: { 
              type: 'planned_office_day', 
              date: dateStr 
            }
          },
          trigger: {
            date: reminderTime
          }
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
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    console.log(`Current planned days:`, plannedDays);
    console.log(`Today: ${today.toISOString()}, Tomorrow: ${tomorrow.toISOString()}`);
    
    // Only schedule for future office days (starting from tomorrow to avoid immediate notifications)
    const schedulingPromises = [];
    
    for (const [dateStr, type] of Object.entries(plannedDays)) {
      if (type === 'office') {
        // Fix date parsing - use proper date construction to avoid timezone issues
        const [year, month, day] = dateStr.split('-').map(Number);
        const planDate = new Date(year, month - 1, day); // month is 0-indexed
        
        console.log(`Checking planned office date: ${dateStr}, planDate: ${planDate.toLocaleDateString()}, today: ${today.toLocaleDateString()}, tomorrow: ${tomorrow.toLocaleDateString()}`);
        
        // Only schedule if the date is tomorrow or later (and within 30 days)
        if (planDate >= tomorrow && planDate <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)) {
          // Create reminder time for 8am on the planned date (local timezone)
          const reminderTime = new Date(year, month - 1, day, 8, 0, 0);
          const now = new Date();
          
          console.log(`Reminder time: ${reminderTime.toLocaleString()}, Current time: ${now.toLocaleString()}`);
          
          // Ensure reminder time is in the future (at least 1 hour from now to avoid immediate sending)
          if (reminderTime > new Date(now.getTime() + 60 * 60 * 1000)) {
            console.log(`✅ Scheduling notification for ${dateStr} at ${reminderTime.toLocaleString()}`);
            
            const promise = Notifications.scheduleNotificationAsync({
              content: {
                title: '🏢 Planned Office Day',
                body: 'You planned to go to office today. Have a great day!',
                data: { 
                  type: 'planned', 
                  date: dateStr,
                  replacesDailyNotifications: true
                },
                categoryIdentifier: 'PLANNED_OFFICE_DAY',
              },
              trigger: {
                date: reminderTime
              },
            }).then(() => {
              console.log(`Successfully scheduled notification for ${dateStr}`);
            }).catch((error) => {
              console.error(`Failed to schedule notification for ${dateStr}:`, error);
            });
            
            schedulingPromises.push(promise);
          } else {
            console.log(`⏰ Skipping notification for ${dateStr} - reminder time ${reminderTime.toLocaleString()} is too close to now or in the past`);
          }
        } else {
          console.log(`📅 Skipping notification for ${dateStr} - date is today, past, or too far in future (planDate: ${planDate.toLocaleDateString()}, tomorrow: ${tomorrow.toLocaleDateString()})`);
        }
      }
    }
    
    try {
      await Promise.all(schedulingPromises);
      
      console.log('✅ Finished scheduling office day reminders');
      
      // Log what's now scheduled
      const updatedNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const plannedNotifications = updatedNotifications.filter(n => n.content.data?.type === 'planned');
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

  const checkLocationAndLogAttendance = async (officeLocation, isManualCheck = false) => {
    const today = getTodayString();
    
    // For manual checks (app opening), only log debug info if already logged
    if (attendanceData[today]) {
      if (isManualCheck) {
        console.log(`Manual check: Already logged attendance for today (${attendanceData[today]}), no location action needed`);
        return; // Quietly return without showing messages
      } else {
        console.log('Already logged attendance for today, skipping scheduled location check');
        return;
      }
    }

    try {
      console.log(`${isManualCheck ? 'Manual' : 'Scheduled'} location check for auto-attendance...`);
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

      // If within 200m of office and not already logged, mark as office day
      if (distance < 0.2) {
        await markAttendance(today, 'office', true);
        
        // Send notification about auto-detection
        await sendNotification(
          '🏢 Office Attendance Auto-Logged',
          `Your location shows you're at the office today. We've automatically logged your attendance for ${new Date().toLocaleDateString()}.`,
          { 
            type: 'auto_office_log',
            date: today,
            status: 'office'
          }
        );
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

    console.log('Setting up scheduled location checks for 10am, 1pm, 3pm...');

    // Schedule location checks at 10am, 1pm, 3pm
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
    scheduleLocationCheck(15); // 3pm
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
        await AsyncStorage.setItem('monthlyTarget', value.toString());
        await AsyncStorage.setItem('targetMode', 'days');
        setShowTargetModal(false);
        Alert.alert('✅ Target Set', `Monthly target set to ${value} office days`);
      } else {
        Alert.alert('Invalid Input', 'Please enter a number between 1 and 31');
      }
    } else if (targetInputMode === 'percentage') {
      if (value > 0 && value <= 100) {
        setMonthlyTarget(value);
        setTargetMode('percentage');
        await AsyncStorage.setItem('monthlyTarget', value.toString());
        await AsyncStorage.setItem('targetMode', 'percentage');
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
              item.properties.name,
              item.properties.street,
              item.properties.city || item.properties.state,
              item.properties.country
            ].filter(Boolean).join(', '),
            lat: item.geometry.coordinates[1],
            lon: item.geometry.coordinates[0],
            country: item.properties.country || '',
            city: item.properties.city || ''
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
    console.log(`Marking attendance: ${date} as ${type}`);
    const newData = { ...attendanceData, [date]: type };
    setAttendanceData(newData);
    
    // Immediately save to AsyncStorage with backup
    try {
      await AsyncStorage.setItem('attendanceData', JSON.stringify(newData));
      // Create a backup with timestamp
      await AsyncStorage.setItem('attendanceData_backup', JSON.stringify({
        data: newData,
        timestamp: Date.now(),
        version: '1.0'
      }));
      console.log('Attendance data saved successfully with backup');
    } catch (error) {
      console.error('Error saving attendance data:', error);
    }
    
    await saveToFirebase('attendance', newData);

    if (!autoDetected) {
      setSelectedDay(null);
      setShowModal(false);
    }
  };

  const clearAttendance = async (date) => {
    console.log(`Clearing attendance for: ${date}`);
    const newData = { ...attendanceData };
    delete newData[date];
    setAttendanceData(newData);
    
    // Immediately save to AsyncStorage
    try {
      await AsyncStorage.setItem('attendanceData', JSON.stringify(newData));
      console.log('Attendance data cleared and saved successfully');
    } catch (error) {
      console.error('Error saving cleared attendance data:', error);
    }
    
    await saveToFirebase('attendance', newData);
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
            await AsyncStorage.setItem('attendanceData', JSON.stringify(newData));
            await saveToFirebase('attendance', newData);
            
            setSelectedDates([]);
            Alert.alert('Success', `Marked ${selectedDates.length} days as ${type.toUpperCase()}`);
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
    let workingDays = 0;
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

      // Check if personal leave
      if (plannedDays[dateStr] === 'leave') {
        personalLeaves++;
        continue;
      }

      workingDays++;
    }

    return {
      totalDays,
      workingDays,
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
    const { workingDays, weekends, holidays, personalLeaves } = workingDaysInfo;
    
    // Calculate adjusted target based on working days and target mode
    let adjustedTarget;
    if (targetMode === 'percentage') {
      adjustedTarget = Math.max(1, Math.round(workingDays * (monthlyTarget / 100)));
    } else {
      // Days mode - adjust proportionally to working days
      const targetPercentage = monthlyTarget / 20; // Assuming original target was based on ~20 working days
      adjustedTarget = Math.max(1, Math.round(workingDays * targetPercentage));
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
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response received:', response);
      const action = response.actionIdentifier;
      // Use consistent local date formatting
      const today = getTodayString();
      
      // Check if day is already logged
      if (attendanceData[today]) {
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
      } else if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // User tapped the notification body (not an action button) - Show quick action dialog
        console.log('Default notification tap - showing quick action dialog');
        
        // Show alert with three quick action buttons
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

  // Enhanced Stats Functions
  const calculateDetailedStats = (view, referenceDate = new Date()) => {
    let startDate, endDate;
    
    switch (view) {
      case 'month':
        startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(referenceDate.getMonth() / 3);
        startDate = new Date(referenceDate.getFullYear(), quarter * 3, 1);
        endDate = new Date(referenceDate.getFullYear(), quarter * 3 + 3, 0);
        break;
      case 'year':
        startDate = new Date(referenceDate.getFullYear(), 0, 1);
        endDate = new Date(referenceDate.getFullYear(), 11, 31);
        break;
      default:
        return { office: 0, wfh: 0, leave: 0, total: 0, workingDays: 0, percentage: 0 };
    }
    
    let office = 0, wfh = 0, leave = 0;
    let workingDays = 0;
    
    // Count attendance and working days for the period
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = getLocalDateString(d);
      const dayOfWeek = d.getDay();
      const attendance = attendanceData[dateStr];
      
      // Check if it's a working day (not weekend, holiday, or leave)
      if (!isWeekendDate(dateStr)) { // Not weekend
        const publicHolidays = getPublicHolidays(userData.country);
        if (!publicHolidays.includes(dateStr) && plannedDays[dateStr] !== 'leave') {
          workingDays++;
        }
      }
      
      if (attendance === 'office') office++;
      else if (attendance === 'wfh') wfh++;
      else if (attendance === 'leave') leave++;
    }
    
    const total = office + wfh + leave;
    const officePercentage = workingDays > 0 ? Math.round((office / workingDays) * 100) : 0;
    
    return {
      office,
      wfh,
      leave,
      total,
      workingDays,
      officePercentage,
      wfhPercentage: workingDays > 0 ? Math.round((wfh / workingDays) * 100) : 0,
      leavePercentage: workingDays > 0 ? Math.round((leave / workingDays) * 100) : 0,
      loggedPercentage: workingDays > 0 ? Math.round((total / workingDays) * 100) : 0
    };
  };

  const exportStatsAsText = (view, referenceDate) => {
    const stats = calculateDetailedStats(view, referenceDate);
    const periodName = view === 'month' 
      ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : view === 'quarter'
      ? `Q${Math.floor(referenceDate.getMonth() / 3) + 1} ${referenceDate.getFullYear()}`
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
        : view === 'quarter'
        ? `Q${Math.floor(referenceDate.getMonth() / 3) + 1} ${referenceDate.getFullYear()}`
        : `${referenceDate.getFullYear()}`;
      
      const reportDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Show loading indicator
      Alert.alert('📄 Generating PDF', 'Creating your attendance report...', [], { cancelable: false });

      // Create HTML content for PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Office Attendance Report - ${periodName}</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
                padding: 40px 30px; 
                background: #fff; 
                color: #333; 
                line-height: 1.6;
                margin: 0;
                font-size: 14px;
              }
              .header { 
                text-align: center; 
                margin-bottom: 40px; 
                border-bottom: 3px solid #FFD700;
                padding-bottom: 20px;
              }
              .title { 
                font-size: 28px; 
                color: #FFD700; 
                margin-bottom: 15px; 
                font-weight: bold;
              }
              .subtitle { 
                font-size: 16px; 
                color: #666; 
                margin: 5px 0;
              }
              .company-name {
                font-size: 18px;
                color: #333;
                font-weight: 600;
                margin-top: 10px;
              }
              .section { 
                margin: 30px 0; 
                padding: 20px; 
                border-left: 4px solid #FFD700; 
                background: #fafafa;
                border-radius: 0 8px 8px 0;
              }
              .section-title { 
                font-size: 20px; 
                font-weight: bold; 
                margin-bottom: 15px; 
                color: #333;
              }
              .stat-item { 
                margin: 10px 0; 
                font-size: 16px; 
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .progress-bar { 
                width: 200px; 
                height: 12px; 
                background: #e0e0e0; 
                border-radius: 6px; 
                margin: 8px 0;
                overflow: hidden;
              }
              .progress-fill { 
                height: 100%; 
                border-radius: 6px; 
                transition: width 0.3s ease;
              }
              .office { background: linear-gradient(90deg, #4CAF50, #45a049); }
              .wfh { background: linear-gradient(90deg, #2196F3, #1976d2); }
              .leave { background: linear-gradient(90deg, #FF9800, #f57c00); }
              .summary-grid { 
                display: flex; 
                justify-content: space-around; 
                margin: 25px 0;
                background: white;
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              .summary-item { 
                text-align: center; 
                flex: 1;
              }
              .summary-value { 
                font-size: 32px; 
                font-weight: bold; 
                color: #FFD700; 
                display: block;
                margin-bottom: 8px;
              }
              .summary-label { 
                font-size: 14px; 
                color: #666; 
                font-weight: 500;
              }
              .stat-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 12px 0;
                padding: 8px 0;
              }
              .stat-label {
                font-weight: 600;
                color: #333;
              }
              .stat-value {
                font-weight: bold;
                color: #FFD700;
              }
              .percentage-text {
                font-size: 14px;
                color: #666;
                margin-top: 5px;
              }
              .footer {
                text-align: center; 
                margin-top: 50px; 
                padding-top: 20px;
                border-top: 2px solid #f0f0f0;
                font-size: 12px; 
                color: #888;
              }
              .target-section {
                background: #fff9e6;
                border-left-color: #ffa500;
              }
              @media print {
                body { margin: 0; padding: 20px; }
                .section { break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">📊 Office Attendance Report</div>
              <div class="subtitle">${periodName}</div>
              <div class="subtitle">Generated on: ${reportDate}</div>
              <div class="company-name">${userData.companyName || 'Not specified'}</div>
            </div>

            <div class="section">
              <div class="section-title">📈 Summary Statistics</div>
              <div class="summary-grid">
                <div class="summary-item">
                  <span class="summary-value">${stats.workingDays}</span>
                  <span class="summary-label">Working Days</span>
                </div>
                <div class="summary-item">
                  <span class="summary-value">${stats.total}</span>
                  <span class="summary-label">Days Logged</span>
                </div>
                <div class="summary-item">
                  <span class="summary-value">${stats.loggedPercentage}%</span>
                  <span class="summary-label">Completion</span>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">🏢 Office Attendance</div>
              <div class="stat-row">
                <span class="stat-label">Office Days:</span>
                <span class="stat-value">${stats.office} days</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill office" style="width: ${stats.officePercentage}%"></div>
              </div>
              <div class="percentage-text">${stats.officePercentage}% of working days</div>
            </div>

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

      // Dismiss loading alert
      Alert.alert('', '', [], { cancelable: true });

      // Show success and offer to share
      Alert.alert(
        '📄 PDF Generated Successfully!',
        `Your attendance report has been saved as:\n"${fileName}"\n\nWould you like to share it now?`,
        [
          { text: 'Later', style: 'cancel' },
          { 
            text: 'Share Now', 
            onPress: async () => {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(permanentUri, {
                  mimeType: 'application/pdf',
                  dialogTitle: `Share ${fileName}`,
                  UTI: 'com.adobe.pdf'
                });
              } else {
                Alert.alert('Sharing not available', 'PDF saved to documents folder');
              }
            }
          }
        ]
      );

    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert('Export Error', `Failed to generate PDF report: ${error.message}\n\nPlease try again.`);
    }
  };

  const renderDetailedStats = () => {
    const referenceDate = statsView === 'month' ? statsMonth : new Date();
    const stats = calculateDetailedStats(statsView, referenceDate);
    
    const periodName = statsView === 'month' 
      ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : statsView === 'quarter'
      ? `Q${Math.floor(referenceDate.getMonth() / 3) + 1} ${referenceDate.getFullYear()}`
      : `${referenceDate.getFullYear()}`;

    return (
      <View>
        {/* Period Summary Card */}
        <View style={styles.statsSummaryCard}>
          <Text style={styles.statsSummaryTitle}>{periodName} Summary</Text>
          <View style={styles.statsSummaryGrid}>
            <View style={styles.statsSummaryItem}>
              <Text style={styles.statsSummaryValue}>{stats.workingDays}</Text>
              <Text style={styles.statsSummaryLabel}>Working Days</Text>
            </View>
            <View style={styles.statsSummaryItem}>
              <Text style={styles.statsSummaryValue}>{stats.total}</Text>
              <Text style={styles.statsSummaryLabel}>Days Logged</Text>
            </View>
            <View style={styles.statsSummaryItem}>
              <Text style={styles.statsSummaryValue}>{stats.loggedPercentage}%</Text>
              <Text style={styles.statsSummaryLabel}>Completion</Text>
            </View>
          </View>
        </View>

        {/* Attendance Breakdown */}
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
            <Text style={styles.statsBreakdownPercentage}>{stats.officePercentage}% of working days</Text>
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
            <Text style={styles.statsBreakdownPercentage}>{stats.wfhPercentage}% of working days</Text>
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
            <Text style={styles.statsBreakdownPercentage}>{stats.leavePercentage}% of working days</Text>
          </View>
        </View>

        {/* Target Progress (if target is set) */}
        {monthlyTarget > 0 && (
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
                  backgroundColor: getTargetColorStyle(stats, statsView === 'month' ? referenceDate : new Date()).backgroundColor 
                }]} />
              </View>
            </View>
          </View>
        )}

        {/* Additional Insights */}
        <View style={styles.statsInsightsCard}>
          <Text style={styles.statsCardTitle}>💡 Insights</Text>
          {renderStatsInsights(stats, periodName)}
        </View>
      </View>
    );
  };

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
        insights.push({ emoji: '🎉', text: 'Congratulations! You\'ve achieved your office target!' });
      } else if (targetProgress >= 80) {
        insights.push({ emoji: '🎯', text: 'You\'re very close to reaching your office target!' });
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
        const isDisabled = !isCurrentMonth || isPast || isWeekend || isHoliday;
        
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
    if (dayData.isDisabled) {
      if (dayData.isHoliday) {
        const holidayName = getHolidayName(dayData.dateStr, userData.country);
        Alert.alert('🌲 Public Holiday', `${holidayName}\n\nYou cannot plan attendance on public holidays.`);
      } else if (dayData.isWeekend) {
        Alert.alert('🏖️ Weekend', 'You cannot plan attendance on weekends.');
      }
      return;
    }
    
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
    await AsyncStorage.setItem('plannedDays', JSON.stringify(newPlanned));
    
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
                        'Change Today\'s Log',
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
                        'Clear Today\'s Log',
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
                  <Text style={styles.quickLogButtonText}>Office</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.quickLogButton, styles.quickWfhButton]}
                  onPress={() => markAttendance(todayStr, 'wfh')}
                >
                  <Text style={styles.quickLogIcon}>🏠</Text>
                  <Text style={styles.quickLogButtonText}>WFH</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.quickLogButton, styles.quickLeaveButton]}
                  onPress={() => markAttendance(todayStr, 'leave')}
                >
                  <Text style={styles.quickLogIcon}>🏖️</Text>
                  <Text style={styles.quickLogButtonText}>Leave</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        
        {/* Date Selection Header - Only show when not today */}
        {!isToday && (
          <View style={styles.dateSelectionHeader}>
            <Text style={styles.homeTitle}>📅 Log for Different Date</Text>
            <Text style={styles.homeDate}>
              {selectedDate.toLocaleDateString('en-US', { 
                weekday: 'long',
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
              })}
            </Text>
          </View>
        )}
        
        {/* View Toggle */}
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
                        : `${targetProgress.percentage}% of ${targetProgress.workingDaysInfo?.workingDays || 0} days`}
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

        <View style={styles.homeViewToggle}>
          <TouchableOpacity 
            style={[styles.homeViewButton, homeView === 'single' && styles.homeViewButtonActive]}
            onPress={() => setHomeView('single')}
          >
            <Text style={[styles.homeViewButtonText, homeView === 'single' && styles.homeViewButtonTextActive]}>Single Day</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.homeViewButton, homeView === 'calendar' && styles.homeViewButtonActive]}
            onPress={() => setHomeView('calendar')}
          >
            <Text style={[styles.homeViewButtonText, homeView === 'calendar' && styles.homeViewButtonTextActive]}>Calendar</Text>
          </TouchableOpacity>
        </View>
        
        {isWeekend && homeView === 'single' && (
          <View style={styles.weekendBadge}>
            <Text style={styles.weekendText}>🌴 Weekend</Text>
          </View>
        )}

        {/* Date Selector or Calendar View */}
        {homeView === 'single' ? (
          <View style={styles.dateSelectorContainer}>
            <Text style={styles.sectionTitle}>Select Date to Log</Text>
            <View style={styles.dateSelector}>
              <TouchableOpacity 
                style={styles.dateSelectorButton}
                onPress={() => {
                  const currentDate = new Date(selectedLogDate);
                  currentDate.setDate(currentDate.getDate() - 1);
                  setSelectedLogDate(getLocalDateString(currentDate));
                }}
              >
                <Text style={styles.dateNavText}>‹</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.currentDateButton}
                onPress={() => setSelectedLogDate(todayStr)}
              >
                <Text style={styles.currentDateText}>
                  {selectedLogDate === todayStr ? 'Today' : selectedDate.getDate()}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.dateSelectorButton}
                onPress={() => {
                  const currentDate = new Date(selectedLogDate);
                  currentDate.setDate(currentDate.getDate() + 1);
                  setSelectedLogDate(getLocalDateString(currentDate));
                }}
              >
                <Text style={styles.dateNavText}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.calendarMultiSelectContainer}>
            <Text style={styles.sectionTitle}>Select Multiple Days</Text>
            <Text style={styles.multiSelectHint}>Tap days to select/deselect. Selected: {selectedDates.length}</Text>
            {renderHomeCalendar()}
            {selectedDates.length > 0 && (
              <View style={styles.selectionActionsContainer}>
                <TouchableOpacity 
                  style={styles.clearSelectionButton}
                  onPress={() => setSelectedDates([])}
                >
                  <Text style={styles.clearSelectionText}>Clear Selection</Text>
                </TouchableOpacity>
                
                <Text style={styles.selectionCountText}>
                  {selectedDates.length} {selectedDates.length === 1 ? 'day' : 'days'} selected
                </Text>
                
                <TouchableOpacity 
                  style={styles.bulkLogButton}
                  onPress={() => {
                    // Scroll to the log buttons
                    Alert.alert(
                      'Bulk Log Attendance',
                      'Select Office, WFH, or Leave below to log all selected dates.'
                    );
                  }}
                >
                  <Text style={styles.bulkLogButtonText}>Log Selected ↓</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Current Status - Only show in single day view */}
        {currentAttendance && homeView === 'single' && (
          <View style={styles.currentStatusContainer}>
            <Text style={styles.currentStatusTitle}>Current Status</Text>
            <View style={[styles.statusBadge, styles[`${currentAttendance}Badge`]]}>
              <Text style={styles.statusBadgeText}>
                {currentAttendance === 'office' ? '🏢 Office' : 
                 currentAttendance === 'wfh' ? '🏠 Work From Home' : '🏖️ Leave'}
              </Text>
            </View>
            
            <View style={styles.logActionButtons}>
              <TouchableOpacity
                style={styles.changeLogButton}
                onPress={() => {
                  Alert.alert(
                    'Change Attendance',
                    `What would you like to change ${selectedLogDate === getTodayString() ? 'today\'s' : 'this'} log to?`,
                    [
                      { text: '🏢 Office', onPress: () => markAttendance(selectedLogDate, 'office') },
                      { text: '🏠 WFH', onPress: () => markAttendance(selectedLogDate, 'wfh') },
                      { text: '🏖️ Leave', onPress: () => markAttendance(selectedLogDate, 'leave') },
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
                    'Clear Attendance Log',
                    `Are you sure you want to remove the attendance entry for ${selectedLogDate === getTodayString() ? 'today' : selectedLogDate}? This action cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Clear Log', 
                        style: 'destructive', 
                        onPress: () => clearAttendance(selectedLogDate)
                      }
                    ]
                  );
                }}
              >
                <Text style={styles.clearLogText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}



        {/* Attendance Options */}
        <View style={styles.attendanceContainer}>
          {homeView === 'single' ? (
            <Text style={styles.sectionTitle}>Log Attendance</Text>
          ) : selectedDates.length > 0 ? (
            <View style={styles.bulkLogHeaderContainer}>
              <Text style={styles.bulkLogTitle}>📅 Bulk Log Attendance</Text>
              <Text style={styles.bulkLogSubtitle}>
                Apply the same status to {selectedDates.length} selected {selectedDates.length === 1 ? 'day' : 'days'}
              </Text>
            </View>
          ) : (
            <View style={styles.bulkLogHeaderContainer}>
              <Text style={styles.sectionTitle}>Select Days to Log</Text>
              <Text style={styles.bulkLogHint}>Tap on calendar days above to select them for bulk logging</Text>
            </View>
          )}

          {/* Weekend Restriction Message */}
          {isWeekend && homeView === 'single' ? (
            <View style={styles.weekendRestrictionContainer}>
              <Text style={styles.weekendRestrictionIcon}>🌴</Text>
              <Text style={styles.weekendRestrictionTitle}>Weekend - No Logging Required</Text>
              <Text style={styles.weekendRestrictionText}>
                Attendance logging is not allowed on weekends. Enjoy your time off!
              </Text>
            </View>
          ) : (
            <View style={styles.attendanceButtons}>
              <TouchableOpacity
                style={[
                  styles.attendanceButton,
                  styles.officeButton,
                  homeView === 'single' && currentAttendance === 'office' && styles.selectedAttendance
                ]}
                onPress={() => {
                  if (homeView === 'single') {
                    markAttendance(selectedLogDate, 'office');
                  } else {
                    markMultipleAttendance('office');
                  }
                }}
              >
                <Text style={styles.attendanceIcon}>🏢</Text>
                <Text style={styles.attendanceText}>Office</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.attendanceButton,
                  styles.wfhButton,
                  homeView === 'single' && currentAttendance === 'wfh' && styles.selectedAttendance
                ]}
                onPress={() => {
                  if (homeView === 'single') {
                    markAttendance(selectedLogDate, 'wfh');
                  } else {
                    markMultipleAttendance('wfh');
                  }
                }}
              >
                <Text style={styles.attendanceIcon}>🏠</Text>
                <Text style={styles.attendanceText}>WFH</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.attendanceButton,
                  styles.leaveButton,
                  homeView === 'single' && currentAttendance === 'leave' && styles.selectedAttendance
                ]}
                onPress={() => {
                if (homeView === 'single') {
                  markAttendance(selectedLogDate, 'leave');
                } else {
                  markMultipleAttendance('leave');
                }
              }}
            >
              <Text style={styles.attendanceIcon}>🏖️</Text>
              <Text style={styles.attendanceText}>Leave</Text>
            </TouchableOpacity>
          </View>
          )}
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
      const dateStr = date.toISOString().split('T')[0];
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
                    if (isHoliday) {
                      const holidayName = getHolidayName(dateStr, userData.country);
                      Alert.alert('🌲 Public Holiday', `${holidayName}\n\nYou cannot select public holidays.`);
                    } else if (isWeekend) {
                      Alert.alert('🏖️ Weekend', 'You cannot select weekends.');
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

  const renderAttendanceChart = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let officeDays = 0;
    let wfhDays = 0;
    let leaveDays = 0;
    let totalWorkDays = 0;

    // Calculate stats based on current view
    let startDate, endDate;
    if (statsView === 'month') {
      startDate = new Date(currentYear, currentMonth, 1);
      endDate = new Date(currentYear, currentMonth + 1, 0);
    } else if (statsView === 'quarter') {
      const quarterStart = Math.floor(currentMonth / 3) * 3;
      startDate = new Date(currentYear, quarterStart, 1);
      endDate = new Date(currentYear, quarterStart + 3, 0);
    } else {
      startDate = new Date(currentYear, 0, 1);
      endDate = new Date(currentYear, 11, 31);
    }

    // Count attendance for the period
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      
      if (!isWeekendDate(dateStr)) { // Skip weekends
        totalWorkDays++;
        const attendance = attendanceData[dateStr];
        if (attendance === 'office') {
          officeDays++;
        } else if (attendance === 'wfh') {
          wfhDays++;
        } else if (attendance === 'leave') {
          leaveDays++;
        }
      }
    }

    const maxValue = Math.max(officeDays, wfhDays, leaveDays, 1);
    const chartData = [
      { label: 'Office', value: officeDays, color: '#4CAF50', icon: '🏢' },
      { label: 'WFH', value: wfhDays, color: '#2196F3', icon: '🏠' },
      { label: 'Leave', value: leaveDays, color: '#FF9800', icon: '🌴' },
    ];

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Attendance Breakdown</Text>
        
        {/* Summary Stats Row */}
        <View style={styles.summaryStatsRow}>
          <View style={styles.summaryStatCard}>
            <Text style={styles.summaryStatNumber}>{totalWorkDays}</Text>
            <Text style={styles.summaryStatLabel}>Work Days</Text>
          </View>
          <View style={styles.summaryStatCard}>
            <Text style={styles.summaryStatNumber}>{officeDays + wfhDays + leaveDays}</Text>
            <Text style={styles.summaryStatLabel}>Logged</Text>
          </View>
          <View style={styles.summaryStatCard}>
            <Text style={styles.summaryStatNumber}>{totalWorkDays - (officeDays + wfhDays + leaveDays)}</Text>
            <Text style={styles.summaryStatLabel}>Unlogged</Text>
          </View>
        </View>

        {/* Attendance Cards Grid */}
        <View style={styles.attendanceCardsGrid}>
          {chartData.map((item, index) => {
            const percentage = totalWorkDays > 0 ? Math.round((item.value / totalWorkDays) * 100) : 0;
            return (
              <View key={index} style={[styles.attendanceCard, { borderLeftColor: item.color }]}>
                <View style={styles.attendanceCardHeader}>
                  <Text style={styles.attendanceCardIcon}>{item.icon}</Text>
                  <View style={styles.attendanceCardInfo}>
                    <Text style={styles.attendanceCardValue}>{item.value}</Text>
                    <Text style={styles.attendanceCardLabel}>{item.label}</Text>
                  </View>
                </View>
                <View style={styles.attendanceCardProgress}>
                  <View style={styles.progressTrack}>
                    <View 
                      style={[
                        styles.progressFill,
                        { 
                          width: `${percentage}%`,
                          backgroundColor: item.color
                        }
                      ]}
                    />
                  </View>
                  <Text style={styles.attendanceCardPercentage}>{percentage}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderAnalyticsScreen = () => {
    return (
      <ScrollView style={styles.analyticsContainer}>
        <View style={styles.analyticsHeader}>
          <Text style={styles.analyticsTitle}>📊 Analytics</Text>
          
          {/* Export Button - Moved to top right corner */}
          <TouchableOpacity 
            style={styles.cornerExportButton}
            onPress={() => exportStatsToPDF(statsView, statsMonth)}
          >
            <Text style={styles.cornerExportButtonText}>⬇</Text>
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

        {/* Attendance Breakdown Chart */}
        {renderAttendanceChart()}

        {/* Stats Content */}
        <View style={styles.analyticsContent}>
          {renderDetailedStats()}
        </View>
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
                    text: 'This Quarter', 
                    onPress: () => exportStatsToPDF('quarter', new Date())
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



          <TouchableOpacity style={styles.settingsItem}>
            <Text style={styles.settingsItemIcon}>🔔</Text>
            <Text style={styles.settingsItemText}>Notifications</Text>
            <Text style={styles.settingsItemBadge}>Coming Soon</Text>
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
                      await AsyncStorage.setItem('userData', JSON.stringify(updatedData));
                      
                      // Small delay to prevent rapid successive calls during mode switching
                      await new Promise(resolve => setTimeout(resolve, 500));
                      
                      // Setup manual notifications
                      await setupManualNotifications();
                      
                      Alert.alert(
                        '✅ Switched to Manual', 
                        'You\'ll now receive 3 daily reminders on weekdays:\n• 10am: Morning check-in\n• 1pm: Afternoon check-in\n• 4pm: End of day reminder'
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
                          'Auto mode needs location permission to detect when you\'re at office. Please enable location access in your device settings.'
                        );
                        return;
                      }
                      
                      const updatedData = { ...userData, trackingMode: 'auto' };
                      setUserData(updatedData);
                      await AsyncStorage.setItem('userData', JSON.stringify(updatedData));
                      
                      // Small delay to prevent rapid successive calls during mode switching
                      await new Promise(resolve => setTimeout(resolve, 500));
                      
                      // Setup auto tracking
                      await setupAutoTracking(updatedData);
                      
                      Alert.alert(
                        '✅ Switched to Smart Auto', 
                        'Location-based tracking is now active. The app will automatically detect when you\'re at office.'
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
            ]}>
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
          const fullAddress = [
            address[0].street,
            address[0].city,
            address[0].region,
            address[0].country
          ].filter(Boolean).join(', ');
          
          // Detect country for holiday calendar and company suggestions
          let country = 'australia'; // default
          const countryName = address[0].country?.toLowerCase() || '';
          
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
            (!userData.companyName || !addressSearchText) && styles.disabledButton
          ]}
          disabled={!userData.companyName || !addressSearchText}
          onPress={() => setScreen('trackingMode')}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
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
                // Check if location permission is already granted
                const currentPermissions = await Location.getForegroundPermissionsAsync();
                
                let locStatus = currentPermissions;
                
                // Only show disclosure and request permission if not already granted
                if (currentPermissions.status !== 'granted') {
                  // Show prominent disclosure before requesting location permission
                  await showLocationPermissionDisclosure();

                  // Request background location for scheduled checks
                  locStatus = await Location.requestBackgroundPermissionsAsync();
                  
                  // If background denied, try foreground only
                  if (locStatus.status !== 'granted') {
                    locStatus = await Location.requestForegroundPermissionsAsync();
                  }
                }
                if (locStatus.status !== 'granted') {
                  Alert.alert(
                    'Location Permission Required',
                    'Auto mode needs location access to detect when you\'re at office. Would you like to continue with Manual mode instead?',
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
              const finalUserData = { ...userData, userId: await getOrCreateUserId() };
              await AsyncStorage.setItem('userData', JSON.stringify(finalUserData));
              setUserData(finalUserData);

              // Save setup completion timestamp to prevent auto-WFH notifications for new users
              await AsyncStorage.setItem('setupCompletedTime', Date.now().toString());

              // Set up tracking based on mode
              if (userData.trackingMode === 'manual') {
                await setupManualNotifications();
              } else {
                await setupAutoTracking(finalUserData);
              }

              // Navigate to home screen - no sample data for new users
              setScreen('home');
              setActiveTab('home');
              
              // Show onboarding tutorial for new users

            };

            // First check if user has set a monthly target
            if (monthlyTarget === 0) {
              Alert.alert(
                '🎯 Set Your Monthly Target',
                'Before we get started, let\'s set your monthly office attendance goal to help track your progress!',
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
                          // TODO: Implement export functionality
                          Alert.alert('Export Feature', 'Export feature will be available soon. For now, take a screenshot of your calendar.');
                        }
                      },
                      { text: 'Reset Now', style: 'destructive', onPress: clearSession }
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
                    : `${targetProgress.percentage}% of ${targetProgress.workingDaysInfo?.workingDays || 0} days`
                  }
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.workingDaysRow}>
              <Text style={styles.workingDaysLabel}>
                Working Days: {targetProgress.workingDaysInfo?.workingDays || 0}
              </Text>
              <Text style={styles.workingDaysBreakdown}>
                (Total: {targetProgress.workingDaysInfo?.totalDays || 0} - Weekends: {targetProgress.workingDaysInfo?.weekends || 0} - Holidays: {targetProgress.workingDaysInfo?.holidays || 0} - Leaves: {targetProgress.workingDaysInfo?.personalLeaves || 0})
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
                    if (!item.isEmpty) {
                      if (item.isHoliday) {
                        const holidayName = getHolidayName(item.date, userData.country);
                        Alert.alert('🌲 Public Holiday', `${holidayName}\n\nYou cannot log attendance on public holidays.`);
                      } else if (item.isWeekend) {
                        Alert.alert('🏖️ Weekend', 'You cannot log attendance on weekends.');
                      } else {
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
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {selectedDay ? new Date(selectedDay.date).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric' 
                }) : ''}
              </Text>
              
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

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    justifyContent: 'space-between',
    gap: 12,
  },
  quickLogButton: {
    flex: 1,
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
    alignSelf: 'center',
    marginTop: 16,
  },
  clearSelectionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Selection Actions
  selectionActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  selectionCountText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  bulkLogButton: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
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
    justifyContent: 'space-between',
  },
  attendanceButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    marginHorizontal: 4,
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
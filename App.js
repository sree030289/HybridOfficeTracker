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
  Modal,
  Alert,
  ActivityIndicator,
  StatusBar as RNStatusBar,
  FlatList,
  Dimensions,
  Platform,
  Image,
  TouchableWithoutFeedback,
  Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { moveAsync, documentDirectory, writeAsStringAsync } from 'expo-file-system/legacy';

const { width: screenWidth } = Dimensions.get('window');

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Firebase configuration
const FIREBASE_URL = 'https://officetracker-mvp-default-rtdb.firebaseio.com/';

// Popular companies for dropdown suggestions
const POPULAR_COMPANIES = [
  'Accenture', 'Amazon', 'Apple', 'Atlassian', 'Commonwealth Bank',
  'Deloitte', 'Google', 'IBM', 'Microsoft', 'NAB', 'PwC', 'Telstra',
  'Westpac', 'Xero', 'ANZ Bank'
];



// Public holidays by country (2024-2025)
const PUBLIC_HOLIDAYS = {
  australia: [
    '2024-01-01', '2024-01-26', '2024-03-29', '2024-04-01', '2024-04-25', 
    '2024-06-10', '2024-12-25', '2024-12-26',
    '2025-01-01', '2025-01-27', '2025-04-18', '2025-04-21', '2025-04-25',
    '2025-06-09', '2025-12-25', '2025-12-26'
  ],
  india: [
    '2024-01-26', '2024-08-15', '2024-10-02', '2024-10-24', '2024-11-12',
    '2025-01-26', '2025-08-15', '2025-10-02', '2025-10-23', '2025-11-01'
  ],
  usa: [
    '2024-01-01', '2024-07-04', '2024-11-28', '2024-12-25',
    '2025-01-01', '2025-07-04', '2025-11-27', '2025-12-25'
  ]
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
  const [selectedLogDate, setSelectedLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerMonth, setPlannerMonth] = useState(new Date());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionMode, setSelectionMode] = useState('office'); // 'office' or 'clear'
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetInputMode, setTargetInputMode] = useState(''); // 'days' or 'percentage'
  const [targetInputValue, setTargetInputValue] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [locationCheckInterval, setLocationCheckInterval] = useState(null);
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


  useEffect(() => {
    initializeApp();
    
    return () => {
      if (locationCheckInterval) {
        clearInterval(locationCheckInterval);
      }
    };
  }, []);

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

  // Auto-mark unlogged days as WFH after 6am next day
  useEffect(() => {
    const checkUnloggedDays = () => {
      const now = new Date();
      const currentHour = now.getHours();
      
      // Only run this check after 6am
      if (currentHour >= 6) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        // Check if yesterday was a weekday (not weekend)
        const dayOfWeek = yesterday.getDay();
        const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;
        
        // If yesterday was a weekday and not logged, mark as WFH
        if (isWeekday && !attendanceData[yesterdayStr]) {
          markAttendance(yesterdayStr, 'wfh', true);
          console.log(`Auto-marked ${yesterdayStr} as WFH (unlogged weekday)`);
        }
      }
    };
    
    // Check immediately on app start
    checkUnloggedDays();
    
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
  }, [attendanceData]);

  const clearSession = async () => {
    try {
      // Clear ALL stored data including all possible keys
      const allKeys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(allKeys);
      
      // Cancel all notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
      
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
      setSelectedLogDate(new Date().toISOString().split('T')[0]);
      setShowModal(false);
      setShowStats(false);
      setShowPlanner(false);
      setCurrentMonth(new Date());
      setCurrentWeek(new Date());
      setPlannerMonth(new Date());
      setStatsMonth(new Date());
      setActiveTab('home');
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
      // Request notification permissions first
      await requestNotificationPermissions();
      
      // Create unique user ID from device info
      const userId = await getOrCreateUserId();
      const storedData = await AsyncStorage.getItem('userData');
      
      if (storedData) {
        const parsed = JSON.parse(storedData);
        setUserData({ ...parsed, userId });
        
        await loadAllData();
        setScreen('calendar');
        
        // Setup notifications based on tracking mode
        if (parsed.trackingMode === 'auto') {
          await setupAutoTracking(parsed);
        } else {
          await setupManualNotifications();
        }
      } else {
        setScreen('welcome');
      }
    } catch (error) {
      console.error('Init error:', error);
      setScreen('welcome');
    }
  };

  const loadAllData = async () => {
    try {
      const attendance = await AsyncStorage.getItem('attendanceData');
      const planned = await AsyncStorage.getItem('plannedDays');
      const target = await AsyncStorage.getItem('monthlyTarget');
      const targetMode = await AsyncStorage.getItem('targetMode');
      
      if (attendance) setAttendanceData(JSON.parse(attendance));
      if (planned) setPlannedDays(JSON.parse(planned));
      if (target) setMonthlyTarget(parseInt(target));
      if (targetMode) setTargetMode(targetMode);
    } catch (error) {
      console.error('Load data error:', error);
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
    // Cancel ALL existing notifications to prevent spam
    await Notifications.cancelAllScheduledNotificationsAsync();
    
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
  };

  const setupAutoTracking = async (userConfig) => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Request location permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location Required', 'Auto tracking needs location permission to work');
      return;
    }

    // Schedule 7am reminder for planned office days
    await scheduleOfficeDayReminders();
    
    // Start hourly location check
    if (userConfig.companyLocation) {
      startHourlyLocationCheck(userConfig.companyLocation);
    }
  };

  const scheduleOfficeDayReminders = async () => {
    // Cancel existing office day reminders to prevent duplicates
    const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const officeReminders = existingNotifications.filter(n => 
      n.content.data?.type === 'auto' || n.content.data?.type === 'planned'
    );
    
    for (const reminder of officeReminders) {
      await Notifications.cancelScheduledNotificationAsync(reminder.identifier);
    }
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    // Only schedule for future office days (starting from tomorrow to avoid immediate notifications)
    Object.keys(plannedDays).forEach(async (dateStr) => {
      if (plannedDays[dateStr] === 'office') {
        const planDate = new Date(dateStr + 'T00:00:00');
        
        // Only schedule if the date is tomorrow or later (and within 30 days)
        if (planDate >= tomorrow && planDate <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)) {
          const reminderTime = new Date(planDate.getFullYear(), planDate.getMonth(), planDate.getDate(), 8, 0, 0);
          
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '� Planned Office Day',
              body: 'You planned to go to office today. Have a great day!',
              data: { 
                type: 'planned', 
                date: dateStr,
                replacesDailyNotifications: true // Flag to indicate this replaces daily notifications
              },
              categoryIdentifier: 'PLANNED_OFFICE_DAY',
            },
            trigger: {
              date: reminderTime
            },
          });
        }
      }
    });
  };

  const startHourlyLocationCheck = (officeLocation) => {
    const checkLocation = async () => {
      const today = new Date().toISOString().split('T')[0];
      
      // Don't check if already marked for today
      if (attendanceData[today]) return;

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const distance = calculateDistance(
          location.coords.latitude,
          location.coords.longitude,
          officeLocation.latitude,
          officeLocation.longitude
        );

        // If within 200m of office, mark as office day
        if (distance < 0.2) {
          await markAttendance(today, 'office', true);
          
          // Send notification about auto-detection
          await Notifications.presentNotificationAsync({
            title: '✅ Auto-detected!',
            body: 'You\'re at office! Day marked automatically.',
          });
        }
      } catch (error) {
        console.log('Location check error:', error);
      }
    };

    // Check immediately and then every hour
    checkLocation();
    const interval = setInterval(checkLocation, 60 * 60 * 1000); // Every hour
    setLocationCheckInterval(interval);
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
      // Using OpenCorporates API (free tier available) - Global search
      const response = await fetch(
        `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query)}&per_page=15&format=json`
      );
      
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
    // Fallback to popular companies if API fails
    return POPULAR_COMPANIES.filter(company =>
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
    const newData = { ...attendanceData, [date]: type };
    setAttendanceData(newData);
    
    await AsyncStorage.setItem('attendanceData', JSON.stringify(newData));
    await saveToFirebase('attendance', newData);

    if (!autoDetected) {
      setSelectedDay(null);
      setShowModal(false);
    }
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
    const today = new Date().toISOString().split('T')[0];

    const days = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, isEmpty: true });
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();
      
      days.push({
        day,
        date: dateStr,
        isToday: dateStr === today,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isHoliday: PUBLIC_HOLIDAYS[userData.country]?.includes(dateStr),
        type: attendanceData[dateStr],
        planned: plannedDays[dateStr]
      });
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
      const publicHolidays = PUBLIC_HOLIDAYS[userData.country] || [];
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
      const dayOfWeek = date.getDay();
      
      // Skip weekends and holidays for working days count
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const publicHolidays = PUBLIC_HOLIDAYS[userData.country] || [];
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
    // Handle notification responses (when user taps action buttons)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response received:', response);
      const action = response.actionIdentifier;
      const today = new Date().toISOString().split('T')[0];
      
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
        Alert.alert('✅ Marked as Office', `Attendance recorded for ${today}`);
      } else if (action === 'wfh') {
        console.log('Marking attendance as WFH for:', today);
        markAttendance(today, 'wfh');
        Alert.alert('✅ Marked as WFH', `Attendance recorded for ${today}`);
      } else if (action === 'confirm_office') {
        console.log('Confirming planned office day for:', today);
        markAttendance(today, 'office');
        Alert.alert('🏢 Office Confirmed', `Great! Enjoy your office day on ${today}`);
      } else if (action === 'change_wfh') {
        console.log('Changed planned office day to WFH for:', today);
        markAttendance(today, 'wfh');
        Alert.alert('🏠 Changed to WFH', `No worries! Marked as WFH for ${today}`);
      } else if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // User tapped the notification body (not an action button)
        console.log('Default notification tap - opening app');
        // Navigate to home screen or calendar view
        setScreen('calendar');
      } else {
        console.log('Unknown action identifier:', action);
      }
    });

    // Handle notifications when app is in foreground - check if already logged
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received while app is open:', notification);
      const today = new Date().toISOString().split('T')[0];
      
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
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      const attendance = attendanceData[dateStr];
      
      // Check if it's a working day (not weekend, holiday, or leave)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
        const publicHolidays = PUBLIC_HOLIDAYS[userData.country] || [];
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
      const fileName = `OfficeTracker_Report_${periodName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      
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
    const todayStr = today.toISOString().split('T')[0];
    
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
        const dateStr = currentDate.toISOString().split('T')[0];
        const isCurrentMonth = currentDate.getMonth() === month;
        const isPast = currentDate < today && dateStr !== todayStr;
        const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
        const isHoliday = PUBLIC_HOLIDAYS[userData.country || 'australia']?.includes(dateStr);
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
            disabled={dayData.isDisabled}
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
            {dayData.isHoliday && <Text style={styles.holidayIndicator}>🎉</Text>}
            {dayData.isPlanned && <Text style={styles.plannedIndicator}>🏢</Text>}
          </TouchableOpacity>
        ))}
      </View>
    ));
  };

  const handlePlannerDayPress = async (dayData) => {
    if (dayData.isDisabled) return;
    
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
    
    // Reschedule notifications if in auto mode
    if (userData.trackingMode === 'auto') {
      await scheduleOfficeDayReminders();
    }
  };

  // HOME SCREEN
  const renderHomeScreen = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const selectedDate = new Date(selectedLogDate);
    const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = selectedDate.getDay() === 0 || selectedDate.getDay() === 6;
    const currentAttendance = attendanceData[selectedLogDate];
    
    return (
      <ScrollView style={styles.homeContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.homeTitle}>📅 {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {dayName}</Text>
        <Text style={styles.homeDate}>
          {selectedDate.toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric' 
          })}
        </Text>
        
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
                  const newDate = new Date(selectedDate);
                  newDate.setDate(newDate.getDate() - 1);
                  setSelectedLogDate(newDate.toISOString().split('T')[0]);
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
                  const newDate = new Date(selectedDate);
                  newDate.setDate(newDate.getDate() + 1);
                  setSelectedLogDate(newDate.toISOString().split('T')[0]);
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
              <TouchableOpacity 
                style={styles.clearSelectionButton}
                onPress={() => setSelectedDates([])}
              >
                <Text style={styles.clearSelectionText}>Clear Selection</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Current Status */}
        {currentAttendance && (
          <View style={styles.currentStatusContainer}>
            <Text style={styles.currentStatusTitle}>Current Status</Text>
            <View style={[styles.statusBadge, styles[`${currentAttendance}Badge`]]}>
              <Text style={styles.statusBadgeText}>
                {currentAttendance === 'office' ? '🏢 Office' : 
                 currentAttendance === 'wfh' ? '🏠 Work From Home' : '🏖️ Leave'}
              </Text>
            </View>
          </View>
        )}



        {/* Attendance Options */}
        <View style={styles.attendanceContainer}>
          <Text style={styles.sectionTitle}>
            {homeView === 'single' ? 'Log Attendance' : `Log Attendance (${selectedDates.length} days selected)`}
          </Text>

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
            const dateStr = date.toISOString().split('T')[0];
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = date.getDate();
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isToday = dateStr === today.toISOString().split('T')[0];
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
      } else if (date.getDay() === 0 || date.getDay() === 6) {
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
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
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
    
    // Group days into weeks
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    
    return (
      <View style={styles.homeCalendar}>
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarMonthTitle}>
            {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
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
              const dateStr = date.toISOString().split('T')[0];
              const isToday = dateStr === today.toISOString().split('T')[0];
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
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
                    attendance === 'office' && styles.calendarDayOffice,
                    attendance === 'wfh' && styles.calendarDayWFH,
                    attendance === 'leave' && styles.calendarDayLeave,
                  ]}
                  onPress={() => {
                    if (isSelected) {
                      setSelectedDates(selectedDates.filter(d => d !== dateStr));
                    } else {
                      setSelectedDates([...selectedDates, dateStr]);
                    }
                  }}
                >
                  <Text style={[
                    styles.calendarDayText,
                    isToday && styles.calendarDayTextToday,
                    isSelected && styles.calendarDayTextSelected,
                    isWeekend && styles.calendarDayTextWeekend,
                  ]}>
                    {day}
                  </Text>
                  {attendance && (
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
      
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
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
      <View style={styles.settingsContainer}>
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
                      await AsyncStorage.setItem('@user_data', JSON.stringify(updatedData));
                      Alert.alert('✅ Updated', 'Tracking mode changed to Manual Entry');
                    }
                  },
                  { 
                    text: '🤖 Smart Auto', 
                    onPress: async () => {
                      const updatedData = { ...userData, trackingMode: 'auto' };
                      setUserData(updatedData);
                      await AsyncStorage.setItem('@user_data', JSON.stringify(updatedData));
                      Alert.alert('✅ Updated', 'Tracking mode changed to Smart Auto');
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
      </View>
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
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingEmoji}>📅</Text>
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 20 }} />
        <Text style={styles.loadingText}>Setting up OfficeTrack...</Text>
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
      setUserData({
        ...userData,
        companyLocation: { latitude: address.lat, longitude: address.lon },
        companyAddress: address.address,
        country: address.country?.toLowerCase().includes('india') ? 'india' : 
                address.country?.toLowerCase().includes('united states') ? 'usa' : 'australia'
      });
      setShowAddressDropdown(false);
      setAddressSuggestions([]);
    };

    const handleUseCurrentLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
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
          
          // Detect country for holiday calendar
          let country = 'australia';
          if (address[0].country?.toLowerCase().includes('india')) country = 'india';
          if (address[0].country?.toLowerCase().includes('united states')) country = 'usa';
          
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
                const locStatus = await Location.requestForegroundPermissionsAsync();
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

              // Request notification permission
              const notifStatus = await Notifications.requestPermissionsAsync();
              if (notifStatus.status !== 'granted') {
                Alert.alert(
                  'Notification Permission',
                  'We need notification permission to send you reminders. You can enable this in your phone settings later.'
                );
              }

              // Save user data and initialize
              const finalUserData = { ...userData, userId: await getOrCreateUserId() };
              await AsyncStorage.setItem('userData', JSON.stringify(finalUserData));
              setUserData(finalUserData);

              // Set up tracking based on mode
              if (userData.trackingMode === 'manual') {
                await setupManualNotifications();
              } else {
                await setupAutoTracking(finalUserData);
              }

              // Initialize with some sample data for demo
              const sampleAttendance = {
                '2024-10-21': 'office',
                '2024-10-22': 'wfh',
                '2024-10-23': 'office',
              };
              setAttendanceData(sampleAttendance);
              await AsyncStorage.setItem('attendanceData', JSON.stringify(sampleAttendance));

              setScreen('calendar');
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
                <Text style={styles.resetButton}>🔄 Reset</Text>
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
                      setSelectedDay(item);
                      setShowModal(true);
                    }
                  }}
                >
                  {!item.isEmpty && (
                    <Text style={[styles.dayText, { color: getTextColor(item) }]}>
                      {item.day}
                    </Text>
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

  return null;
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
    zIndex: 1000,
    elevation: 10,
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
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
  resetButton: {
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
    color: '#666666',
    marginBottom: 4,
  },
  bottomNavIconActive: {
    color: '#FFD700',
  },
  bottomNavLabel: {
    fontSize: 11,
    color: '#666666',
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
    marginBottom: 16,
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
  progressFill: {
    height: '100%',
    borderRadius: 3,
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
  resetSection: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  resetButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
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
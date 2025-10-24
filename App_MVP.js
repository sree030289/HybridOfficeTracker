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
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

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
    name: '',
    mobile: '',
    companyName: '',
    companyLocation: null,
    companyAddress: '',
    trackingMode: 'manual',
    country: 'australia'
  });
  
  const [attendanceData, setAttendanceData] = useState({});
  const [plannedDays, setPlannedDays] = useState({});
  const [monthlyTarget, setMonthlyTarget] = useState(15);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [locationCheckInterval, setLocationCheckInterval] = useState(null);
  const [companySearchText, setCompanySearchText] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  useEffect(() => {
    initializeApp();
    
    return () => {
      if (locationCheckInterval) {
        clearInterval(locationCheckInterval);
      }
    };
  }, []);

  const initializeApp = async () => {
    try {
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
      
      if (attendance) setAttendanceData(JSON.parse(attendance));
      if (planned) setPlannedDays(JSON.parse(planned));
      if (target) setMonthlyTarget(parseInt(target));
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
    try {
      if (!userData.userId) return;
      const url = `${FIREBASE_URL}/users/${userData.userId}/${path}.json`;
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          timestamp: Date.now(),
          deviceInfo: Device.modelName
        })
      });
    } catch (error) {
      console.log('Firebase save error:', error);
    }
  };

  const setupManualNotifications = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // 3 daily notifications: 10am, 1pm, 4pm
    const notificationTimes = [
      { hour: 10, minute: 0, title: '🌅 Morning Check-in', body: 'Are you in office today?' },
      { hour: 13, minute: 0, title: '🕐 Afternoon Check-in', body: 'Quick check - office or WFH today?' },
      { hour: 16, minute: 0, title: '🌅 End of Day', body: 'Don\'t forget to log your attendance!' }
    ];

    for (let i = 0; i < notificationTimes.length; i++) {
      const { hour, minute, title, body } = notificationTimes[i];
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { type: 'manual', timeSlot: i },
          categoryIdentifier: 'MANUAL_CHECKIN',
        },
        trigger: {
          hour,
          minute,
          repeats: true,
        },
      });
    }

    // Set up notification categories with actions
    await Notifications.setNotificationCategoryAsync('MANUAL_CHECKIN', [
      { identifier: 'office', buttonTitle: '🏢 Office', options: { opensAppToForeground: false } },
      { identifier: 'wfh', buttonTitle: '🏠 WFH', options: { opensAppToForeground: false } }
    ]);
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
    // Check next 7 days for planned office days
    for (let i = 1; i <= 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      if (plannedDays[dateStr] === 'office') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🌅 Office Day Reminder',
            body: 'You planned to go to office today. Ready?',
            data: { type: 'auto', date: dateStr },
          },
          trigger: {
            hour: 7,
            minute: 0,
            repeats: false,
            date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 0)
          },
        });
      }
    }
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

  const calculateTargetProgress = () => {
    const stats = calculateStats('month');
    const progress = stats.office;
    const remaining = Math.max(0, monthlyTarget - progress);
    
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, daysInMonth - now.getDate());
    
    const percentage = monthlyTarget > 0 ? Math.min(100, Math.round((progress / monthlyTarget) * 100)) : 0;
    
    let suggestion = '';
    if (remaining > 0) {
      const daysPerWeek = Math.ceil(remaining / Math.max(1, daysRemaining / 7));
      suggestion = `Need ${daysPerWeek} days/week to reach target`;
    } else if (remaining === 0) {
      suggestion = 'Target achieved! 🎉';
    } else {
      suggestion = 'Target exceeded! 🚀';
    }

    return { progress, remaining, suggestion, percentage };
  };

  // Handle notification responses
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const action = response.actionIdentifier;
      const today = new Date().toISOString().split('T')[0];
      
      if (action === 'office') {
        markAttendance(today, 'office');
      } else if (action === 'wfh') {
        markAttendance(today, 'wfh');
      }
    });

    return () => subscription.remove();
  }, [attendanceData, userData]);

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
      <ScrollView style={styles.container} contentContainerStyle={styles.welcomeContainer}>
        <RNStatusBar barStyle="light-content" backgroundColor="#4F46E5" />
        
        <View style={styles.welcomeHeader}>
          <Text style={styles.welcomeEmoji}>📅</Text>
          <Text style={styles.welcomeTitle}>OfficeTrack</Text>
          <Text style={styles.welcomeSubtitle}>
            Your simple hybrid work attendance tracker
          </Text>
        </View>

        <View style={styles.welcomeFeatures}>
          <Text style={styles.featuresTitle}>What you get:</Text>
          <FeatureItem emoji="✅" text="Track office days effortlessly" />
          <FeatureItem emoji="📊" text="Monthly attendance insights" />
          <FeatureItem emoji="🎯" text="Set and achieve office day targets" />
          <FeatureItem emoji="📱" text="Smart notifications and reminders" />
          <FeatureItem emoji="🆓" text="Completely free to use" />
        </View>

        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={() => setScreen('companySetup')}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (screen === 'companySetup') {
    const filteredCompanies = POPULAR_COMPANIES.filter(company =>
      company.toLowerCase().includes(companySearchText.toLowerCase())
    );

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.setupContainer}>
        <RNStatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        
        <Text style={styles.setupTitle}>Company Details</Text>
        <Text style={styles.setupSubtitle}>Help us set up your workspace</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Company Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Type your company name..."
            value={companySearchText}
            onChangeText={(text) => {
              setCompanySearchText(text);
              setUserData({ ...userData, companyName: text });
              setShowCompanyDropdown(text.length > 0);
            }}
            onFocus={() => setShowCompanyDropdown(companySearchText.length > 0)}
          />
          
          {showCompanyDropdown && filteredCompanies.length > 0 && (
            <View style={styles.dropdown}>
              {filteredCompanies.slice(0, 5).map((company, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setCompanySearchText(company);
                    setUserData({ ...userData, companyName: company });
                    setShowCompanyDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownText}>{company}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Office Location</Text>
          <TouchableOpacity
            style={styles.locationButton}
            onPress={async () => {
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
            }}
          >
            <Text style={styles.locationButtonText}>
              {userData.companyAddress ? '📍 Update Location' : '📍 Set Current Location'}
            </Text>
          </TouchableOpacity>
          
          {userData.companyAddress && (
            <Text style={styles.addressPreview}>{userData.companyAddress}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton, 
            !userData.companyName && styles.disabledButton
          ]}
          disabled={!userData.companyName}
          onPress={() => setScreen('userInfo')}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (screen === 'userInfo') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.setupContainer}>
        <RNStatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        
        <Text style={styles.setupTitle}>Your Information</Text>
        <Text style={styles.setupSubtitle}>Just a few more details</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            value={userData.name}
            onChangeText={(text) => setUserData({ ...userData, name: text })}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Mobile Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+61 XXX XXX XXX"
            keyboardType="phone-pad"
            value={userData.mobile}
            onChangeText={(text) => setUserData({ ...userData, mobile: text })}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton, 
            (!userData.name || !userData.mobile) && styles.disabledButton
          ]}
          disabled={!userData.name || !userData.mobile}
          onPress={() => setScreen('trackingMode')}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setScreen('companySetup')}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (screen === 'trackingMode') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.setupContainer}>
        <RNStatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        
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
            // Request permissions based on selected mode
            if (userData.trackingMode === 'auto') {
              const locStatus = await Location.requestForegroundPermissionsAsync();
              if (locStatus.status !== 'granted') {
                Alert.alert(
                  'Location Permission Required',
                  'Auto mode needs location access to detect when you\'re at office. You can change this later in settings.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Enable', onPress: () => Location.requestForegroundPermissionsAsync() }
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
          }}
        >
          <Text style={styles.primaryButtonText}>
            Start {userData.trackingMode === 'auto' ? 'Auto' : 'Manual'} Tracking
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setScreen('userInfo')}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (screen === 'calendar') {
    const calendarDays = generateCalendarDays();
    const stats = calculateStats('month');
    const targetProgress = calculateTargetProgress();
    const monthName = currentMonth.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });

    return (
      <View style={styles.container}>
        <RNStatusBar barStyle="light-content" backgroundColor="#4F46E5" />
        
        {/* Header */}
        <View style={styles.calendarHeader}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>OfficeTrack</Text>
            <TouchableOpacity onPress={() => setShowPlanner(true)}>
              <Text style={styles.planButton}>📅 Plan</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.headerMonth}>{monthName}</Text>
          
          {/* Target Progress */}
          <View style={styles.targetCard}>
            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Monthly Target:</Text>
              <TouchableOpacity 
                onPress={() => {
                  Alert.prompt(
                    'Set Monthly Target',
                    'How many office days per month?',
                    async (text) => {
                      const target = parseInt(text);
                      if (target > 0 && target <= 25) {
                        setMonthlyTarget(target);
                        await AsyncStorage.setItem('monthlyTarget', text);
                      }
                    },
                    'plain-text',
                    monthlyTarget.toString()
                  );
                }}
              >
                <Text style={styles.targetValue}>{targetProgress.progress}/{monthlyTarget} ({targetProgress.percentage}%)</Text>
              </TouchableOpacity>
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
              <Text style={styles.todayButton}>Today</Text>
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

        {/* Stats Modal */}
        <Modal visible={showStats} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <ScrollView style={styles.statsModalContainer}>
              <View style={styles.statsModal}>
                <Text style={styles.statsModalTitle}>📊 Detailed Statistics</Text>
                
                <StatsSection title="This Month" stats={calculateStats('month')} />
                <StatsSection title="This Quarter" stats={calculateStats('quarter')} />
                <StatsSection title="This Year" stats={calculateStats('year')} />

                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowStats(false)}
                >
                  <Text style={styles.modalCancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* Planner Modal */}
        <Modal visible={showPlanner} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.plannerModal}>
              <Text style={styles.plannerTitle}>📅 Plan Your Office Days</Text>
              <Text style={styles.plannerSubtitle}>
                Schedule when you plan to go to office. You'll get morning reminders!
              </Text>
              
              {/* Next 14 days planning */}
              <ScrollView style={styles.plannerList}>
                {Array.from({ length: 14 }, (_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() + i + 1);
                  const dateStr = date.toISOString().split('T')[0];
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.plannerItem,
                        plannedDays[dateStr] === 'office' && styles.plannerItemSelected
                      ]}
                      onPress={async () => {
                        const newPlanned = { ...plannedDays };
                        if (newPlanned[dateStr] === 'office') {
                          delete newPlanned[dateStr];
                        } else {
                          newPlanned[dateStr] = 'office';
                        }
                        setPlannedDays(newPlanned);
                        await AsyncStorage.setItem('plannedDays', JSON.stringify(newPlanned));
                        await scheduleOfficeDayReminders(); // Reschedule notifications
                      }}
                    >
                      <Text style={styles.plannerDate}>{dayName}</Text>
                      <Text style={styles.plannerStatus}>
                        {plannedDays[dateStr] === 'office' ? '✅ Office' : '⭕ Plan Office?'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowPlanner(false)}
              >
                <Text style={styles.modalCancelText}>Done</Text>
              </TouchableOpacity>
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
  
  // Loading Screen
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
  },

  // Welcome Screen
  welcomeContainer: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#4F46E5',
  },
  welcomeHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  welcomeEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
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
  featuresTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
    textAlign: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  featureEmoji: {
    fontSize: 24,
    marginRight: 16,
  },
  featureText: {
    fontSize: 16,
    color: 'white',
    flex: 1,
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
    color: '#111827',
    marginBottom: 8,
  },
  setupSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
  },

  // Form Components
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
  },
  dropdown: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    maxHeight: 200,
    marginTop: -1,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownText: {
    fontSize: 16,
    color: '#374151',
  },
  locationButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  locationButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  addressPreview: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic',
    paddingHorizontal: 4,
  },

  // Tracking Mode Cards
  trackingCard: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  trackingCardSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
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
    color: '#111827',
    marginBottom: 4,
  },
  freeTag: {
    backgroundColor: '#10B981',
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
    color: '#6B7280',
    marginBottom: 16,
  },
  trackingFeatures: {
    paddingLeft: 8,
  },
  
  // Buttons
  primaryButton: {
    backgroundColor: '#4F46E5',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  backButton: {
    fontSize: 16,
    color: '#4F46E5',
    textAlign: 'center',
    fontWeight: '600',
  },

  // Calendar Header
  calendarHeader: {
    backgroundColor: '#4F46E5',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  planButton: {
    fontSize: 14,
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.2)',
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

  // Calendar Content
  calendarContent: {
    flex: 1,
    padding: 16,
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
    color: '#4F46E5',
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  todayButton: {
    fontSize: 16,
    color: '#4F46E5',
    fontWeight: '600',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },

  // Calendar Grid
  calendar: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
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
    color: '#6B7280',
    paddingVertical: 8,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: `${100/7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 4,
  },
  dayText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
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
    color: '#6B7280',
    fontWeight: '500',
  },

  // Quick Stats
  quickStats: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '500',
  },

  // Stats Button
  statsButton: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4F46E5',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
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
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },

  // Stats Modal
  statsModalContainer: {
    flex: 1,
  },
  statsModal: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: '80%',
  },
  statsModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
    textAlign: 'center',
  },
  statsSection: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statsSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
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
    color: '#6B7280',
  },
  statsPercentage: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },

  // Planner Modal
  plannerModal: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  plannerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  plannerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
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
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  plannerItemSelected: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  plannerDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  plannerStatus: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Utilities
  bottomPadding: {
    height: 32,
  },
});
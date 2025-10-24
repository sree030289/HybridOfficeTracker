// OfficeTrack Production MVP - Ready to Launch
// Complete implementation with all features

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
  Linking
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Firebase configuration
const FIREBASE_URL = 'https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app/';

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
  });
  const [attendanceData, setAttendanceData] = useState({});
  const [plannedDays, setPlannedDays] = useState({});
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [holidays, setHolidays] = useState([]);
  const [locationCheckInterval, setLocationCheckInterval] = useState(null);

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
      const userId = await getOrCreateUserId();
      const storedData = await AsyncStorage.getItem('userData');
      
      if (storedData) {
        const parsed = JSON.parse(storedData);
        setUserData({ ...parsed, userId });
        
        await loadAllData();
        await loadHolidays(parsed.companyAddress);
        
        setScreen('calendar');
        
        if (parsed.trackingMode === 'auto') {
          setupAutoNotifications();
          startHourlyLocationCheck(parsed.companyLocation);
        } else {
          setupManualNotifications();
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
    const attendance = await AsyncStorage.getItem('attendanceData');
    const planned = await AsyncStorage.getItem('plannedDays');
    const target = await AsyncStorage.getItem('monthlyTarget');
    
    if (attendance) setAttendanceData(JSON.parse(attendance));
    if (planned) setPlannedDays(JSON.parse(planned));
    if (target) setMonthlyTarget(parseInt(target));
  };

  const getOrCreateUserId = async () => {
    let userId = await AsyncStorage.getItem('userId');
    if (!userId) {
      userId = `${Device.modelName?.replace(/\s/g, '_')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('userId', userId);
    }
    return userId;
  };

  const saveToFirebase = async (path, data) => {
    try {
      const url = `${FIREBASE_URL}/users/${userData.userId}/${path}.json`;
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.log('Firebase error:', error);
    }
  };

  const loadHolidays = async (address) => {
    // Public holidays by country
    const holidays2024 = {
      australia: ['2024-01-01', '2024-01-26', '2024-04-25', '2024-12-25', '2024-12-26',
                  '2025-01-01', '2025-01-27', '2025-04-25', '2025-12-25', '2025-12-26'],
      india: ['2024-01-26', '2024-08-15', '2024-10-02', '2024-10-24', '2024-11-12',
              '2025-01-26', '2025-08-15', '2025-10-02', '2025-10-23', '2025-11-01'],
      us: ['2024-01-01', '2024-07-04', '2024-11-28', '2024-12-25',
           '2025-01-01', '2025-07-04', '2025-11-27', '2025-12-25']
    };
    
    let country = 'australia';
    if (address?.toLowerCase().includes('india')) country = 'india';
    if (address?.toLowerCase().includes('united states') || address?.toLowerCase().includes('usa')) country = 'us';
    
    setHolidays(holidays2024[country]);
  };

  const setupManualNotifications = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    const times = [
      { hour: 10, minute: 0, id: 'morning' },
      { hour: 13, minute: 0, id: 'afternoon' },
      { hour: 16, minute: 0, id: 'evening' }
    ];

    for (const time of times) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📍 OfficeTrack Check-in',
          body: 'Are you in office today?',
          data: { type: 'manual', time: time.id },
          categoryIdentifier: 'CHECKIN',
        },
        trigger: {
          hour: time.hour,
          minute: time.minute,
          repeats: true,
        },
      });
    }

    await Notifications.setNotificationCategoryAsync('CHECKIN', [
      { identifier: 'office', buttonTitle: '🏢 Yes, Office', options: { opensAppToForeground: false } },
      { identifier: 'wfh', buttonTitle: '🏠 No, WFH', options: { opensAppToForeground: false } }
    ]);
  };

  const setupAutoNotifications = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Schedule 7am notification for planned office days
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    if (plannedDays[tomorrowStr] === 'office') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🌅 Office Day Tomorrow!',
          body: 'You planned to go to office tomorrow. Ready?',
          data: { type: 'auto', date: tomorrowStr },
        },
        trigger: {
          hour: 19,
          minute: 0,
          repeats: false,
        },
      });
    }
  };

  const startHourlyLocationCheck = (officeLocation) => {
    const checkLocation = async () => {
      const today = new Date().toISOString().split('T')[0];
      if (attendanceData[today]) return;

      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const distance = calculateDistance(
          location.coords.latitude,
          location.coords.longitude,
          officeLocation.latitude,
          officeLocation.longitude
        );

        if (distance < 0.2) {
          await markAttendance(today, 'office', true);
          Alert.alert('✓ Auto-detected', 'You\'re at office! Day marked automatically.');
        }
      } catch (error) {
        console.log('Location check error:', error);
      }
    };

    checkLocation();
    const interval = setInterval(checkLocation, 60 * 60 * 1000);
    setLocationCheckInterval(interval);
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
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
      await Notifications.cancelAllScheduledNotificationsAsync();
      setTimeout(() => {
        if (userData.trackingMode === 'manual') {
          setupManualNotifications();
        }
      }, 24 * 60 * 60 * 1000);
    }

    setSelectedDay(null);
    setShowModal(false);
  };

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
      const d = new Date(date);
      return d >= startDate && d <= endDate;
    });

    const office = entries.filter(([, type]) => type === 'office').length;
    const wfh = entries.filter(([, type]) => type === 'wfh').length;
    const leave = entries.filter(([, type]) => type === 'leave').length;

    return { office, wfh, leave, total: entries.length };
  };

  const calculateTargetProgress = () => {
    if (!monthlyTarget) return { progress: 0, remaining: 0, suggestion: '', percentage: 0 };

    const stats = calculateStats('month');
    const progress = stats.office;
    const remaining = monthlyTarget - progress;
    
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - now.getDate();
    
    const daysPerWeek = remaining > 0 ? Math.ceil(remaining / Math.max(1, daysRemaining / 7)) : 0;
    
    let suggestion = '';
    if (remaining > 0) {
      suggestion = `Come ${daysPerWeek} days/week to reach target`;
    } else if (remaining === 0) {
      suggestion = 'Target achieved! 🎉';
    } else {
      suggestion = 'Target exceeded! 🚀';
    }

    const percentage = Math.min(100, Math.round((progress / monthlyTarget) * 100));

    return { progress, remaining, suggestion, percentage };
  };

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];

    const days = [];
    
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();
      
      days.push({
        day,
        date: dateStr,
        isToday: dateStr === today,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isHoliday: holidays?.includes(dateStr),
        type: attendanceData[dateStr],
        planned: plannedDays[dateStr]
      });
    }

    return days;
  };

  const getDayColor = (item) => {
    if (item.isHoliday) return '#EF4444';
    if (item.isWeekend) return '#9CA3AF';
    if (item.type === 'office') return '#10B981';
    if (item.type === 'wfh') return '#3B82F6';
    if (item.type === 'leave') return '#F59E0B';
    if (item.planned === 'office') return '#A7F3D0';
    return '#F3F4F6';
  };

  // SCREENS

  if (screen === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading OfficeTrack...</Text>
      </View>
    );
  }

  if (screen === 'welcome') {
    return (
      <View style={styles.container}>
        <RNStatusBar barStyle="light-content" />
        <View style={styles.welcomeContainer}>
          <Text style={styles.welcomeEmoji}>📅</Text>
          <Text style={styles.welcomeTitle}>OfficeTrack</Text>
          <Text style={styles.welcomeSubtitle}>
            Track your hybrid work attendance effortlessly
          </Text>
          
          <View style={styles.featureList}>
            <FeatureItem text="Smart attendance tracking" />
            <FeatureItem text="Automatic office detection" />
            <FeatureItem text="Monthly goals & insights" />
            <FeatureItem text="Plan your office days" />
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setScreen('companySetup')}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === 'companySetup') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.formContainer}>
        <RNStatusBar barStyle="dark-content" />
        <Text style={styles.formTitle}>Company Details</Text>
        
        <Text style={styles.label}>Company Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Acme Corporation"
          value={userData.companyName}
          onChangeText={(text) => setUserData({ ...userData, companyName: text })}
        />

        <Text style={styles.label}>Office Location</Text>
        <TouchableOpacity
          style={styles.locationButton}
          onPress={async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Please enable location to set office address');
              return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const address = await Location.reverseGeocodeAsync({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude
            });

            const fullAddress = [
              address[0].street,
              address[0].city,
              address[0].region,
              address[0].country
            ].filter(Boolean).join(', ');
            
            setUserData({
              ...userData,
              companyLocation: location.coords,
              companyAddress: fullAddress
            });
          }}
        >
          <Text style={styles.locationButtonText}>
            {userData.companyAddress || '📍 Set Current Location as Office'}
          </Text>
        </TouchableOpacity>

        {userData.companyAddress && (
          <Text style={styles.addressPreview}>{userData.companyAddress}</Text>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, !userData.companyName && styles.disabledButton]}
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
      <ScrollView style={styles.container} contentContainerStyle={styles.formContainer}>
        <RNStatusBar barStyle="dark-content" />
        <Text style={styles.formTitle}>Your Information</Text>
        
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="John Doe"
          value={userData.name}
          onChangeText={(text) => setUserData({ ...userData, name: text })}
        />

        <Text style={styles.label}>Mobile Number</Text>
        <TextInput
          style={styles.input}
          placeholder="+61 XXX XXX XXX"
          keyboardType="phone-pad"
          value={userData.mobile}
          onChangeText={(text) => setUserData({ ...userData, mobile: text })}
        />

        <TouchableOpacity
          style={[styles.primaryButton, (!userData.name || !userData.mobile) && styles.disabledButton]}
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
      <ScrollView style={styles.container} contentContainerStyle={styles.formContainer}>
        <RNStatusBar barStyle="dark-content" />
        <Text style={styles.formTitle}>How would you like to track?</Text>
        <Text style={styles.formSubtitle}>Both options are completely free</Text>

        <TouchableOpacity
          style={[
            styles.modeCard,
            userData.trackingMode === 'manual' && styles.modeCardSelected
          ]}
          onPress={() => setUserData({ ...userData, trackingMode: 'manual' })}
        >
          <Text style={styles.modeEmoji}>✋</Text>
          <Text style={styles.modeTitle}>Manual Entry</Text>
          <Text style={styles.modeDescription}>
            • Receive 3 notifications daily (10am, 1pm, 4pm){'\n'}
            • Quick tap to mark your day{'\n'}
            • Full control over your data{'\n'}
            • No location tracking needed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeCard,
            userData.trackingMode === 'auto' && styles.modeCardSelected
          ]}
          onPress={() => setUserData({ ...userData, trackingMode: 'auto' })}
        >
          <Text style={styles.modeEmoji}>🤖</Text>
          <Text style={styles.modeTitle}>Auto Smart Detection</Text>
          <Text style={styles.modeDescription}>
            • Automatically detects when you're at office{'\n'}
            • Location checked once per hour (low battery){'\n'}
            • Morning reminder for planned office days{'\n'}
            • Hands-free tracking
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={async () => {
            if (userData.trackingMode === 'auto') {
              const locStatus = await Location.requestForegroundPermissionsAsync();
              if (locStatus.status !== 'granted') {
                Alert.alert('Location Required', 'Auto mode needs location permission');
                return;
              }
            }

            const notifStatus = await Notifications.requestPermissionsAsync();
            if (notifStatus.status !== 'granted') {
              Alert.alert('Notifications Required', 'Please enable notifications for reminders');
            }

            await AsyncStorage.setItem('userData', JSON.stringify(userData));
            
            if (userData.trackingMode === 'manual') {
              await setupManualNotifications();
            } else {
              await setupAutoNotifications();
              startHourlyLocationCheck(userData.companyLocation);
            }

            await loadHolidays(userData.companyAddress);
            setScreen('calendar');
          }}
        >
          <Text style={styles.primaryButtonText}>
            {userData.trackingMode === 'auto' ? 'Enable Auto Tracking' : 'Start Tracking'}
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
    const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return (
      <View style={styles.container}>
        <RNStatusBar barStyle="light-content" />
        
        <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>OfficeTrack</Text>
          <Text style={styles.calendarMonth}>{monthName}</Text>
          
          {monthlyTarget > 0 && (
            <View style={styles.targetCard}>
              <Text style={styles.targetText}>
                Target: {targetProgress.progress}/{monthlyTarget} days ({targetProgress.percentage}%)
              </Text>
              <Text style={styles.targetSuggestion}>{targetProgress.suggestion}</Text>
            </View>
          )}
        </View>

        <ScrollView style={styles.calendarContent}>
          <View style={styles.weekDays}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <Text key={day} style={styles.weekDay}>{day}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.calendarCell,
                  { backgroundColor: getDayColor(item) },
                  item.isToday && styles.todayCell
                ]}
                disabled={!item.day}
                onPress={() => {
                  if (item.day) {
                    setSelectedDay(item);
                    setShowModal(true);
                  }
                }}
              >
                {item.day && (
                  <Text style={[
                    styles.cellText,
                    (item.type || item.isHoliday || item.isWeekend) && styles.cellTextWhite
                  ]}>
                    {item.day}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.legend}>
            <LegendItem color="#10B981" label="Office" />
            <LegendItem color="#3B82F6" label="WFH" />
            <LegendItem color="#F59E0B" label="Leave" />
            <LegendItem color="#EF4444" label="Holiday" />
            <LegendItem color="#9CA3AF" label="Weekend" />
            <LegendItem color="#A7F3D0" label="Planned" />
          </View>

          <View style={styles.quickStats}>
            <StatBox label="Office" value={stats.office} color="#10B981" />
            <StatBox label="WFH" value={stats.wfh} color="#3B82F6" />
            <StatBox label="Leave" value={stats.leave} color="#F59E0B" />
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowStats(true)}>
            <Text style={styles.secondaryButtonText}>📊 View Detailed Stats</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              Alert.prompt(
                'Set Monthly Target',
                'How many office days per month?',
                async (text) => {
                  const target = parseInt(text);
                  if (target > 0) {
                    setMonthlyTarget(target);
                    await AsyncStorage.setItem('monthlyTarget', text);
                  }
                },
                'plain-text',
                monthlyTarget.toString()
              );
            }}
          >
            <Text style={styles.secondaryButtonText}>🎯 Set Monthly Target</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={showModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedDay?.date}</Text>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#10B981' }]}
                onPress={() => markAttendance(selectedDay.date, 'office')}
              >
                <Text style={styles.modalButtonText}>🏢 Office</Text>
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
                <Text style={styles.modalButtonText}>🌴 Leave</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#A7F3D0' }]}
                onPress={async () => {
                  const newPlanned = { ...plannedDays, [selectedDay.date]: 'office' };
                  setPlannedDays(newPlanned);
                  await AsyncStorage.setItem('plannedDays', JSON.stringify(newPlanned));
                  setShowModal(false);
                  Alert.alert('✓ Planned', 'Office day planned! You\'ll get a reminder at 7am.');
                }}
              >
                <Text style={styles.modalButtonText}>📅 Plan for Office</Text>
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

        <Modal visible={showStats} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.statsModal}>
              <Text style={styles.statsModalTitle}>📊 Detailed Statistics</Text>
              
              <StatsSection period="month" calculate={calculateStats} />
              <StatsSection period="quarter" calculate={calculateStats} />
              <StatsSection period="year" calculate={calculateStats} />

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowStats(false)}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return null;
}

function FeatureItem({ text }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureCheckmark}>✓</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function LegendItem({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function StatBox({ label, value, color }) {
  return (
    <View style={[styles.statBox, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StatsSection({ period, calculate }) {
  const stats = calculate(period);
  const periodName = period.charAt(0).toUpperCase() + period.slice(1);
  
  return (
    <View style={styles.statsSection}>
      <Text style={styles.statsSectionTitle}>{periodName}</Text>
      <View style={styles.statsRow}>
        <Text style={styles.statsText}>Office: {stats.office} days</Text>
        <Text style={styles.statsText}>WFH: {stats.wfh} days</Text>
      </View>
      <View style={styles.statsRow}>
        <Text style={styles.statsText}>Leave: {stats.leave} days</Text>
        <Text style={styles.statsText}>Total: {stats.total} days</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6B7280' },
  welcomeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#4F46E5' },
  welcomeEmoji: { fontSize: 64, marginBottom: 16 },
  welcomeTitle: { fontSize: 32, fontWeight: 'bold', color: 'white', marginBottom: 8 },
  welcomeSubtitle: { fontSize: 16, color: 'white', textAlign: 'center', opacity: 0.9, marginBottom: 40 },
  featureList: { width: '100%', marginBottom: 40 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  featureCheckmark: { fontSize: 20, color: '#10B981', marginRight: 12 },
  featureText: { fontSize: 16, color: 'white' },
  formContainer: { padding: 24, paddingTop: 60 },
  formTitle: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  formSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 16, fontSize: 16 },
  locationButton: { backgroundColor: '#4F46E5', padding: 16, borderRadius: 12, alignItems: 'center' },
  locationButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  addressPreview: { fontSize: 12, color: '#6B7280', marginTop: 8, fontStyle: 'italic' },
  primaryButton: { backgroundColor: '#4F46E5', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  primaryButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  disabledButton: { backgroundColor: '#9CA3AF' },
  backButton: { fontSize: 16, color: '#4F46E5', textAlign: 'center', marginTop: 16 },
  modeCard: { backgroundColor: 'white', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 16, padding: 20, marginBottom: 16 },
  modeCardSelected: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
  modeEmoji: { fontSize: 32, marginBottom: 8 },
  modeTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  modeDescription: { fontSize: 14, color: '#6B7280', lineHeight: 20 },
  calendarHeader: { backgroundColor: '#4F46E5', padding: 20, paddingTop: 50 },
  calendarTitle: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  calendarMonth: { fontSize: 18, color: 'white', opacity: 0.9, marginTop: 4 },
  targetCard: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 8, marginTop: 12 },
  targetText: { color: 'white', fontSize: 14, fontWeight: '600' },
  targetSuggestion: { color: 'white', fontSize: 12, marginTop: 4, opacity: 0.9 },
  calendarContent: { flex: 1, padding: 16 },
  weekDays: { flexDirection: 'row', marginBottom: 8 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#6B7280' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginBottom: 4 },
  todayCell: { borderWidth: 2, borderColor: '#4F46E5' },
  cellText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  cellTextWhite: { color: 'white' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  legendText: { fontSize: 12, color: '#6B7280' },
  quickStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: 'white', padding: 16, borderRadius: 12, marginHorizontal: 4, borderLeftWidth: 4 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  secondaryButton: { backgroundColor: 'white', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: '#4F46E5' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 20, textAlign: 'center' },
  modalButton: { padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  modalButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  modalCancelButton: { padding: 16, alignItems: 'center', marginTop: 8 },
  modalCancelText: { color: '#6B7280', fontSize: 16 },
  statsModal: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  statsModalTitle: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 24, textAlign: 'center' },
  statsSection: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12, marginBottom: 16 },
  statsSectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  statsText: { fontSize: 14, color: '#6B7280' },
});

/**
 * Firebase Cloud Messaging Service
 * Handles FCM token registration and notification management
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import firebaseService from './firebaseService';
import { database } from '../firebase.config';
import { ref, update } from 'firebase/database';

class FCMService {
  constructor() {
    this.fcmToken = null;
    this.userId = null;
  }

  /**
   * Initialize FCM service with user ID
   */
  async initialize(userId) {
    this.userId = userId;
    await this.registerToken();
  }

  /**
   * Register FCM token with Firebase
   */
  async registerToken() {
    try {
      if (Platform.OS === 'web') {
        console.log('FCM not supported on web');
        return null;
      }

      // Check if device supports push notifications
      if (!Device.isDevice) {
        console.log('Must use physical device for push notifications');
        return null;
      }

      // Request notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push notification permissions');
        return null;
      }

      // Get the Expo push token (which uses FCM on Android and APNs on iOS)
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'd6c98ab3-554e-44ef-b8a7-fe176cabe25e' // Your Expo project ID
      });

      if (token?.data) {
        this.fcmToken = token.data;
        console.log('📱 FCM Token obtained:', token.data);

        // Save token to Firebase at root level
        if (this.userId) {
          try {
            const userRef = ref(database, `users/${this.userId}`);
            await update(userRef, {
              fcmToken: token.data,
              fcmTokenUpdatedAt: Date.now(),
              platform: Platform.OS,
              deviceModel: Device.modelName || 'Unknown',
              osVersion: Device.osVersion || 'Unknown',
              lastUpdated: Date.now()
            });
            console.log('✅ FCM token saved to Firebase');
          } catch (saveError) {
            console.error('❌ Error saving FCM token to Firebase:', saveError);
            // Don't let FCM save error block app initialization
          }
        }

        return token.data;
      }
    } catch (error) {
      console.error('❌ Error registering FCM token:', error);
      return null;
    }
  }

  /**
   * Update user settings in Firebase (e.g., tracking mode)
   * This allows cloud functions to know who to send notifications to
   */
  async updateUserSettings(settings) {
    if (!this.userId) {
      console.error('FCM Service not initialized with userId');
      return;
    }

    try {
      // updateData already uses getUserRef() which points to users/{userId}
      // So we only need to pass the nested path 'settings', not 'users/{userId}/settings'
      await firebaseService.updateData('settings', settings);
      console.log('✅ User settings updated in Firebase');
    } catch (error) {
      console.error('❌ Error updating user settings:', error);
    }
  }

  /**
   * Mark attendance in Firebase so cloud functions know not to send reminders
   */
  async markAttendanceLogged(date) {
    if (!this.userId) {
      console.error('FCM Service not initialized with userId');
      return;
    }

    try {
      await firebaseService.updateData(`users/${this.userId}/attendance/${date}`, {
        logged: true,
        timestamp: Date.now()
      });
      console.log(`✅ Marked attendance logged for ${date}`);
    } catch (error) {
      console.error('❌ Error marking attendance:', error);
    }
  }

  /**
   * Get the current FCM token
   */
  getToken() {
    return this.fcmToken;
  }

  /**
   * Unregister FCM token (e.g., on logout)
   */
  async unregisterToken() {
    if (!this.userId) return;

    try {
      await firebaseService.updateData(`users/${this.userId}`, {
        fcmToken: null,
        fcmTokenUpdatedAt: Date.now()
      });
      this.fcmToken = null;
      console.log('✅ FCM token unregistered');
    } catch (error) {
      console.error('❌ Error unregistering FCM token:', error);
    }
  }
}

// Export singleton instance
const fcmService = new FCMService();
export default fcmService;

import { database } from '../firebase.config';
import { ref, set, get, update, onValue, off } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import productionLogger from './productionLogger';

/**
 * Timeout wrapper for Firebase operations to prevent hanging
 */
const firebaseWithTimeout = (promise, timeoutMs = 30000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Firebase operation timeout')), timeoutMs)
    )
  ]);
};

/**
 * Firebase Service for OfficeTracker
 * Provides reliable data persistence with offline support
 * 
 * Data Structure:
 * /users/{userId}/
 *   - attendanceData: { "2024-01-15": "office", "2024-01-16": "wfh" }
 *   - plannedDays: { "2024-01-20": "office", "2024-01-21": "leave" }
 *   - userData: { companyName, trackingMode, etc. }
 *   - settings: { monthlyTarget, targetMode }
 *   - lastUpdated: timestamp
 */

class FirebaseService {
  constructor() {
    this.userId = null;
    this.listeners = {};
    this.isOnline = true;
    this.syncQueue = [];
    this.isSyncing = false;
  }

  /**
   * Initialize the service with user ID
   */
  async initialize(userId) {
    this.userId = userId;
    console.log('🔥 Firebase Service initialized for user:', userId);
    
    // Try to sync any pending changes
    await this.processSyncQueue();
  }

  /**
   * Get reference to user's data path
   */
  getUserRef(path = '') {
    if (!this.userId) {
      throw new Error('User ID not initialized');
    }
    return ref(database, `users/${this.userId}${path ? '/' + path : ''}`);
  }

  /**
   * GET: Fetch all user data from Firebase
   * Falls back to AsyncStorage if offline
   */
  async getAllData() {
    try {
      console.log('📥 Fetching all data from Firebase...');
      const userRef = this.getUserRef();
      const snapshot = await firebaseWithTimeout(get(userRef), 30000);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('✅ Data fetched from Firebase successfully');
        
        // Cache in AsyncStorage for offline access
        await this.cacheDataLocally(data);
        
        return {
          attendanceData: data.attendanceData || {},
          plannedDays: data.plannedDays || {},
          userData: data.userData || {},
          settings: data.settings || { monthlyTarget: 15, targetMode: 'days' },
          cachedHolidays: data.cachedHolidays || {},
          holidayLastUpdated: data.holidayLastUpdated || {},
          lastUpdated: data.lastUpdated || Date.now()
        };
      } else {
        console.log('⚠️ No Firebase data found, checking local cache...');
        return await this.getLocalData();
      }
    } catch (error) {
      console.error('❌ Firebase fetch error:', error);
      console.log('📱 Falling back to local data...');
      return await this.getLocalData();
    }
  }

  /**
   * POST: Save complete data structure to Firebase
   * Also saves to AsyncStorage as backup
   */
  async saveAllData(data) {
    try {
      console.log('💾 Saving all data to Firebase...');
      
      // Get existing data first to preserve FCM token and other fields
      const existingSnapshot = await firebaseWithTimeout(get(this.getUserRef()), 30000);
      const existingData = existingSnapshot.exists() ? existingSnapshot.val() : {};
      
      const dataToSave = {
        ...existingData, // Preserve existing fields like fcmToken, platform, etc.
        attendanceData: data.attendanceData || {},
        plannedDays: data.plannedDays || {},
        userData: data.userData || {},
        settings: {
          monthlyTarget: data.monthlyTarget || 15,
          targetMode: data.targetMode || 'days'
        },
        cachedHolidays: data.cachedHolidays || {},
        holidayLastUpdated: data.holidayLastUpdated || {},
        lastUpdated: Date.now()
      };

      // Save to Firebase
      const userRef = this.getUserRef();
      await firebaseWithTimeout(set(userRef, dataToSave), 30000);
      
      // Also save to local cache
      await this.cacheDataLocally(dataToSave);
      
      // Log save details
      const attendanceCount = Object.keys(dataToSave.attendanceData || {}).length;
      const plannedCount = Object.keys(dataToSave.plannedDays || {}).length;
      console.log('✅ All data saved successfully to Firebase');
      console.log(`   ├─ Attendance Records: ${attendanceCount} days`);
      console.log(`   ├─ Planned Days: ${plannedCount} days`);
      console.log(`   └─ Timestamp: ${new Date(dataToSave.lastUpdated).toLocaleString()}`);
      return true;
    } catch (error) {
      console.error('❌ Firebase save error:', error);
      
      // Log critical error to production logger
      productionLogger.error('Firebase save failed', error, {
        operation: 'saveAllData',
        dataSize: {
          attendance: Object.keys(data.attendanceData || {}).length,
          plannedDays: Object.keys(data.plannedDays || {}).length,
        }
      });
      
      // Queue for later sync
      this.addToSyncQueue('saveAll', data);
      
      // Still save locally
      await this.cacheDataLocally({
        attendanceData: data.attendanceData || {},
        plannedDays: data.plannedDays || {},
        userData: data.userData || {},
        settings: {
          monthlyTarget: data.monthlyTarget || 15,
          targetMode: data.targetMode || 'days'
        },
        cachedHolidays: data.cachedHolidays || {},
        holidayLastUpdated: data.holidayLastUpdated || {}
      });
      
      return false;
    }
  }

  /**
   * UPDATE: Update specific fields in Firebase
   * More efficient than saving all data
   */
  async updateData(path, data) {
    try {
      console.log(`📝 Updating ${path} in Firebase...`);
      
      const updates = {};
      updates[path] = data;
      updates['lastUpdated'] = Date.now();
      
      const userRef = this.getUserRef();
      await firebaseWithTimeout(update(userRef, updates), 30000);
      
      // Update local cache
      const localData = await this.getLocalData();
      if (path === 'attendanceData') {
        localData.attendanceData = data;
      } else if (path === 'plannedDays') {
        localData.plannedDays = data;
      } else if (path === 'userData') {
        localData.userData = data;
      } else if (path === 'settings') {
        localData.settings = data;
      }
      await this.cacheDataLocally(localData);
      
      console.log(`✅ ${path} updated successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Firebase update error for ${path}:`, error);
      
      // Queue for later sync
      this.addToSyncQueue('update', { path, data });
      
      // Update locally anyway
      const localData = await this.getLocalData();
      if (path === 'attendanceData') {
        localData.attendanceData = data;
      } else if (path === 'plannedDays') {
        localData.plannedDays = data;
      } else if (path === 'userData') {
        localData.userData = data;
      } else if (path === 'settings') {
        localData.settings = data;
      }
      await this.cacheDataLocally(localData);
      
      return false;
    }
  }

  /**
   * UPDATE: Update a single attendance entry
   * Most efficient for single day updates
   */
  async updateAttendance(dateStr, type) {
    try {
      console.log(`📅 Updating attendance for ${dateStr}: ${type}`);
      
      const attendanceRef = this.getUserRef(`attendanceData/${dateStr}`);
      await set(attendanceRef, type);
      
      // Update last updated timestamp
      const lastUpdatedRef = this.getUserRef('lastUpdated');
      await set(lastUpdatedRef, Date.now());
      
      // Update local cache
      const localData = await this.getLocalData();
      localData.attendanceData[dateStr] = type;
      await this.cacheDataLocally(localData);
      
      console.log(`✅ Attendance updated for ${dateStr}`);
      return true;
    } catch (error) {
      console.error(`❌ Firebase attendance update error:`, error);
      
      // Queue for later sync
      this.addToSyncQueue('updateAttendance', { dateStr, type });
      
      // Update locally
      const localData = await this.getLocalData();
      localData.attendanceData[dateStr] = type;
      await this.cacheDataLocally(localData);
      
      return false;
    }
  }

  /**
   * UPDATE: Delete a single attendance entry
   */
  async deleteAttendance(dateStr) {
    try {
      console.log(`🗑️ Deleting attendance for ${dateStr}`);
      
      const attendanceRef = this.getUserRef(`attendanceData/${dateStr}`);
      await set(attendanceRef, null);
      
      // Update last updated timestamp
      const lastUpdatedRef = this.getUserRef('lastUpdated');
      await set(lastUpdatedRef, Date.now());
      
      // Update local cache
      const localData = await this.getLocalData();
      delete localData.attendanceData[dateStr];
      await this.cacheDataLocally(localData);
      
      console.log(`✅ Attendance deleted for ${dateStr}`);
      return true;
    } catch (error) {
      console.error(`❌ Firebase attendance delete error:`, error);
      
      // Queue for later sync
      this.addToSyncQueue('deleteAttendance', { dateStr });
      
      // Delete locally
      const localData = await this.getLocalData();
      delete localData.attendanceData[dateStr];
      await this.cacheDataLocally(localData);
      
      return false;
    }
  }

  /**
   * Set up real-time listener for data changes
   * Automatically syncs when data changes in Firebase
   */
  setupRealtimeSync(onDataChange) {
    if (!this.userId) {
      console.error('Cannot setup realtime sync: User ID not initialized');
      return;
    }

    console.log('👂 Setting up real-time sync listener...');
    
    const userRef = this.getUserRef();
    
    const listener = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('🔄 Data changed in Firebase, syncing locally...');
        
        // Cache locally
        this.cacheDataLocally(data);
        
        // Notify app
        if (onDataChange) {
          onDataChange({
            attendanceData: data.attendanceData || {},
            plannedDays: data.plannedDays || {},
            userData: data.userData || {},
            settings: data.settings || { monthlyTarget: 15, targetMode: 'days' },
            lastUpdated: data.lastUpdated || Date.now()
          });
        }
      }
    }, (error) => {
      console.error('❌ Realtime sync error:', error);
    });

    // Store listener reference for cleanup
    this.listeners.mainListener = listener;
  }

  /**
   * Stop real-time sync
   */
  stopRealtimeSync() {
    if (this.listeners.mainListener) {
      const userRef = this.getUserRef();
      off(userRef);
      delete this.listeners.mainListener;
      console.log('🛑 Realtime sync stopped');
    }
  }

  /**
   * Cache data locally in AsyncStorage
   */
  async cacheDataLocally(data) {
    try {
      const cacheData = {
        ...data,
        cachedAt: Date.now()
      };
      
      await AsyncStorage.setItem('firebaseCache', JSON.stringify(cacheData));
      console.log('💾 Data cached locally');
    } catch (error) {
      console.error('❌ Local cache error:', error);
    }
  }

  /**
   * Get data from local AsyncStorage cache
   */
  async getLocalData() {
    try {
      const cached = await AsyncStorage.getItem('firebaseCache');
      if (cached) {
        const data = JSON.parse(cached);
        console.log('📱 Retrieved data from local cache');
        return {
          attendanceData: data.attendanceData || {},
          plannedDays: data.plannedDays || {},
          userData: data.userData || {},
          settings: data.settings || { monthlyTarget: 15, targetMode: 'days' },
          cachedHolidays: data.cachedHolidays || {},
          holidayLastUpdated: data.holidayLastUpdated || {},
          lastUpdated: data.lastUpdated || data.cachedAt || Date.now()
        };
      }
      
      // Fallback to old AsyncStorage format - MIGRATION HAPPENING
      console.log('🔄 ============================================');
      console.log('� MIGRATION DETECTED: Converting old data format to new Firebase format');
      console.log('🔄 ============================================');
      
      const attendance = await AsyncStorage.getItem('attendanceData');
      const planned = await AsyncStorage.getItem('plannedDays');
      const userData = await AsyncStorage.getItem('userData');
      const target = await AsyncStorage.getItem('monthlyTarget');
      const targetMode = await AsyncStorage.getItem('targetMode');
      
      // Log what we found
      const attendanceCount = attendance ? Object.keys(JSON.parse(attendance)).length : 0;
      const plannedCount = planned ? Object.keys(JSON.parse(planned)).length : 0;
      
      console.log('📊 Migration Stats:');
      console.log(`   ├─ Attendance Records: ${attendanceCount} days`);
      console.log(`   ├─ Planned Days: ${plannedCount} days`);
      console.log(`   ├─ Monthly Target: ${target || 15}`);
      console.log(`   └─ Tracking Mode: ${targetMode || 'days'}`);
      console.log('✅ Old data successfully loaded and converted!');
      console.log('📤 This data will be uploaded to Firebase on next user action');
      console.log('🔄 ============================================');
      
      return {
        attendanceData: attendance ? JSON.parse(attendance) : {},
        plannedDays: planned ? JSON.parse(planned) : {},
        userData: userData ? JSON.parse(userData) : {},
        settings: {
          monthlyTarget: target ? parseInt(target) : 15,
          targetMode: targetMode || 'days'
        },
        lastUpdated: Date.now()
      };
    } catch (error) {
      console.error('❌ Error reading local data:', error);
      return {
        attendanceData: {},
        plannedDays: {},
        userData: {},
        settings: { monthlyTarget: 15, targetMode: 'days' },
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Add operation to sync queue for later processing
   */
  addToSyncQueue(operation, data) {
    this.syncQueue.push({
      operation,
      data,
      timestamp: Date.now()
    });
    console.log(`📋 Added to sync queue: ${operation} (Queue size: ${this.syncQueue.length})`);
  }

  /**
   * Process sync queue (sync offline changes when back online)
   */
  async processSyncQueue() {
    if (this.isSyncing || this.syncQueue.length === 0) {
      return;
    }

    this.isSyncing = true;
    console.log(`🔄 Processing sync queue (${this.syncQueue.length} items)...`);

    while (this.syncQueue.length > 0) {
      const item = this.syncQueue[0];
      
      try {
        switch (item.operation) {
          case 'saveAll':
            await this.saveAllData(item.data);
            break;
          case 'update':
            await this.updateData(item.data.path, item.data.data);
            break;
          case 'updateAttendance':
            await this.updateAttendance(item.data.dateStr, item.data.type);
            break;
          case 'deleteAttendance':
            await this.deleteAttendance(item.data.dateStr);
            break;
        }
        
        // Remove from queue if successful
        this.syncQueue.shift();
        console.log(`✅ Synced: ${item.operation}`);
      } catch (error) {
        console.error(`❌ Sync failed for ${item.operation}:`, error);
        // Keep in queue and try again later
        break;
      }
    }

    this.isSyncing = false;
    console.log('✅ Sync queue processed');
  }

  /**
   * Clear all user data (for logout/reset)
   */
  async clearAllData() {
    try {
      if (this.userId) {
        const userRef = this.getUserRef();
        await set(userRef, null);
      }
      
      await AsyncStorage.removeItem('firebaseCache');
      await AsyncStorage.removeItem('attendanceData');
      await AsyncStorage.removeItem('plannedDays');
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('monthlyTarget');
      await AsyncStorage.removeItem('targetMode');
      
      console.log('🗑️ All data cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing data:', error);
      return false;
    }
  }

  /**
   * Check if Firebase is available (connectivity check)
   */
  async checkConnectivity() {
    try {
      const testRef = ref(database, '.info/connected');
      const snapshot = await get(testRef);
      this.isOnline = snapshot.val() === true;
      return this.isOnline;
    } catch (error) {
      this.isOnline = false;
      return false;
    }
  }
}

// Export singleton instance
export default new FirebaseService();

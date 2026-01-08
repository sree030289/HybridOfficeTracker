/**
 * Production Logger Service - 100% FREE Firebase Edition
 * 
 * Logs errors, events, and debug info to FREE Firebase services:
 * 1. Firebase Analytics (usage metrics, events) - FREE
 * 2. Firebase Realtime Database (remote debugging logs) - FREE tier 1GB
 * 3. Console (development debugging)
 * 
 * NO PAID SERVICES! Everything is free with Firebase.
 */

import { logEvent } from 'firebase/analytics';
import { ref, push } from 'firebase/database';
import { database, analytics } from '../firebase.config';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

class ProductionLogger {
  constructor() {
    this.initialized = false;
    this.userId = null;
    this.isDevelopment = __DEV__;
  }

  /**
   * Initialize logger with user context
   */
  initialize(userId) {
    if (this.initialized) return;

    this.userId = userId;
    this.initialized = true;
    
    this.info('ProductionLogger initialized (FREE Firebase edition)', { 
      userId,
      device: {
        model: Device.modelName,
        os: Device.osName,
        osVersion: Device.osVersion,
      }
    });
  }

  /**
   * Log info message (development + Firebase)
   */
  info(message, data = {}) {
    console.log(`ℹ️ [INFO] ${message}`, data);

    if (!this.isDevelopment && this.userId) {
      this._logToFirebase('info', message, data);
    }
  }

  /**
   * Log warning message (development + Firebase Analytics + Database)
   */
  warn(message, data = {}) {
    console.warn(`⚠️ [WARN] ${message}`, data);

    if (!this.isDevelopment && this.userId) {
      this._logToFirebase('warning', message, data);
      
      // Log as event to Firebase Analytics (only if available)
      if (analytics) {
        this.logEvent('app_warning', {
          warning_message: message.substring(0, 100), // Analytics has 100 char limit
          ...data
        });
      }
    }
  }

  /**
   * Log error (development + Firebase Analytics + Database)
   */
  error(message, error = null, data = {}) {
    console.error(`❌ [ERROR] ${message}`, error, data);

    if (!this.isDevelopment && this.userId) {
      this._logToFirebase('error', message, {
        ...data,
        error: error ? error.toString() : null,
        stack: error?.stack || null,
      });

      // Log error event to Firebase Analytics (only if available)
      if (analytics) {
        this.logEvent('app_error', {
          error_message: message.substring(0, 100),
          error_type: error?.name || 'unknown',
          ...data
        });
      }
    }
  }

  /**
   * Log user action/event (Firebase Analytics)
   */
  logEvent(eventName, params = {}) {
    console.log(`📊 [EVENT] ${eventName}`, params);

    // Only log to analytics if it's available (web platform)
    if (!analytics) {
      return;
    }

    try {
      // Log to Firebase Analytics
      logEvent(analytics, eventName, {
        ...params,
        user_id: this.userId,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }

  /**
   * Log migration event with detailed tracking
   */
  logMigration(status, stats = {}) {
    const migrationData = {
      status, // 'started', 'success', 'failed'
      attendance_records: stats.attendanceCount || 0,
      planned_days: stats.plannedCount || 0,
      monthly_target: stats.monthlyTarget || 15,
      target_mode: stats.targetMode || 'days',
      timestamp: Date.now(),
      user_id: this.userId,
    };

    // Log to console
    console.log(`🔄 [MIGRATION ${status.toUpperCase()}]`, migrationData);

    // Log to Firebase Analytics (for metrics dashboard) - only if available
    if (analytics) {
      this.logEvent(`migration_${status}`, migrationData);
    }

    // Log to Firebase Database for remote debugging
    if (!this.isDevelopment && this.userId) {
      this._logToFirebase('migration', `Migration ${status}`, migrationData);
    }
  }

  /**
   * Log critical migration failure (needs immediate attention)
   */
  logMigrationFailure(error, context = {}) {
    const errorData = {
      error_message: error.toString(),
      stack: error.stack,
      context,
      timestamp: Date.now(),
      user_id: this.userId,
    };

    console.error('🚨 [MIGRATION FAILED]', errorData);

    // Log to Firebase Analytics (only if available)
    if (analytics) {
      this.logEvent('migration_critical_failure', errorData);
    }

    // Log to Firebase Database (high priority)
    if (!this.isDevelopment && this.userId) {
      this._logToFirebase('critical', 'Migration Critical Failure', errorData);
    }
  }

  /**
   * Private: Log to Firebase Realtime Database
   * Structure: /logs/{userId}/{logId}
   */
  async _logToFirebase(level, message, data) {
    try {
      const logsRef = ref(database, `logs/${this.userId}`);
      
      await push(logsRef, {
        level,
        message,
        data,
        timestamp: Date.now(),
        device: {
          model: Device.modelName,
          os: Device.osName,
          osVersion: Device.osVersion,
          appVersion: Application.nativeApplicationVersion,
        },
      });
    } catch (error) {
      // Silently fail to avoid recursive logging
      console.error('Failed to log to Firebase:', error);
    }
  }

  /**
   * Store migration metadata in user's Firebase data
   */
  async storeMigrationMetadata(stats) {
    try {
      const migrationMetaRef = ref(database, `users/${this.userId}/migrationMetadata`);
      
      await push(migrationMetaRef, {
        attendanceRecordsMigrated: stats.attendanceCount || 0,
        plannedDaysMigrated: stats.plannedCount || 0,
        monthlyTarget: stats.monthlyTarget || 15,
        targetMode: stats.targetMode || 'days',
        migrationTimestamp: Date.now(),
        migrationSuccess: stats.success || false,
        appVersion: Application.nativeApplicationVersion,
      });

      console.log('✅ Migration metadata stored in Firebase');
    } catch (error) {
      console.error('Failed to store migration metadata:', error);
    }
  }

  /**
   * Get user's logs from Firebase (for remote debugging)
   */
  async getUserLogs(limit = 50) {
    try {
      const logsRef = ref(database, `logs/${this.userId}`);
      const snapshot = await get(query(logsRef, orderByChild('timestamp'), limitToLast(limit)));
      
      if (snapshot.exists()) {
        return Object.values(snapshot.val());
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch user logs:', error);
      return [];
    }
  }
}

// Export singleton instance
export default new ProductionLogger();

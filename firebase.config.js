import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDnbUWLhnJCOvQn_3vNd5ydMJYwbHy5GMo",
  authDomain: "hybridofficetracker.firebaseapp.com",
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "hybridofficetracker",
  storageBucket: "hybridofficetracker.firebasestorage.app",
  messagingSenderId: "822621254921",
  appId: "1:822621254921:web:f35adf00433e3043c1cfd8",
  measurementId: "G-357YX598G4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services - Using Realtime Database
export const database = getDatabase(app);

// Initialize Auth with AsyncStorage persistence for React Native
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Analytics only if supported (web/supported platforms)
let analytics = null;
if (Platform.OS === 'web') {
  // Only initialize analytics on web platform
  isSupported().then(yes => {
    if (yes) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    console.log('Analytics not supported in this environment');
  });
}
export { analytics };

export default app;
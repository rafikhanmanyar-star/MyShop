import { useEffect } from 'react';
import { initializeFirebaseNative } from '../services/firebaseNative';

/** Starts Firebase (Analytics, Crashlytics, FCM) on the Android Capacitor shell. */
export default function FirebaseBootstrap() {
    useEffect(() => {
        void initializeFirebaseNative();
    }, []);
    return null;
}

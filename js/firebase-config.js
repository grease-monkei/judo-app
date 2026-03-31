/**
 * White Rock Judo Club — Firebase Configuration
 * Connects the app to Cloud Firestore for real-time cross-device sync.
 */

const firebaseConfig = {
    apiKey: "AIzaSyAAv7uuPvIpcaXGz7JghcwwV3GdMYt02FQ",
    authDomain: "whiterockjudo-b45c0.firebaseapp.com",
    projectId: "whiterockjudo-b45c0",
    storageBucket: "whiterockjudo-b45c0.firebasestorage.app",
    messagingSenderId: "59862227853",
    appId: "1:59862227853:web:62fc2e97608543f0163bc4"
};

firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();

// Enable offline persistence so the app works without internet
// and syncs automatically when connection is restored
firestore.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Firestore persistence: Multiple tabs open, only one can enable persistence.');
        } else if (err.code === 'unimplemented') {
            console.warn('Firestore persistence: Not supported in this browser.');
        }
    });

console.log('🔥 Firebase initialized for White Rock Judo Club');

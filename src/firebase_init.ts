import { initializeApp } from 'firebase/app';
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

// Firestore holds lobby / game room / game data; the Realtime Database is used
// only for presence, because it has .info/connected and onDisconnect() (see presence.ts).

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD4D_8Vyvk8VqFclkvKzj71WJyOFQrO-iY",               // Retrieve this from your Firebase Console Project Settings
  authDomain: "mayegama-ts.firebaseapp.com",
  projectId: "mayegama-ts",
  storageBucket: "mayegama-ts.firebasestorage.app",
  messagingSenderId: "1083188534909",
  appId: "1:1083188534909:web:5562d3b05b8f547c07db14",                 // Retrieve this from your Firebase Console Project Settings
  databaseURL: "https://mayegama-ts-default-rtdb.firebaseio.com",
  measurementId: "G-8YZDFT2H0L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and Realtime Database
const db = getFirestore(app);
const rtdb = getDatabase(app);

export { app, db, rtdb };

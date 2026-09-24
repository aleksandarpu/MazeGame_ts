import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { getDatabase, ref, set, onValue, onDisconnect, serverTimestamp } from "firebase/database";
/*
Firebase Realtime Database has native presence features (like .info/connected and onDisconnect())
designed specifically for tracking online/offline status.
*/
// Your web app's Firebase configuration
// Some values are pre-filled based on your project!
const firebaseConfig = {
    apiKey: "AIzaSyD4D_8Vyvk8VqFclkvKzj71WJyOFQrO", // Retrieve this from your Firebase Console Project Settings
    authDomain: "mayegama-ts.firebaseapp.com",
    projectId: "mayegama-ts",
    storageBucket: "mayegama-ts.firebasestorage.app",
    messagingSenderId: "1083188534909",
    appId: "1:1083188534909:web:5562d3b05b8f547c07db14", // Retrieve this from your Firebase Console Project Settings
    databaseURL: "https://mayegama-ts-default-rtdb.firebaseio.com"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Cloud Firestore and Realtime Database
const db = getFirestore(app);
const rtdb = getDatabase(app);
export { app, db, rtdb };
// Example: Writing data to your database
export const writeData = async (path, data) => {
    const dbRef = ref(rtdb, path);
    try {
        await set(dbRef, data);
        console.log("Data written successfully!");
    }
    catch (error) {
        console.error("Error writing data: ", error);
    }
};
// Example: Listening for realtime updates
const dataRef = ref(rtdb, "path/to/data");
onValue(dataRef, (snapshot) => {
    const value = snapshot.val();
    console.log("New data from database:", value);
});
export async function saveUserProfile(userId, profileData) {
    const userDocRef = doc(db, "users", userId);
    await setDoc(userDocRef, profileData, { merge: true });
}
export function monitorUserPresence(userId) {
    // .info/connected is a special path that returns true if the client is connected to RTDB
    const connectedRef = ref(rtdb, ".info/connected");
    const userStatusRef = ref(rtdb, `status/${userId}`);
    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            // The client is actively connected
            set(userStatusRef, {
                state: "online",
                lastChanged: serverTimestamp()
            });
            // Queue this write to execute on the Firebase servers automatically 
            // when the client unexpectedly loses connection or closes the app
            onDisconnect(userStatusRef).set({
                state: "offline",
                lastChanged: serverTimestamp()
            });
        }
    });
}

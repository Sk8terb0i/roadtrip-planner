import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAXwr9whNZ-jrZ2s71bBXAmwCPT78WZygk",
  authDomain: "roadtrip-planner-6860e.firebaseapp.com",
  projectId: "roadtrip-planner-6860e",
  storageBucket: "roadtrip-planner-6860e.firebasestorage.app",
  messagingSenderId: "544592275714",
  appId: "1:544592275714:web:e9dd2c4a6351519acb7a1b",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

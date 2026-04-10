import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAXwr9whNZ-jrZ2s71bBXAmwCPT78WZygk",
  authDomain: "roadtrip-planner-6860e.firebaseapp.com",
  projectId: "roadtrip-planner-6860e",
  storageBucket: "roadtrip-planner-6860e.firebasestorage.app",
  messagingSenderId: "544592275714",
  appId: "1:544592275714:web:e9dd2c4a6351519acb7a1b",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// --- Trip Functions ---

export const createTrip = async (tripData) => {
  const docRef = await addDoc(collection(db, "Trips"), tripData);
  return docRef.id;
};

export const getTrips = async () => {
  const q = query(collection(db, "Trips"), orderBy("startDate", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
};

export const getTrip = async (tripId) => {
  const docRef = doc(db, "Trips", tripId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
};

// --- Stops Functions ---

export const addStop = async (tripId, stopData) => {
  const stopsRef = collection(db, "Trips", tripId, "Stops");
  const docRef = await addDoc(stopsRef, stopData);
  return docRef.id;
};

export const getStops = async (tripId) => {
  const q = query(
    collection(db, "Trips", tripId, "Stops"),
    orderBy("day", "asc"),
    orderBy("order", "asc"),
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
};

// Update an existing stop
export const updateStop = async (tripId, stopId, stopData) => {
  const stopRef = doc(db, "Trips", tripId, "Stops", stopId);
  await updateDoc(stopRef, stopData);
};

// Delete a stop
export const deleteStop = async (tripId, stopId) => {
  const stopRef = doc(db, "Trips", tripId, "Stops", stopId);
  await deleteDoc(stopRef);
};

/**
 * Specialized function for dynamic trip card preview.
 * Fetches only the stops marked with the 'bed' (hotel) icon.
 */
export const getTripHotels = async (tripId) => {
  try {
    const q = query(
      collection(db, "Trips", tripId, "Stops"),
      where("icon", "==", "bed"),
      orderBy("day", "asc"),
      orderBy("order", "asc"),
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));
  } catch (error) {
    console.error("Error fetching hotels for preview:", error);
    return [];
  }
};

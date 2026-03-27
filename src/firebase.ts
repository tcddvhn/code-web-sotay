import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import type { FirebaseOptions } from 'firebase/app';

const defaultFirebaseConfig = {
  projectId: 'gen-lang-client-0167602527',
  appId: '1:884763283838:web:7ec28d3355e4c1be1d232f',
  apiKey: 'AIzaSyBH68EBlVOiQo0kYWCceghZoUkhnKE9rjM',
  authDomain: 'gen-lang-client-0167602527.firebaseapp.com',
  messagingSenderId: '884763283838',
  measurementId: '',
};

const envFirebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firebaseConfig = {
  ...defaultFirebaseConfig,
  ...Object.fromEntries(
    Object.entries(envFirebaseConfig).filter(([, value]) => typeof value === 'string' && value.trim() !== ''),
  ),
};

const app = initializeApp(firebaseConfig as FirebaseOptions);
export const auth = getAuth(app);

export const loginWithEmail = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);
export const signUpWithEmail = (email: string, password: string) => createUserWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);

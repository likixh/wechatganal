// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyAf-6ZGbYVFrVxVO5IVCydVPKgh2M0tK18",
    authDomain: "wechatganal.firebaseapp.com",
    projectId: "wechatganal",
    storageBucket: "wechatganal.firebasestorage.app",
    messagingSenderId: "413652415884",
    appId: "1:413652415884:web:ff8c14f128e823b9f992a9",
    measurementId: "G-LHP8FJ1LBG"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
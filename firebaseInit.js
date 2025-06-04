// firebaseInit.js
const firebaseConfig = {
  apiKey: "AIzaSyCS3QI-AHSzzlYT6DZyAsvTTyz4MlZUx2k",
  authDomain: "parallel-translator.firebaseapp.com",
  projectId: "parallel-translator",
  storageBucket: "parallel-translator.firebasestorage.app",
  messagingSenderId: "449814379859",
  appId: "1:449814379859:web:3858a2a57d387b26ae75a6",
  measurementId: "G-FKRR9NG4ST"
};

firebase.initializeApp(firebaseConfig);

// Signal Firebase is ready
window.firebaseReady = true;

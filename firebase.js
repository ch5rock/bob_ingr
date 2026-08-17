/*
  Firebase Console > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성에서
  firebaseConfig 값을 복사해서 아래에 붙여넣으세요.

  이 config 자체는 웹 앱에서 공개되는 값이라 비밀번호가 아닙니다.
  대신 반드시 Firestore Security Rules와 Anonymous Auth를 설정하세요.
*/

export const FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

export const FIREBASE_READY =
  FIREBASE_CONFIG.apiKey &&
  !FIREBASE_CONFIG.apiKey.startsWith("PASTE_") &&
  FIREBASE_CONFIG.projectId &&
  !FIREBASE_CONFIG.projectId.startsWith("PASTE_");

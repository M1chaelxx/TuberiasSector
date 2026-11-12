import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD5ooKRGZoNVGLYMq61P6ZDEFcHcVFpgZQ",
  authDomain: "bd-tuberias.firebaseapp.com",
  projectId: "bd-tuberias",
  storageBucket: "bd-tuberias.firebasestorage.app",
  messagingSenderId: "490401360995",
  appId: "1:490401360995:web:c914c69b20a78410cadc56"
};

const app = initializeApp(firebaseConfig);

// Persistent IndexedDB cache — data stays available across navigations
// without re-fetching from the server each time
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const storage = getStorage(app);

// Autenticación (Firebase Auth). La sesión dura mientras la pestaña esté
// abierta, igual que el login anterior (sessionStorage).
export const auth = getAuth(app);
export const authListo = setPersistence(auth, browserSessionPersistence).catch(() => {});
export { firebaseConfig };

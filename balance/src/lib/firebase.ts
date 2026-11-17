// Connects to the Balance Firebase project and signs in anonymously, so people
// need no account. These values identify the project and are not secrets;
// what protects the data is firestore.rules plus end-to-end encryption.
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyArOxCeE8tk0lR2SCArcFLBASOp-Iwjx28',
  authDomain: 'balance-team.firebaseapp.com',
  projectId: 'balance-team',
  storageBucket: 'balance-team.firebasestorage.app',
  messagingSenderId: '881141683371',
  appId: '1:881141683371:web:868cb12115d0c36d4613ee',
};

export interface Client {
  db: Firestore;
  uid: string;
}

let pending: Promise<Client> | null = null;

/** The signed-in connection, created once. A failed attempt can be retried. */
export function getClient(): Promise<Client> {
  if (!pending) {
    pending = (async () => {
      // A build made with VITE_EMULATOR talks to local emulators under a demo
      // project id, so it can never reach the real project.
      const emulated = Boolean(import.meta.env.VITE_EMULATOR);
      const app = initializeApp(emulated ? { ...firebaseConfig, projectId: 'demo-balance' } : firebaseConfig);
      const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
      const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
      if (emulated) {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        connectFirestoreEmulator(db, '127.0.0.1', 8080);
      }
      await auth.authStateReady();
      const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
      return { db, uid: user.uid };
    })().catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}

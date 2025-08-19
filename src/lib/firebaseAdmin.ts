import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initializeFirebaseAdmin() {
  if (getApps().length > 0) return;

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      initializeApp({
        credential: cert(serviceAccount),
      });
      return;
    }

    // Fallback to application default credentials (e.g., if running on GCP)
    initializeApp({
      credential: applicationDefault(),
    });
  } catch {
    // Last resort: attempt default initialization (may have limited perms)
    initializeApp();
  }
}

initializeFirebaseAdmin();

export const adminDb = getFirestore();



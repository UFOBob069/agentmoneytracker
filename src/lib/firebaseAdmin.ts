import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initializeFirebaseAdmin() {
  if (getApps().length > 0) return;

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    const splitProjectId = process.env.FIREBASE_PROJECT_ID;
    const splitClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const splitPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        // Fix the private key by replacing \\n with actual newlines
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        initializeApp({
          credential: cert(serviceAccount),
        });
        // eslint-disable-next-line no-console
        console.log('[firebase-admin] initialized with FIREBASE_SERVICE_ACCOUNT');
        return;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[firebase-admin] failed to parse FIREBASE_SERVICE_ACCOUNT, falling back to split vars', error);
      }
    }

    if (splitProjectId && splitClientEmail && splitPrivateKey) {
      const pk = splitPrivateKey.replace(/\\n/g, '\n');
      initializeApp({
        credential: cert({
          projectId: splitProjectId,
          clientEmail: splitClientEmail,
          privateKey: pk,
        }),
      });
      // eslint-disable-next-line no-console
      console.log('[firebase-admin] initialized with split env vars (PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY)');
      return;
    }

    // Fallback to ADC if running in an environment that provides it
    initializeApp({
      credential: applicationDefault(),
    });
    // eslint-disable-next-line no-console
    console.log('[firebase-admin] initialized with applicationDefault credentials');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[firebase-admin] initialization failed; attempting bare initializeApp()', err);
    initializeApp();
  }
}

initializeFirebaseAdmin();

export const adminDb = getFirestore();



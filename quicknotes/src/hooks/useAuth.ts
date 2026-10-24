import { useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAppStore } from '../stores/appStore';
import {
  performInitialSync,
  cleanupOnLogout,
  createUserProfile,
  startRealtimeSync,
  stopRealtimeSync,
  DEFAULT_USER_SETTINGS,
} from '../services/firebaseSync';

/**
 * Subscribes to Firebase auth state and runs the initial sync / cleanup.
 * Mount this exactly once (in App) — useAuth() can be used anywhere.
 */
export function useAuthListener() {
  useEffect(() => {
    let wasSignedIn = false;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const store = useAppStore.getState();

      if (firebaseUser) {
        wasSignedIn = true;
        store.setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName ?? undefined,
          photoURL: firebaseUser.photoURL ?? undefined,
          createdAt: Date.now(),
          settings: store.user?.uid === firebaseUser.uid ? store.user.settings : DEFAULT_USER_SETTINGS,
        });
        store.setAuthStatus('authenticated');
        await performInitialSync();
        if (auth.currentUser?.uid === firebaseUser.uid) startRealtimeSync();
      } else {
        stopRealtimeSync();
        if (wasSignedIn) await cleanupOnLogout();
        wasSignedIn = false;
        store.setUser(null);
        store.setAuthStatus('unauthenticated');
      }
    });

    return () => {
      unsubscribe();
      stopRealtimeSync();
    };
  }, []);
}

export function useAuth() {
  const authStatus = useAppStore((state) => state.authStatus);

  const signIn = async (email: string, password: string) => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return user;
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(user, { displayName });
      const current = useAppStore.getState().user;
      if (current?.uid === user.uid) useAppStore.getState().setUser({ ...current, displayName });
    }

    await createUserProfile({
      uid: user.uid,
      email: user.email ?? email,
      displayName,
      createdAt: Date.now(),
      settings: DEFAULT_USER_SETTINGS,
    });

    sendEmailVerification(user).catch((error) => console.warn('Failed to send verification email:', error));
    return user;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  return {
    loading: authStatus === 'loading',
    isAuthenticated: authStatus === 'authenticated',
    signIn,
    signUp,
    signOut,
    resetPassword,
    resendVerification,
  };
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'auth/requires-recent-login': 'Please sign in again to continue.',
  'auth/invalid-api-key': 'Firebase is not configured. Check your .env file.',
};

export function getAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
  return (error as { message?: string })?.message || 'An error occurred';
}

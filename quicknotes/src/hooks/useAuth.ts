import { useEffect, useState } from 'react';
import {
  User as FirebaseUser,
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
import { performInitialSync, cleanupOnLogout, createUserProfile } from '../services/firebaseSync';

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { setUser: setAppUser } = useAppStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        setAppUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email!,
          displayName: firebaseUser.displayName ?? undefined,
          photoURL: firebaseUser.photoURL ?? undefined,
          createdAt: Date.now(),
          settings: {
            theme: 'system',
            shortcutsEnabled: true,
            autoSaveDelay: 1500,
            sortOrder: 'manual',
          },
        });
        await performInitialSync();
      } else {
        await cleanupOnLogout();
        setAppUser(null);
      }
    });

    return () => unsubscribe();
  }, [setAppUser]);

  const signIn = async (email: string, password: string) => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return user;
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(user, { displayName });
    }
    await sendEmailVerification(user);
    
    // Create user profile in Firestore
    await createUserProfile({
      uid: user.uid,
      email: user.email!,
      displayName,
      createdAt: Date.now(),
      settings: {
        theme: 'system',
        shortcutsEnabled: true,
        autoSaveDelay: 1500,
        sortOrder: 'manual',
      },
    });
    
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
    user,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    resendVerification,
    isAuthenticated: !!user,
  };
}
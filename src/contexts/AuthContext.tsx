import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged, browserPopupRedirectResolver } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  toggleOnlineStatus: (show: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Update user profile in Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          
          const userData = {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'User',
            displayNameLower: (currentUser.displayName || 'User').toLowerCase(),
            email: currentUser.email || `user-${currentUser.uid}@example.com`,
            emailLower: (currentUser.email || `user-${currentUser.uid}@example.com`).toLowerCase(),
            photoURL: currentUser.photoURL || '',
            lastSeen: serverTimestamp(),
            status: userSnap.exists() && userSnap.data().showOnlineStatus === false ? 'offline' : 'online',
            showOnlineStatus: userSnap.exists() ? userSnap.data().showOnlineStatus ?? true : true
          };

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              ...userData,
              createdAt: serverTimestamp()
            });
          } else {
            await setDoc(userRef, userData, { merge: true });
          }
        } catch (error) {
          console.error("Error updating user profile:", error);
        }
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google:", error);
    }
  };

  const toggleOnlineStatus = async (show: boolean) => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { 
        showOnlineStatus: show,
        status: show ? 'online' : 'offline',
        lastSeen: serverTimestamp()
      }, { merge: true });
    }
  };

  const logout = async () => {
    try {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { status: 'offline', lastSeen: serverTimestamp() }, { merge: true });
      }
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout, toggleOnlineStatus }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

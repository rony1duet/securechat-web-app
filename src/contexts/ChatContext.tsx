import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import Fuse from 'fuse.js';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, setDoc, addDoc, updateDoc, serverTimestamp, Timestamp, writeBatch, deleteField, getDocs, limit, Firestore, startAt, endAt } from 'firebase/firestore';
import { db, dbDefault, dbNamed } from '../lib/firebase';
import { useAuth } from './AuthContext';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  displayNameLower?: string;
  emailLower?: string;
  photoURL: string;
  lastSeen: Timestamp;
  status: 'online' | 'offline';
  showOnlineStatus?: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessageId?: string;
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: Timestamp;
    status?: 'sent' | 'delivered' | 'seen';
  };
  updatedAt: Timestamp;
  createdAt: Timestamp;
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: Timestamp;
  status?: 'sent' | 'delivered' | 'seen';
  imageUrl?: string;
  isDeleted?: boolean;
}

interface ChatContextType {
  chats: Chat[];
  activeChat: Chat | null;
  setActiveChat: (chat: Chat | null) => void;
  activeDb: Firestore;
  messages: Message[];
  users: Record<string, UserProfile>;
  typingStatus: Record<string, boolean>;
  setTyping: (isTyping: boolean) => Promise<void>;
  sendMessage: (text: string, imageUrl?: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  startChat: (userId: string) => Promise<void>;
  searchUsers: (query: string) => Promise<UserProfile[]>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null, user?: any) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid,
      email: user?.email,
      emailVerified: user?.emailVerified,
      isAnonymous: user?.isAnonymous,
      tenantId: user?.tenantId,
      providerInfo: user?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the whole app, but we log it clearly
};

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const [typingStatus, setTypingStatus] = useState<Record<string, boolean>>({});

  const sortChatsByUpdatedAtDesc = (items: Chat[]) => {
    return [...items].sort((a, b) => {
      const aMs = a.updatedAt?.toMillis?.() ?? 0;
      const bMs = b.updatedAt?.toMillis?.() ?? 0;
      return bMs - aMs;
    });
  };

  // Fetch all users for quick lookup and ensure chat participants are loaded
  useEffect(() => {
    if (!user) {
      setUsers({});
      return;
    }

    // 1. Initial fetch of some users
    const usersQuery = query(collection(db, 'users'), limit(100));
    const unsubscribeInitial = onSnapshot(
      usersQuery,
      (snapshot) => {
        setUsers(prev => {
          const next = { ...prev };
          snapshot.forEach((userDoc) => {
            next[userDoc.id] = userDoc.data() as UserProfile;
          });
          return next;
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users', user);
      }
    );

    // 2. Listen for participants in current chats
    const participantIds = new Set<string>();
    chats.forEach(chat => {
      chat.participants.forEach(pId => {
        if (pId !== user.uid) participantIds.add(pId);
      });
    });

    const participantIdsStr = Array.from(participantIds).sort().join(',');

    const unsubscribers: (() => void)[] = [];
    
    // Fetch missing participants
    participantIds.forEach(pId => {
      if (!users[pId]) {
        const unsub = onSnapshot(doc(db, 'users', pId), (docSnap) => {
          if (docSnap.exists()) {
            setUsers(prev => ({
              ...prev,
              [pId]: docSnap.data() as UserProfile
            }));
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${pId}`, user);
        });
        unsubscribers.push(unsub);
      }
    });

    return () => {
      unsubscribeInitial();
      unsubscribers.forEach(u => u());
    };
  }, [user, chats.map(c => c.id).join(',')]); // Re-run when user changes or chats list changes

  // Fetch user's chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }

    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const fallbackQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    let fallbackUnsubscribe: (() => void) | null = null;

    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const chatsData: Chat[] = [];
        snapshot.forEach((chatDoc) => {
          chatsData.push({ id: chatDoc.id, ...chatDoc.data() } as Chat);
        });
        setChats(chatsData);
      },
      (error) => {
        console.warn('Chats query failed; falling back without orderBy:', error);
        if (fallbackUnsubscribe) return;
        fallbackUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
          const chatsData: Chat[] = [];
          snapshot.forEach((chatDoc) => {
            chatsData.push({ id: chatDoc.id, ...chatDoc.data() } as Chat);
          });
          setChats(sortChatsByUpdatedAtDesc(chatsData));
        }, (fallbackError) => {
          handleFirestoreError(fallbackError, OperationType.LIST, 'chats', user);
          setChats([]);
        });
      }
    );

    return () => {
      unsubscribe();
      if (fallbackUnsubscribe) {
        fallbackUnsubscribe();
      }
    };
  }, [user]);

  // Fetch messages for active chat
  useEffect(() => {
    if (!user || !activeChat) {
      setMessages([]);
      return;
    }

    const path = `chats/${activeChat.id}/messages`;
    const q = query(
      collection(db, path),
      orderBy('timestamp', 'asc')
    );

    const fallbackQ = query(
      collection(db, path)
    );

    let fallbackUnsubscribe: (() => void) | null = null;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
    }, (error) => {
      console.warn('Messages query failed; falling back without orderBy:', error);
      if (fallbackUnsubscribe) return;
      
      fallbackUnsubscribe = onSnapshot(fallbackQ, (snapshot) => {
        const msgs: Message[] = [];
        snapshot.forEach((doc) => {
          msgs.push({ id: doc.id, ...doc.data() } as Message);
        });
        // Sort manually by timestamp
        const sortedMsgs = msgs.sort((a, b) => {
          const aTime = a.timestamp?.toMillis?.() ?? 0;
          const bTime = b.timestamp?.toMillis?.() ?? 0;
          return aTime - bTime;
        });
        setMessages(sortedMsgs);
      }, (fallbackError) => {
        handleFirestoreError(fallbackError, OperationType.LIST, path, user);
        setMessages([]);
      });
    });

    return () => {
      unsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  }, [user, activeChat]);

  // Mark messages as seen
  useEffect(() => {
    if (!activeChat || !user || messages.length === 0) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    
    const unreadMessages = messages.filter(m => m.senderId !== user.uid && m.status !== 'seen');
    
    if (unreadMessages.length > 0) {
      const batch = writeBatch(db);
      unreadMessages.forEach(m => {
        batch.update(doc(db, `chats/${activeChat.id}/messages/${m.id}`), { status: 'seen' });
      });
      batch.commit()
        .then(async () => {
          if (activeChat.lastMessageId && unreadMessages.some(m => m.id === activeChat.lastMessageId)) {
            await updateDoc(doc(db, 'chats', activeChat.id), { 'lastMessage.status': 'seen' });
          }
        })
        .catch((error) => {
          handleFirestoreError(error, OperationType.UPDATE, `chats/${activeChat.id}/messages`, user);
        });
    }
  }, [messages, activeChat, user]);

  // When the current user is online in the app, mark incoming "sent" messages as "delivered" in realtime
  useEffect(() => {
    if (!user || chats.length === 0) return;
    const unsubscribers = chats.map((chat) => {
      if (!chat.participants.includes(user.uid)) {
        return () => {};
      }

      const path = `chats/${chat.id}/messages`;
      const sentMessagesQuery = query(
        collection(db, path),
        where('status', '==', 'sent')
      );

      return onSnapshot(sentMessagesQuery, async (snapshot) => {
        const incomingSentMessages = snapshot.docs.filter(
          (messageDoc) => messageDoc.data().senderId !== user.uid
        );

        if (incomingSentMessages.length === 0) return;

        try {
          const batch = writeBatch(db);
          incomingSentMessages.forEach((messageDoc) => {
            batch.update(messageDoc.ref, { status: 'delivered' });
          });
          await batch.commit();

          if (chat.lastMessageId && incomingSentMessages.some((messageDoc) => messageDoc.id === chat.lastMessageId)) {
            await updateDoc(doc(db, 'chats', chat.id), { 'lastMessage.status': 'delivered' });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path, user);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, path, user);
      });
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [chats, user]);

  // Listen for typing status across all chats
  useEffect(() => {
    if (!user || chats.length === 0) {
      setTypingStatus({});
      return;
    }

    const unsubscribers = chats.map((chat) => {
      const typingRef = collection(db, 'chats', chat.id, 'typing');
      return onSnapshot(typingRef, (snapshot) => {
        setTypingStatus(prev => {
          let isAnyoneTypingInThisChat = false;
          snapshot.forEach((doc) => {
            if (doc.id !== user.uid) {
              const data = doc.data();
              const updatedAt = data.updatedAt as Timestamp;
              if (updatedAt) {
                const now = Date.now();
                const lastUpdate = updatedAt.toMillis();
                if (now - lastUpdate < 10000 && data.isTyping) {
                  isAnyoneTypingInThisChat = true;
                }
              }
            }
          });
          
          if (prev[chat.id] === isAnyoneTypingInThisChat) return prev;
          return { ...prev, [chat.id]: isAnyoneTypingInThisChat };
        });
      }, (error) => {
        console.warn(`Typing listener failed for chat ${chat.id}:`, error);
      });
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [chats, user]);

  const setTyping = async (isTyping: boolean) => {
    if (!activeChat || !user) return;

    try {
      const typingDocRef = doc(db, 'chats', activeChat.id, 'typing', user.uid);
      await setDoc(typingDocRef, {
        isTyping,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error('Error setting typing status:', error);
    }
  };

  const sendMessage = async (text: string, imageUrl?: string) => {
    if (!user || !activeChat || (!text.trim() && !imageUrl)) return;

    const path = `chats/${activeChat.id}/messages`;
    try {
      const otherUserId = activeChat.participants.find((participantId) => participantId !== user.uid);
      const otherUser = otherUserId ? users[otherUserId] : null;
      const initialStatus: Message['status'] = otherUser?.status === 'online' ? 'delivered' : 'sent';

      // Add message
      const messageRef = await addDoc(collection(db, path), {
        text,
        senderId: user.uid,
        timestamp: serverTimestamp(),
        status: initialStatus,
        ...(imageUrl ? { imageUrl } : {})
      });

      // Update chat lastMessage
      await setDoc(doc(db, 'chats', activeChat.id), {
        lastMessageId: messageRef.id,
        lastMessage: {
          text: imageUrl ? (text ? `📷 ${text}` : '📷 Image') : text,
          senderId: user.uid,
          timestamp: serverTimestamp(),
          status: initialStatus
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Clear typing status after sending message
      await setTyping(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path, user);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user || !activeChat) return;
    const path = `chats/${activeChat.id}/messages/${messageId}`;
    try {
      await setDoc(doc(db, path), {
        text: 'This message was deleted',
        imageUrl: deleteField(),
        isDeleted: true
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path, user);
    }
  };

  const startChat = async (otherUserId: string) => {
    if (!user) return;

    // Check if chat already exists
    const existingChat = chats.find(c => 
      c.participants.includes(otherUserId) && c.participants.length === 2
    );

    if (existingChat) {
      setActiveChat(existingChat);
      return;
    }

    // Create new chat
    try {
      const newChatRef = await addDoc(collection(db, 'chats'), {
        participants: [user.uid, otherUserId],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      const chatDoc = await getDoc(newChatRef);
      setActiveChat({ id: chatDoc.id, ...chatDoc.data() } as Chat);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats', user);
    }
  };

  const searchUsers = async (searchQuery: string) => {
    if (!searchQuery.trim() || !user) return [];

    const normalized = searchQuery.trim().toLowerCase();
    const usersRef = collection(db, 'users');

    try {
      // 1. Fetch candidates by prefix on displayNameLower
      const nameQuery = query(
        usersRef,
        orderBy('displayNameLower'),
        startAt(normalized),
        endAt(`${normalized}\uf8ff`),
        limit(20)
      );

      // 2. Fetch candidates by prefix on emailLower
      const emailQuery = query(
        usersRef,
        orderBy('emailLower'),
        startAt(normalized),
        endAt(`${normalized}\uf8ff`),
        limit(20)
      );

      // 3. Fetch by exact UID
      const uidQuery = query(
        usersRef,
        where('uid', '==', searchQuery.trim()),
        limit(1)
      );

      const [nameSnap, emailSnap, uidSnap] = await Promise.all([
        getDocs(nameQuery),
        getDocs(emailQuery),
        getDocs(uidQuery)
      ]);

      // Merge results
      const candidateMap = new Map<string, UserProfile>();
      
      [...nameSnap.docs, ...emailSnap.docs, ...uidSnap.docs].forEach(d => {
        const profile = d.data() as UserProfile;
        if (profile.uid && profile.uid !== user.uid) {
          candidateMap.set(profile.uid, profile);
        }
      });

      let candidates = Array.from(candidateMap.values());

      // If we don't have enough candidates, fetch some recent users as additional fuzzy search pool
      if (candidates.length < 10) {
        const recentUsersQuery = query(usersRef, limit(50));
        const recentSnap = await getDocs(recentUsersQuery);
        recentSnap.docs.forEach(d => {
          const profile = d.data() as UserProfile;
          if (profile.uid && profile.uid !== user.uid && !candidateMap.has(profile.uid)) {
            candidates.push(profile);
          }
        });
      }

      // Use Fuse for fuzzy matching and ranking
      if (candidates.length > 0) {
        const fuse = new Fuse(candidates, {
          keys: ['displayName', 'email', 'uid'],
          threshold: 0.4, // Adjust for more/less fuzziness
          includeScore: true
        });

        const results = fuse.search(searchQuery);
        return results.map(r => r.item);
      }

      return [];
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users', user);
      return [];
    }
  };

  return (
    <ChatContext.Provider value={{
      chats,
      activeChat,
      setActiveChat,
      activeDb: db,
      messages,
      users,
      typingStatus,
      setTyping,
      sendMessage,
      deleteMessage,
      startChat,
      searchUsers
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

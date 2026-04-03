import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat, UserProfile, Chat } from '../contexts/ChatContext';
import { useTheme } from '../contexts/ThemeContext';
import { Search, LogOut, Settings, User, MessageCircle, Check, CheckCheck, Moon, Sun, Monitor, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../contexts/ChatContext';

interface SidebarChatMeta {
  text: string;
  senderId: string;
  status?: 'sent' | 'delivered' | 'seen';
  timestamp?: Date;
  unreadCount: number;
}

import TypingIndicator from './TypingIndicator';

export default function Sidebar() {
  const { user, logout, toggleOnlineStatus } = useAuth();
  const { chats, activeChat, setActiveChat, users, searchUsers, startChat, typingStatus } = useChat();
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatMeta, setChatMeta] = useState<Record<string, SidebarChatMeta>>({});
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get current user's profile to check showOnlineStatus
  const currentUserProfile = user ? users[user.uid] : null;
  const isOnlineStatusVisible = currentUserProfile?.showOnlineStatus ?? true;

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim()) {
      setIsSearching(true);
      setIsLoadingSearch(true);
      
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const results = await searchUsers(query);
          setSearchResults(results);
        } finally {
          setIsLoadingSearch(false);
        }
      }, 300);
    } else {
      setIsSearching(false);
      setIsLoadingSearch(false);
      setSearchResults([]);
    }
  };

  const handleStartChat = async (otherUserId: string) => {
    await startChat(otherUserId);
    setSearchQuery('');
    setIsSearching(false);
  };

  const getOtherUser = (chat: Chat) => {
    if (!user) return null;
    const otherUserId = chat.participants.find(id => id !== user.uid);
    return otherUserId ? users[otherUserId] : null;
  };

  useEffect(() => {
    if (!user || chats.length === 0) {
      setChatMeta({});
      return;
    }

    const unsubscribers = chats.map((chat) => {
      const messagesQuery = query(
        collection(db, `chats/${chat.id}/messages`),
        orderBy('timestamp', 'desc')
      );

      const fallbackQuery = query(
        collection(db, `chats/${chat.id}/messages`)
      );

      const handleSnapshot = (snapshot: any) => {
        if (snapshot.empty) {
          setChatMeta((prev) => {
            const next = { ...prev };
            delete next[chat.id];
            return next;
          });
          return;
        }

        const docs = snapshot.docs;
        // If it's the fallback query, we need to sort manually to get the latest
        const sortedDocs = snapshot.query === fallbackQuery 
          ? [...docs].sort((a, b) => (b.data().timestamp?.toMillis?.() ?? 0) - (a.data().timestamp?.toMillis?.() ?? 0))
          : docs;

        const latest = sortedDocs[0].data() as {
          text?: string;
          imageUrl?: string;
          senderId: string;
          status?: 'sent' | 'delivered' | 'seen';
          timestamp?: { toDate?: () => Date };
        };

        const unreadCount = docs.reduce((count: number, messageDoc: any) => {
          const message = messageDoc.data() as { senderId: string; status?: string };
          if (message.senderId !== user.uid && message.status !== 'seen') {
            return count + 1;
          }
          return count;
        }, 0);

        const previewText = latest.text && latest.text.trim().length > 0
          ? latest.text
          : latest.imageUrl
            ? '📷 Image'
            : 'No messages yet';

        setChatMeta((prev) => ({
          ...prev,
          [chat.id]: {
            text: previewText,
            senderId: latest.senderId,
            status: latest.status,
            timestamp: latest.timestamp?.toDate ? latest.timestamp.toDate() : undefined,
            unreadCount
          }
        }));
      };

      let fallbackUnsub: (() => void) | null = null;

      const unsub = onSnapshot(messagesQuery, handleSnapshot, (error) => {
        console.warn(`Sidebar messages listener failed for chat ${chat.id}:`, error);
        handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/messages`, user);
        if (!fallbackUnsub) {
          fallbackUnsub = onSnapshot(fallbackQuery, handleSnapshot, (err) => {
            console.error(`Sidebar fallback messages listener failed for chat ${chat.id}:`, err);
            handleFirestoreError(err, OperationType.LIST, `chats/${chat.id}/messages`, user);
          });
        }
      });

      return () => {
        unsub();
        if (fallbackUnsub) (fallbackUnsub as () => void)();
      };
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [chats, user]);

  return (
    <div className={cn(
      "w-full md:w-80 lg:w-96 bg-white dark:bg-[#17212b] border-r border-slate-200 dark:border-black/20 flex-col h-full shrink-0 relative overflow-hidden",
      activeChat ? "hidden md:flex" : "flex"
    )}>
      {/* Settings Sliding Window */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-white dark:bg-[#17212b] flex flex-col"
          >
            <div className="p-4 flex items-center gap-4 border-b border-slate-200 dark:border-black/20 bg-white dark:bg-[#17212b]">
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {/* Profile Section */}
              <div className="flex flex-col items-center text-center">
                <div className="relative group">
                  <div className="w-28 h-28 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center overflow-hidden border-4 border-white dark:border-[#242f3d] shadow-xl transition-transform group-hover:scale-105">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-12 h-12 text-blue-500 dark:text-blue-400" />
                    )}
                  </div>
                </div>
                <h3 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{user?.displayName}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{user?.email}</p>
              </div>

              {/* Settings Groups */}
              <div className="space-y-6">
                {/* Appearance Group */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] px-1">Appearance</h4>
                  <div className="bg-slate-50 dark:bg-[#242f3d] rounded-2xl p-1.5 flex gap-1 shadow-inner">
                    {[
                      { id: 'light', icon: Sun, label: 'Light' },
                      { id: 'dark', icon: Moon, label: 'Dark' },
                      { id: 'system', icon: Monitor, label: 'Auto' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id as any)}
                        className={cn(
                          "flex-1 flex flex-col items-center justify-center py-3 rounded-xl text-xs font-semibold transition-all",
                          theme === t.id 
                            ? "bg-white dark:bg-[#17212b] text-blue-500 shadow-md scale-[1.02]" 
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                      >
                        <t.icon className="w-5 h-5 mb-1.5" />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Privacy Group */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] px-1">Privacy & Security</h4>
                  <div className="bg-slate-50 dark:bg-[#242f3d] rounded-2xl divide-y divide-slate-200/50 dark:divide-white/5 overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between p-4 hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                          {isOnlineStatusVisible ? <Eye className="w-5 h-5 text-blue-500" /> : <EyeOff className="w-5 h-5 text-slate-400" />}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">Online Status</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Show when you're active</div>
                        </div>
                      </div>
                      <button 
                        onClick={() => toggleOnlineStatus(!isOnlineStatusVisible)}
                        className={cn(
                          "w-11 h-6 rounded-full transition-all relative",
                          isOnlineStatusVisible ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                          isOnlineStatusVisible ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Account Actions */}
                <div className="space-y-3 pt-2">
                  <button 
                    onClick={logout}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-[#242f3d] hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all group shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                        <LogOut className="w-5 h-5 text-red-500" />
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-red-500 transition-colors">Log Out</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header / Profile Section */}
      <div className="p-4 border-b border-slate-200 dark:border-black/20 bg-white dark:bg-[#17212b] sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-3 group text-left min-w-0"
          >
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center overflow-hidden border border-blue-200 dark:border-blue-500/30 transition-transform group-hover:scale-105">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                )}
              </div>
              <div className={cn(
                "absolute bottom-0 right-0 w-3 h-3 border-2 border-white dark:border-[#17212b] rounded-full",
                isOnlineStatusVisible ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">
                {user?.displayName || 'My Profile'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate uppercase tracking-wider font-semibold">
                {isOnlineStatusVisible ? 'Online' : 'Invisible'}
              </div>
            </div>
          </button>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-full transition-all"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Search people..."
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-slate-100 dark:bg-[#242f3d] text-slate-900 dark:text-slate-200 rounded-2xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/20 border border-transparent focus:border-blue-500/50 text-sm transition-all placeholder:text-slate-500"
          />
          {searchQuery && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setIsSearching(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4 rotate-90" />
            </button>
          )}
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isSearching ? (
          <div className="p-3 space-y-1">
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">Search Results</h3>
              {isLoadingSearch && (
                <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
              )}
            </div>
            {isLoadingSearch && searchResults.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Searching...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No users found</p>
                <p className="text-xs text-slate-400 mt-1">Try searching by full name or email</p>
              </div>
            ) : (
              searchResults.map(u => (
                <button
                  key={u.uid}
                  onClick={() => handleStartChat(u.uid)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-2xl transition-all group text-left"
                >
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0 border border-slate-200 dark:border-white/10 shadow-sm">
                      {u.photoURL ? (
                        <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-lg">
                          {u.displayName?.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    {u.status === 'online' && u.showOnlineStatus !== false && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#17212b] rounded-full shadow-sm" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[15px] text-slate-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">{u.displayName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="p-2">
            {chats.length === 0 ? (
              <div className="text-center py-12 px-4 flex flex-col items-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-slate-600 dark:text-slate-400 font-medium">No chats yet</p>
                <p className="text-slate-500 text-sm mt-1">Search for a user to start messaging.</p>
              </div>
            ) : (
              chats.map(chat => {
                const otherUser = getOtherUser(chat);
                const otherUserId = chat.participants.find(id => id !== user?.uid);
                
                // If we don't have the user profile yet, we still show the chat item
                // but with placeholder data. The ChatContext will fetch the profile.
                const displayName = otherUser?.displayName || 'User';
                const photoURL = otherUser?.photoURL;
                const isOtherUserOnline = otherUser?.status === 'online' && (otherUser?.showOnlineStatus !== false);
                
                const liveMeta = chatMeta[chat.id];
                const fallbackTime = chat.lastMessage?.timestamp ? chat.lastMessage.timestamp.toDate() : undefined;
                const previewTimestamp = liveMeta?.timestamp || fallbackTime;
                const previewSenderId = liveMeta?.senderId || chat.lastMessage?.senderId;
                const previewStatus = liveMeta?.status || chat.lastMessage?.status;
                const previewText = liveMeta?.text || chat.lastMessage?.text || 'No messages yet';
                const unreadCount = liveMeta?.unreadCount || 0;
                
                const isTyping = typingStatus[chat.id];
                
                const isActive = activeChat?.id === chat.id;
                const hasUnread = !isActive && unreadCount > 0;
                
                return (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 text-left mb-1",
                      isActive 
                        ? "bg-blue-500 text-white dark:bg-[#2b5278]" 
                        : hasUnread
                          ? "bg-blue-50/70 dark:bg-blue-500/10 hover:bg-blue-100/70 dark:hover:bg-blue-500/20"
                          : "hover:bg-slate-50 dark:hover:bg-[#242f3d]"
                    )}
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-sm">
                        {photoURL ? (
                          <img src={photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600 dark:text-slate-300 font-medium text-base">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      {isOtherUserOnline && (
                        <div className={cn(
                          "absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 rounded-full",
                          isActive ? "border-blue-500 dark:border-[#2b5278]" : "border-white dark:border-[#17212b]"
                        )}></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className={cn(
                          "font-medium text-sm truncate",
                          isActive ? "text-white" : hasUnread ? "text-slate-900 dark:text-white font-semibold" : "text-slate-900 dark:text-slate-200"
                        )}>
                          {displayName}
                        </span>
                        {previewTimestamp && (
                          <span className={cn(
                            "text-xs shrink-0 ml-2",
                            isActive ? "text-blue-100 dark:text-blue-200" : "text-slate-500"
                          )}>
                            {formatDistanceToNow(previewTimestamp, { addSuffix: false })}
                          </span>
                        )}
                      </div>
                      <div className={cn(
                        "text-xs truncate flex items-center gap-1",
                        isActive ? "text-blue-100" : hasUnread ? "text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"
                      )}>
                        {isTyping ? (
                          <div className="flex items-center gap-1.5">
                            <TypingIndicator compact />
                            <span className={cn("font-medium", isActive ? "text-blue-100" : "text-blue-500")}>typing...</span>
                          </div>
                        ) : previewSenderId ? (
                          <>
                            {previewSenderId === user?.uid && (
                              <span className="shrink-0">
                                {previewStatus === 'seen' ? (
                                  <CheckCheck className={cn("w-3.5 h-3.5", isActive ? "text-blue-100 dark:text-blue-200" : "text-blue-500 dark:text-blue-400")} />
                                ) : previewStatus === 'delivered' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                )}
                              </span>
                            )}
                            <span className={cn("truncate", hasUnread && previewSenderId !== user?.uid && "font-semibold")}>{previewText}</span>
                          </>
                        ) : (
                          <span className="italic">No messages yet</span>
                        )}

                        {!isActive && unreadCount > 0 && (
                          <span className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-blue-500 text-white text-[10px] font-semibold flex items-center justify-center">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

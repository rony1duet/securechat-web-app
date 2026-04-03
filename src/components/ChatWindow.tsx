import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useChat, Message } from '../contexts/ChatContext';
import { useTheme } from '../contexts/ThemeContext';
import { Send, Image as ImageIcon, Smile, Paperclip, ChevronLeft, Check, CheckCheck, Phone, Video, X, Trash2 } from 'lucide-react';
import { useCall } from '../contexts/CallContext';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import EmojiPicker, { Theme } from 'emoji-picker-react';

import TypingIndicator from './TypingIndicator';

export default function ChatWindow() {
  const { user } = useAuth();
  const { activeChat, setActiveChat, messages, users, sendMessage, deleteMessage, typingStatus, setTyping } = useChat();
  const { startCall } = useCall();
  const { resolvedTheme } = useTheme();
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedImage, showEmojiPicker, typingStatus]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [newMessage]);

  // Handle typing status
  useEffect(() => {
    if (!newMessage.trim()) {
      setTyping(false);
      return;
    }

    setTyping(true);
    const timeout = setTimeout(() => {
      setTyping(false);
    }, 3000);

    return () => {
      clearTimeout(timeout);
    };
  }, [newMessage]);

  if (!activeChat || !user) {
    return (
      <div className="hidden md:flex flex-1 bg-slate-50 dark:bg-slate-950 flex-col items-center justify-center text-slate-500 p-8 text-center">
        <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-slate-200 dark:shadow-slate-900/50">
          <svg className="w-12 h-12 text-slate-400 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-300 mb-2">Select a chat to start messaging</h2>
        <p className="max-w-md text-slate-500">Choose an existing conversation from the sidebar or search for a user to start a new one.</p>
      </div>
    );
  }

  const otherUserId = activeChat.participants.find(id => id !== user.uid);
  const otherUser = otherUserId ? users[otherUserId] : null;
  const displayName = otherUser?.displayName || 'User';
  const isTyping = typingStatus[activeChat.id];
  const canShowOtherUserPresence = otherUser?.showOnlineStatus !== false;
  const isOtherUserOnline = canShowOtherUserPresence && otherUser?.status === 'online';
  const otherUserStatusText = canShowOtherUserPresence
    ? isOtherUserOnline
      ? 'Online'
      : otherUser?.lastSeen
        ? `Last seen ${formatDistanceToNow(otherUser.lastSeen.toDate(), { addSuffix: true })}`
        : 'Offline'
    : '';

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedImage) return;
    
    await sendMessage(newMessage, selectedImage || undefined);
    setNewMessage('');
    setSelectedImage(null);
    setShowEmojiPicker(false);
  };

  const handleEmojiClick = (emojiData: any) => {
    setNewMessage((prev) => prev + emojiData.emoji);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Compress image to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.7 quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setSelectedImage(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn(
      "flex-1 flex-col h-full bg-slate-50 dark:bg-[#0e1621] relative overflow-hidden",
      activeChat ? "flex" : "hidden md:flex"
    )}>
      {/* Chat Header */}
      <div className="h-16 glass sticky top-0 z-20 flex items-center justify-between px-4 md:px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={() => setActiveChat(null)}
            className="md:hidden p-2 -ml-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-sm border border-slate-200 dark:border-white/10">
              {otherUser?.photoURL ? (
                <img src={otherUser.photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600 dark:text-slate-300 font-medium">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {isOtherUserOnline && (
              <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#17212b] rounded-full shadow-sm"></div>
            )}
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="font-semibold text-slate-900 dark:text-white text-[15px] leading-tight">{displayName}</h2>
            {otherUserStatusText && (
              <p className={cn(
                "text-[11px] mt-0.5",
                isOtherUserOnline ? "text-green-500 font-medium" : "text-slate-500 dark:text-slate-400"
              )}>
                {otherUserStatusText}
              </p>
            )}
          </div>
        </div>

        {/* Call Actions */}
        <div className="flex items-center gap-1 md:gap-2">
          <button 
            onClick={() => otherUserId && startCall(activeChat.id, otherUserId, false)}
            className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            title="Audio Call"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button 
            onClick={() => otherUserId && startCall(activeChat.id, otherUserId, true)}
            className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            title="Video Call"
          >
            <Video className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar scroll-smooth relative"
        style={{
          backgroundImage: resolvedTheme === 'dark' 
            ? `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231e293b' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            : `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => {
            const isMe = msg.senderId === user.uid;
            const showAvatar = !isMe && (index === 0 || messages[index - 1].senderId !== msg.senderId);
            const isConsecutive = index > 0 && messages[index - 1].senderId === msg.senderId;
            
            return (
              <motion.div
                key={msg.id}
                initial={{ 
                  opacity: 0, 
                  x: isMe ? 20 : -20, 
                  y: 10,
                  scale: 0.95 
                }}
                animate={{ 
                  opacity: 1, 
                  x: 0, 
                  y: 0,
                  scale: 1 
                }}
                transition={{ 
                  type: "spring",
                  stiffness: 260,
                  damping: 20,
                  duration: 0.3
                }}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
                className={cn(
                  "flex w-full group relative",
                  isMe ? "justify-end" : "justify-start",
                  isConsecutive ? "mt-1" : "mt-4"
                )}
              >
                <div className={cn(
                  "flex max-w-[85%] md:max-w-[70%] relative",
                  isMe ? "flex-row-reverse" : "flex-row"
                )}>
                  {/* Avatar for other user */}
                  {!isMe && (
                    <div className="w-8 shrink-0 mr-3 flex flex-col justify-end">
                      {showAvatar ? (
                        otherUser?.photoURL ? (
                          <img src={otherUser.photoURL} alt="" className="w-8 h-8 rounded-full object-cover shadow-sm border border-slate-200 dark:border-transparent" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-medium shadow-sm">
                            {otherUser?.displayName?.charAt(0).toUpperCase()}
                          </div>
                        )
                      ) : (
                        <div className="w-8 h-8" /> // Spacer for alignment
                      )}
                    </div>
                  )}

                  {/* Delete Button */}
                  {isMe && hoveredMessageId === msg.id && !msg.isDeleted && (
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="absolute -left-12 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors bg-white/80 dark:bg-[#17212b]/80 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 shadow-sm border border-slate-200 dark:border-transparent"
                      title="Delete message"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Message Bubble */}
                  <div className={cn(
                    "relative px-4 py-2.5 shadow-sm transition-all",
                    msg.isDeleted 
                      ? "bg-slate-100 dark:bg-[#18222d]/50 text-slate-500 dark:text-slate-400 italic border border-slate-200 dark:border-black/20"
                      : isMe 
                        ? "bg-blue-500 text-white shadow-blue-500/10" 
                        : "bg-white dark:bg-[#18222d] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-white/5",
                    // Dynamic border radius based on consecutive messages
                    isMe 
                      ? cn("rounded-2xl rounded-tr-sm", isConsecutive && "rounded-tr-2xl rounded-br-sm")
                      : cn("rounded-2xl rounded-tl-sm", isConsecutive && "rounded-tl-2xl rounded-bl-sm")
                  )}>
                    {msg.imageUrl && !msg.isDeleted && (
                      <div 
                        className="mb-2 -mx-2 -mt-1 overflow-hidden rounded-xl bg-black/5 dark:bg-black/10 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setViewingImage(msg.imageUrl!)}
                      >
                        <img src={msg.imageUrl} alt="Attachment" className="max-w-full h-auto max-h-72 object-contain" />
                      </div>
                    )}
                    {msg.text && (
                      <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
                    )}
                    <div className={cn(
                      "text-[10px] mt-1.5 flex items-center justify-end gap-1.5 select-none",
                      msg.isDeleted ? "text-slate-400 dark:text-slate-500" : isMe ? "text-blue-100 dark:text-blue-200/80" : "text-slate-400"
                    )}>
                      {msg.timestamp && format(msg.timestamp.toDate(), 'h:mm a')}
                      {isMe && !msg.isDeleted && (
                        <span className="ml-0.5">
                          {msg.status === 'seen' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-400 dark:text-sky-300" />
                          ) : msg.status === 'delivered' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start mt-4"
          >
            <TypingIndicator />
          </motion.div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* Input Area */}
      <div className="p-3 md:p-4 glass shrink-0 relative z-20">
        {/* Image Preview */}
        {selectedImage && (
          <div className="absolute bottom-full left-4 mb-4 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex items-start gap-2 animate-in slide-in-from-bottom-2">
            <img src={selectedImage} alt="Preview" className="h-24 w-auto rounded-xl object-contain bg-slate-100 dark:bg-slate-900/50" />
            <button 
              onClick={() => setSelectedImage(null)}
              className="p-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full text-slate-600 dark:text-slate-300 transition-colors shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="absolute bottom-[calc(100%+16px)] left-4 z-50 shadow-2xl rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 animate-in fade-in zoom-in-95">
            <EmojiPicker 
              onEmojiClick={handleEmojiClick}
              theme={resolvedTheme === 'dark' ? Theme.DARK : Theme.LIGHT}
              lazyLoadEmojis={true}
              searchDisabled={false}
              skinTonesDisabled={true}
              width={320}
              height={400}
            />
          </div>
        )}

        <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-end gap-3">
          <div className="flex-1 bg-slate-100 dark:bg-[#242f3d] rounded-[24px] border border-transparent focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all flex items-end px-2 py-1.5 shadow-inner">
            <button 
              type="button" 
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={cn(
                "p-2.5 mb-0.5 transition-colors rounded-full hover:bg-slate-200 dark:hover:bg-white/5 shrink-0",
                showEmojiPicker ? "text-blue-500" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Smile className="w-5 h-5" />
            </button>
            
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 mb-0.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors rounded-full hover:bg-slate-200 dark:hover:bg-white/5 shrink-0"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            
            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Type a message..."
              className="flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-500 px-3 py-2.5 focus:outline-none resize-none min-h-[44px] text-[15px] leading-relaxed custom-scrollbar"
              rows={1}
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim() && !selectedImage}
            className="w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-200 dark:disabled:bg-white/5 disabled:text-slate-400 dark:disabled:text-slate-600 text-white flex items-center justify-center shrink-0 transition-all shadow-lg shadow-blue-500/20 disabled:shadow-none mb-0.5 active:scale-95"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
      </div>
      {/* Image Viewer Modal */}
      <AnimatePresence>
        {viewingImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setViewingImage(null)}
          >
            <button 
              className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 rounded-full transition-colors"
              onClick={() => setViewingImage(null)}
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={viewingImage}
              alt="Fullscreen"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

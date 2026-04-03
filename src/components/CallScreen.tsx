import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '../contexts/CallContext';
import { useAuth } from '../contexts/AuthContext';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Maximize2, Minimize2, User, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import { ZEGO_CONFIG } from '../config/zego';

export default function CallScreen() {
  const { user } = useAuth();
  const { 
    callStatus, 
    incomingCall, 
    activeCall,
    acceptCall, 
    rejectCall, 
    endCall, 
    toggleCallType,
    callError,
    clearCallError,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo
  } = useCall();

  const [seconds, setSeconds] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStatus === 'connected') {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      setSeconds(0);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  // Handle local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callStatus]);

  // Handle remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callStatus]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (callStatus === 'idle' && !incomingCall && !callError) return null;

  const participantName = incomingCall?.callerName || activeCall?.calleeName || activeCall?.callerName || 'User';

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-[#0e1621] flex flex-col items-center justify-center overflow-hidden"
      >
        {/* Background Ambient Glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-blue-500/10 blur-[120px] rounded-full" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-purple-500/10 blur-[120px] rounded-full" />
        </div>

        {/* Error UI (Fatal) */}
        {callError && callStatus === 'idle' && (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-10 bg-[#17212b] border border-white/10 p-8 rounded-3xl max-w-md w-full mx-4 text-center shadow-2xl backdrop-blur-xl"
          >
            <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <VideoOff className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Connection Error</h2>
            <p className="text-slate-400 mb-8 leading-relaxed">{callError}</p>
            <button 
              onClick={clearCallError}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-semibold transition-all shadow-lg active:scale-95"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        {/* Incoming Call UI */}
        {incomingCall && callStatus === 'ringing' && (
          <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-lg px-6">
            <div className="relative">
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-40 h-40 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30"
              >
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-5xl font-bold text-white shadow-2xl">
                  {participantName.charAt(0).toUpperCase()}
                </div>
              </motion.div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-green-500 rounded-full border-4 border-[#0e1621] flex items-center justify-center">
                <div className="w-3 h-3 bg-white rounded-full animate-ping" />
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-4xl font-bold text-white mb-3 tracking-tight">{participantName}</h2>
              <p className="text-blue-400 text-xl font-medium animate-pulse">
                Incoming {incomingCall.withVideo ? 'Video' : 'Voice'} Call...
              </p>
            </div>
            
            <div className="flex items-center gap-12 mt-4">
              <div className="flex flex-col items-center gap-3">
                <button 
                  onClick={rejectCall}
                  className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl transition-all hover:scale-110 active:scale-90"
                >
                  <PhoneOff className="w-10 h-10" />
                </button>
                <span className="text-slate-400 text-sm font-medium">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-3">
                <button 
                  onClick={acceptCall}
                  className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-xl transition-all hover:scale-110 active:scale-90"
                >
                  {incomingCall.withVideo ? <Video className="w-10 h-10" /> : <Phone className="w-10 h-10" />}
                </button>
                <span className="text-slate-400 text-sm font-medium">Accept</span>
              </div>
            </div>
          </div>
        )}

        {/* Outgoing Call UI */}
        {callStatus === 'calling' && (
          <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-lg px-6">
            <div className="relative">
              <motion.div 
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 3 }}
                className="w-40 h-40 rounded-full bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl"
              >
                <div className="w-32 h-32 rounded-full bg-blue-500/20 flex items-center justify-center text-5xl font-bold text-blue-400">
                  {participantName.charAt(0).toUpperCase()}
                </div>
              </motion.div>
            </div>

            <div className="text-center">
              <h2 className="text-4xl font-bold text-white mb-3 tracking-tight">Calling {participantName}...</h2>
              <p className="text-slate-400 text-xl">Waiting for answer</p>
            </div>

            <div className="flex flex-col items-center gap-3 mt-4">
              <button 
                onClick={endCall}
                className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white shadow-2xl transition-all hover:scale-110 active:scale-90 group"
              >
                <PhoneOff className="w-10 h-10 group-hover:rotate-[135deg] transition-transform duration-300" />
              </button>
              <span className="text-slate-400 text-sm font-medium">Cancel</span>
            </div>
          </div>
        )}

        {/* Connected Call UI (Custom) */}
        {callStatus === 'connected' && (
          <div className="w-full h-full flex flex-col relative bg-[#0e1621]">
            {/* Main Content Area */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              {activeCall?.withVideo ? (
                /* Video Mode */
                <div className="w-full h-full relative bg-black">
                  {/* Remote Video (Full Screen) */}
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                    {remoteStream ? (
                      <video 
                        ref={remoteVideoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-32 h-32 rounded-full bg-blue-500/20 flex items-center justify-center text-5xl font-bold text-blue-400">
                          {participantName.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-slate-400 animate-pulse">Connecting to {participantName}...</p>
                      </div>
                    )}
                  </div>

                  {/* Local Video (Picture-in-Picture) */}
                  <motion.div 
                    drag
                    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    className="absolute top-6 right-6 w-32 md:w-48 aspect-[3/4] bg-slate-800 rounded-2xl overflow-hidden shadow-2xl border border-white/10 z-20 cursor-move"
                  >
                    {localStream ? (
                      <video 
                        ref={localVideoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className={cn("w-full h-full object-cover", isVideoOff && "hidden")}
                      />
                    ) : null}
                    {isVideoOff && (
                      <div className="w-full h-full flex items-center justify-center bg-slate-800">
                        <User className="w-12 h-12 text-slate-600" />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white font-medium">
                      You
                    </div>
                  </motion.div>
                </div>
              ) : (
                /* Audio Mode */
                <div className="flex flex-col items-center gap-12 z-10">
                  <div className="relative">
                    <motion.div 
                      animate={{ 
                        scale: [1, 1.1, 1],
                        opacity: [0.3, 0.6, 0.3]
                      }}
                      transition={{ repeat: Infinity, duration: 3 }}
                      className="absolute inset-0 rounded-full bg-blue-500 blur-3xl"
                    />
                    <motion.div 
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="relative w-48 h-48 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-7xl font-bold text-white shadow-2xl border-4 border-white/10"
                    >
                      {participantName.charAt(0).toUpperCase()}
                    </motion.div>
                  </div>
                  <div className="text-center">
                    <h2 className="text-4xl font-bold text-white mb-2">{participantName}</h2>
                    <p className="text-blue-400 text-xl font-medium tracking-widest">{formatTime(seconds)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Call Info Overlay (Video Mode Only) */}
            {activeCall?.withVideo && (
              <div className="absolute top-6 left-6 z-10 flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs">
                  {participantName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-white text-xs font-bold leading-none">{participantName}</div>
                  <div className="text-blue-400 text-[10px] font-medium mt-0.5">{formatTime(seconds)}</div>
                </div>
              </div>
            )}

            {/* Call Controls */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 md:gap-6 px-6 md:px-8 py-4 bg-white/10 backdrop-blur-2xl rounded-full border border-white/10 shadow-2xl">
              <button 
                onClick={toggleMute}
                className={cn(
                  "p-4 rounded-full transition-all active:scale-90",
                  isMuted ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              <button 
                onClick={toggleCallType}
                className={cn(
                  "p-4 rounded-full transition-all active:scale-90",
                  activeCall?.withVideo ? "bg-blue-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {activeCall?.withVideo ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
              </button>

              <button 
                onClick={endCall}
                className="p-5 bg-red-600 hover:bg-red-500 text-white rounded-full transition-all active:scale-90 shadow-xl shadow-red-600/20"
              >
                <PhoneOff className="w-8 h-8" />
              </button>

              <button 
                onClick={toggleVideo}
                disabled={!activeCall?.withVideo}
                className={cn(
                  "p-4 rounded-full transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed",
                  isVideoOff ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

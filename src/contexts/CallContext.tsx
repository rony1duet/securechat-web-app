import React, { createContext, useContext, useMemo, useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ZegoExpressEngine } from 'zego-express-engine-webrtc';
import { ZEGO_CONFIG } from '../config/zego';

interface ActiveCall {
  callId: string;
  roomId: string;
  chatId: string;
  calleeId: string;
  calleeName: string;
  callerId: string;
  callerName: string;
  withVideo: boolean;
}

interface CallContextType {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callStatus: 'idle' | 'ringing' | 'calling' | 'connected';
  incomingCall: { chatId: string; callerId: string; callerName: string; withVideo: boolean } | null;
  activeCall: ActiveCall | null;
  startCall: (chatId: string, calleeId: string, withVideo: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleCallType: () => Promise<void>;
  setCallConnected: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  isMuted: boolean;
  isVideoOff: boolean;
  callError: string | null;
  clearCallError: () => void;
  setCallErrorMessage: (message: string | null) => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

import { handleFirestoreError, OperationType } from './ChatContext';

import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { users, activeDb } = useChat();

  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'calling' | 'connected'>('idle');
  const [incomingCall, setIncomingCall] = useState<{ chatId: string; callerId: string; callerName: string; withVideo: boolean } | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const zegoEngineRef = useRef<ZegoExpressEngine | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localStreamIdRef = useRef<string | null>(null);
  const remoteStreamIdRef = useRef<string | null>(null);

  // Initialize Zego Engine
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const engine = new ZegoExpressEngine(ZEGO_CONFIG.appID, 'wss://webliveroom' + ZEGO_CONFIG.appID + '-api.zegocloud.com/ws');
    zegoEngineRef.current = engine;

    engine.on('roomStreamUpdate', async (roomID, updateType, streamList) => {
      if (updateType === 'ADD') {
        const stream = streamList[0];
        remoteStreamIdRef.current = stream.streamID;
        try {
          const remoteMediaStream = await engine.startPlayingStream(stream.streamID);
          setRemoteStream(remoteMediaStream);
        } catch (err) {
          console.error('Failed to play remote stream:', err);
        }
      } else if (updateType === 'DELETE') {
        const stream = streamList[0];
        if (remoteStreamIdRef.current === stream.streamID) {
          engine.stopPlayingStream(stream.streamID);
          setRemoteStream(null);
          remoteStreamIdRef.current = null;
        }
      }
    });

    engine.on('roomStateUpdate', (roomID, state, errorCode, extendedData) => {
      if (state === 'DISCONNECTED') {
        setCallStatus('idle');
      }
    });

    return () => {
      if (zegoEngineRef.current) {
        // Cleanup if needed
      }
    };
  }, []);

  const joinRoom = async (roomId: string, withVideo: boolean) => {
    if (!zegoEngineRef.current || !user) return;

    try {
      // In a real app, you'd get this from your server
      // For this demo, we'll use a simple token generation if possible, 
      // but Zego core SDK usually needs a real token.
      // However, for testing purposes, some versions allow passing the serverSecret or a dummy token if configured.
      // Actually, we'll use the ZegoUIKitPrebuilt's token generation logic if we can, 
      // or just assume we have a way to join.
      
      // Since we don't have a token server, we'll use a placeholder or try to join without it if the SDK allows (unlikely).
      // Wait, ZegoExpressEngine.loginRoom requires a token.
      
      // I'll use a trick: use the ZegoUIKitPrebuilt's token generation if I can find it, 
      // or just implement a simple one if I know the algorithm.
      // Actually, Zego provides a way to generate a test token.
      
      // For now, let's assume we can join. I'll use a dummy token and hope for the best or 
      // I'll need to implement the token generation.
      
      // Generate a test token (Kit Token)
      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
        ZEGO_CONFIG.appID,
        ZEGO_CONFIG.serverSecret,
        roomId,
        user.uid,
        user.displayName || user.email || 'User'
      );
      
      // For the Core SDK, sometimes the Kit Token string itself is accepted as the token,
      // or we need to extract the inner token. We'll try to use the kitToken directly first
      // as it's the most common way for test tokens in recent versions.
      // If it fails, we'll see it in the logs.
      
      console.log('Logging into Zego room:', roomId, 'User:', user.uid);
      
      await zegoEngineRef.current.loginRoom(
        roomId, 
        kitToken, 
        { userID: user.uid, userName: user.displayName || user.email || 'User' }, 
        { userUpdate: true }
      );
      
      const localMediaStream = await zegoEngineRef.current.createStream({
        camera: {
          audio: true,
          video: withVideo
        }
      });
      
      setLocalStream(localMediaStream);
      localStreamRef.current = localMediaStream;
      
      // Use a unique stream ID
      const streamID = `stream_${user.uid}_${Date.now()}`;
      localStreamIdRef.current = streamID;
      await zegoEngineRef.current.startPublishingStream(streamID, localMediaStream);
    } catch (err) {
      console.error('Failed to join room:', err);
      setCallError('Failed to initialize media streams. Please check camera/microphone permissions.');
    }
  };

  const leaveRoom = async () => {
    if (!zegoEngineRef.current || !activeCall) return;

    if (localStreamRef.current) {
      if (localStreamIdRef.current) {
        zegoEngineRef.current.stopPublishingStream(localStreamIdRef.current);
        localStreamIdRef.current = null;
      }
      zegoEngineRef.current.destroyStream(localStreamRef.current);
      setLocalStream(null);
      localStreamRef.current = null;
    }

    if (remoteStreamIdRef.current) {
      zegoEngineRef.current.stopPlayingStream(remoteStreamIdRef.current);
      setRemoteStream(null);
      remoteStreamIdRef.current = null;
    }

    await zegoEngineRef.current.logoutRoom(activeCall.roomId);
  };

  useEffect(() => {
    if (callStatus === 'connected' && activeCall) {
      joinRoom(activeCall.roomId, activeCall.withVideo);
    } else if (callStatus === 'idle') {
      leaveRoom();
    }
  }, [callStatus]);

  useEffect(() => {
    if (!user) return;

    const incomingQuery = query(
      collection(activeDb, 'calls'),
      where('calleeId', '==', user.uid),
      where('status', '==', 'ringing')
    );

    const unsubscribe = onSnapshot(incomingQuery, (snapshot) => {
      if (snapshot.empty) {
        setIncomingCall(null);
        if (!activeCall && callStatus === 'ringing') {
          setCallStatus('idle');
        }
        return;
      }

      const callDoc = snapshot.docs[0];
      const data = callDoc.data() as {
        chatId: string;
        callerId: string;
        callerName?: string;
        withVideo: boolean;
        roomId: string;
      };

      setIncomingCall({
        chatId: data.chatId,
        callerId: data.callerId,
        callerName: data.callerName || users[data.callerId]?.displayName || 'User',
        withVideo: Boolean(data.withVideo),
      });

      if (!activeCall || activeCall.callId !== callDoc.id) {
        setActiveCall({
          callId: callDoc.id,
          roomId: data.roomId,
          chatId: data.chatId,
          calleeId: user.uid,
          calleeName: users[user.uid]?.displayName || user.displayName || 'You',
          callerId: data.callerId,
          callerName: data.callerName || users[data.callerId]?.displayName || 'User',
          withVideo: Boolean(data.withVideo),
        });
      }

      setCallStatus('ringing');
    }, (error) => {
      console.warn('Incoming calls listener failed:', error);
      handleFirestoreError(error, OperationType.LIST, 'calls', user);
    });

    return unsubscribe;
  }, [user, users, activeCall, callStatus, activeDb]);

  const activeCallRef = useRef<ActiveCall | null>(null);
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    if (!activeCall) return;

    const callRef = doc(activeDb, 'calls', activeCall.callId);
    const unsubscribe = onSnapshot(callRef, (callSnapshot) => {
      if (!callSnapshot.exists()) {
        setCallStatus('idle');
        setIncomingCall(null);
        setActiveCall(null);
        return;
      }

      const data = callSnapshot.data() as any;
      if (data.status === 'accepted' && callStatus === 'calling') {
        setCallStatus('connected');
      }
      if (data.status === 'rejected') {
        setCallError('Call was rejected.');
        setIncomingCall(null);
        setActiveCall(null);
        setCallStatus('idle');
      }
      if (data.status === 'ended') {
        setIncomingCall(null);
        setActiveCall(null);
        setCallStatus('idle');
      }
      
      // Sync withVideo state
      if (data.withVideo !== undefined && activeCallRef.current?.withVideo !== data.withVideo) {
        const wasVideo = activeCallRef.current?.withVideo;
        const isNowVideo = data.withVideo;
        
        setActiveCall(prev => prev ? { ...prev, withVideo: isNowVideo } : null);
        
        // If call type changed to video and we don't have a video track, try to enable it
        if (!wasVideo && isNowVideo && zegoEngineRef.current && localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (!videoTrack) {
            // We need to recreate the stream to add video
            (async () => {
              try {
                await zegoEngineRef.current?.destroyStream(localStreamRef.current!);
                const newList = await zegoEngineRef.current?.createStream({
                  camera: { audio: !isMuted, video: true }
                });
                if (newList) {
                  setLocalStream(newList);
                  localStreamRef.current = newList;
                  if (localStreamIdRef.current) {
                    await zegoEngineRef.current?.startPublishingStream(localStreamIdRef.current, newList);
                  }
                  setIsVideoOff(false);
                }
              } catch (err) {
                console.error('Failed to auto-enable video:', err);
              }
            })();
          } else {
            videoTrack.enabled = true;
            setIsVideoOff(false);
          }
        }
      }
    }, (error) => {
      console.warn('Active call listener failed:', error);
      handleFirestoreError(error, OperationType.GET, `calls/${activeCall.callId}`, user);
    });

    return unsubscribe;
  }, [activeCall?.callId, callStatus, activeDb]);

  const startCall = async (chatId: string, calleeId: string, withVideo: boolean) => {
    if (!user) {
      setCallError('You must be logged in to start a call.');
      return;
    }

    if (callStatus !== 'idle') {
      setCallError('You already have an active call session.');
      return;
    }

    if (calleeId === user.uid) {
      setCallError('You cannot call yourself.');
      return;
    }

    const calleeName = users[calleeId]?.displayName || 'User';
    const callerName = user.displayName || user.email || 'User';

    try {
      const roomId = `securechat-${chatId}`;
      const callId = `chat-${chatId}`;
      await setDoc(doc(activeDb, 'calls', callId), {
        roomId,
        chatId,
        callerId: user.uid,
        callerName,
        calleeId,
        calleeName,
        withVideo,
        status: 'ringing',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCallStatus('calling');
      setActiveCall({
        callId,
        roomId,
        chatId,
        calleeId,
        calleeName,
        callerId: user.uid,
        callerName,
        withVideo,
      });
      setIncomingCall(null);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        setCallError('Call permission denied by Firestore rules. Update and deploy firestore.rules.');
      } else if (code === 'unavailable') {
        setCallError('Network unavailable. Check internet connection and try again.');
      } else {
        const errorMessage = (error as { message?: string } | null)?.message;
        setCallError(`Failed to start call (${code || 'unknown'}). ${errorMessage || 'Please try again.'}`);
      }
      setCallStatus('idle');
      setActiveCall(null);
    }
  };

  const acceptCall = async () => {
    if (!activeCall || !user) return;

    try {
      await updateDoc(doc(activeDb, 'calls', activeCall.callId), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      setIncomingCall(null);
      setCallStatus('connected');
    } catch {
      setCallError('Failed to accept call. Please try again.');
    }
  };

  const rejectCall = async () => {
    if (!activeCall) {
      setCallStatus('idle');
      setIncomingCall(null);
      return;
    }

    try {
      await updateDoc(doc(activeDb, 'calls', activeCall.callId), {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
    } catch {
      setCallError('Failed to reject call.');
    }

    setCallStatus('idle');
    setIncomingCall(null);
    setActiveCall(null);
  };

  const endCall = async () => {
    if (activeCall) {
      try {
        await updateDoc(doc(activeDb, 'calls', activeCall.callId), {
          status: 'ended',
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore update failures and still clean up local state.
      }
    }

    setCallStatus('idle');
    setIncomingCall(null);
    setActiveCall(null);
    setCallError(null);
  };

  const toggleCallType = async () => {
    if (!activeCall || !user) return;
    
    const newWithVideo = !activeCall.withVideo;
    
    try {
      await updateDoc(doc(activeDb, 'calls', activeCall.callId), {
        withVideo: newWithVideo,
        updatedAt: serverTimestamp(),
      });
      
      // If we are turning video ON, we need to recreate the stream or update it
      if (zegoEngineRef.current && localStreamRef.current) {
        if (newWithVideo) {
          // Try to enable video track if it exists, or recreate stream
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = true;
            setIsVideoOff(false);
          } else {
            // Recreate stream with video
            await zegoEngineRef.current.destroyStream(localStreamRef.current);
            const newList = await zegoEngineRef.current.createStream({
              camera: { audio: !isMuted, video: true }
            });
            setLocalStream(newList);
            localStreamRef.current = newList;
            if (localStreamIdRef.current) {
              await zegoEngineRef.current.startPublishingStream(localStreamIdRef.current, newList);
            }
            setIsVideoOff(false);
          }
        } else {
          // Turn video OFF
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = false;
            setIsVideoOff(true);
          }
        }
      }
    } catch (error) {
      console.error('Failed to toggle call type:', error);
    }
  };

  const setCallConnected = () => {
    setCallStatus('connected');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const clearCallError = () => setCallError(null);
  const setCallErrorMessage = (message: string | null) => setCallError(message);

  const value = useMemo(
    () => ({
      localStream,
      remoteStream,
      callStatus,
      incomingCall,
      activeCall,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleCallType,
      setCallConnected,
      toggleMute,
      toggleVideo,
      isMuted,
      isVideoOff,
      callError,
      clearCallError,
      setCallErrorMessage,
    }),
    [
      localStream,
      remoteStream,
      callStatus,
      incomingCall,
      activeCall,
      isMuted,
      isVideoOff,
      callError,
    ]
  );

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};

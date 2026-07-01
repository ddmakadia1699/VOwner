import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { createClient } from '@supabase/supabase-js';
import { 
  Search, 
  MessageSquare, 
  Phone, 
  User, 
  ShieldAlert, 
  Volume2, 
  VolumeX,
  Bell, 
  BellOff, 
  ArrowLeft, 
  Send, 
  Plus, 
  Car, 
  CheckCircle, 
  LogOut, 
  PhoneIncoming, 
  PhoneCall, 
  PhoneOff,
  Calendar,
  AlertTriangle,
  History,
  Lock,
  Unlock,
  Check,
  ShieldCheck,
  Smartphone,
  Info,
  Shield,
  Trash2,
  HelpCircle,
  Eye,
  Globe,
  Clock,
  AlertCircle
} from 'lucide-react';

const SOCKET_URL = 'http://localhost:5001';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseClient = null;
export const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
};

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const COUNTRIES = [
  { code: 'IN', name: 'India', label: 'IND', placeholder: 'MH12AB1234' },
  { code: 'US', name: 'United States', label: 'USA', placeholder: '7XYZ89' },
  { code: 'EU', name: 'European Union', label: 'EU', placeholder: 'B-MW-2026' },
  { code: 'AE', name: 'United Arab Emirates', label: 'UAE', placeholder: '5-99999' },
  { code: 'GB', name: 'United Kingdom', label: 'UK', placeholder: 'AB12 CDE' },
  { code: 'GL', name: 'Global/General', label: 'GL', placeholder: 'GLOBAL12' }
];

// Regex format auto-detector helper
const autoDetectCountry = (plateStr) => {
  const clean = plateStr.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!clean) return 'GL';
  if (/^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/.test(clean)) return 'IN';
  if (/^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(clean)) return 'GB';
  if (/^[A-Z]{1,3}[A-Z0-9]{1,4}[0-9]{1,4}$/.test(clean) && clean.length >= 6) return 'EU';
  if (/^[0-9]{1,6}$/.test(clean)) return 'AE';
  if (clean.length >= 5 && clean.length <= 7) return 'US';
  return 'GL';
};

// Global Context Authentication Fetch helpers
const authFetch = async (url, options = {}) => {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || localStorage.getItem('vehicle_app_token');
  let guestId = localStorage.getItem('vehicle_app_guest_id');
  if (!guestId) {
    guestId = '00000000-0000-4000-8000-' + Math.floor(100000000000 + Math.random() * 900000000000).toString().substring(0, 12);
    localStorage.setItem('vehicle_app_guest_id', guestId);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    'x-guest-id': guestId,
    ...options.headers
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    await supabase.auth.signOut();
    localStorage.removeItem('vehicle_app_token');
    localStorage.removeItem('vehicle_app_phone');
    localStorage.removeItem('vehicle_app_user_id');
    window.location.href = '/login';
  }
  return response;
};

const adminFetch = async (url, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-secret': 'ceo2026',
    ...options.headers
  };
  return fetch(url, { ...options, headers });
};

// Reusable Global Plate Component (Clean white badge layout style)
function DynamicPlate({ plateNumber, className = '' }) {
  if (!plateNumber) return null;
  const parts = plateNumber.split(':');
  const countryCode = parts.length === 2 ? parts[0] : 'IN';
  const displayPlate = (parts.length === 2 ? parts[1] : plateNumber).toUpperCase();

  return (
    <div className={`license-plate-display-clean ${className}`}>
      <span className="plate-country-pill">{countryCode}</span>
      <span>{displayPlate}</span>
    </div>
  );
}

// Global App Container
export default function App() {
  const navigate = useNavigate();

  // Authentication & Session States
  const [userId, setUserId] = useState(() => {
    return localStorage.getItem('vehicle_app_user_id') || generateUUID();
  });
  const [ownerPhone, setOwnerPhone] = useState(() => {
    return localStorage.getItem('vehicle_app_phone') || '';
  });
  const [isOwnerLoggedIn, setIsOwnerLoggedIn] = useState(() => {
    return !!localStorage.getItem('vehicle_app_phone');
  });

  // Anti-Spam Security verification states
  const [showVerification, setShowVerification] = useState(false);
  const [verifyPhone, setVerifyPhone] = useState('');
  const [verifyOtp, setVerifyOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [visitorVerified, setVisitorVerified] = useState(() => {
    return localStorage.getItem('vehicle_app_verified') === 'true';
  });
  const [pendingAction, setPendingAction] = useState(null);

  // WebRTC VoIP Calling states
  const [callState, setCallState] = useState('idle');
  const [activeCall, setActiveCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callStatusText, setCallStatusText] = useState('');

  // Sockets & WebRTC connections
  const socketRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const audioRingRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Custom Toast state
  const [toast, setToast] = useState(null); // { message: '', type: 'success' | 'error' | 'info' }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsOwnerLoggedIn(true);
        setUserId(session.user.id);
        setOwnerPhone(session.user.phone || session.user.email || '');
        localStorage.setItem('vehicle_app_token', session.access_token);
        localStorage.setItem('vehicle_app_phone', session.user.phone || session.user.email || '');
        localStorage.setItem('vehicle_app_user_id', session.user.id);

        // Sync with backend profiles
        fetch(`${SOCKET_URL}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: session.user.id, phoneNumber: session.user.phone || session.user.email || '' })
        });
      }
    });

    // Listen to auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setIsOwnerLoggedIn(true);
        setUserId(session.user.id);
        setOwnerPhone(session.user.phone || session.user.email || '');
        localStorage.setItem('vehicle_app_token', session.access_token);
        localStorage.setItem('vehicle_app_phone', session.user.phone || session.user.email || '');
        localStorage.setItem('vehicle_app_user_id', session.user.id);

        // Sync session user
        fetch(`${SOCKET_URL}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: session.user.id, phoneNumber: session.user.phone || session.user.email || '' })
        });
      } else {
        setIsOwnerLoggedIn(false);
        setOwnerPhone('');
        localStorage.removeItem('vehicle_app_token');
        localStorage.removeItem('vehicle_app_phone');
        localStorage.removeItem('vehicle_app_user_id');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('vehicle_app_user_id')) {
      fetch(`${SOCKET_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            localStorage.setItem('vehicle_app_user_id', data.user.id);
            setUserId(data.user.id);
          }
        });
    }

    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => {
      socketRef.current.emit('register-socket', userId);
    });

    socketRef.current.on('incoming-call', (data) => {
      setActiveCall(data);
      setCallState('ringing');
      setCallStatusText('Incoming call...');
      triggerRingtone();
    });

    socketRef.current.on('call-accepted', async (data) => {
      setCallStatusText('Connecting audio...');
      try {
        if (peerConnection.current) {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          setCallState('connected');
          setCallStatusText('Connected');
        }
      } catch (e) {
        console.error('Call accept failed:', e);
        endActiveCall();
      }
    });

    socketRef.current.on('call-rejected', () => {
      setCallStatusText('Call Busy/Rejected');
      setTimeout(() => cleanupCallState(), 2000);
    });

    socketRef.current.on('call-failed', (data) => {
      setCallStatusText(data.reason);
      setTimeout(() => cleanupCallState(), 3500);
    });

    socketRef.current.on('ice-candidate', async (data) => {
      try {
        if (peerConnection.current && data.candidate) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (e) {
        console.error('Candidate mapping failed:', e);
      }
    });

    socketRef.current.on('call-ended', () => {
      setCallStatusText('Call Ended');
      setTimeout(() => cleanupCallState(), 1500);
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      stopRingtone();
    };
  }, [userId]);

  const triggerRingtone = () => {
    stopRingtone();
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc2.frequency.setValueAtTime(480, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
      
      let ringInterval = setInterval(() => {
        try {
          gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
          gainNode.gain.setValueAtTime(0, audioCtx.currentTime + 1.2);
        } catch(e) {}
      }, 2500);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc1.start();
      osc2.start();

      audioRingRef.current = {
        stop: () => {
          clearInterval(ringInterval);
          try {
            osc1.stop();
            osc2.stop();
            audioCtx.close();
          } catch(e) {}
        }
      };
    } catch (e) {
      console.error('Ringtone playback error:', e);
    }
  };

  const stopRingtone = () => {
    if (audioRingRef.current) {
      audioRingRef.current.stop();
      audioRingRef.current = null;
    }
  };

  const setupWebRTC = async (isCaller, targetId) => {
    try {
      peerConnection.current = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;

      stream.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, stream);
      });

      peerConnection.current.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate && socketRef.current && targetId) {
          socketRef.current.emit('ice-candidate', {
            targetId,
            candidate: event.candidate
          });
        }
      };
    } catch (e) {
      console.error('WebRTC configuration failed:', e);
      showToast('Could not configure microphone.', 'error');
      endActiveCall();
    }
  };

  const startAudioCall = async (chatId, plateNumber, recipientId) => {
    setCallState('calling');
    setCallStatusText('Calling...');
    
    const effectiveCallerId = userId || localStorage.getItem('vehicle_app_user_id') || localStorage.getItem('vehicle_app_guest_id') || '00000000-0000-4000-a000-000000000001';
    const callDetails = {
      chatId,
      plateNumber,
      callerId: effectiveCallerId,
      recipientId
    };

    setActiveCall(callDetails);
    await setupWebRTC(true, recipientId);

    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      
      socketRef.current.emit('call-user', {
        chatId,
        plateNumber,
        callerId: effectiveCallerId,
        offer
      });
    } catch (e) {
      console.error('Offer routing failed:', e);
      endActiveCall();
    }
  };

  const acceptCall = async () => {
    stopRingtone();
    if (!activeCall) return;
    setCallStatusText('Answering...');
    await setupWebRTC(false, activeCall.callerId);

    try {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(activeCall.offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      socketRef.current.emit('accept-call', {
        callerId: activeCall.callerId,
        answer
      });
      setCallState('connected');
      setCallStatusText('Connected');
    } catch (e) {
      console.error('Answer routing failed:', e);
      rejectCall();
    }
  };

  const rejectCall = () => {
    stopRingtone();
    if (activeCall && socketRef.current) {
      socketRef.current.emit('reject-call', { callerId: activeCall.callerId });
    }
    cleanupCallState();
  };

  const endActiveCall = () => {
    if (activeCall && socketRef.current) {
      const targetId = activeCall.callerId === userId 
        ? activeCall.recipientId 
        : activeCall.callerId;
      socketRef.current.emit('end-call', { targetId });
    }
    cleanupCallState();
  };

  const cleanupCallState = () => {
    stopRingtone();
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setCallState('idle');
    setActiveCall(null);
    setCallStatusText('');
  };

  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    localStorage.removeItem('vehicle_app_token');
    localStorage.removeItem('vehicle_app_phone');
    localStorage.removeItem('vehicle_app_user_id');
    setOwnerPhone('');
    setIsOwnerLoggedIn(false);
    showToast('Logged out successfully.', 'info');
    navigate('/');
  };

  const requestVerificationWrapper = (callback) => {
    if (!visitorVerified) {
      setPendingAction(() => callback);
      setShowVerification(true);
    } else {
      callback();
    }
  };

  const handleVerifySubmit = (e) => {
    e.preventDefault();
    if (!verifyPhone) return;
    setOtpSent(true);
    showToast('Test OTP is 1234', 'info');
  };

  const handleOtpVerify = (e) => {
    e.preventDefault();
    if (verifyOtp === '1234') {
      localStorage.setItem('vehicle_app_verified', 'true');
      setVisitorVerified(true);
      setShowVerification(false);
      setOtpSent(false);
      setVerifyPhone('');
      setVerifyOtp('');
      showToast('Anti-spam check passed.', 'success');
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      showToast('Invalid OTP. Use test OTP: 1234', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

      {/* --- Beautiful Toast Notification component overlay --- */}
      {toast && (
        <div className="toast-container">
          <div className={`toast-notification toast-${toast.type}`}>
            {toast.type === 'success' && <CheckCircle size={18} color="var(--success)" />}
            {toast.type === 'error' && <AlertTriangle size={18} color="var(--danger)" />}
            {toast.type === 'info' && <Info size={18} color="var(--primary)" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* --- Identity Verification Modal Overlay --- */}
      {showVerification && (
        <div className="verification-overlay">
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--primary)' }}>
              <ShieldCheck size={28} />
              <h3 style={{ fontSize: 20 }}>Anti-Spam Verification</h3>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              To protect vehicle owners from spam calls and harassment, verify your identity with a quick mobile check.
            </p>

            {!otpSent ? (
              <form onSubmit={handleVerifySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Smartphone size={18} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} />
                  <input 
                    type="tel" 
                    placeholder="Enter Mobile Number" 
                    className="chat-input"
                    value={verifyPhone}
                    onChange={(e) => setVerifyPhone(e.target.value)}
                    style={{ paddingLeft: 40 }}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary">Send Verification Code</button>
              </form>
            ) : (
              <form onSubmit={handleOtpVerify} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input 
                    type="text" 
                    placeholder="Enter Code (Use 1234)" 
                    className="chat-input"
                    value={verifyOtp}
                    onChange={(e) => setVerifyOtp(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Code sent to: {verifyPhone}</span>
                </div>
                <button type="submit" className="btn btn-success">Verify & Continue</button>
              </form>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4, lineHeight: 1.35 }}>
              🔒 <strong>Privacy & Audits</strong>: By completing verification, you consent to anti-spam auditing. Your phone number is encrypted and never shared.
            </div>
            
            <button className="btn btn-secondary" onClick={() => { setShowVerification(false); setOtpSent(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* --- incoming / Outgoing VoIP Call Modal overlay --- */}
      {callState !== 'idle' && (
        <div className="call-modal">
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="call-avatar">
              <Car size={48} color="var(--primary)" />
            </div>
            <DynamicPlate plateNumber={activeCall?.plateNumber} />
            <div className="call-status">{callStatusText}</div>
          </div>

          <div className="call-actions">
            {callState === 'ringing' ? (
              <>
                <button className="call-btn call-btn-accept" onClick={acceptCall}>
                  <PhoneIncoming size={28} />
                </button>
                <button className="call-btn call-btn-decline" onClick={rejectCall}>
                  <PhoneOff size={28} />
                </button>
              </>
            ) : (
              <>
                {callState === 'connected' && (
                  <button className="call-btn btn-secondary" onClick={toggleMute} style={{ width: 68, height: 68, borderRadius: 34 }}>
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                  </button>
                )}
                <button className="call-btn call-btn-decline" onClick={endActiveCall}>
                  <PhoneOff size={28} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Page Routing */}
      <Routes>
        <Route path="/" element={<SearchPage isOwnerLoggedIn={isOwnerLoggedIn} handleLogout={handleLogout} requestVerificationWrapper={requestVerificationWrapper} showToast={showToast} />} />
        <Route path="/login" element={<LoginPage showToast={showToast} />} />
        <Route path="/dashboard" element={<DashboardPage ownerPhone={ownerPhone} handleLogout={handleLogout} showToast={showToast} />} />
        <Route path="/chat/:plate" element={<ChatPage userId={userId} socketRef={socketRef} requestVerificationWrapper={requestVerificationWrapper} startAudioCall={startAudioCall} showToast={showToast} />} />
        <Route path="/admin/login" element={<AdminLoginPage showToast={showToast} />} />
        <Route path="/admin" element={<AdminDashboardPage showToast={showToast} />} />
      </Routes>

    </div>
  );
}

// --- Page 1: Visitor Plate Search Portal Page ---
function SearchPage({ isOwnerLoggedIn, handleLogout, requestVerificationWrapper, showToast }) {
  const navigate = useNavigate();
  const [plateSearchInput, setPlateSearchInput] = useState('');

  // Results State
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Conflict Picker choices
  const [collisionMatches, setCollisionMatches] = useState([]);

  // Auto-Detect background logic
  const detectedCode = autoDetectCountry(plateSearchInput);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!plateSearchInput.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setCollisionMatches([]);
    try {
      const res = await authFetch(`${SOCKET_URL}/api/vehicles/owner/${plateSearchInput}`);
      const data = await res.json();
      if (data.success) {
        if (data.multipleMatches) {
          setCollisionMatches(data.matches);
          showToast('Multiple regional matches found. Please choose.', 'info');
        } else {
          setResult(data);
          showToast('Vehicle owner located.', 'success');
        }
      } else {
        setError(data.error || 'Vehicle not registered.');
        showToast(data.error || 'Vehicle not found.', 'error');
      }
    } catch (e) {
      setError('Network search error.');
      showToast('Network error search failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCollision = (m) => {
    setCollisionMatches([]);
    setResult({
      registered: true,
      owner_id: m.owner_id || 'owner_id',
      dnd: m.dnd,
      isVerified: m.isVerified,
      verificationStatus: m.verificationStatus,
      plate_number: m.plate_number
    });
    showToast('Conflict match selected.', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Clean Premium Navbar */}
      <header className="chat-header">
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo-badge">
            <Car size={16} color="white" />
          </div>
          <span className="logo-text">
            Sampark<span className="logo-dot">.net</span>
          </span>
        </Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to="/admin/login" className="btn btn-secondary" style={{ width: 'auto', padding: '8px 12px', fontSize: 11.5, textDecoration: 'none', display: 'flex', gap: 4, borderRadius: 8 }}>
            <Shield size={13} /> CEO
          </Link>
          {isOwnerLoggedIn ? (
            <Link to="/dashboard" className="btn btn-primary" style={{ width: 'auto', padding: '8px 12px', fontSize: 11.5, textDecoration: 'none', display: 'flex', gap: 4, borderRadius: 8 }}>
              <User size={13} /> Portal
            </Link>
          ) : (
            <Link to="/login" className="btn btn-primary" style={{ width: 'auto', padding: '8px 12px', fontSize: 11.5, textDecoration: 'none', display: 'flex', gap: 4, borderRadius: 8 }}>
              <User size={13} /> Login
            </Link>
          )}
        </div>
      </header>

      <main style={{ padding: '32px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ textSelf: 'center', marginTop: 8 }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.2, letterSpacing: '-0.03em', textAlign: 'center' }}>Reach Owners, Privately</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 10, lineHeight: 1.5, textAlign: 'center' }}>
            Type any plate. Our smart lookup dynamically formats styling and bridges secure, fully masked communications.
          </p>
        </div>

        {/* Regular, simplified clean search box layout */}
        <form onSubmit={handleSearch} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>LICENSE PLATE NUMBER</label>
            <input 
              type="text" 
              className="chat-input" 
              placeholder="Enter Plate (e.g. GJ05RH0862)"
              value={plateSearchInput}
              onChange={(e) => setPlateSearchInput(e.target.value.toUpperCase())}
              style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '15px' }}>
            <Search size={18} />
            {loading ? 'Searching...' : 'Find Vehicle Owner'}
          </button>
        </form>

        {collisionMatches.length > 0 && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'slideUp 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)' }}>
              <AlertTriangle size={20} />
              <h3 style={{ fontSize: 15 }}>Multiple Matches Found</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -4 }}>
              Select which registered vehicle you wish to reach:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {collisionMatches.map((m, idx) => (
                <button 
                  key={idx} 
                  onClick={() => handleSelectCollision(m)} 
                  className="btn btn-secondary" 
                  style={{ justifyContent: 'space-between', padding: '14px 16px', borderRadius: 12 }}
                >
                  <DynamicPlate plateNumber={m.plate_number} className="mini" />
                  <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>Select &rarr;</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'slideUp 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <DynamicPlate plateNumber={result.plate_number || `${detectedCode}:${plateSearchInput}`} />
              <span className={`pill ${result.isVerified ? 'pill-success' : result.registered ? 'pill-warning' : 'pill-muted'}`}>
                {result.isVerified ? <ShieldCheck size={12} /> : null}
                {result.isVerified ? 'Verified Owner' : result.registered ? 'Pending CEO Verification' : 'Unregistered'}
              </span>
            </div>

            {result.registered ? (
              <>
                <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  Vehicle registered. Connecting masks your phone numbers completely.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-primary" onClick={() => navigate(`/chat/${result.plate_number}`)} style={{ flex: 1 }}>
                    <MessageSquare size={16} /> Chat
                  </button>
                  <button 
                    className="btn btn-success" 
                    onClick={() => requestVerificationWrapper(() => navigate(`/chat/${result.plate_number}?call=true`))}
                    disabled={result.dnd}
                    style={{ flex: 1 }}
                  >
                    <Phone size={16} /> Call
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  This vehicle isn't claimed yet. Leave an offline message and they will receive it when they claim this plate.
                </p>
                <button className="btn btn-secondary" onClick={() => navigate(`/chat/${detectedCode}:${plateSearchInput}`)}>
                  <MessageSquare size={16} /> Leave Offline Message
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 14, textAlign: 'center', fontWeight: 600 }}>
            {error}
          </div>
        )}

        {/* Informational Guidelines Card */}
        <div className="glass-panel" style={{ background: '#f8fafc', borderColor: 'transparent', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
            <Info size={16} />
            <h4 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>How Sampark Works</h4>
          </div>
          <ul style={{ fontSize: 12.5, color: 'var(--text-muted)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Enter any plate to search. No lookup fee or QR code scan is required.</li>
            <li>We verify owners with official registration certificates.</li>
            <li>Your mobile number is completely hidden. All calls use WebRTC proxy technology.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

// --- Page 2: Owner Login/Registration Page ---
function LoginPage({ showToast }) {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Successfully logged in!', 'success');
        navigate('/dashboard');
      }
    } catch (e) {
      showToast('Authentication failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignup = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: window.location.origin + '/login'
        }
      });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Account created! Please check your email for confirmation.', 'success');
        setActiveTab('login');
      }
    } catch (e) {
      showToast('Registration failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login'
      });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Password reset link sent to your email!', 'success');
        setActiveTab('login');
      }
    } catch (e) {
      showToast('Request failed.', 'error');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <header className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}><ArrowLeft size={24} /></Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="logo-badge" style={{ width: 26, height: 26, borderRadius: 8 }}>
              <Car size={13} color="white" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>Owner Portal</span>
          </div>
        </div>
      </header>

      <main style={{ padding: '40px 24px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        <div className="login-card-container">
          <div className="login-tabs">
            <button 
              type="button"
              className={`login-tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => setActiveTab('login')}
            >
              Sign In
            </button>
            <button 
              type="button"
              className={`login-tab-btn ${activeTab === 'signup' ? 'active' : ''}`}
              onClick={() => setActiveTab('signup')}
            >
              Sign Up
            </button>
          </div>

          {activeTab === 'login' && (
            <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input 
                type="email" 
                placeholder="Email Address" 
                className="chat-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <input 
                type="password" 
                placeholder="Password" 
                className="chat-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <div style={{ textAlign: 'right' }}>
                <button 
                  type="button" 
                  onClick={() => setActiveTab('forgot')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer' }}
                >
                  Forgot Password?
                </button>
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '14px' }} disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {activeTab === 'signup' && (
            <form onSubmit={handleEmailSignup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input 
                type="email" 
                placeholder="Email Address" 
                className="chat-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <input 
                type="password" 
                placeholder="Password (Min 6 chars)" 
                className="chat-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '14px' }} disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          {activeTab === 'forgot' && (
            <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Enter your email address and we'll send you a password recovery link.
              </p>
              <input 
                type="email" 
                placeholder="Email Address" 
                className="chat-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '14px' }} disabled={loading}>
                {loading ? 'Sending link...' : 'Send Recovery Link'}
              </button>
              <div style={{ textAlign: 'center' }}>
                <button 
                  type="button" 
                  onClick={() => setActiveTab('login')}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}


        </div>
      </main>
    </div>
  );
}

// --- Page 3: Owner Dashboard Page (GDPR Consent Protected) ---
function DashboardPage({ ownerPhone, handleLogout, showToast }) {
  const navigate = useNavigate();
  const [dashboardTab, setDashboardTab] = useState('overview');
  const [registeredPlates, setRegisteredPlates] = useState([]);
  const [newPlateInput, setNewPlateInput] = useState('');

  // Profile Notification States
  const [profileEmail, setProfileEmail] = useState('');
  const [profileWhatsapp, setProfileWhatsapp] = useState('');

  const [ownerChats, setOwnerChats] = useState([]);
  const [callerChats, setCallerChats] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);

  // RC Consent Checklist state
  const [rcConsents, setRcConsents] = useState({});

  // Reminders edit state
  const [editingPlateExpiry, setEditingPlateExpiry] = useState(null);
  const [fastagExpiryInput, setFastagExpiryInput] = useState('');
  const [pucExpiryInput, setPucExpiryInput] = useState('');
  const [insuranceExpiryInput, setInsuranceExpiryInput] = useState('');
  const [emergencyPhoneInput, setEmergencyPhoneInput] = useState('');
  const [verifyingPlate, setVerifyingPlate] = useState(null);

  // Parking log state
  const [activePlateLogs, setActivePlateLogs] = useState([]);
  const [viewingLogsPlate, setViewingLogsPlate] = useState('');

  // Disputes dialogue
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputedPlate, setDisputedPlate] = useState('');
  const [disputeSuccessMessage, setDisputeSuccessMessage] = useState('');

  // Auto-detect country in background
  const activeRegCountryCode = autoDetectCountry(newPlateInput);

  useEffect(() => {
    if (!localStorage.getItem('vehicle_app_token')) {
      navigate('/login');
      return;
    }
    refreshData();
    fetchProfile();
  }, []);

  const refreshData = () => {
    fetchVehicles();
    fetchChats();
    fetchBlocks();
  };

  const fetchVehicles = async () => {
    const res = await authFetch(`${SOCKET_URL}/api/vehicles`);
    const data = await res.json();
    if (data.success) setRegisteredPlates(data.vehicles);
  };

  const fetchProfile = async () => {
    try {
      const res = await authFetch(`${SOCKET_URL}/api/user/profile`);
      const data = await res.json();
      if (data.success && data.profile) {
        setProfileEmail(data.profile.email || '');
        setProfileWhatsapp(data.profile.whatsapp_number || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`${SOCKET_URL}/api/user/profile`, {
        method: 'POST',
        body: JSON.stringify({ email: profileEmail, whatsappNumber: profileWhatsapp })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Profile notification settings updated successfully.', 'success');
        fetchProfile();
      } else {
        showToast(data.error, 'error');
      }
    } catch (e) {
      showToast('Failed to save settings.', 'error');
    }
  };

  const fetchChats = async () => {
    const resOwner = await authFetch(`${SOCKET_URL}/api/chats/owner`);
    const dataOwner = await resOwner.json();
    if (dataOwner.success) setOwnerChats(dataOwner.chats);

    const resCaller = await authFetch(`${SOCKET_URL}/api/chats/caller`);
    const dataCaller = await resCaller.json();
    if (dataCaller.success) setCallerChats(dataCaller.chats);
  };

  const fetchBlocks = async () => {
    const res = await authFetch(`${SOCKET_URL}/api/chats/blocks`);
    const data = await res.json();
    if (data.success) setBlockedUsers(data.blocks);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!newPlateInput.trim()) return;
    try {
      const res = await authFetch(`${SOCKET_URL}/api/vehicles/register`, {
        method: 'POST',
        body: JSON.stringify({ plateNumber: newPlateInput, countryCode: activeRegCountryCode })
      });
      const data = await res.json();
      if (data.success) {
        setNewPlateInput('');
        showToast('Vehicle registered successfully.', 'success');
        fetchVehicles();
      } else if (res.status === 409 && data.code === 'PLATE_CLAIMED') {
        setDisputedPlate(`${activeRegCountryCode}:${newPlateInput}`);
        setNewPlateInput('');
        setShowDisputeDialog(true);
        setDisputeSuccessMessage('');
      } else {
        showToast(data.error, 'error');
      }
    } catch (e) {
      showToast('Registration error.', 'error');
    }
  };

  const handleFileDispute = async () => {
    const parts = disputedPlate.split(':');
    const country = parts[0];
    const plate = parts[1];

    const res = await authFetch(`${SOCKET_URL}/api/vehicles/dispute`, {
      method: 'POST',
      body: JSON.stringify({ plateNumber: plate, countryCode: country })
    });
    const data = await res.json();
    if (data.success) {
      setDisputeSuccessMessage('Dispute submitted for CEO review.');
      showToast('Ownership dispute filed.', 'info');
      fetchVehicles();
    }
  };

  const handleToggleDnd = async (plateKey, currentDnd) => {
    const parts = plateKey.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : plateKey;
    const isCurrentlyDnd = currentDnd === 1 || currentDnd === true || currentDnd === '1' || currentDnd === 'true' || Boolean(currentDnd && currentDnd !== '0' && currentDnd !== 'false');
    const nextDnd = isCurrentlyDnd ? 0 : 1;

    try {
      const res = await authFetch(`${SOCKET_URL}/api/vehicles/dnd`, {
        method: 'POST',
        body: JSON.stringify({ plateNumber: rawPlate, dnd: nextDnd, countryCode: country })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`DND set to ${nextDnd === 1 ? 'ON' : 'OFF'}.`, 'info');
        fetchVehicles();
      } else {
        showToast(data.error, 'error');
      }
    } catch (e) {
      showToast('Failed to toggle DND status.', 'error');
    }
  };

  const compressImageBase64 = (base64Str, maxWidth = 1000, maxHeight = 1000, quality = 0.6) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedData = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedData);
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const handleUploadRcFile = (plateKey, event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!rcConsents[plateKey]) {
      showToast('You must check the legal consent checkbox to process documents.', 'error');
      return;
    }

    const parts = plateKey.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : plateKey;

    setVerifyingPlate(plateKey);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawBase64 = reader.result;
      try {
        let uploadPayload = rawBase64;
        if (file.type.startsWith('image/')) {
          uploadPayload = await compressImageBase64(rawBase64);
        }
        const res = await authFetch(`${SOCKET_URL}/api/vehicles/verify`, {
          method: 'POST',
          body: JSON.stringify({ plateNumber: rawPlate, rcDoc: uploadPayload, countryCode: country })
        });
        const data = await res.json();
        if (data.success) {
          setVerifyingPlate(null);
          showToast('RC Document uploaded successfully.', 'success');
          fetchVehicles();
        } else {
          setVerifyingPlate(null);
          showToast('Upload failed.', 'error');
        }
      } catch (e) {
        setVerifyingPlate(null);
        showToast('Verification upload error.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleConsent = (plateKey) => {
    setRcConsents(prev => ({
      ...prev,
      [plateKey]: !prev[plateKey]
    }));
  };

  const handleCheckInOut = async (plateKey, action) => {
    const parts = plateKey.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : plateKey;

    setRegisteredPlates(prev => prev.map(p => {
      if (p.plate_number === plateKey) {
        return {
          ...p,
          in_out_status: action,
          in_out_time: new Date().toISOString()
        };
      }
      return p;
    }));

    const res = await authFetch(`${SOCKET_URL}/api/vehicles/logs`, {
      method: 'POST',
      body: JSON.stringify({ plateNumber: rawPlate, action, countryCode: country })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Parking check ${action === 'entered' ? 'In (Parked)' : 'Out (Exited)'} logged.`, 'success');
      fetchVehicles();
      if (viewingLogsPlate === plateKey) fetchPlateLogs(plateKey);
    } else {
      showToast('Failed to log parking status.', 'error');
      fetchVehicles();
    }
  };

  const fetchPlateLogs = async (plateKey) => {
    setViewingLogsPlate(plateKey);
    const parts = plateKey.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : plateKey;

    const res = await authFetch(`${SOCKET_URL}/api/vehicles/logs?plateNumber=${rawPlate}&countryCode=${country}`);
    const data = await res.json();
    if (data.success) setActivePlateLogs(data.logs);
  };

  const handleSaveReminders = async (e) => {
    e.preventDefault();
    if (!editingPlateExpiry) return;

    const parts = editingPlateExpiry.plate_number.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : editingPlateExpiry.plate_number;

    const res = await authFetch(`${SOCKET_URL}/api/vehicles/reminders`, {
      method: 'POST',
      body: JSON.stringify({
        plateNumber: rawPlate,
        fastag: fastagExpiryInput,
        puc: pucExpiryInput,
        insurance: insuranceExpiryInput,
        countryCode: country
      })
    });
    const data = await res.json();
    if (data.success) {
      setEditingPlateExpiry(null);
      showToast('Reminders saved.', 'success');
      fetchVehicles();
    }
  };

  const handleSaveEmergencyContact = async (plateKey) => {
    const parts = plateKey.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : plateKey;

    const res = await authFetch(`${SOCKET_URL}/api/emergency`, {
      method: 'POST',
      body: JSON.stringify({ plateNumber: rawPlate, phone: emergencyPhoneInput, countryCode: country })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Emergency contact added.', 'success');
      setEmergencyPhoneInput('');
      fetchVehicles();
    }
  };

  const handleDeleteChat = async (chatId, e) => {
    e.stopPropagation();
    const confirm = window.confirm('Are you sure you want to delete this conversation?');
    if (!confirm) return;
    try {
      const res = await authFetch(`${SOCKET_URL}/api/chats/${chatId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast('Conversation deleted.', 'success');
        fetchChats();
      } else {
        showToast(data.error, 'error');
      }
    } catch (e) {
      showToast('Failed to delete conversation.', 'error');
    }
  };

  const handleUnblockUser = async (blockedId) => {
    const res = await authFetch(`${SOCKET_URL}/api/chats/unblock`, {
      method: 'POST',
      body: JSON.stringify({ blockedUserId: blockedId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('User unblocked.', 'success');
      fetchBlocks();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      
      {/* Dispute Modal inside dashboard */}
      {showDisputeDialog && (
        <div className="verification-overlay">
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--warning)' }}>
              <HelpCircle size={28} />
              <h3 style={{ fontSize: 18 }}>Claim Dispute Request</h3>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Plate <strong>{disputedPlate.toUpperCase()}</strong> is already registered by another owner. If you sold/purchased this car, submit an ownership dispute claim. The CEO admin will verify and reassign the vehicle records.
            </p>

            {disputeSuccessMessage ? (
              <div style={{ color: 'var(--success)', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>
                {disputeSuccessMessage}
              </div>
            ) : (
              <button className="btn btn-primary" onClick={handleFileDispute}>File Ownership Dispute</button>
            )}

            <button className="btn btn-secondary" onClick={() => { setShowDisputeDialog(false); setDisputedPlate(''); }}>
              Close
            </button>
          </div>
        </div>
      )}

      <header className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo-badge" style={{ width: 32, height: 32, borderRadius: 10 }}>
            <Car size={16} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 900, margin: 0, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Owner Dashboard</h1>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Logged in: {ownerPhone}</span>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={handleLogout} style={{ width: 'auto', padding: '8px 12px', color: 'var(--danger)', borderRadius: 8, fontSize: 12, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}>
          <LogOut size={14} /> Logout
        </button>
      </header>

      <main style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Tabs navigation */}
        <div className="tabs-header">
          <button className={`tab-btn ${dashboardTab === 'overview' ? 'active' : ''}`} onClick={() => setDashboardTab('overview')}>
            <Smartphone size={16} /> Overview
          </button>
          <button className={`tab-btn ${dashboardTab === 'reminders' ? 'active' : ''}`} onClick={() => setDashboardTab('reminders')}>
            <Calendar size={16} /> Reminders
          </button>
          <button className={`tab-btn ${dashboardTab === 'logs' ? 'active' : ''}`} onClick={() => setDashboardTab('logs')}>
            <History size={16} /> Logs
          </button>
          <button className={`tab-btn ${dashboardTab === 'blocklist' ? 'active' : ''}`} onClick={() => setDashboardTab('blocklist')}>
            <ShieldAlert size={16} /> Blocklist
          </button>
        </div>

        {/* Tab 1: Overview */}
        {dashboardTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="stats-grid">
              <div className="stat-card"><span className="value">{registeredPlates.length}</span><span className="label">Vehicles</span></div>
              <div className="stat-card"><span className="value">{ownerChats.length + callerChats.length}</span><span className="label">Inbox Alerts</span></div>
            </div>

            {/* Notification Preferences Profile Form */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: 15 }}>Secure Notification Settings</h3>
              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700 }}>WHATSAPP NUMBER (FOR OFFLINE ALERTS)</label>
                  <input 
                    type="tel" 
                    placeholder="WhatsApp Number (e.g. +919876543210)" 
                    className="chat-input"
                    value={profileWhatsapp}
                    onChange={e => setProfileWhatsapp(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700 }}>EMAIL ADDRESS (FOR OFFLINE ALERTS)</label>
                  <input 
                    type="email" 
                    placeholder="Email Address (e.g. you@example.com)" 
                    className="chat-input"
                    value={profileEmail}
                    onChange={e => setProfileEmail(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '12px' }}>
                  Save Profile Settings
                </button>
              </form>
            </div>

            {/* Simplified Add Vehicle panel */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: 15 }}>Register New Vehicle</h3>
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>LICENSE PLATE NUMBER</label>
                  <input 
                    type="text" 
                    className="chat-input" 
                    placeholder="Enter Plate (e.g. GJ05RH0862)"
                    value={newPlateInput}
                    onChange={(e) => setNewPlateInput(e.target.value.toUpperCase())}
                    style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '12px' }}>
                  <Plus size={20} /> Add Vehicle
                </button>
              </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.02em' }}>MY REGISTERED VEHICLES</h3>
              
              {registeredPlates.map(plate => (
                <div key={plate.id} className="vehicle-card">
                  <div className="vehicle-card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <DynamicPlate plateNumber={plate.plate_number} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                      <span className={`pill ${plate.is_verified === 1 ? 'pill-success' : plate.rc_doc ? 'pill-warning' : 'pill-muted'}`}>
                        {plate.is_verified === 1 ? <ShieldCheck size={12} /> : plate.rc_doc ? <Clock size={12} /> : <AlertCircle size={12} />}
                        {plate.is_verified === 1 ? 'Verified RC' : plate.rc_doc ? 'Pending Review (RC Uploaded)' : 'RC Upload Required'}
                      </span>
                      {plate.in_out_status ? (
                        <span className={`pill ${plate.in_out_status === 'entered' ? 'pill-success' : 'pill-muted'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: plate.in_out_status === 'entered' ? 'var(--success)' : 'var(--text-muted)' }}></span>
                          {plate.in_out_status === 'entered' ? 'Parked IN' : 'Exited OUT'}
                          {plate.in_out_time ? ` (${new Date(plate.in_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                        </span>
                      ) : (
                        <span className="pill pill-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }}></span>
                          Status: Not Logged
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="vehicle-card-body">
                    {/* DND and Parking Log Controls Grid */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <button 
                        onClick={() => handleToggleDnd(plate.plate_number, plate.dnd)} 
                        className={`btn ${(plate.dnd === 1 || plate.dnd === true || plate.dnd === '1') ? 'btn-secondary' : 'btn-primary'}`} 
                        style={{ width: 'auto', padding: '8px 14px', fontSize: 11.5, borderRadius: 10, gap: 5 }}
                      >
                        {(plate.dnd === 1 || plate.dnd === true || plate.dnd === '1') ? <BellOff size={14} color="var(--danger)" /> : <Bell size={14} color="var(--success)" />}
                        <span>{(plate.dnd === 1 || plate.dnd === true || plate.dnd === '1') ? 'DND Active' : 'Calls Active'}</span>
                      </button>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button 
                          className={`btn ${plate.in_out_status === 'entered' ? 'btn-success' : 'btn-secondary'}`} 
                          onClick={() => handleCheckInOut(plate.plate_number, 'entered')} 
                          style={{ width: 'auto', padding: '8px 12px', fontSize: 11.5, borderRadius: 10, fontWeight: plate.in_out_status === 'entered' ? 700 : 500, background: plate.in_out_status === 'entered' ? 'var(--success)' : undefined, color: plate.in_out_status === 'entered' ? 'white' : undefined }}
                        >
                          In
                        </button>
                        <button 
                          className={`btn ${plate.in_out_status === 'exited' ? 'btn-secondary' : 'btn-secondary'}`} 
                          onClick={() => handleCheckInOut(plate.plate_number, 'exited')} 
                          style={{ width: 'auto', padding: '8px 12px', fontSize: 11.5, borderRadius: 10, fontWeight: plate.in_out_status === 'exited' ? 700 : 500, background: plate.in_out_status === 'exited' ? 'var(--danger)' : undefined, color: plate.in_out_status === 'exited' ? 'white' : undefined }}
                        >
                          Out
                        </button>
                      </div>
                    </div>

                    {/* Expandable Verification Box if unverified */}
                    {plate.is_verified !== 1 && (
                      <div className="verification-box" style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, color: plate.rc_doc ? 'var(--success)' : 'var(--text-muted)', lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          {plate.rc_doc ? <CheckCircle size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 1 }} /> : <ShieldAlert size={15} color="var(--primary)" style={{ flexShrink: 0, marginTop: 1 }} />}
                          <span>
                            {plate.rc_doc 
                              ? <strong>📄 RC Document uploaded successfully and is currently under review by our team. You can replace/re-upload below if needed.</strong>
                              : <>🔒 <strong>Legal Privacy check</strong>: Blurring out home address is recommended before upload.</>
                            }
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <input 
                            type="checkbox" 
                            id={`consent-${plate.plate_number}`}
                            checked={!!rcConsents[plate.plate_number]}
                            onChange={() => toggleConsent(plate.plate_number)}
                            style={{ width: 15, height: 15, cursor: 'pointer' }}
                          />
                          <label htmlFor={`consent-${plate.plate_number}`} style={{ fontSize: 11.5, color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                            {plate.rc_doc ? 'I consent to replace my uploaded RC document.' : 'I consent to securely upload RC.'}
                          </label>
                        </div>

                        <input 
                          type="file" 
                          accept="image/*,application/pdf"
                          id={`rc-file-${plate.plate_number}`}
                          style={{ display: 'none' }}
                          onChange={(e) => handleUploadRcFile(plate.plate_number, e)}
                        />

                        <button 
                          className={`custom-file-upload ${!rcConsents[plate.plate_number] ? 'disabled' : ''}`}
                          onClick={() => rcConsents[plate.plate_number] && document.getElementById(`rc-file-${plate.plate_number}`).click()}
                          disabled={!rcConsents[plate.plate_number]}
                          style={{ marginTop: 6 }}
                        >
                          <Plus size={14} /> {plate.rc_doc ? 'Replace RC Document' : 'Upload RC Document'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.02em' }}>CONVERSATIONS INBOX</h3>
              <div className="inbox-list">
                {ownerChats.map(c => {
                  const plateDisplay = c.plate_number.split(':')[1] || c.plate_number;
                  const countryCode = c.plate_number.split(':')[0] || 'IN';
                  return (
                    <div key={c.id} className="inbox-item-premium" onClick={() => navigate(`/chat/${c.plate_number}`)}>
                      <div className="inbox-item-meta">
                        <div className="inbox-avatar">{plateDisplay.substring(0, 2)}</div>
                        <div className="inbox-details">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{plateDisplay}</span>
                            <span className="plate-country-pill" style={{ padding: '2px 4px', fontSize: 8 }}>{countryCode}</span>
                          </div>
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Spam-Shielded Alert ({c.caller_id.substring(0, 8)}...)</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <MessageSquare size={16} color="var(--primary)" />
                        <button 
                          type="button"
                          onClick={(e) => handleDeleteChat(c.id, e)} 
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 4 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {callerChats.map(c => {
                  const plateDisplay = c.plate_number.split(':')[1] || c.plate_number;
                  const countryCode = c.plate_number.split(':')[0] || 'IN';
                  return (
                    <div key={c.id} className="inbox-item-premium" onClick={() => navigate(`/chat/${c.plate_number}`)} style={{ borderLeft: '4px solid var(--primary)' }}>
                      <div className="inbox-item-meta">
                        <div className="inbox-avatar" style={{ background: 'var(--primary)', color: 'white' }}>{plateDisplay.substring(0, 2)}</div>
                        <div className="inbox-details">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{plateDisplay}</span>
                            <span className="plate-country-pill" style={{ padding: '2px 4px', fontSize: 8 }}>{countryCode}</span>
                          </div>
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Contacting Owner</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <MessageSquare size={16} color="var(--primary)" />
                        <button 
                          type="button"
                          onClick={(e) => handleDeleteChat(c.id, e)} 
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 4 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Reminders */}
        {dashboardTab === 'reminders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {registeredPlates.map(plate => {
              const fastagStat = renderExpiryStatus(calculateDaysRemaining(plate.fastag_expiry));
              const pucStat = renderExpiryStatus(calculateDaysRemaining(plate.puc_expiry));
              const insuranceStat = renderExpiryStatus(calculateDaysRemaining(plate.insurance_expiry));

              return (
                <div key={plate.id} style={{ borderBottom: '1px solid var(--border-card)', paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <DynamicPlate plateNumber={plate.plate_number} className="mini" />
                    <button className="btn btn-secondary" onClick={() => { setEditingPlateExpiry(plate); setFastagExpiryInput(plate.fastag_expiry || ''); setPucExpiryInput(plate.puc_expiry || ''); setInsuranceExpiryInput(plate.insurance_expiry || ''); }} style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}>Set Expiries</button>
                  </div>

                  <div className="reminder-item">
                    <div>
                      <div className="reminder-header"><span>FasTag Wallet Expiry</span><span className={`pill ${fastagStat.class}`}>{fastagStat.text}</span></div>
                      <div className="expiry-bar-container" style={{ marginTop: 6 }}><div className={`expiry-bar-fill ${fastagStat.barClass}`} style={{ width: `${fastagStat.pct}%` }} /></div>
                    </div>
                    <div>
                      <div className="reminder-header"><span>PUC Pollution Expiry</span><span className={`pill ${pucStat.class}`}>{pucStat.text}</span></div>
                      <div className="expiry-bar-container" style={{ marginTop: 6 }}><div className={`expiry-bar-fill ${pucStat.barClass}`} style={{ width: `${pucStat.pct}%` }} /></div>
                    </div>
                    <div>
                      <div className="reminder-header"><span>Insurance Cover Expiry</span><span className={`pill ${insuranceStat.class}`}>{insuranceStat.text}</span></div>
                      <div className="expiry-bar-container" style={{ marginTop: 6 }}><div className={`expiry-bar-fill ${insuranceStat.barClass}`} style={{ width: `${insuranceStat.pct}%` }} /></div>
                    </div>
                  </div>
                </div>
              );
            })}

            {editingPlateExpiry && (
              <div className="verification-overlay">
                <form onSubmit={handleSaveReminders} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <h3>Set Reminders</h3>
                  <input type="date" className="chat-input" value={fastagExpiryInput} onChange={e => setFastagExpiryInput(e.target.value)} />
                  <input type="date" className="chat-input" value={pucExpiryInput} onChange={e => setPucExpiryInput(e.target.value)} />
                  <input type="date" className="chat-input" value={insuranceExpiryInput} onChange={e => setInsuranceExpiryInput(e.target.value)} />
                  <button type="submit" className="btn btn-primary">Save</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingPlateExpiry(null)}>Cancel</button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Logs */}
        {dashboardTab === 'logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {registeredPlates.map(plate => (
                <button key={plate.id} className={`btn ${viewingLogsPlate === plate.plate_number ? 'btn-primary' : 'btn-secondary'}`} onClick={() => fetchPlateLogs(plate.plate_number)} style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}>
                  {plate.plate_number.split(':')[1] || plate.plate_number}
                </button>
              ))}
            </div>
            {viewingLogsPlate && (
              <div className="glass-panel">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0 }}>Parking Logs for</h4>
                  <DynamicPlate plateNumber={viewingLogsPlate} className="mini" />
                </div>
                {activePlateLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', padding: 8, fontSize: 12 }}>
                    <span style={{ color: log.action === 'entered' ? 'var(--success)' : 'var(--danger)' }}>{log.action === 'entered' ? 'Entered' : 'Exited'}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Blocklist */}
        {dashboardTab === 'blocklist' && (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3>Blocked Callers</h3>
            {blockedUsers.map(b => (
              <div key={b.id} style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', padding: 8 }}>
                <span style={{ fontSize: 13 }}>ID: {b.blocked_user_id.substring(0, 12)}...</span>
                <button className="btn btn-danger-outline" onClick={() => handleUnblockUser(b.blocked_user_id)}>Unblock</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// --- Page 4: Anonymous Chat View Page ---
function ChatPage({ userId, socketRef, requestVerificationWrapper, startAudioCall, showToast }) {
  const navigate = useNavigate();
  const { plate } = useParams();
  const location = useLocation();

  const [activeChat, setActiveChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [messagesSentToday, setMessagesSentToday] = useState(0);
  const [chatError, setChatError] = useState('');

  // Offline status pill flags
  const [ownerOfflineAlert, setOwnerOfflineAlert] = useState(false);

  const isAutoCall = location.search.includes('call=true');

  useEffect(() => {
    if (!plate) return;
    initChat();
  }, [plate]);

  const initChat = async () => {
    const parts = plate.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : plate;

    try {
      const res = await authFetch(`${SOCKET_URL}/api/chats/get-or-create`, {
        method: 'POST',
        body: JSON.stringify({ plateNumber: rawPlate, countryCode: country })
      });
      const data = await res.json();
      if (data.success) {
        const ownerDetailRes = await authFetch(`${SOCKET_URL}/api/vehicles/owner/${rawPlate}?countryCode=${country}`);
        const ownerDetail = await ownerDetailRes.json();

        setActiveChat({
          id: data.chat.id,
          plate_number: plate,
          recipientId: ownerDetail.registered ? ownerDetail.owner_id : 'unregistered'
        });
        setChatMessages(data.messages);
        setMessagesSentToday(data.messagesSentToday || 0);

        if (data.ownerOffline) {
          setOwnerOfflineAlert(true);
        }

        if (socketRef.current) {
          socketRef.current.emit('join-chat', data.chat.id);
        }

        if (isAutoCall && ownerDetail.registered) {
          setTimeout(() => startAudioCall(data.chat.id, plate, ownerDetail.owner_id), 800);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeChat) return;

    if (socketRef.current) {
      const effectiveSenderId = userId || localStorage.getItem('vehicle_app_user_id') || localStorage.getItem('vehicle_app_guest_id') || '00000000-0000-4000-a000-000000000001';
      socketRef.current.emit('send-message', {
        chatId: activeChat.id,
        senderId: effectiveSenderId,
        recipientId: activeChat.recipientId,
        text: chatInput,
        plateNumber: activeChat.plate_number
      });
    }
    setChatInput('');
  };

  const handleBlockUser = async () => {
    if (!activeChat || activeChat.recipientId === 'unregistered') return;
    const res = await authFetch(`${SOCKET_URL}/api/chats/block`, {
      method: 'POST',
      body: JSON.stringify({ blockedUserId: activeChat.recipientId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Owner blocked successfully.', 'success');
      navigate('/');
    }
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ArrowLeft size={24} /></button>
          <div style={{ width: 1, height: 20, background: 'var(--border-card)' }}></div>
          <DynamicPlate plateNumber={plate} className="mini" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {activeChat?.recipientId !== 'unregistered' && (
            <button className="btn btn-success" onClick={() => requestVerificationWrapper(() => startAudioCall(activeChat.id, plate, activeChat.recipientId))} style={{ width: 'auto', padding: '8px 12px', borderRadius: 8 }}><Phone size={14} /> Call</button>
          )}
          {activeChat?.recipientId !== 'unregistered' && activeChat?.recipientId !== userId && (
            <button className="btn btn-danger" onClick={handleBlockUser} style={{ width: 'auto', padding: '8px 12px', borderRadius: 8 }}><Lock size={14} /> Block</button>
          )}
        </div>
      </header>

      {/* Dispatched Notification confirmation alerts */}
      {ownerOfflineAlert && (
        <div style={{ background: 'rgba(79, 70, 229, 0.08)', color: 'var(--primary)', padding: '10px 16px', borderBottom: '1px solid var(--border-card)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={14} style={{ flexShrink: 0 }} />
          <span>Owner is offline. Dispatched alert notifications to their WhatsApp & Email.</span>
        </div>
      )}

      <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid var(--border-card)', fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between' }}>
        <span>Security Shield Active</span>
        <span>Sent: {messagesSentToday}/5 limit</span>
      </div>

      <div className="chat-messages">
        {chatMessages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.sender_id === userId ? 'sent' : 'received'}`}>
            <div>{msg.text}</div>
            <div className="chat-timestamp">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        ))}
      </div>

      {chatError && (
        <div style={{ background: 'rgba(239, 68, 68, 0.95)', color: 'white', padding: 10, textSelf: 'center', fontSize: 13 }}>
          <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />{chatError}
        </div>
      )}

      <form onSubmit={handleSend} className="chat-input-bar">
        <input type="text" className="chat-input" placeholder={messagesSentToday >= 5 ? "Limit reached" : "Message owner..."} value={chatInput} onChange={e => setChatInput(e.target.value)} disabled={messagesSentToday >= 5} />
        <button type="submit" className="chat-send-btn" disabled={messagesSentToday >= 5}><Send size={18} /></button>
      </form>
    </div>
  );
}

// --- Page 5: CEO Admin Authorization Login Page ---
function AdminLoginPage({ showToast }) {
  const navigate = useNavigate();
  const [passInput, setPassInput] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (passInput === 'ceo2026') {
      localStorage.setItem('vehicle_app_admin_secret', 'ceo2026');
      showToast('Admin access authorized.', 'success');
      navigate('/admin');
    } else {
      showToast('Access Denied: Invalid credentials.', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <header className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}><ArrowLeft size={24} /></Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="logo-badge" style={{ width: 26, height: 26, borderRadius: 8 }}>
              <Shield size={13} color="white" />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>CEO Admin Portal</span>
          </div>
        </div>
      </header>

      <main style={{ padding: '40px 24px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        <form onSubmit={handleLogin} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--primary)', alignSelf: 'center' }}>
            <Shield size={32} />
            <h2 style={{ fontSize: 24 }}>CEO Credentials</h2>
          </div>
          <input type="password" placeholder="Passcode (ceo2026)" className="chat-input" value={passInput} onChange={e => setPassInput(e.target.value)} required />
          <button type="submit" className="btn btn-primary" style={{ padding: '15px' }}>Authorize</button>
        </form>
      </main>
    </div>
  );
}

// --- Page 6: CEO Admin Dashboard Control Center Page ---
function AdminDashboardPage({ showToast }) {
  const navigate = useNavigate();
  const [adminTab, setAdminTab] = useState('verifications');
  const [adminStats, setAdminStats] = useState({ totalUsers: 0, totalVehicles: 0, totalVerified: 0, totalPending: 0, totalBlocks: 0, totalDisputes: 0 });
  const [adminVehicles, setAdminVehicles] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminGlobalBlocks, setAdminGlobalBlocks] = useState([]);
  const [adminDisputes, setAdminDisputes] = useState([]);

  const [viewingRcDoc, setViewingRcDoc] = useState(null);

  useEffect(() => {
    if (localStorage.getItem('vehicle_app_admin_secret') !== 'ceo2026') {
      navigate('/admin/login');
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const resStats = await adminFetch(`${SOCKET_URL}/api/admin/stats`);
      const dataStats = await resStats.json();
      if (dataStats.success) setAdminStats(dataStats.stats);

      const resUsers = await adminFetch(`${SOCKET_URL}/api/admin/users`);
      const dataUsers = await resUsers.json();
      if (dataUsers.success) setAdminUsers(dataUsers.users);

      const resVehicles = await adminFetch(`${SOCKET_URL}/api/admin/vehicles`);
      const dataVehicles = await resVehicles.json();
      if (dataVehicles.success) setAdminVehicles(dataVehicles.vehicles);

      const resBlocks = await adminFetch(`${SOCKET_URL}/api/admin/blocks`);
      const dataBlocks = await resBlocks.json();
      if (dataBlocks.success) setAdminGlobalBlocks(dataBlocks.blocks);

      const resDisputes = await adminFetch(`${SOCKET_URL}/api/admin/disputes`);
      const dataDisputes = await resDisputes.json();
      if (dataDisputes.success) setAdminDisputes(dataDisputes.disputes);
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerify = async (ownerId, plateNum, status) => {
    const parts = plateNum.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : plateNum;

    const res = await adminFetch(`${SOCKET_URL}/api/admin/vehicles/verify`, {
      method: 'POST',
      body: JSON.stringify({ ownerId, plateNumber: rawPlate, status, countryCode: country })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Vehicle set to ${status}.`, 'success');
      fetchData();
    }
  };

  const handleResolve = async (disputeId, action) => {
    const res = await adminFetch(`${SOCKET_URL}/api/admin/disputes/resolve`, {
      method: 'POST',
      body: JSON.stringify({ disputeId, status: action })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Dispute transfer ${action}.`, 'success');
      fetchData();
    }
  };

  const handleBan = async (userId) => {
    const confirm = window.confirm(`Ban user ${userId}?`);
    if (!confirm) return;
    const res = await adminFetch(`${SOCKET_URL}/api/admin/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('User has been banned.', 'success');
      fetchData();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      
      {/* CEO RC Inspector Overlay Modal */}
      {viewingRcDoc && (
        <div className="verification-overlay" style={{ zIndex: 200 }}>
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 360, width: '100%', alignSelf: 'center' }}>
            <h3 style={{ fontSize: 18 }}>RC Document Inspector</h3>
            <div style={{ overflow: 'auto', maxHeight: 300, background: '#000', display: 'flex', justifyContent: 'center', borderRadius: 10, padding: 10 }}>
              <img src={viewingRcDoc} alt="Vehicle RC Registration Card" style={{ maxWidth: '100%', height: 'auto', borderRadius: 6 }} />
            </div>
            <button className="btn btn-secondary" onClick={() => setViewingRcDoc(null)}>Close Inspector</button>
          </div>
        </div>
      )}

      <header className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo-badge" style={{ width: 32, height: 32, borderRadius: 10 }}>
            <Shield size={16} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 900, margin: 0, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>CEO Control Center</h1>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Security Check: Verified</span>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => { localStorage.removeItem('vehicle_app_admin_secret'); navigate('/'); }} style={{ width: 'auto', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>Logout CEO</button>
      </header>

      <main style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Stats grid */}
        <div className="stats-grid">
          <div className="stat-card"><span className="value">{adminStats.totalUsers}</span><span className="label">Users</span></div>
          <div className="stat-card"><span className="value">{adminStats.totalPending}</span><span className="label">Pending RC</span></div>
          <div className="stat-card"><span className="value">{adminStats.totalDisputes}</span><span className="label">Disputes</span></div>
          <div className="stat-card"><span className="value">{adminStats.totalBlocks}</span><span className="label">Blocks</span></div>
        </div>

        {/* Tab navigations */}
        <div className="tabs-header">
          <button className={`tab-btn ${adminTab === 'verifications' ? 'active' : ''}`} onClick={() => setAdminTab('verifications')}><CheckCircle size={16} /> Verifications</button>
          <button className={`tab-btn ${adminTab === 'disputes' ? 'active' : ''}`} onClick={() => setAdminTab('disputes')}><HelpCircle size={16} /> Disputes</button>
          <button className={`tab-btn ${adminTab === 'users' ? 'active' : ''}`} onClick={() => setAdminTab('users')}><User size={16} /> Users</button>
          <button className={`tab-btn ${adminTab === 'blocks' ? 'active' : ''}`} onClick={() => setAdminTab('blocks')}><ShieldAlert size={16} /> Blocks</button>
        </div>

        {/* Tab 1: Verifications Queue */}
        {adminTab === 'verifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {adminVehicles.map(v => (
              <div key={v.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
                  <DynamicPlate plateNumber={v.plate_number} className="mini" />
                  <span className={`pill ${v.verification_status === 'verified' ? 'pill-success' : 'pill-warning'}`}>{v.verification_status}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Owner: {v.owner_phone}</div>
                
                {/* View RC Document Inspector Button */}
                {v.rc_doc && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setViewingRcDoc(v.rc_doc)}
                    style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                  >
                    <Eye size={14} /> View RC Document
                  </button>
                )}

                {v.verification_status !== 'verified' ? (
                  <button className="btn btn-success" onClick={() => handleVerify(v.owner_id, v.plate_number, 'verified')} style={{ padding: '8px 12px', fontSize: 12 }}>Approve Verification</button>
                ) : (
                  <button className="btn btn-danger" onClick={() => handleVerify(v.owner_id, v.plate_number, 'unverified')} style={{ padding: '8px 12px', fontSize: 12 }}>Revoke Verification</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Disputes Queue */}
        {adminTab === 'disputes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {adminDisputes.map(d => (
              <div key={d.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
                  <DynamicPlate plateNumber={d.plate_number} className="mini" />
                  <span className="pill pill-warning">{d.status}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Disputing Owner: {d.disputing_phone}<br />Current Owner: {d.current_owner_phone}</div>
                {d.status === 'open' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-success" onClick={() => handleResolve(d.id, 'approved')} style={{ flex: 1, padding: '8px' }}>Approve Dispute</button>
                    <button className="btn btn-danger" onClick={() => handleResolve(d.id, 'rejected')} style={{ flex: 1, padding: '8px' }}>Reject Dispute</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Users List */}
        {adminTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {adminUsers.map(u => (
              <div key={u.id} className="glass-panel" style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
                <div><div style={{ fontSize: 13, fontWeight: 700 }}>Phone: {u.phone_number || 'Guest'}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>UID: {u.id}</div></div>
                <button className="btn btn-danger-outline" onClick={() => handleBan(u.id)}>Ban Spammer</button>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Block Logs */}
        {adminTab === 'blocks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {adminGlobalBlocks.map(b => (
              <div key={b.id} className="glass-panel" style={{ fontSize: 12, padding: 12 }}>
                <div>Blocked By: {b.owner_phone || 'Anonymous'}</div>
                <div>Target Block: {b.blocked_phone || 'Anonymous'}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// Custom Helper: Render expiry warn status
const renderExpiryStatus = (days) => {
  if (days === null) return { text: 'Not set', class: 'pill-muted', pct: 0, barClass: 'expired' };
  if (days <= 0) return { text: 'Expired', class: 'pill-danger', pct: 100, barClass: 'expired' };
  if (days <= 30) return { text: `${days} days left`, class: 'pill-warning', pct: 30, barClass: 'warning' };
  return { text: `${days} days left`, class: 'pill-success', pct: 100, barClass: 'safe' };
};

const calculateDaysRemaining = (expiryDateStr) => {
  if (!expiryDateStr) return null;
  const expiry = new Date(expiryDateStr);
  const today = new Date();
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  initDb,
  getOrCreateUser,
  registerVehicle,
  getVehicleOwner,
  lookupVehicleGlobal,
  toggleDnd,
  getOwnerVehicles,
  getOrCreateChat,
  saveMessage,
  getChatMessages,
  getOwnerChats,
  getCallerChats,
  normalizePlate,
  blockUser,
  unblockUser,
  getBlockedUsers,
  isBlocked,
  countMessagesInLast24Hours,
  addParkingLog,
  getParkingLogs,
  updateReminders,
  updateEmergencyContact,
  updateVerificationStatus,
  createDispute,
  getAllDisputes,
  resolveDispute,
  getAllVehicles,
  getAllUsers,
  getAllGlobalBlocks,
  deleteUser,
  updateUserProfile,
  getUserProfile,
  deleteChat,
  getSupabase
} from './database.js';

// Synchronous local .env variable loader fallback
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      if (key && !key.startsWith('#')) {
        process.env[key] = val;
      }
    }
  });
}

const app = express({ limit: '50mb' });
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory mappings
const userSockets = new Map();
const activeCalls = new Map();
const searchRateLimits = new Map();

// Database Initialization
initDb().catch((err) => {
  console.error('Failed to initialize database:', err);
});

// Regex format auto-detector helper
const autoDetectCountry = (plateStr) => {
  const clean = plateStr.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (/^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/.test(clean)) return 'IN';
  if (/^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(clean)) return 'GB';
  if (/^[A-Z]{1,3}[A-Z0-9]{1,4}[0-9]{1,4}$/.test(clean) && clean.length >= 6) return 'EU';
  if (/^[0-9]{1,6}$/.test(clean)) return 'AE';
  if (clean.length >= 5 && clean.length <= 7) return 'US';
  return 'GL';
};

// --- Offline Notification Dispatcher Helper ---
const dispatchOfflineNotifications = async (ownerProfile, plateNumber) => {
  const { phone_number, email, whatsapp_number } = ownerProfile;
  const targetWhatsapp = whatsapp_number || phone_number;
  const formattedPlate = plateNumber.toUpperCase();
  const chatLink = `http://localhost:5173/chat/${plateNumber}`;

  // 1. WhatsApp Dispatch (Official Meta Cloud API client logic)
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const waTemplate = process.env.WHATSAPP_TEMPLATE_NAME || "hello_world";

  if (waToken && waPhoneId && targetWhatsapp) {
    try {
      let cleanWaNumber = targetWhatsapp.replace(/[^0-9]/g, '');
      if (cleanWaNumber.length === 10) {
        cleanWaNumber = '91' + cleanWaNumber;
      }
      const url = `https://graph.facebook.com/v19.0/${waPhoneId}/messages`;
      const body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanWaNumber,
        type: "template",
        template: {
          name: waTemplate,
          language: { code: "en_US" },
          components: waTemplate !== "hello_world" ? [
            {
              type: "body",
              parameters: [
                { type: "text", text: formattedPlate },
                { type: "text", text: chatLink }
              ]
            }
          ] : undefined
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      console.log(`[WHATSAPP DISPATCH SUCCESS] Sent alert to WhatsApp: ${cleanWaNumber}. Meta status:`, data);
    } catch (err) {
      console.error(`[WHATSAPP DISPATCH ERROR] Failed to send WhatsApp alert:`, err.message);
    }
  } else {
    console.log(`
┌────────────────────────────────────────────────────────┐
│  🟢 META WHATSAPP BUSINESS CLUID API DISPATCH          │
├────────────────────────────────────────────────────────┤
│  Recipient WhatsApp : ${targetWhatsapp || 'Not configured'}                  │
│  Template Name      : ${waTemplate}             │
│  Template Params    : [ "${formattedPlate}", "${chatLink}" ]   │
│  Status             : Simulated SUCCESS (API Key Missing)│
└────────────────────────────────────────────────────────┘
    `);
  }

  // 2. Resend Email Dispatch (REST API)
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "onboarding@resend.dev";

  if (resendApiKey && email) {
    try {
      const url = 'https://api.resend.com/emails';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `Urgent: Contact Request for Vehicle ${formattedPlate}`,
          html: `<p>Hi,</p><p>Someone is trying to contact you regarding your vehicle <strong>${formattedPlate}</strong>. Open this secure link to chat or call anonymously:</p><p><a href="${chatLink}">${chatLink}</a></p><p>Best,<br/>Sampark Support</p>`
        })
      });
      const data = await response.json();
      console.log(`[EMAIL DISPATCH SUCCESS] Sent alert to Email: ${email}. Resend status:`, data);
    } catch (err) {
      console.error(`[EMAIL DISPATCH ERROR] Failed to send Email alert:`, err.message);
    }
  } else {
    console.log(`
┌────────────────────────────────────────────────────────┐
│  ✉️ RESEND TRANSACTIONAL EMAIL DISPATCH                │
├────────────────────────────────────────────────────────┤
│  Recipient Email    : ${email || 'Not configured'}                  │
│  Subject            : Contact Request for Vehicle ${formattedPlate} │
│  Status             : Simulated SUCCESS (API Key Missing)│
└────────────────────────────────────────────────────────┘
    `);
  }
};

// --- Security Middlewares ---
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Session token missing.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Session invalid.' });
    }
    req.userId = user.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Auth processing error.' });
  }
};

const getGuestIdFromRequest = (req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || 'anonymous_ua';
  const hash = crypto.createHash('md5').update(`vowner_guest_${ip}_${ua}`).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
};

const getGuestIdFromSocket = (socket) => {
  const ip = socket.handshake?.headers?.['x-forwarded-for'] || socket.handshake?.address || '127.0.0.1';
  const ua = socket.handshake?.headers?.['user-agent'] || 'anonymous_ua';
  const hash = crypto.createHash('md5').update(`vowner_guest_${ip}_${ua}`).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
};

const optionalAuthUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        req.userId = user.id;
        return next();
      }
    } catch (err) {
      // Ignore token validation error for optional auth
    }
  }

  // Deterministic fallback for guest callers based on IP and User-Agent
  const guestId = getGuestIdFromRequest(req);
  try {
    await getOrCreateUser(guestId, 'Anonymous Guest');
    req.userId = guestId;
  } catch (err) {
    req.userId = guestId;
  }
  next();
};

const authenticateAdmin = (req, res, next) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== 'ceo2026') {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid admin credentials.' });
  }
  next();
};

const checkSearchRateLimit = (req, res, next) => {
  const identifier = req.userId || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous';

  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const LIMIT = 15;

  const record = searchRateLimits.get(identifier);
  if (!record) {
    searchRateLimits.set(identifier, { count: 1, startTime: now });
    return next();
  }

  if (now - record.startTime > ONE_HOUR) {
    searchRateLimits.set(identifier, { count: 1, startTime: now });
    return next();
  }

  if (record.count >= LIMIT) {
    return res.status(429).json({
      success: false,
      error: 'Security rate limit exceeded. You can only search 15 vehicles per hour.'
    });
  }

  record.count += 1;
  next();
};

// --- Secure REST API Routes ---

app.post('/api/auth', async (req, res) => {
  const { id, phoneNumber } = req.body;
  try {
    const effectiveId = id || getGuestIdFromRequest(req);
    const user = await getOrCreateUser(effectiveId, phoneNumber || 'Anonymous Guest');
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Profile Management Routes
app.get('/api/user/profile', authenticateUser, async (req, res) => {
  try {
    const profile = await getUserProfile(req.userId);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/user/profile', authenticateUser, async (req, res) => {
  const { email, whatsappNumber } = req.body;
  try {
    const profile = await updateUserProfile(req.userId, email, whatsappNumber);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/vehicles/register', authenticateUser, async (req, res) => {
  const { plateNumber, countryCode } = req.body;
  try {
    const vehicle = await registerVehicle(req.userId, plateNumber, countryCode || 'IN');
    res.json({ success: true, vehicle });
  } catch (err) {
    if (err.message === 'PLATE_CLAIMED') {
      return res.status(409).json({ success: false, code: 'PLATE_CLAIMED', error: 'Plate already claimed.' });
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/vehicles', authenticateUser, async (req, res) => {
  try {
    const vehicles = await getOwnerVehicles(req.userId);
    res.json({ success: true, vehicles });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Refactored Search endpoint: matches globally without country code LOV
app.get('/api/vehicles/owner/:plate', optionalAuthUser, checkSearchRateLimit, async (req, res) => {
  const { plate } = req.params;
  try {
    const matches = await lookupVehicleGlobal(plate);
    
    if (matches.length === 0) {
      return res.json({ 
        success: true, 
        registered: false, 
        detectedCountry: autoDetectCountry(plate) 
      });
    }

    if (matches.length === 1) {
      const ownerInfo = matches[0];
      return res.json({
        success: true,
        registered: true,
        multipleMatches: false,
        owner_id: ownerInfo.owner_id,
        dnd: ownerInfo.dnd === 1,
        isVerified: ownerInfo.is_verified === 1,
        verificationStatus: ownerInfo.verification_status,
        emergencyPhone: ownerInfo.emergency_phone || '',
        fastagExpiry: ownerInfo.fastag_expiry || '',
        pucExpiry: ownerInfo.puc_expiry || '',
        insuranceExpiry: ownerInfo.insurance_expiry || '',
        plate_number: ownerInfo.plate_number
      });
    }

    // Multiple plates conflict matched: return choices
    return res.json({
      success: true,
      registered: true,
      multipleMatches: true,
      matches: matches.map(m => ({
        plate_number: m.plate_number,
        isVerified: m.is_verified === 1,
        verificationStatus: m.verification_status,
        dnd: m.dnd === 1
      }))
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/vehicles/dnd', authenticateUser, async (req, res) => {
  const { plateNumber, dnd, countryCode } = req.body;
  try {
    const vehicle = await toggleDnd(req.userId, plateNumber, dnd, countryCode || 'IN');
    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/vehicles/reminders', authenticateUser, async (req, res) => {
  const { plateNumber, fastag, puc, insurance, countryCode } = req.body;
  try {
    const vehicle = await updateReminders(req.userId, plateNumber, fastag, puc, insurance, countryCode || 'IN');
    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/vehicles/emergency', optionalAuthUser, async (req, res) => {
  const { plateNumber, phone, countryCode } = req.body;
  try {
    const vehicle = await updateEmergencyContact(req.userId, plateNumber, phone, countryCode || 'IN');
    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/vehicles/verify', authenticateUser, async (req, res) => {
  const { plateNumber, rcDoc, countryCode } = req.body;
  console.log(`[VERIFY UPLOAD] Plate: ${plateNumber}, Doc Size: ${rcDoc ? rcDoc.length : 0} bytes`);
  try {
    const vehicle = await updateVerificationStatus(req.userId, plateNumber, 'pending', rcDoc, countryCode || 'IN');
    console.log('[VERIFY UPLOAD SUCCESS] Status set to pending.');
    res.json({ success: true, vehicle });
  } catch (err) {
    console.error('[VERIFY UPLOAD ERROR]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/vehicles/dispute', authenticateUser, async (req, res) => {
  const { plateNumber, countryCode } = req.body;
  try {
    const disputeId = await createDispute(plateNumber, req.userId, countryCode || 'IN');
    res.json({ success: true, disputeId });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/chats/block', authenticateUser, async (req, res) => {
  const { blockedUserId } = req.body;
  try {
    await blockUser(req.userId, blockedUserId);
    res.json({ success: true, message: 'User blocked.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/chats/unblock', authenticateUser, async (req, res) => {
  const { blockedUserId } = req.body;
  try {
    await unblockUser(req.userId, blockedUserId);
    res.json({ success: true, message: 'User unblocked.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/chats/blocks', authenticateUser, async (req, res) => {
  try {
    const blocks = await getBlockedUsers(req.userId);
    res.json({ success: true, blocks });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/vehicles/logs', authenticateUser, async (req, res) => {
  const { plateNumber, action, countryCode } = req.body;
  try {
    const log = await addParkingLog(plateNumber, action, countryCode || 'IN');
    res.json({ success: true, log });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/vehicles/logs', authenticateUser, async (req, res) => {
  const { plateNumber, countryCode } = req.query;
  try {
    const logs = await getParkingLogs(plateNumber, countryCode || 'IN');
    res.json({ success: true, logs });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/chats/get-or-create', optionalAuthUser, async (req, res) => {
  const { plateNumber, countryCode } = req.body;
  try {
    const chat = await getOrCreateChat(plateNumber, req.userId, countryCode || 'IN');
    const messages = await getChatMessages(chat.id);
    const msgCount = await countMessagesInLast24Hours(chat.id, req.userId);

    const ownerDetail = await getVehicleOwner(plateNumber, countryCode || 'IN');
    let ownerOnline = false;
    
    if (ownerDetail) {
      const ownerSocketId = userSockets.get(ownerDetail.owner_id);
      ownerOnline = !!ownerSocketId;

      if (!ownerOnline) {
        const ownerProfile = await getUserProfile(ownerDetail.owner_id);
        if (ownerProfile) {
          await dispatchOfflineNotifications(ownerProfile, plateNumber);
        }
      }
    }

    res.json({ success: true, chat, messages, messagesSentToday: msgCount, ownerOffline: !ownerOnline, callerId: req.userId });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/chats/owner', authenticateUser, async (req, res) => {
  try {
    const chats = await getOwnerChats(req.userId);
    res.json({ success: true, chats });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/chats/caller', authenticateUser, async (req, res) => {
  try {
    const chats = await getCallerChats(req.userId);
    res.json({ success: true, chats });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/chats/:chatId/messages', optionalAuthUser, async (req, res) => {
  const { chatId } = req.params;
  try {
    const messages = await getChatMessages(chatId);
    res.json({ success: true, messages });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/chats/:chatId', authenticateUser, async (req, res) => {
  const { chatId } = req.params;
  try {
    await deleteChat(chatId, req.userId);
    res.json({ success: true, message: 'Conversation deleted.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- CEO Admin Dashboard Routes (authenticateAdmin) ---

app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    const vehicles = await getAllVehicles();
    const blocks = await getAllGlobalBlocks();
    const disputes = await getAllDisputes();
    
    const pendingVehicles = vehicles.filter(v => v.verification_status === 'pending');
    const verifiedVehicles = vehicles.filter(v => v.verification_status === 'verified');
    const openDisputes = disputes.filter(d => d.status === 'open');

    res.json({
      success: true,
      stats: {
        totalUsers: users.length,
        totalVehicles: vehicles.length,
        totalVerified: verifiedVehicles.length,
        totalPending: pendingVehicles.length,
        totalBlocks: blocks.length,
        totalDisputes: openDisputes.length
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/vehicles', authenticateAdmin, async (req, res) => {
  try {
    const vehicles = await getAllVehicles();
    res.json({ success: true, vehicles });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/blocks', authenticateAdmin, async (req, res) => {
  try {
    const blocks = await getAllGlobalBlocks();
    res.json({ success: true, blocks });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/disputes', authenticateAdmin, async (req, res) => {
  try {
    const disputes = await getAllDisputes();
    res.json({ success: true, disputes });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/disputes/resolve', authenticateAdmin, async (req, res) => {
  const { disputeId, status } = req.body;
  try {
    await resolveDispute(disputeId, status);
    res.json({ success: true, message: 'Dispute resolved.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/vehicles/verify', authenticateAdmin, async (req, res) => {
  const { ownerId, plateNumber, status } = req.body;
  const parts = plateNumber.split(':');
  const country = parts.length === 2 ? parts[0] : 'IN';
  const rawPlate = parts.length === 2 ? parts[1] : plateNumber;

  try {
    const vehicle = await updateVerificationStatus(ownerId, rawPlate, status, null, country);
    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await deleteUser(id);
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Sockets
io.on('connection', (socket) => {
  socket.on('register-socket', (userId) => {
    userSockets.set(userId, socket.id);
  });

  socket.on('join-chat', (chatId) => {
    socket.join(chatId);
  });

  socket.on('send-message', async (data) => {
    let { chatId, senderId, recipientId, text, plateNumber } = data;
    try {
      if (!senderId || senderId === '00000000-0000-4000-a000-000000000001') {
        senderId = getGuestIdFromSocket(socket);
      }
      await getOrCreateUser(senderId, 'Anonymous Guest');

      const blocked = await isBlocked(senderId, recipientId);
      if (blocked) {
        return socket.emit('chat-error', { message: 'Message blocked.' });
      }

      const count = await countMessagesInLast24Hours(chatId, senderId);
      if (count >= 5) {
        return socket.emit('chat-error', { message: 'Limit reached.' });
      }

      const message = await saveMessage(chatId, senderId, text);
      io.to(chatId).emit('new-message', message);
    } catch (err) {
      socket.emit('chat-error', { message: 'Error: ' + err.message });
    }
  });

  socket.on('call-user', async (data) => {
    let { chatId, plateNumber, callerId, offer } = data;
    const parts = plateNumber.split(':');
    const country = parts.length === 2 ? parts[0] : 'IN';
    const rawPlate = parts.length === 2 ? parts[1] : plateNumber;

    try {
      if (!callerId || callerId === '00000000-0000-4000-a000-000000000001') {
        callerId = getGuestIdFromSocket(socket);
      }
      await getOrCreateUser(callerId, 'Anonymous Guest');

      const vehicleOwner = await getVehicleOwner(rawPlate, country);
      if (!vehicleOwner) {
        return socket.emit('call-failed', { reason: 'Owner not registered.' });
      }

      const ownerId = vehicleOwner.owner_id;

      const blocked = await isBlocked(callerId, ownerId);
      if (blocked) {
        return socket.emit('call-failed', { reason: 'Blocked by user.' });
      }

      if (vehicleOwner.dnd === 1) {
        return socket.emit('call-failed', { reason: 'Owner is on DND.' });
      }

      const ownerSocketId = userSockets.get(ownerId);
      if (!ownerSocketId) {
        // Owner offline VoIP fallback trigger
        const ownerProfile = await getUserProfile(ownerId);
        await dispatchOfflineNotifications(ownerProfile, plateNumber);
        return socket.emit('call-failed', { 
          reason: 'Owner offline. Secure alerts dispatched to their WhatsApp & Email.',
          offlineDispatched: true
        });
      }

      activeCalls.set(socket.id, ownerSocketId);
      activeCalls.set(ownerSocketId, socket.id);

      io.to(ownerSocketId).emit('incoming-call', {
        chatId,
        callerId,
        plateNumber: plateNumber,
        offer
      });
    } catch (err) {
      socket.emit('call-failed', { reason: 'Calling error.' });
    }
  });

  socket.on('accept-call', (data) => {
    const { callerId, answer } = data;
    const callerSocketId = userSockets.get(callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call-accepted', { answer });
    }
  });

  socket.on('reject-call', (data) => {
    const { callerId } = data;
    const callerSocketId = userSockets.get(callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call-rejected');
    }
    const peerSocketId = activeCalls.get(socket.id);
    if (peerSocketId) {
      activeCalls.delete(socket.id);
      activeCalls.delete(peerSocketId);
    }
  });

  socket.on('ice-candidate', (data) => {
    const { targetId, candidate } = data;
    const targetSocketId = userSockets.get(targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', { candidate, senderId: socket.id });
    }
  });

  socket.on('end-call', (data) => {
    const { targetId } = data;
    const targetSocketId = userSockets.get(targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-ended');
    }
    const peerSocketId = activeCalls.get(socket.id);
    if (peerSocketId) {
      activeCalls.delete(socket.id);
      activeCalls.delete(peerSocketId);
    }
  });

  socket.on('disconnect', () => {
    const peerSocketId = activeCalls.get(socket.id);
    if (peerSocketId) {
      io.to(peerSocketId).emit('call-ended');
      activeCalls.delete(socket.id);
      activeCalls.delete(peerSocketId);
    }
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// Trigger nodemon reload for active .env credentials v5


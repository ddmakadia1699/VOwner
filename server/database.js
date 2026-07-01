import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;

export const getSupabase = () => {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase URL or Service Key is missing from environment variables.');
    }
    supabaseInstance = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseInstance;
};

// Normalize license plates globally: e.g., ("MH12AB1234", "IN") -> "IN:MH12AB1234"
export const normalizePlate = (plate, countryCode = 'IN') => {
  if (!plate) return '';
  const cleaned = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${countryCode.toUpperCase()}:${cleaned}`;
};

export const initDb = async () => {
  // Test connection to Supabase
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.error('Supabase connection verification failed:', error.message);
      throw error;
    }
    console.log('Supabase database connection initialized successfully.');
  } catch (err) {
    console.error('Failed to connect to Supabase:', err.message);
    throw err;
  }
};

// User operations
export const getOrCreateUser = async (id, phoneNumber = null, passcode = null) => {
  const supabase = getSupabase();
  
  if (phoneNumber) {
    const { data: existingUser, error: findErr } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (existingUser) {
      return existingUser;
    }
  }

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (userErr) throw userErr;

  if (!user) {
    const { data: inserted, error: insertErr } = await supabase
      .from('users')
      .insert([{ id, phone_number: phoneNumber }])
      .select()
      .single();
    if (insertErr) throw insertErr;
    return inserted;
  }
  return user;
};

// Update user profile email & custom whatsapp settings
export const updateUserProfile = async (userId, email, whatsappNumber) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .update({ email, whatsapp_number: whatsappNumber })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getUserProfile = async (userId) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('id, phone_number, email, whatsapp_number')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

// Vehicle operations (supporting global keys)
export const registerVehicle = async (ownerId, plateNumber, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  if (!normalized) throw new Error('Invalid plate number');
  
  const { data: existing, error: checkErr } = await supabase
    .from('vehicles')
    .select('*')
    .eq('plate_number', normalized)
    .maybeSingle();

  if (existing) {
    if (existing.owner_id === ownerId) {
      return existing;
    }
    throw new Error('PLATE_CLAIMED');
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('vehicles')
    .insert([{ 
      owner_id: ownerId, 
      plate_number: normalized, 
      is_verified: 0, 
      dnd: 0, 
      verification_status: 'unverified' 
    }])
    .select()
    .single();

  if (insertErr) throw insertErr;
  return inserted;
};

export const getVehicleOwner = async (plateNumber, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, users!inner(phone_number, email, whatsapp_number)')
    .eq('plate_number', normalized)
    .maybeSingle();

  if (error || !data) return null;

  const { data: logs } = await supabase
    .from('parking_logs')
    .select('*')
    .eq('plate_number', normalized)
    .order('timestamp', { ascending: false })
    .limit(1);

  if (data.is_verified !== 1 && !data.rc_doc && data.verification_status === 'pending') {
    data.verification_status = 'unverified';
  }

  return {
    ...data,
    phone_number: data.users.phone_number,
    owner_email: data.users.email,
    owner_whatsapp: data.users.whatsapp_number,
    in_out_status: logs && logs.length > 0 ? logs[0].action : null,
    in_out_time: logs && logs.length > 0 ? logs[0].timestamp : null
  };
};

// Global Vehicle Suffix Lookup Helper (Resolves auto-detection/multiple country matches)
export const lookupVehicleGlobal = async (rawPlateInput) => {
  const supabase = getSupabase();
  const cleaned = rawPlateInput.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, users(phone_number, email, whatsapp_number)')
    .or(`plate_number.ilike.%:${cleaned},plate_number.eq.${cleaned}`);

  if (error) throw error;
  
  const matches = data || [];
  for (let m of matches) {
    const { data: logs } = await supabase
      .from('parking_logs')
      .select('*')
      .eq('plate_number', m.plate_number)
      .order('timestamp', { ascending: false })
      .limit(1);
    if (logs && logs.length > 0) {
      m.in_out_status = logs[0].action;
      m.in_out_time = logs[0].timestamp;
    } else {
      m.in_out_status = null;
      m.in_out_time = null;
    }
    if (m.is_verified !== 1 && !m.rc_doc && m.verification_status === 'pending') {
      m.verification_status = 'unverified';
    }
  }

  return matches.map(m => ({
    ...m,
    owner_phone: m.users?.phone_number || null,
    owner_email: m.users?.email || null,
    owner_whatsapp: m.users?.whatsapp_number || null
  }));
};

export const toggleDnd = async (ownerId, plateNumber, dndStatus, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  const isDnd = dndStatus === 1 || dndStatus === true || dndStatus === '1' || dndStatus === 'true' || Boolean(dndStatus && dndStatus !== '0' && dndStatus !== 'false');
  
  const { data, error } = await supabase
    .from('vehicles')
    .update({ dnd: isDnd ? 1 : 0 })
    .eq('plate_number', normalized)
    .eq('owner_id', ownerId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getOwnerVehicles = async (ownerId) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('owner_id', ownerId);
  if (error) throw error;
  
  const vehicles = data || [];
  for (let v of vehicles) {
    const { data: logs } = await supabase
      .from('parking_logs')
      .select('*')
      .eq('plate_number', v.plate_number)
      .order('timestamp', { ascending: false })
      .limit(1);
    if (logs && logs.length > 0) {
      v.in_out_status = logs[0].action;
      v.in_out_time = logs[0].timestamp;
    } else {
      v.in_out_status = null;
      v.in_out_time = null;
    }
    if (v.is_verified !== 1 && !v.rc_doc && v.verification_status === 'pending') {
      v.verification_status = 'unverified';
    }
  }

  return vehicles;
};

export const updateReminders = async (ownerId, plateNumber, fastag, puc, insurance, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      fastag_expiry: fastag,
      puc_expiry: puc,
      insurance_expiry: insurance
    })
    .eq('plate_number', normalized)
    .eq('owner_id', ownerId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateEmergencyContact = async (ownerId, plateNumber, phone, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  
  const { data, error } = await supabase
    .from('vehicles')
    .update({ emergency_phone: phone })
    .eq('plate_number', normalized)
    .eq('owner_id', ownerId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateVerificationStatus = async (ownerId, plateNumber, status, rcDoc = null, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  const isVerified = status === 'verified' ? 1 : 0;
  
  const updateData = {
    verification_status: status,
    is_verified: isVerified
  };
  
  if (rcDoc !== null) {
    updateData.rc_doc = rcDoc;
  } else if (status === 'unverified') {
    updateData.rc_doc = null;
  }

  const { data, error } = await supabase
    .from('vehicles')
    .update(updateData)
    .eq('plate_number', normalized)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Chat Operations
export const getOrCreateChat = async (plateNumber, callerId, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  
  const { data: vehicle, error: vErr } = await supabase
    .from('vehicles')
    .select('*')
    .eq('plate_number', normalized)
    .maybeSingle();

  if (!vehicle) throw new Error('Vehicle owner not registered.');

  let { data: chat, error } = await supabase
    .from('chats')
    .select('*')
    .eq('plate_number', normalized)
    .eq('caller_id', callerId)
    .maybeSingle();

  if (!chat) {
    const { data: inserted, error: insertErr } = await supabase
      .from('chats')
      .insert([{ plate_number: normalized, caller_id: callerId }])
      .select()
      .single();
    if (insertErr) throw insertErr;
    chat = inserted;
  }
  return chat;
};

export const saveMessage = async (chatId, senderId, text) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .insert([{ chat_id: chatId, sender_id: senderId, text }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getChatMessages = async (chatId) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const getOwnerChats = async (ownerId) => {
  const supabase = getSupabase();
  const { data: vehicles, error: vErr } = await supabase
    .from('vehicles')
    .select('plate_number')
    .eq('owner_id', ownerId);
  if (vErr || !vehicles || vehicles.length === 0) return [];
  
  const plates = vehicles.map(v => v.plate_number);
  const { data: chats, error: cErr } = await supabase
    .from('chats')
    .select('*, messages(created_at)')
    .in('plate_number', plates);
    
  if (cErr) throw cErr;
  
  return (chats || []).map(c => {
    const sortedMsgs = (c.messages || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return {
      ...c,
      last_activity: sortedMsgs[0]?.created_at || c.created_at
    };
  }).sort((a,b) => new Date(b.last_activity) - new Date(a.last_activity));
};

export const getCallerChats = async (callerId) => {
  const supabase = getSupabase();
  const { data: chats, error } = await supabase
    .from('chats')
    .select('*, messages(created_at)')
    .eq('caller_id', callerId);
  if (error) throw error;
  return (chats || []).map(c => {
    const sortedMsgs = (c.messages || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return {
      ...c,
      last_activity: sortedMsgs[0]?.created_at || c.created_at
    };
  }).sort((a,b) => new Date(b.last_activity) - new Date(a.last_activity));
};

// Anti-Spam Operations
export const blockUser = async (ownerId, blockedUserId) => {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('blocks')
    .upsert([{ owner_id: ownerId, blocked_user_id: blockedUserId }], { onConflict: 'owner_id,blocked_user_id' });
  if (error) throw error;
};

export const unblockUser = async (ownerId, blockedUserId) => {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('owner_id', ownerId)
    .eq('blocked_user_id', blockedUserId);
  if (error) throw error;
};

export const getBlockedUsers = async (ownerId) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .eq('owner_id', ownerId);
  if (error) throw error;
  return data || [];
};

export const isBlocked = async (userId1, userId2) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .or(`and(owner_id.eq.${userId1},blocked_user_id.eq.${userId2}),and(owner_id.eq.${userId2},blocked_user_id.eq.${userId1})`)
    .maybeSingle();
  if (error) return false;
  return !!data;
};

export const countMessagesInLast24Hours = async (chatId, senderId) => {
  const supabase = getSupabase();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('chat_id', chatId)
    .eq('sender_id', senderId)
    .gte('created_at', yesterday);
  if (error) return 0;
  return count || 0;
};

// Parking Log Operations
export const addParkingLog = async (plateNumber, action, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  const { data, error } = await supabase
    .from('parking_logs')
    .insert([{ plate_number: normalized, action }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getParkingLogs = async (plateNumber, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  const { data, error } = await supabase
    .from('parking_logs')
    .select('*')
    .eq('plate_number', normalized)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
};

// Dispute Operations
export const createDispute = async (plateNumber, disputingUserId, countryCode = 'IN') => {
  const supabase = getSupabase();
  const normalized = normalizePlate(plateNumber, countryCode);
  
  const { data: vehicle, error: vErr } = await supabase
    .from('vehicles')
    .select('owner_id')
    .eq('plate_number', normalized)
    .maybeSingle();

  if (!vehicle) throw new Error('Vehicle not registered.');

  const { data, error } = await supabase
    .from('disputes')
    .insert([{
      plate_number: normalized,
      disputing_user_id: disputingUserId,
      current_owner_id: vehicle.owner_id,
      status: 'open'
    }])
    .select()
    .single();

  if (error) throw error;
  return data.id;
};

export const getAllDisputes = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('disputes')
    .select('*, disputing:users!disputes_disputing_user_id_fkey(phone_number), current:users!disputes_current_owner_id_fkey(phone_number)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(d => ({
    ...d,
    disputing_phone: d.disputing?.phone_number || null,
    current_owner_phone: d.current?.phone_number || null
  }));
};

export const resolveDispute = async (disputeId, status) => {
  const supabase = getSupabase();
  const { data: dispute, error: dErr } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .single();
  if (dErr || !dispute) throw new Error('Dispute not found.');

  if (status === 'approved') {
    const { error: vErr } = await supabase
      .from('vehicles')
      .update({
        owner_id: dispute.disputing_user_id,
        verification_status: 'pending',
        is_verified: 0,
        rc_doc: null
      })
      .eq('plate_number', dispute.plate_number);
    if (vErr) throw vErr;

    const { error: cErr } = await supabase
      .from('chats')
      .delete()
      .eq('plate_number', dispute.plate_number);
    if (cErr) throw cErr;
  }

  const { error: uErr } = await supabase
    .from('disputes')
    .update({ status })
    .eq('id', disputeId);
  if (uErr) throw uErr;
};

export const deleteChat = async (chatId, userId) => {
  const supabase = getSupabase();
  const { data: chat, error: cErr } = await supabase
    .from('chats')
    .select('*, vehicles(owner_id)')
    .eq('id', chatId)
    .single();
  if (cErr || !chat) throw new Error('Chat not found.');
  
  if (chat.caller_id !== userId && chat.vehicles?.owner_id !== userId) {
    throw new Error('Unauthorized to delete this chat.');
  }

  const { error: mErr } = await supabase
    .from('messages')
    .delete()
    .eq('chat_id', chatId);
  if (mErr) throw mErr;

  const { error: dErr } = await supabase
    .from('chats')
    .delete()
    .eq('id', chatId);
  if (dErr) throw dErr;
};

// CEO Admin Portal Operations
export const getAllVehicles = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, users(phone_number)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(v => ({
    ...v,
    owner_phone: v.users?.phone_number || null
  }));
};

export const getAllUsers = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getAllGlobalBlocks = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blocks')
    .select('*, owner:users!blocks_owner_id_fkey(phone_number), blocked:users!blocks_blocked_user_id_fkey(phone_number)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(b => ({
    ...b,
    owner_phone: b.owner?.phone_number || null,
    blocked_phone: b.blocked?.phone_number || null
  }));
};

export const deleteUser = async (userId) => {
  const supabase = getSupabase();
  
  // Wiping user disputes
  await supabase.from('disputes').delete().or(`disputing_user_id.eq.${userId},current_owner_id.eq.${userId}`);
  
  // Fetch matching plates for vehicle deletions to safely clear logs/chats
  const { data: vehicles } = await supabase.from('vehicles').select('plate_number').eq('owner_id', userId);
  if (vehicles && vehicles.length > 0) {
    const plates = vehicles.map(v => v.plate_number);
    await supabase.from('parking_logs').delete().in('plate_number', plates);
    await supabase.from('chats').delete().in('plate_number', plates);
  }

  await supabase.from('blocks').delete().or(`owner_id.eq.${userId},blocked_user_id.eq.${userId}`);
  await supabase.from('chats').delete().eq('caller_id', userId);
  await supabase.from('vehicles').delete().eq('owner_id', userId);
  await supabase.from('users').delete().eq('id', userId);
};

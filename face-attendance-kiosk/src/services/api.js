/**
 * API Service for Panda Ka Dhaba Attendance Kiosk & Mini ERP
 * Communicates with the live Hostinger MySQL Backend API.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://rich-plum-barracuda-67.hostingersite.com/api';

const LOCAL_STORAGE_KEY_PROFILES = 'pkd_local_profiles';
const LOCAL_STORAGE_KEY_LOGS = 'pkd_local_attendance_logs';

/**
 * Helper to fetch with timeout and fallback
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}/${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[API] Network request to ${url} failed, using local storage fallback:`, err.message);
    throw err;
  }
}

/**
 * Get dashboard statistics
 */
export async function getStats() {
  try {
    const res = await request('stats.php');
    if (res.status === 'success') {
      return res.data;
    }
  } catch {
    const localProfiles = getLocalProfiles();
    const localLogs = getLocalLogs();
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = localLogs.filter((l) => l.log_date === today);

    return {
      total_profiles: localProfiles.length,
      registered_faces: localProfiles.filter((p) => p.is_face_registered).length,
      staff_count: localProfiles.filter((p) => p.type === 'staff').length,
      customer_count: localProfiles.filter((p) => p.type === 'customer').length,
      today_checkins: todayLogs.length,
      today_date: today,
    };
  }
}

/**
 * Fetch profiles (Staff or Customer)
 */
export async function getProfiles({ type = '', search = '', registeredOnly = false, includeDescriptor = false } = {}) {
  try {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (search) params.append('q', search);
    if (registeredOnly) params.append('registered_only', '1');
    if (includeDescriptor) params.append('include_descriptor', '1');

    const res = await request(`profiles.php?${params.toString()}`);
    if (res.status === 'success') {
      if (res.data && res.data.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_KEY_PROFILES, JSON.stringify(res.data));
      }
      return res.data;
    }
    return [];
  } catch {
    let profiles = getLocalProfiles();
    if (type) profiles = profiles.filter((p) => p.type === type);
    if (registeredOnly) profiles = profiles.filter((p) => p.is_face_registered);
    if (search) {
      const q = search.toLowerCase();
      profiles = profiles.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.phone && p.phone.includes(q)) ||
          (p.profile_code && p.profile_code.toLowerCase().includes(q))
      );
    }
    return profiles;
  }
}

/**
 * Create a new Profile (Staff or Customer) with optional face descriptor
 */
export async function createProfile({ name, phone = '', type = 'staff', role = 'Staff', face_descriptor = null }) {
  try {
    const res = await request('profiles.php', {
      method: 'POST',
      body: JSON.stringify({
        name,
        phone,
        type,
        role,
        face_descriptor,
      }),
    });
    if (res.status === 'success') {
      const local = getLocalProfiles();
      local.unshift(res.data);
      localStorage.setItem(LOCAL_STORAGE_KEY_PROFILES, JSON.stringify(local));
      return res.data;
    }
    throw new Error(res.message || 'Failed to create profile');
  } catch (err) {
    const local = getLocalProfiles();
    const newId = Date.now();
    const prefix = type === 'staff' ? 'PKD' : 'CUST';
    const profileCode = `${prefix}-${String(local.length + 1).padStart(3, '0')}`;
    const newProfile = {
      id: newId,
      profile_code: profileCode,
      name,
      phone,
      type,
      role,
      face_descriptor,
      is_face_registered: face_descriptor ? 1 : 0,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    local.unshift(newProfile);
    localStorage.setItem(LOCAL_STORAGE_KEY_PROFILES, JSON.stringify(local));
    return newProfile;
  }
}

/**
 * Save / Update face descriptor for an existing profile
 */
export async function saveFaceDescriptor(profileId, descriptor) {
  const descriptorArray = Array.from(descriptor);
  try {
    const res = await request('profiles.php', {
      method: 'POST',
      body: JSON.stringify({
        action: 'save_face',
        profile_id: profileId,
        face_descriptor: descriptorArray,
      }),
    });
    updateLocalDescriptor(profileId, descriptorArray);
    return res;
  } catch (err) {
    updateLocalDescriptor(profileId, descriptorArray);
    return { status: 'success', message: 'Face saved locally' };
  }
}

/**
 * Mark Attendance Check-in or Check-out
 */
export async function markAttendance(profileId, action = 'check_in', method = 'face_kiosk') {
  try {
    const res = await request('attendance.php', {
      method: 'POST',
      body: JSON.stringify({
        profile_id: profileId,
        action,
        method,
      }),
    });
    return res;
  } catch (err) {
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0];
    const localLogs = getLocalLogs();
    const profiles = getLocalProfiles();
    const profile = profiles.find((p) => p.id === profileId) || { name: 'Member', role: 'Staff', type: 'staff' };

    const existing = localLogs.find((l) => l.profile_id === profileId && l.log_date === today);
    if (existing) {
      if (action === 'check_out') {
        existing.check_out_time = time;
        localStorage.setItem(LOCAL_STORAGE_KEY_LOGS, JSON.stringify(localLogs));
        return { status: 'success', action: 'checked_out', message: `Check-out logged for ${profile.name}` };
      }
      return { status: 'warning', action: 'already_in', message: `Already checked in today at ${existing.check_in_time}` };
    }

    const newLog = {
      id: Date.now(),
      profile_id: profileId,
      profile_name: profile.name,
      profile_type: profile.type || 'staff',
      role: profile.role || 'Staff',
      log_date: today,
      check_in_time: time,
      check_out_time: null,
      method,
    };
    localLogs.unshift(newLog);
    localStorage.setItem(LOCAL_STORAGE_KEY_LOGS, JSON.stringify(localLogs));
    return {
      status: 'success',
      action: 'checked_in',
      message: `Welcome to Panda Ka Dhaba, ${profile.name}!`,
      data: newLog,
    };
  }
}

/**
 * Get attendance logs for a specific date
 */
export async function getAttendanceLogs(date = '') {
  const queryDate = date || new Date().toISOString().split('T')[0];
  try {
    const res = await request(`attendance.php?date=${queryDate}`);
    if (res.status === 'success') {
      return res.data || [];
    }
    return [];
  } catch {
    const local = getLocalLogs();
    return local.filter((l) => l.log_date === queryDate);
  }
}

// Local Storage helpers
function getLocalProfiles() {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY_PROFILES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function getLocalLogs() {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY_LOGS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function updateLocalDescriptor(profileId, descriptor) {
  const profiles = getLocalProfiles();
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index !== -1) {
    profiles[index].face_descriptor = descriptor;
    profiles[index].is_face_registered = 1;
    localStorage.setItem(LOCAL_STORAGE_KEY_PROFILES, JSON.stringify(profiles));
  }
}

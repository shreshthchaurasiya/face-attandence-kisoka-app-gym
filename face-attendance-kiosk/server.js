import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Hostinger MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'srv547.hstgr.io',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'u152059793_PANDA_DB',
  password: process.env.DB_PASSWORD || 'pandakadhabaDB2',
  database: process.env.DB_NAME || 'u152059793_pandakadhabaDB',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test Connection
pool.getConnection()
  .then((conn) => {
    console.log('✅ Connected directly to Hostinger MySQL Database (srv547.hstgr.io:3306)');
    conn.release();
  })
  .catch((err) => {
    console.error('❌ Hostinger DB Connection Error:', err.message);
  });

// 1. GET Dashboard Stats
app.get('/api/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [[{ total_profiles }]] = await pool.query('SELECT COUNT(*) as total_profiles FROM profiles');
    const [[{ registered_faces }]] = await pool.query('SELECT COUNT(*) as registered_faces FROM profiles WHERE is_face_registered = 1');
    const [[{ staff_count }]] = await pool.query("SELECT COUNT(*) as staff_count FROM profiles WHERE type = 'staff'");
    const [[{ customer_count }]] = await pool.query("SELECT COUNT(*) as customer_count FROM profiles WHERE type = 'customer'");
    const [[{ today_checkins }]] = await pool.query('SELECT COUNT(*) as today_checkins FROM attendance_logs WHERE log_date = ?', [today]);

    res.json({
      status: 'success',
      data: {
        total_profiles,
        registered_faces,
        staff_count,
        customer_count,
        today_checkins,
        today_date: today,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. GET Profiles (Staff & Customers)
app.get('/api/profiles', async (req, res) => {
  try {
    const { type, q, registered_only, include_descriptor } = req.query;

    let query = 'SELECT id, profile_code, name, phone, type, role, is_face_registered, status, created_at';
    if (include_descriptor === '1') {
      query += ', face_descriptor';
    }
    query += ' FROM profiles WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (registered_only === '1') {
      query += ' AND is_face_registered = 1';
    }
    if (q) {
      query += ' AND (name LIKE ? OR phone LIKE ? OR profile_code LIKE ?)';
      const s = `%${q}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY id DESC';

    const [rows] = await pool.query(query, params);

    // Parse face_descriptor JSON if included
    if (include_descriptor === '1') {
      rows.forEach((p) => {
        if (p.face_descriptor) {
          try {
            p.face_descriptor = typeof p.face_descriptor === 'string' ? JSON.parse(p.face_descriptor) : p.face_descriptor;
          } catch {
            p.face_descriptor = null;
          }
        }
      });
    }

    res.json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. POST Create Profile OR Save Face
app.post('/api/profiles', async (req, res) => {
  try {
    const { action, profile_id, face_descriptor, name, phone, type = 'staff', role = 'Staff' } = req.body;

    // Action: Save Face for existing profile
    if (action === 'save_face') {
      if (!profile_id || !face_descriptor) {
        return res.status(400).json({ status: 'error', message: 'profile_id and face_descriptor required' });
      }
      const descJson = JSON.stringify(Array.from(face_descriptor));
      await pool.query(
        'UPDATE profiles SET face_descriptor = ?, is_face_registered = 1 WHERE id = ?',
        [descJson, profile_id]
      );
      return res.json({ status: 'success', message: 'Face registered successfully!' });
    }

    // Action: Create New Profile
    if (!name || !name.trim()) {
      return res.status(400).json({ status: 'error', message: 'Name is required' });
    }

    const [[{ maxId }]] = await pool.query('SELECT MAX(id) as maxId FROM profiles');
    const nextId = (maxId || 0) + 1;
    const prefix = type === 'staff' ? 'PKD' : 'CUST';
    const profileCode = `${prefix}-${String(nextId).padStart(3, '0')}`;

    let isRegistered = 0;
    let descJson = null;
    if (face_descriptor) {
      isRegistered = 1;
      descJson = JSON.stringify(Array.from(face_descriptor));
    }

    const [result] = await pool.query(
      'INSERT INTO profiles (profile_code, name, phone, type, role, face_descriptor, is_face_registered, status) VALUES (?, ?, ?, ?, ?, ?, ?, "active")',
      [profileCode, name.trim(), phone || null, type, role, descJson, isRegistered]
    );

    res.json({
      status: 'success',
      data: {
        id: result.insertId,
        profile_code: profileCode,
        name,
        phone,
        type,
        role,
        is_face_registered: isRegistered,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. GET Attendance Logs
app.get('/api/attendance', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const [logs] = await pool.query(
      `SELECT a.id, a.profile_id, a.profile_name, a.profile_type, a.log_date, a.check_in_time, a.check_out_time, a.method, a.created_at,
              p.role, p.phone, p.profile_code
       FROM attendance_logs a
       LEFT JOIN profiles p ON a.profile_id = p.id
       WHERE a.log_date = ?
       ORDER BY a.check_in_time DESC`,
      [date]
    );

    res.json({ status: 'success', date, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. POST Mark Attendance
app.post('/api/attendance', async (req, res) => {
  try {
    const { profile_id, action = 'check_in', method = 'face_kiosk' } = req.body;

    if (!profile_id) {
      return res.status(400).json({ status: 'error', message: 'profile_id required' });
    }

    const [[profile]] = await pool.query('SELECT id, name, type, role, status FROM profiles WHERE id = ?', [profile_id]);
    if (!profile) {
      return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0];

    const [existing] = await pool.query(
      'SELECT id, check_in_time, check_out_time FROM attendance_logs WHERE profile_id = ? AND log_date = ?',
      [profile_id, today]
    );

    if (existing.length > 0) {
      if (action === 'check_out') {
        await pool.query('UPDATE attendance_logs SET check_out_time = ? WHERE id = ?', [time, existing[0].id]);
        return res.json({
          status: 'success',
          action: 'checked_out',
          message: `Goodbye ${profile.name}! Check-out logged.`,
          check_out_time: time,
        });
      }
      return res.json({
        status: 'warning',
        action: 'already_in',
        message: `Already checked in today at ${existing[0].check_in_time}`,
        data: existing[0],
      });
    }

    const [insertResult] = await pool.query(
      'INSERT INTO attendance_logs (profile_id, profile_name, profile_type, log_date, check_in_time, method) VALUES (?, ?, ?, ?, ?, ?)',
      [profile.id, profile.name, profile.type, today, time, method]
    );

    res.json({
      status: 'success',
      action: 'checked_in',
      message: `Welcome to Panda Ka Dhaba, ${profile.name}!`,
      data: {
        id: insertResult.insertId,
        name: profile.name,
        role: profile.role,
        check_in_time: time,
        log_date: today,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Panda Ka Dhaba API Server running on http://localhost:${PORT}`);
});

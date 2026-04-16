// server.js — CampusNav Express Backend (MySQL Edition)
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { pool, query, run } = require('./db');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'campusnav_secret';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function nowIST() {
  const ist  = new Date(Date.now() + 5.5 * 3600000);
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const day  = days[ist.getUTCDay()];
  const hh   = String(ist.getUTCHours()).padStart(2,'0');
  const mm   = String(ist.getUTCMinutes()).padStart(2,'0');
  return { day, time: `${hh}:${mm}:00` };
}

function floorLabel(n) {
  return ['Ground Floor','1st Floor','2nd Floor','3rd Floor','4th Floor'][n] || `Floor ${n}`;
}

function formatTime(t) {
  if (!t) return '—';
  const [h, m] = String(t).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/blocks
app.get('/api/blocks', async (req, res) => {
  try {
    const blocks = await query('SELECT * FROM blocks ORDER BY name');
    res.json(blocks);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await query(`
      SELECT r.*, b.name AS block_name, b.short AS block_short
      FROM rooms r JOIN blocks b ON r.block_id = b.id
      ORDER BY r.room_no
    `);
    res.json(rooms);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/location/:roomNo
app.get('/api/location/:roomNo', async (req, res) => {
  try {
    const rows = await query(`
      SELECT r.*, b.name AS block_name, b.short AS block_short, b.\`desc\` AS block_desc
      FROM rooms r JOIN blocks b ON r.block_id = b.id
      WHERE UPPER(r.room_no) = UPPER(?)
    `, [req.params.roomNo.trim()]);

    if (!rows.length) return res.status(404).json({ error: `Room "${req.params.roomNo}" not found` });
    const r = rows[0];

    res.json({
      room_no:    r.room_no,
      type:       r.type,
      block_name: r.block_name,
      floor:      floorLabel(r.floor),
      floor_num:  r.floor,
      capacity:   r.capacity,
      has_ac:     !!r.has_ac,
      is_lab:     !!r.is_lab,
      nearby:     r.nearby,
      directions: r.directions,
      notes:      r.notes,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/availability/:roomNo
app.get('/api/availability/:roomNo', async (req, res) => {
  try {
    const rows = await query(`
      SELECT r.*, b.name AS block_name
      FROM rooms r JOIN blocks b ON r.block_id = b.id
      WHERE UPPER(r.room_no) = UPPER(?)
    `, [req.params.roomNo.trim()]);

    if (!rows.length) return res.status(404).json({ error: `Room "${req.params.roomNo}" not found` });
    const room = rows[0];
    const { day, time } = nowIST();

    // Current slot
    const current = await query(`
      SELECT *,
        TIME_FORMAT(slot_start,'%H:%i') AS start_fmt,
        TIME_FORMAT(slot_end,  '%H:%i') AS end_fmt
      FROM timetable
      WHERE room_id = ? AND day = ? AND slot_start <= ? AND slot_end > ?
      LIMIT 1
    `, [room.id, day, time, time]);

    // Next slot today
    const next = await query(`
      SELECT *,
        TIME_FORMAT(slot_start,'%H:%i') AS start_fmt,
        TIME_FORMAT(slot_end,  '%H:%i') AS end_fmt
      FROM timetable
      WHERE room_id = ? AND day = ? AND slot_start > ?
      ORDER BY slot_start LIMIT 1
    `, [room.id, day, time]);

    res.json({
      room_no:      room.room_no,
      block_name:   room.block_name,
      is_occupied:  current.length > 0,
      current_class: current.length ? {
        batch:   current[0].batch,
        dept:    current[0].dept,
        subject: current[0].subject,
        faculty: current[0].faculty,
        until:   current[0].end_fmt,
      } : null,
      next_class: next.length ? {
        from:  next[0].start_fmt,
        until: next[0].end_fmt,
        batch: next[0].batch,
        dept:  next[0].dept,
      } : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/empty-rooms?block_id=&slot_start=&slot_end=&day=
app.get('/api/empty-rooms', async (req, res) => {
  try {
    const { block_id, slot_start, slot_end, day: queryDay } = req.query;
    const { day: todayDay, time } = nowIST();
    const day   = queryDay  || todayDay;
    const start = slot_start || time.slice(0,5);
    const end   = slot_end   || `${String(Number(start.slice(0,2)) + 1).padStart(2,'0')}:00`;

    // Rooms occupied during this slot
    const occupied = await query(`
      SELECT DISTINCT room_id FROM timetable
      WHERE day = ? AND slot_start < ? AND slot_end > ?
    `, [day, end + ':00', start + ':00']);
    const occupiedIds = occupied.map(r => r.room_id);

    let sql = `
      SELECT r.*, b.name AS block_name, b.short AS block_short
      FROM rooms r JOIN blocks b ON r.block_id = b.id
      WHERE 1=1
    `;
    const params = [];
    if (block_id) { sql += ' AND r.block_id = ?'; params.push(block_id); }
    if (occupiedIds.length) {
      sql += ` AND r.id NOT IN (${occupiedIds.map(() => '?').join(',')})`;
      params.push(...occupiedIds);
    }
    sql += ' ORDER BY r.room_no';

    const emptyRooms = await query(sql, params);
    res.json({
      day,
      slot_start: start,
      slot_end:   end,
      total_empty: emptyRooms.length,
      rooms: emptyRooms.map(r => ({
        room_no:    r.room_no,
        block_name: r.block_name,
        floor:      floorLabel(r.floor),
        type:       r.type,
        capacity:   r.capacity,
        has_ac:     !!r.has_ac,
        is_lab:     !!r.is_lab,
        notes:      r.notes,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/suggest
app.get('/api/suggest', async (req, res) => {
  try {
    const { day, time } = nowIST();

    const occupied = await query(`
      SELECT DISTINCT room_id FROM timetable
      WHERE day = ? AND slot_start <= ? AND slot_end > ?
    `, [day, time, time]);
    const occupiedIds = occupied.map(r => r.room_id);

    let sql = `
      SELECT r.*, b.name AS block_name FROM rooms r JOIN blocks b ON r.block_id = b.id
    `;
    const params = [];
    if (occupiedIds.length) {
      sql += ` WHERE r.id NOT IN (${occupiedIds.map(() => '?').join(',')})`;
      params.push(...occupiedIds);
    }

    const freeRooms = await query(sql, params);

    const suggestions = await Promise.all(freeRooms.map(async r => {
      const tags = [];
      if (r.has_ac)      tags.push('AC');
      if (r.capacity > 65) tags.push('Spacious');
      if (r.is_lab)      tags.push('Lab');
      if (r.floor === 3) tags.push('Quiet');
      if (r.notes) tags.push(...r.notes.split(',').map(t => t.trim()).filter(Boolean));

      const nextOcc = await query(`
        SELECT TIME_FORMAT(slot_start,'%H:%i') AS start_fmt
        FROM timetable WHERE room_id = ? AND day = ? AND slot_start > ?
        ORDER BY slot_start LIMIT 1
      `, [r.id, day, time]);

      return {
        room_no:    r.room_no,
        block_name: r.block_name,
        floor:      floorLabel(r.floor),
        capacity:   r.capacity,
        has_ac:     !!r.has_ac,
        is_lab:     !!r.is_lab,
        tags,
        free_until: nextOcc.length ? nextOcc[0].start_fmt : '17:00',
        directions: r.directions,
      };
    }));

    suggestions.sort((a, b) => (b.has_ac ? 1 : 0) - (a.has_ac ? 1 : 0) || b.capacity - a.capacity);
    res.json({ day, current_time: time.slice(0,5), suggestions: suggestions.slice(0, 10) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/search?q=
app.get('/api/search', async (req, res) => {
  try {
    const q = '%' + (req.query.q || '') + '%';
    const rooms = await query(`
      SELECT r.*, b.name AS block_name FROM rooms r JOIN blocks b ON r.block_id = b.id
      WHERE r.room_no LIKE ? OR r.type LIKE ? OR b.name LIKE ?
      ORDER BY r.room_no LIMIT 20
    `, [q, q, q]);
    res.json(rooms);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/timetable/:roomNo
app.get('/api/timetable/:roomNo', async (req, res) => {
  try {
    const rooms = await query('SELECT * FROM rooms WHERE UPPER(room_no) = UPPER(?)', [req.params.roomNo]);
    if (!rooms.length) return res.status(404).json({ error: 'Room not found' });

    const slots = await query(`
      SELECT *,
        TIME_FORMAT(slot_start,'%H:%i') AS slot_start,
        TIME_FORMAT(slot_end,  '%H:%i') AS slot_end
      FROM timetable WHERE room_id = ?
      ORDER BY FIELD(day,'Monday','Tuesday','Wednesday','Thursday','Friday'), slot_start
    `, [rooms[0].id]);

    res.json({ room_no: rooms[0].room_no, timetable: slots });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admins = await query('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admins.length || !bcrypt.compareSync(password, admins[0].password))
      return res.status(401).json({ error: 'Invalid credentials' });
    const admin = admins[0];
    const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, username: admin.username, role: admin.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/rooms
app.post('/api/admin/rooms', authMiddleware, async (req, res) => {
  try {
    const { room_no, block_id, floor, type, capacity, has_ac, is_lab, nearby, directions, notes } = req.body;
    if (!room_no || !block_id) return res.status(400).json({ error: 'room_no and block_id required' });
    const result = await run(`
      INSERT INTO rooms (room_no,block_id,floor,type,capacity,has_ac,is_lab,nearby,directions,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [room_no, block_id, floor||0, type||'classroom', capacity||60, has_ac?1:0, is_lab?1:0, nearby||'', directions||'', notes||'']);
    res.json({ success: true, id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: `Room "${req.body.room_no}" already exists` });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/rooms/:id
app.put('/api/admin/rooms/:id', authMiddleware, async (req, res) => {
  try {
    const { room_no, block_id, floor, type, capacity, has_ac, is_lab, nearby, directions, notes } = req.body;
    await run(`
      UPDATE rooms SET room_no=?,block_id=?,floor=?,type=?,capacity=?,has_ac=?,is_lab=?,nearby=?,directions=?,notes=?
      WHERE id=?
    `, [room_no, block_id, floor||0, type||'classroom', capacity||60, has_ac?1:0, is_lab?1:0, nearby||'', directions||'', notes||'', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/rooms/:id  (ON DELETE CASCADE handles timetable)
app.delete('/api/admin/rooms/:id', authMiddleware, async (req, res) => {
  try {
    // Check for linked timetable entries — warn admin first
    const ttRows = await query('SELECT COUNT(*) AS c FROM timetable WHERE room_id = ?', [req.params.id]);
    const ttCount = ttRows[0].c;

    if (ttCount > 0 && req.query.force !== 'true') {
      const roomRows = await query('SELECT room_no FROM rooms WHERE id = ?', [req.params.id]);
      return res.status(409).json({
        warning: true,
        room_no: roomRows[0]?.room_no,
        timetable_count: ttCount,
        message: `Room has ${ttCount} timetable entries. Send ?force=true to delete both.`,
      });
    }

    // MySQL ON DELETE CASCADE removes timetable rows automatically
    const result = await run('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/timetable
app.post('/api/admin/timetable', authMiddleware, async (req, res) => {
  try {
    const { room_id, day, slot_start, slot_end, batch, dept, subject, faculty } = req.body;
    if (!room_id || !day || !slot_start || !slot_end) return res.status(400).json({ error: 'Missing fields' });

    // Conflict check
    const conflicts = await query(`
      SELECT * FROM timetable WHERE room_id=? AND day=? AND slot_start < ? AND slot_end > ?
    `, [room_id, day, slot_end + ':00', slot_start + ':00']);
    if (conflicts.length) return res.status(409).json({ error: 'Time slot conflict' });

    const result = await run(`
      INSERT INTO timetable (room_id,day,slot_start,slot_end,batch,dept,subject,faculty)
      VALUES (?,?,?,?,?,?,?,?)
    `, [room_id, day, slot_start, slot_end, batch||'', dept||'', subject||'', faculty||'']);
    res.json({ success: true, id: result.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/timetable/:id
app.put('/api/admin/timetable/:id', authMiddleware, async (req, res) => {
  try {
    const { room_id, day, slot_start, slot_end, batch, dept, subject, faculty } = req.body;
    // Conflict check excluding self
    const conflicts = await query(`
      SELECT * FROM timetable WHERE room_id=? AND day=? AND slot_start < ? AND slot_end > ? AND id != ?
    `, [room_id, day, slot_end + ':00', slot_start + ':00', req.params.id]);
    if (conflicts.length) return res.status(409).json({ error: 'Time slot conflict' });

    await run(`
      UPDATE timetable SET room_id=?,day=?,slot_start=?,slot_end=?,batch=?,dept=?,subject=?,faculty=?
      WHERE id=?
    `, [room_id, day, slot_start, slot_end, batch||'', dept||'', subject||'', faculty||'', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/timetable/:id
app.delete('/api/admin/timetable/:id', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM timetable WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/rooms
app.get('/api/admin/rooms', authMiddleware, async (req, res) => {
  try {
    const rooms = await query(`
      SELECT r.*, b.name AS block_name FROM rooms r JOIN blocks b ON r.block_id = b.id ORDER BY r.room_no
    `);
    res.json(rooms);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/timetable
app.get('/api/admin/timetable', authMiddleware, async (req, res) => {
  try {
    const { room_id } = req.query;
    let sql = `
      SELECT t.*,
        TIME_FORMAT(t.slot_start,'%H:%i') AS slot_start,
        TIME_FORMAT(t.slot_end,  '%H:%i') AS slot_end,
        r.room_no
      FROM timetable t JOIN rooms r ON t.room_id = r.id
    `;
    const params = [];
    if (room_id) { sql += ' WHERE t.room_id = ?'; params.push(room_id); }
    sql += ' ORDER BY FIELD(t.day,\'Monday\',\'Tuesday\',\'Wednesday\',\'Thursday\',\'Friday\'), t.slot_start';
    res.json(await query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/blocks
app.post('/api/admin/blocks', authMiddleware, async (req, res) => {
  try {
    const { name, short, desc } = req.body;
    if (!name || !short) return res.status(400).json({ error: 'name and short required' });
    const result = await run('INSERT INTO blocks (name, short, `desc`) VALUES (?,?,?)', [name, short, desc||'']);
    res.json({ success: true, id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Block name already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/blocks/:id
app.put('/api/admin/blocks/:id', authMiddleware, async (req, res) => {
  try {
    const { name, short, desc } = req.body;
    await run('UPDATE blocks SET name=?, short=?, `desc`=? WHERE id=?', [name, short, desc||'', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/blocks/:id
app.delete('/api/admin/blocks/:id', authMiddleware, async (req, res) => {
  try {
    const roomCount = await query('SELECT COUNT(*) AS c FROM rooms WHERE block_id = ?', [req.params.id]);
    if (roomCount[0].c > 0)
      return res.status(409).json({ error: `Cannot delete: ${roomCount[0].c} room(s) still in this block` });
    await run('DELETE FROM blocks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/stats
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  console.log("ADMIN STATS API HIT");

  try {
    const { day, time } = nowIST();   // ✅ ADD THIS LINE

    const totalRoomsResult = await query('SELECT COUNT(*) AS totalRooms FROM rooms');
    const totalRooms = totalRoomsResult[0].totalRooms;

    const totalBlocksResult = await query('SELECT COUNT(*) AS totalBlocks FROM blocks');
    const totalBlocks = totalBlocksResult[0].totalBlocks;

    const totalSlotsResult = await query('SELECT COUNT(*) AS totalSlots FROM timetable');
    const totalSlots = totalSlotsResult[0].totalSlots;

    const labsResult = await query('SELECT COUNT(*) AS labs FROM rooms WHERE is_lab=1');
    const labs = labsResult[0].labs;

    const occupiedResult = await query(`
      SELECT COUNT(DISTINCT room_id) AS currentlyOccupied FROM timetable
      WHERE day=? AND slot_start<=? AND slot_end>?
    `, [day, time, time]);

    const currentlyOccupied = occupiedResult[0].currentlyOccupied;

    res.json({
      totalRooms,
      totalBlocks,
      totalSlots,
      labs,
      currentlyOccupied,
      currentlyEmpty: totalRooms - currentlyOccupied
    });

  } catch (e) {
    console.error("ERROR IN /api/admin/stats:", e);
    res.status(500).json({ error: e.message });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ─── START ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    // Test connection
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected');
    conn.release();
    app.listen(PORT, () => {
      console.log(`\n🎓 CampusNav running at http://localhost:${PORT}`);
      console.log(`📊 Admin login: admin / admin123\n`);
    });
  } catch (err) {
    console.error('❌ Cannot connect to MySQL:', err.message);
    console.error('   Edit backend/.env with your MySQL password, then run again.\n');
    process.exit(1);
  }
}
start();

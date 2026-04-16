// setup.js — Run once: node setup.js
// Creates the MySQL database, all tables, and seeds sample data
require('dotenv').config();
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcryptjs');

async function setup() {
  // Connect without database first so we can CREATE it
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const DB = process.env.DB_NAME || 'campusnav';
  console.log(`\n🚀 Setting up CampusNav MySQL database: "${DB}"\n`);

  // ── Create database ──────────────────────────────────────────────────────
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(`USE \`${DB}\``);
  console.log(`✅ Database "${DB}" ready`);

  // ── Drop & recreate tables (clean setup) ─────────────────────────────────
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('DROP TABLE IF EXISTS timetable');
  await conn.query('DROP TABLE IF EXISTS rooms');
  await conn.query('DROP TABLE IF EXISTS blocks');
  await conn.query('DROP TABLE IF EXISTS admins');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // ── CREATE TABLE: blocks ─────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE blocks (
      id    INT AUTO_INCREMENT PRIMARY KEY,
      name  VARCHAR(100) NOT NULL UNIQUE,
      short VARCHAR(10)  NOT NULL,
      \`desc\` TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  console.log('✅ Table: blocks');

  // ── CREATE TABLE: rooms ──────────────────────────────────────────────────
  // ON DELETE RESTRICT on block_id: can't delete a block that still has rooms
  // room_no is the stable permanent identifier (not the auto-increment id)
  await conn.query(`
    CREATE TABLE rooms (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      room_no    VARCHAR(30)  NOT NULL UNIQUE,
      block_id   INT          NOT NULL,
      floor      TINYINT      NOT NULL DEFAULT 0,
      type       ENUM('classroom','lab','seminar') NOT NULL DEFAULT 'classroom',
      capacity   SMALLINT     DEFAULT 60,
      has_ac     TINYINT(1)   DEFAULT 0,
      is_lab     TINYINT(1)   DEFAULT 0,
      nearby     VARCHAR(200),
      directions TEXT,
      notes      TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_room_block
        FOREIGN KEY (block_id) REFERENCES blocks(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      INDEX idx_room_no  (room_no),
      INDEX idx_block_id (block_id)
    ) ENGINE=InnoDB
  `);
  console.log('✅ Table: rooms');

  // ── CREATE TABLE: timetable ──────────────────────────────────────────────
  // ON DELETE CASCADE: deleting a room auto-removes its timetable rows
  await conn.query(`
    CREATE TABLE timetable (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      room_id    INT          NOT NULL,
      day        ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
      slot_start TIME         NOT NULL,
      slot_end   TIME         NOT NULL,
      batch      VARCHAR(20),
      dept       VARCHAR(20),
      subject    VARCHAR(100),
      faculty    VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_tt_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      INDEX idx_tt_room_day (room_id, day),
      INDEX idx_tt_day_time (day, slot_start, slot_end)
    ) ENGINE=InnoDB
  `);
  console.log('✅ Table: timetable');

  // ── CREATE TABLE: admins ─────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE admins (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      username   VARCHAR(50)  NOT NULL UNIQUE,
      password   VARCHAR(255) NOT NULL,
      role       VARCHAR(20)  DEFAULT 'admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  console.log('✅ Table: admins');

  // ── SEED: Blocks ─────────────────────────────────────────────────────────
  const blocks = [
    ['Alpha Block', 'A', 'Main academic block, ground to 3rd floor'],
    ['Beta Block',  'B', 'Science and engineering labs, 4 floors'],
    ['Gamma Block', 'G', 'Computer science department, 3 floors'],
    ['Delta Block', 'D', 'Management and humanities, 2 floors'],
    ['Lab Complex', 'L', 'Dedicated lab building'],
  ];
  for (const [name, short, desc] of blocks) {
    await conn.query('INSERT INTO blocks (name, short, `desc`) VALUES (?,?,?)', [name, short, desc]);
  }
  console.log('✅ Seeded: blocks');

  // Get block IDs
  const [blockRows] = await conn.query('SELECT id, short FROM blocks');
  const B = {};
  blockRows.forEach(r => { B[r.short] = r.id; });

  // ── SEED: Rooms ───────────────────────────────────────────────────────────
  const rooms = [
    // [room_no, block_short, floor, type, cap, ac, lab, nearby, directions, notes]
    // Alpha Block
    ['A-101','A',1,'classroom',70,0,0,'Near Main Entrance Gate','Enter Alpha Block → Ground floor → 1st room on left after reception','Corner room, good ventilation'],
    ['A-102','A',1,'classroom',70,0,0,'Opposite A-101','Enter Alpha Block → Ground floor → 2nd room on left','Near water cooler'],
    ['A-103','A',1,'classroom',60,0,0,'Near Staircase A1','Enter Alpha Block → Ground floor → Walk straight → Last room before stairs',''],
    ['A-201','A',2,'classroom',65,1,0,'Opposite Seminar Hall A','Enter Alpha Block → Take main stairs to 1st floor → Turn right → 1st room','AC Room'],
    ['A-202','A',2,'classroom',65,1,0,'Next to A-201','Enter Alpha Block → 1st floor → 2nd room on right','AC Room'],
    ['A-203','A',2,'classroom',60,0,0,'Near Boys Washroom A2','Enter Alpha Block → 1st floor → Turn right → walk to end',''],
    ['A-301','A',3,'classroom',55,0,0,'Near Rooftop Stairs','Enter Alpha Block → Take stairs to 2nd floor → Turn left → 1st room','Quietest floor'],
    ['A-302','A',3,'classroom',55,0,0,'Opposite A-301','Enter Alpha Block → 2nd floor → 2nd room on left',''],
    ['A-Seminar','A',2,'seminar',150,1,0,'Opposite A-201','Enter Alpha Block → 1st floor → Large hall on left side','Seminar Hall A — bookings required'],
    // Beta Block
    ['B-101','B',1,'classroom',60,0,0,'Near Beta Block Entrance','Enter Beta Block main gate → Ground floor → 1st room on right',''],
    ['B-102','B',1,'classroom',60,0,0,'Next to B-101','Enter Beta Block → Ground floor → 2nd room on right',''],
    ['B-103','B',1,'classroom',60,0,0,'Near Canteen Exit','Enter Beta Block → Ground floor → Walk straight → room before back exit','Close to canteen'],
    ['B-201','B',2,'classroom',70,0,0,'Opposite Physics Lab','Enter Beta Block → Take stairs → 1st floor → 1st room left',''],
    ['B-202','B',2,'classroom',70,1,0,'Near Lift B','Enter Beta Block → 1st floor → Near lift → 2nd room','AC Room'],
    ['B-203','B',2,'classroom',65,0,0,'Opposite B-202','Enter Beta Block → 1st floor → 3rd room on left',''],
    ['B-204','B',2,'classroom',65,0,0,'Opposite Seminar Hall B','Enter Beta Block → 1st floor → Turn right from stairs → 4th room',''],
    ['B-207','B',2,'classroom',60,0,0,'Near Girls Washroom B2','Enter Beta Block → 1st floor → Walk to west wing → last room',''],
    ['B-301','B',3,'classroom',55,1,0,'Near B-Block Terrace','Enter Beta Block → 2nd floor → 1st room on right','AC Room, very quiet'],
    ['B-305','B',3,'classroom',55,1,0,'Opposite B-301','Enter Beta Block → 2nd floor → 5th room on right','AC, spacious, projector'],
    ['B-Physics-Lab','B',1,'lab',40,0,1,'Next to B-101','Enter Beta Block → Ground floor → Lab corridor → Physics Lab','Physics Lab'],
    ['B-Chemistry-Lab','B',1,'lab',40,0,1,'Near Back Staircase','Enter Beta Block → Ground floor → Lab corridor → 2nd lab','Chemistry Lab'],
    // Gamma Block
    ['G-101','G',1,'classroom',65,0,0,'Near Gamma Gate','Enter Gamma Block → Ground floor → 1st room',''],
    ['G-102','G',1,'classroom',65,0,0,'Opposite G-101','Enter Gamma Block → Ground floor → 2nd room',''],
    ['G-201','G',2,'classroom',60,1,0,'Near HOD CS Office','Enter Gamma Block → Stairs → 1st floor → Turn left → 1st room','Near CS HOD'],
    ['G-202','G',2,'classroom',60,1,0,'Next to G-201','Enter Gamma Block → 1st floor → 2nd room','AC Room'],
    ['G-301','G',3,'classroom',50,0,0,'Top floor, near terrace','Enter Gamma Block → Climb to 2nd floor → All the way to end','Quiet spot'],
    ['G-AI-Lab','G',2,'lab',40,1,1,'Opposite G-201','Enter Gamma Block → 1st floor → Turn right → AI Lab door','AI & ML Lab, AC'],
    ['G-CS-Lab1','G',1,'lab',50,1,1,'Near Gamma Entrance','Enter Gamma Block → Ground floor → CS Lab 1 on right side','Computer Science Lab 1'],
    ['G-CS-Lab2','G',1,'lab',50,1,1,'Next to CS Lab 1','Enter Gamma Block → Ground floor → CS Lab 2','Computer Science Lab 2'],
    // Delta Block
    ['D-101','D',1,'classroom',70,0,0,'Near Delta Entrance','Enter Delta Block → Ground floor → 1st room','Large batch room'],
    ['D-102','D',1,'classroom',70,0,0,'Next to D-101','Enter Delta Block → Ground floor → 2nd room',''],
    ['D-201','D',2,'classroom',60,1,0,'Near MBA Office','Enter Delta Block → Stairs → 1st floor → Turn left','AC, near MBA dept'],
    ['D-202','D',2,'classroom',60,0,0,'Opposite D-201','Enter Delta Block → 1st floor → 2nd room on right',''],
    // Lab Complex
    ['L-Electronics-Lab','L',1,'lab',45,0,1,'Near Lab Complex Gate','Enter Lab Complex → Ground floor → Electronics Lab on left','Electronics & Circuits Lab'],
    ['L-Mech-Lab','L',1,'lab',35,0,1,'Next to Electronics Lab','Enter Lab Complex → Ground floor → Mech Lab','Mechanical Lab'],
    ['L-Civil-Lab','L',2,'lab',35,0,1,'1st floor Lab Complex','Enter Lab Complex → Stairs → 1st floor → Civil Lab','Civil Engineering Lab'],
    ['L-Language-Lab','L',1,'lab',50,1,1,'Near Lab Complex Entrance','Enter Lab Complex → Ground floor → Language Lab near entrance','Language Lab, AC'],
  ];

  for (const [rno, bShort, floor, type, cap, ac, lab, nearby, dir, notes] of rooms) {
    await conn.query(
      `INSERT INTO rooms (room_no,block_id,floor,type,capacity,has_ac,is_lab,nearby,directions,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [rno, B[bShort], floor, type, cap, ac, lab, nearby, dir, notes]
    );
  }
  console.log('✅ Seeded: rooms');

  // ── SEED: Timetable ───────────────────────────────────────────────────────
  const [roomRows] = await conn.query('SELECT id FROM rooms');
  const days      = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const slots     = [['09:00','10:00'],['10:00','11:00'],['11:00','12:00'],['12:00','13:00'],['14:00','15:00'],['15:00','16:00'],['16:00','17:00']];
  const depts     = ['CSE','ECE','MECH','CIVIL','MBA','MCA'];
  const batches   = ['1st Year','2nd Year','3rd Year','4th Year'];
  const subjects  = ['Mathematics','Physics','Chemistry','Programming','Networks','DBMS','OS','Algorithms','Signals','Structures','Engineering Drawing','Economics','Management','English','Data Science','AI/ML','Web Tech','Cloud Computing'];
  const faculties = ['Dr. Sharma','Dr. Reddy','Prof. Kumar','Dr. Rao','Prof. Gupta','Dr. Patel','Prof. Singh','Dr. Naidu'];
  const rand = arr => arr[Math.floor(Math.random() * arr.length)];

  let ttCount = 0;
  for (const room of roomRows) {
    for (const day of days) {
      for (const [start, end] of slots) {
        if (Math.random() < 0.55) {
          await conn.query(
            `INSERT INTO timetable (room_id,day,slot_start,slot_end,batch,dept,subject,faculty) VALUES (?,?,?,?,?,?,?,?)`,
            [room.id, day, start, end, rand(batches), rand(depts), rand(subjects), rand(faculties)]
          );
          ttCount++;
        }
      }
    }
  }
  console.log(`✅ Seeded: timetable (${ttCount} entries)`);

  // ── SEED: Admins (bcrypt-hashed passwords) ────────────────────────────────
  const adminHash   = await bcrypt.hash('admin123',   10);
  const facultyHash = await bcrypt.hash('faculty123', 10);
  await conn.query(
    'INSERT INTO admins (username,password,role) VALUES (?,?,?),(?,?,?)',
    ['admin', adminHash, 'superadmin', 'faculty', facultyHash, 'admin']
  );
  console.log('✅ Seeded: admins  (admin/admin123, faculty/faculty123)');

  await conn.end();
  console.log('\n🎉 Setup complete! Edit .env with your MySQL password, then run: npm start\n');
}

setup().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  console.error('   Check that MySQL is running and .env credentials are correct.\n');
  process.exit(1);
});

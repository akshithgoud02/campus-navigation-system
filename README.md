# 🎓 CampusNav — College Classroom Finder (MySQL Edition)

Same great app — now powered by **MySQL** instead of SQLite.

---

## 🚀 Quick Start (3 steps)

### Step 1 — Edit `.env`
Open `backend/.env` and set your MySQL password:
```
DB_PASSWORD=your_mysql_password_here
```

### Step 2 — Install & Setup
```bash
cd campusnav_final/backend
npm install
npm run setup        # creates database, tables and seed data
```

### Step 3 — Run
```bash
npm start
```
Open: **http://localhost:3000**

---

## 🔑 Default Admin Credentials
| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Super Admin |
| `faculty` | `faculty123` | Admin |

---

## 🗄️ MySQL Schema

```sql
-- Blocks (college wings/sections)
CREATE TABLE blocks (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE,  -- "Alpha Block"
  short VARCHAR(10)  NOT NULL,         -- "A"
  `desc` TEXT
);

-- Rooms (room_no is the permanent stable identifier)
CREATE TABLE rooms (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  room_no    VARCHAR(30) NOT NULL UNIQUE,  -- "B-204"
  block_id   INT NOT NULL,
  floor      TINYINT DEFAULT 0,
  type       ENUM('classroom','lab','seminar'),
  capacity   SMALLINT DEFAULT 60,
  has_ac     TINYINT(1) DEFAULT 0,
  is_lab     TINYINT(1) DEFAULT 0,
  nearby     VARCHAR(200),
  directions TEXT,
  notes      TEXT,
  FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE RESTRICT
);

-- Timetable (CASCADE: deleting a room removes its slots automatically)
CREATE TABLE timetable (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  room_id    INT NOT NULL,
  day        ENUM('Monday',...,'Sunday') NOT NULL,
  slot_start TIME NOT NULL,
  slot_end   TIME NOT NULL,
  batch      VARCHAR(20),
  dept       VARCHAR(20),
  subject    VARCHAR(100),
  faculty    VARCHAR(100),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Admins (bcrypt-hashed passwords)
CREATE TABLE admins (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role     VARCHAR(20) DEFAULT 'admin'
);
```

---

## 📁 Structure
```
campusnav/
├── backend/
│   ├── server.js      ← Express + all API routes (MySQL)
│   ├── db.js          ← mysql2 connection pool
│   ├── setup.js       ← Database + table creation + seed data
│   ├── .env           ← Your MySQL credentials (edit this!)
│   └── package.json
└── frontend/
    └── public/
        ├── index.html
        ├── css/style.css
        └── js/app.js
```

---

## 🔧 Change Port
Edit `backend/.env`:
```
PORT=4000
```

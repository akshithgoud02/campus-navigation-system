# 🎓 campus-navigation-system

A full-stack web application that helps students locate classrooms, view directions, and find empty rooms using Node.js, Express, and MySQL.

## 🚀 Quick Start (3 Steps)
## 📥 Step 1-- Download Project

1. Open GitHub and go to this repository  
2. Click the green **Code** button  
3. Click **Download ZIP**  
4. Extract the ZIP file  
5. Open the folder in VS Code  


### Step 2 — Setup `.env` (IMPORTANT)

📍 Go to:

```
backend/
```

👉 Create a file named:

```
.env
```

👉 Add this:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=campus_nav
PORT=3000
```

Note: `.env` is not included in GitHub for security reasons.

---

### Step 3 — Install & Run

Open terminal inside `backend/` folder:

```
cd campus-navigation-system/backend
npm install
npm run setup      # creates database, tables and seed data
```

---
### Step 4 — Run
```bash
npm start
```

## 🌐 Open in Browser

```
http://localhost:3000
```

---

## 🔑 Default Admin Credentials

| Username | Password   | Role        |
| -------- | ---------- | ----------- |
| admin    | admin123   | Super Admin |
| faculty  | faculty123 | Admin       |

---

## 🗄️ MySQL Database

This project uses MySQL.

👉 `npm run setup` will:

* Create database
* Create tables
* Insert sample data

---

## 📁 Project Structure

```
campusnav/
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── setup.js
│   ├── .env (create manually)
│   └── package.json
└── frontend/
    └── public/
        ├── index.html
        ├── css/style.css
        └── js/app.js
```

---

---

## 💡 Features

* 🔍 Classroom search
* 🗺️ Directions & landmarks
* 🏫 Room listing
* 📅 Timetable
* 🪑 Empty room finder
* 🔐 Admin login
---

## 👨‍💻 Author

Akshith Goud  
GitHub: https://github.com/akshithgoud02
// db.js — MySQL connection pool (replaces better-sqlite3)
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'campusnav',
  waitForConnections: true,
  connectionLimit:    10,
  timezone:           '+05:30',   // IST
  charset:            'utf8mb4',
});

// Convenience wrapper — returns rows array
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// For INSERT / UPDATE / DELETE — returns result object (.insertId, .affectedRows)
async function run(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

module.exports = { pool, query, run };
console.log("DB Connected");
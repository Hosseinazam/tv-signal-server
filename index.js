// ===============================
// Imports
// ===============================
const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ===============================
// PostgreSQL Connection
// ===============================
const db = new Pool({
    host: process.env.POSTGRES_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    port: process.env.POSTGRES_PORT
});

db.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch(err => console.error("Postgres Error:", err));
// ===============================
// Create Users Table
// ===============================
const createUsersTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Users table ready");
  } catch (err) {
    console.error("Error creating users table:", err);
  }
};

createUsersTable();

// ===============================
// Create Subscriptions Table
// ===============================
const createSubscriptionsTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        type VARCHAR(20) NOT NULL, -- monthly, 6month, yearly
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_date TIMESTAMP,
        active BOOLEAN DEFAULT TRUE
      );
    `);
    console.log("Subscriptions table ready");
  } catch (err) {
    console.error("Error creating subscriptions table:", err);
  }
};

createSubscriptionsTable();


// ===============================
// Routes
// ===============================
app.get("/", (req, res) => {
  res.send("Server is running and Database is connected!");
});

// دریافت سیگنال از تریدینگ‌ویو
app.post("/webhook", (req, res) => {
  console.log("Alert received:", req.body);
  res.json({ ok: true });
});


// ===============================
// Start Server
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));

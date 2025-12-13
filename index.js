// index.js — Full auth + consent + subscription + signals
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();

const cors = require("cors");
app.use(cors());

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_long_secret";

// ----------------- Postgres -----------------
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

// Ensure schema / tables and columns
const initDb = async () => {
  try {
    // users table (if not exists)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        consent_accepted BOOLEAN DEFAULT FALSE,
        consent_text TEXT,
        consent_at TIMESTAMP,
        consent_ip VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Users table ready");

    // subscriptions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL, -- monthly, 6month, yearly
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_date TIMESTAMP,
        active BOOLEAN DEFAULT TRUE
      );
    `);
    console.log("Subscriptions table ready");

    // signals table (for storing alerts)
    await db.query(`
      CREATE TABLE IF NOT EXISTS signals (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(50),
        type VARCHAR(20),
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Signals table ready");
  } catch (err) {
    console.error("Error initializing DB:", err);
  }
};

initDb();

// ----------------- Helpers -----------------
const genToken = (user) => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });

const authMiddleware = async (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "No token" });
  const token = h.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await db.query("SELECT id, username, email, consent_accepted FROM users WHERE id = $1", [payload.id]);
    if (!rows[0]) return res.status(401).json({ error: "User not found" });
    req.user = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const hasActiveSubscription = async (userId) => {
  const { rows } = await db.query(
    `SELECT * FROM subscriptions WHERE user_id = $1 AND active = true AND end_date > NOW() ORDER BY end_date DESC LIMIT 1`,
    [userId]
  );
  return rows.length > 0 ? rows[0] : null;
};

// ----------------- Routes -----------------
// Health
app.get("/", (req, res) => res.send("Server is running and Database is connected!"));

// signup
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "username,email,password required" });

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      "INSERT INTO users (username, email, password) VALUES ($1,$2,$3) RETURNING id, username, email",
      [username, email, hashed]
    );
    const user = rows[0];
    const token = genToken(user);
    res.json({ ok: true, token, user });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "User or email already exists" });
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email,password required" });
    const { rows } = await db.query("SELECT id, username, email, password FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });
    const token = genToken(user);
    res.json({ ok: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// accept consent (user must accept text before subscribe)
app.post("/accept-consent", authMiddleware, async (req, res) => {
  try {
    const { consent_text } = req.body;
    if (!consent_text) return res.status(400).json({ error: "consent_text required" });
    const ip = req.ip || req.headers["x-forwarded-for"] || "";
    await db.query(
      `UPDATE users SET consent_accepted = true, consent_text = $1, consent_at = NOW(), consent_ip = $2 WHERE id = $3`,
      [consent_text, ip, req.user.id]
    );
    res.json({ ok: true, msg: "Consent recorded" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// subscribe (no payment gateway here — creates subscription record)
// In production you will tie this to Stripe/Payment and only create subscription after successful payment.
// Here we allow creation when consent accepted.
app.post("/subscribe", authMiddleware, async (req, res) => {
  try {
    const { type } = req.body; // monthly | 6month | yearly
    if (!["monthly", "6month", "yearly"].includes(type)) return res.status(400).json({ error: "invalid type" });

    // check consent
    const { rows: urows } = await db.query("SELECT consent_accepted FROM users WHERE id = $1", [req.user.id]);
    if (!urows[0] || !urows[0].consent_accepted) return res.status(403).json({ error: "consent_required" });

    // compute end_date
    const now = new Date();
    let end = new Date(now);
    if (type === "monthly") end.setMonth(end.getMonth() + 1);
    if (type === "6month") end.setMonth(end.getMonth() + 6);
    if (type === "yearly") end.setFullYear(end.getFullYear() + 1);

    // optional: deactivate previous subscriptions
    await db.query("UPDATE subscriptions SET active = false WHERE user_id = $1", [req.user.id]);

    const { rows } = await db.query(
      "INSERT INTO subscriptions (user_id, type, start_date, end_date, active) VALUES ($1,$2,NOW(),$3,true) RETURNING *",
      [req.user.id, type, end]
    );
    res.json({ ok: true, subscription: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// me - profile + active subscription
app.get("/me", authMiddleware, async (req, res) => {
  try {
    const { rows: urows } = await db.query("SELECT id, username, email, consent_accepted, consent_at FROM users WHERE id = $1", [req.user.id]);
    const sub = await hasActiveSubscription(req.user.id);
    res.json({ ok: true, user: urows[0], subscription: sub || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// webhook - store incoming signals
app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    const symbol = payload.symbol || payload.ticker || null;
    const type = (payload.signal || payload.type || "signal").toString();
    await db.query("INSERT INTO signals (symbol, type, payload) VALUES ($1,$2,$3)", [symbol, type, payload]);
    console.log("Stored signal:", symbol, type);
    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook store error:", err);
    res.status(500).json({ error: "server" });
  }
});

// signals - only for subscribed users
app.get("/signals", authMiddleware, async (req, res) => {
  try {
    const active = await hasActiveSubscription(req.user.id);
    if (!active) return res.status(402).json({ error: "subscription_required" });
    const { rows } = await db.query("SELECT id, symbol, type, payload, created_at FROM signals ORDER BY created_at DESC LIMIT 200");
    res.json({ ok: true, signals: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------- Start -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));

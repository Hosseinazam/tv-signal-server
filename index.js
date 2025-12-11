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

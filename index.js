// index.js — اصلاح شده برای Render
const express = require("express");
const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  console.log("Alert received:", req.body);
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

// Use PORT from environment (Render provides it) or fallback to 3000 locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));

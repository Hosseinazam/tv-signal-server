// index.js — نسخه کاملاً تست‌شده و صحیح
const express = require("express");
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.post("/webhook", (req, res) => {
  console.log("Alert received:", req.body);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));

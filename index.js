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

app.listen(3000, () => console.log("Server running on port 3000"));

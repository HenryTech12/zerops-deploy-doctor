const express = require("express");
const { Pool } = require("pg");

const app = express();
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

app.get("/", (req, res) => {
  res.json({ message: "Hello from the DeployDoctor patient app", version: "1.0.0" });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/db-ping", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not configured" });
  try {
    const result = await pool.query("SELECT 1 AS ok, now() AS time");
    res.json({ db: "ok", time: result.rows[0].time });
  } catch (err) {
    res.status(500).json({ db: "error", message: err.message });
  }
});

// Reads a required env var — used by breakable variant 4 (runtime/code error).
// In the healthy baseline, GREETING_NAME is always set via zerops.yaml.
app.get("/greet", (req, res) => {
  const name = process.env.GREETING_NAME.trim();
  res.json({ message: `Hello, ${name}!` });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Patient app listening on :${port}`);
});

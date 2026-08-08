require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { migrate } = require("../../../db/migrate");
const { seed } = require("../../../db/seed");

const diagnoseRoute = require("./routes/diagnose");
const applyFixRoute = require("./routes/applyFix");
const applyCodeFixRoute = require("./routes/applyCodeFix");
const statusRoute = require("./routes/status");
const replayRoute = require("./routes/replay");
const patternsRoute = require("./routes/patterns");
const watchRoute = require("./routes/watch");
const githubRoute = require("./routes/github");
const authRoute = require("./routes/auth");
const watchScheduler = require("./lib/watchScheduler");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} origin=${req.headers.origin || "-"}`);
  next();
});

app.get("/health", (req, res) => res.json({ ok: true, service: "deploydoctor-api" }));

app.use("/api/diagnose", diagnoseRoute);
app.use("/api/apply-fix", applyFixRoute);
app.use("/api/apply-code-fix", applyCodeFixRoute);
app.use("/api/status", statusRoute);
app.use("/api/replay", replayRoute); // public, no auth — F6
app.use("/api/patterns", patternsRoute);
app.use("/api/watch", watchRoute); // F8 — see watchScheduler.js for the actual background job
app.use("/api/github", githubRoute); // Connect repo — GitHub App install + repo/file picker
app.use("/api/auth", authRoute); // landing page "Continue with GitHub" — see auth.js

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Migrate + seed run in-process, inside this same long-running node
// invocation, rather than as separate `npm run` steps chained with `&&` in
// the platform's start command — Zerops's process supervisor was observed
// treating the first chained command's exit as "the start command finished"
// and never reaching the later steps, so nothing here can depend on shell
// chaining to reach app.listen().
async function start() {
  await migrate();
  await seed();

  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`DeployDoctor API listening on :${port}`);
  });

  watchScheduler.start();
}

start().catch((err) => {
  console.error("Startup failed:", err.message);
  process.exit(1);
});

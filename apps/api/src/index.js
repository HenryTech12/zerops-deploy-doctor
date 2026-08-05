require("dotenv").config();
const express = require("express");
const cors = require("cors");

const diagnoseRoute = require("./routes/diagnose");
const applyFixRoute = require("./routes/applyFix");
const statusRoute = require("./routes/status");
const replayRoute = require("./routes/replay");
const patternsRoute = require("./routes/patterns");
const watchRoute = require("./routes/watch");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => res.json({ ok: true, service: "deploydoctor-api" }));

app.use("/api/diagnose", diagnoseRoute);
app.use("/api/apply-fix", applyFixRoute);
app.use("/api/status", statusRoute);
app.use("/api/replay", replayRoute); // public, no auth — F6
app.use("/api/patterns", patternsRoute);
app.use("/api/watch", watchRoute); // F8 — page-open polling only

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`DeployDoctor API listening on :${port}`);
});

// Real server-side background job for Watch Mode — runs inside this same
// long-running node process (Zerops's `start:` keeps it alive; this isn't
// serverless), so it keeps checking on the interval below whether or not
// any browser tab has the dashboard open, unlike the old page-open-only
// polling. One process, one timer — if this ever scales to multiple api
// replicas, watchMode.checkForNewError()'s row-locked signature swap is
// what keeps concurrent ticks from double-triggering, not this file.
const zerops = require("./zerops");
const watchMode = require("./watchMode");

const INTERVAL_MS = 30000;

function start() {
  setInterval(async () => {
    try {
      const state = await watchMode.getState();
      if (!state.enabled || !zerops.isConfigured()) return;
      await watchMode.checkForNewError(process.env.PATIENT_SERVICE_ID);
    } catch (err) {
      console.error("Watch Mode background check failed:", err.message);
    }
  }, INTERVAL_MS);
  console.log(`Watch Mode background scheduler running (every ${INTERVAL_MS / 1000}s).`);
}

module.exports = { start };

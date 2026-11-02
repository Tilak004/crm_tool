// Full re-check of the edit log's hash chain; the result shows on the Edit log page.
//   npm run audit:verify
// Runs nightly on the server (deploy/verify-audit.sh, scheduled by setup.sh / update.sh).
import { verifyAuditChain } from "../src/lib/audit";
import { db } from "../src/lib/db";

verifyAuditChain({ full: true })
  .then((r) => {
    if (r.ok) console.log(`Edit log OK: all ${r.count} entries intact.`);
    else { console.error(`Edit log check FAILED at entry #${r.brokenAtSeq}: ${r.reason}.`); process.exitCode = 1; }
  })
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());

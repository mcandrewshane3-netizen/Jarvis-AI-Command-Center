import { runDuePaperOperations } from "./services/paper-operations/scheduler";

const apiUrl = process.env.JARVIS_API_URL;
const secret = process.env.PAPER_SCHEDULER_SECRET;

if (!apiUrl) throw new Error("JARVIS_API_URL is required for the PAPER scheduler.");
if (!secret) throw new Error("PAPER_SCHEDULER_SECRET is required for the PAPER scheduler.");

const result = await runDuePaperOperations({ apiUrl, secret });
console.log(JSON.stringify({
  component: "jarvis-paper-scheduler",
  checkedAt: result.checkedAt,
  due: result.due,
  statuses: result.results.map(({ sessionId, status, httpStatus }) => ({
    sessionId, status, httpStatus,
  })),
}));
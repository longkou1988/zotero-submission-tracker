/* eslint-disable */
// Minimal Firefox RDP client to evaluate JS in Zotero's parent process.
// Usage: node rdp-eval.mjs <port> <expression>
import net from "node:net";

const port = Number(process.argv[2]);
const code = process.argv[3];

const socket = net.connect(port, "127.0.0.1");
await new Promise((resolve, reject) => {
  socket.on("connect", resolve);
  socket.on("error", reject);
});

let buffer = "";
const listeners = [];
socket.on("data", (chunk) => {
  buffer += chunk.toString();
  for (;;) {
    const idx = buffer.indexOf(":");
    if (idx === -1) break;
    const len = parseInt(buffer.slice(0, idx), 10);
    if (Number.isNaN(len)) {
      buffer = buffer.slice(idx + 1);
      continue;
    }
    const total = idx + 1 + len;
    if (buffer.length < total) break;
    const payload = buffer.slice(idx + 1, total);
    buffer = buffer.slice(total);
    try {
      const msg = JSON.parse(payload);
      for (const l of [...listeners]) l(msg);
    } catch {}
  }
});

function send(obj) {
  const s = JSON.stringify(obj);
  socket.write(`${s.length}:${s}`);
}

function waitFor(pred, timeout = 20000, label = "response") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
      reject(new Error(`timeout waiting for ${label}`));
    }, timeout);
    const listener = (msg) => {
      if (pred(msg)) {
        clearTimeout(timer);
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
        resolve(msg);
      }
    };
    listeners.push(listener);
  });
}

function summarizeGrip(grip) {
  if (grip == null) return grip;
  if (typeof grip !== "object") return grip;
  if (grip.type === "undefined") return undefined;
  if (grip.type === "object" && grip.class === "Error") {
    return `Error: ${grip.preview?.message ?? grip.errorMessage ?? "(error)"}`;
  }
  if (grip.type === "object" && grip.preview?.message !== undefined) {
    return `Error: ${grip.preview.message}`;
  }
  if (grip.type === "longstring") return grip.value;
  if (grip.type === "object" && grip.preview) {
    const entries = grip.preview.ownProperties ?? {};
    const parts = Object.entries(entries)
      .slice(0, 30)
      .map(([k, v]) => {
        const val = v?.value ?? v?.get?.displayValue ?? "…";
        return `${k}: ${typeof val === "object" ? JSON.stringify(val).slice(0, 80) : val}`;
      });
    return `{ ${parts.join(", ")} }`;
  }
  if (grip.type === "string") return grip.value;
  if ("value" in grip) return grip.value;
  return JSON.stringify(grip).slice(0, 200);
}

await waitFor((m) => m.from === "root" && m.applicationType, 10000, "greeting");
send({ to: "root", type: "getProcess", id: 0 });
let proc;
try {
  proc = await waitFor(
    (m) => m.from === "root" && (m.form || m.error),
    10000,
    "getProcess",
  );
} catch (e) {
  proc = null;
}
let consoleActor = proc?.form?.consoleActor;
if (!consoleActor) {
  send({ to: "root", type: "listTabs" });
  const tabsMsg = await waitFor(
    (m) => m.from === "root" && ("tabs" in m || "consoleActor" in m),
    10000,
    "listTabs",
  );
  consoleActor =
    tabsMsg.consoleActor ??
    tabsMsg.tabs?.find((t) => t.consoleActor)?.consoleActor;
}
if (!consoleActor) {
  send({ to: "root", type: "getRoot" });
  const rootMsg = await waitFor(
    (m) => m.from === "root" && m.traits,
    10000,
    "getRoot",
  );
  console.error("getRoot response:", JSON.stringify(rootMsg).slice(0, 1200));
  process.exit(1);
}

send({
  to: consoleActor,
  type: "evaluateJS",
  text: code,
  frameActor: undefined,
  url: undefined,
  selectedNodeActor: undefined,
});
const result = await waitFor(
  (m) =>
    m.from === consoleActor &&
    (m.type === "evaluated" || m.error || m.type === "undefined"),
  30000,
  "evaluateJS",
);
if (result.error) {
  console.error("RDP error:", JSON.stringify(result));
} else {
  const out = {
    exception: result.exception ? summarizeGrip(result.exception) : undefined,
    result: summarizeGrip(result.result),
    helperResult: result.helperResult,
    timestamp: result.timestamp,
  };
  console.log(JSON.stringify(out, null, 2));
}
socket.destroy();
process.exit(0);

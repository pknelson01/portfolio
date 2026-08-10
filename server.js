// ============================================================================
//  SERVER.JS — Portfolio
// ============================================================================ 

import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

// ----------------------------------------------------
// Path Fix (ESM)
// ----------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------------------------------
// Express Setup
// ----------------------------------------------------
const app = express();
app.use(express.json({ limit: "64kb" }));

// ----------------------------------------------------
// Static Files
// ----------------------------------------------------
app.use("/portfolio", express.static(path.join(__dirname, "Portfolio")));
app.use("/is201", express.static(path.join(__dirname, "IS201")));

// ============================================================================
// ROUTES
// ============================================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Portfolio/main.html"));
});

app.get("/projects", (req, res) => {
  res.sendFile(path.join(__dirname, "Portfolio/projects.html"));
});

app.get("/contact", (req, res) => {
  res.sendFile(path.join(__dirname, "Portfolio/contact.html"));
});

app.get("/truereview", (req, res) => {
  res.redirect("https://truereview-fxde.onrender.com/");
});

app.get("/testify", (req, res) => {
  res.sendFile(path.join(__dirname, "Portfolio/testify.html"));
});

app.get("/is201", (req, res) => {
  res.sendFile(path.join(__dirname, "IS201/index.html"));
});

app.get("/is201/scratch", (req, res) => {
  res.sendFile(path.join(__dirname, "IS201/scratch.html"));
});

app.get("/is201/webapp", (req, res) => {
  res.sendFile(path.join(__dirname, "IS201/webapp.html"));
});

// ============================================================================
// TESTIFY TOGETHER — testimony submissions
// ============================================================================

const TESTIFY_INBOX = "pk.elliott11@gmail.com";
const MAX_NAME = 80;
const MAX_TESTIMONY = 5000;

// Gmail SMTP. Requires GMAIL_USER and GMAIL_APP_PASSWORD (a Google App
// Password, not the account password) to be set in the environment.
let mailer = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
} else {
  console.warn("[testify] GMAIL_USER / GMAIL_APP_PASSWORD not set — /api/testify will return 503.");
}

// Light per-IP throttle so the public form can't be used to flood the inbox.
const testifyHits = new Map();
const THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const THROTTLE_MAX = 5;

function recentHits(ip) {
  const now = Date.now();
  const recent = (testifyHits.get(ip) || []).filter(t => now - t < THROTTLE_WINDOW_MS);
  testifyHits.set(ip, recent);
  return recent;
}

// Only counts attempts that actually reach the mail server, so a visitor who
// fumbles the form a few times doesn't burn through their allowance.
function throttled(ip) {
  return recentHits(ip).length >= THROTTLE_MAX;
}

function recordSendAttempt(ip) {
  recentHits(ip).push(Date.now());
}

app.post("/api/testify", async (req, res) => {
  if (!mailer) {
    return res.status(503).json({ error: "Testimony submissions aren't configured yet. Try again later." });
  }
  if (throttled(req.ip)) {
    return res.status(429).json({ error: "Too many submissions. Please try again later." });
  }

  const anonymous = req.body?.anonymous === true;
  const name = String(req.body?.name ?? "").trim();
  const testimony = String(req.body?.testimony ?? "").trim();
  const visibility = req.body?.visibility === "Private" ? "Private" : "Public";

  if (!testimony) {
    return res.status(400).json({ error: "Please write your testimony before submitting." });
  }
  if (testimony.length > MAX_TESTIMONY) {
    return res.status(400).json({ error: "That testimony is too long." });
  }
  if (!anonymous && !name) {
    return res.status(400).json({ error: "Please enter your name, or choose Anonymous." });
  }
  if (name.length > MAX_NAME) {
    return res.status(400).json({ error: "That name is too long." });
  }

  const body = anonymous ? testimony : `${testimony}\n-${name}`;

  recordSendAttempt(req.ip);

  try {
    await mailer.sendMail({
      // Gmail forces the address to the authenticated account; only the
      // display name is ours to set.
      from: { name: "Testify Together", address: process.env.GMAIL_USER },
      to: TESTIFY_INBOX,
      subject: `Testify Together — ${visibility}`,
      text: body,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[testify] send failed:", err);
    res.status(502).json({ error: "Something went wrong sending your testimony. Please try again." });
  }
});

// ----------------------------------------------------
// Start Server
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

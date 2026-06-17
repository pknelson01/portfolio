// ============================================================================
//  SERVER.JS — Portfolio
// ============================================================================

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// ----------------------------------------------------
// Path Fix (ESM)
// ----------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------------------------------
// Express Setup
// ----------------------------------------------------
const app = express();

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

app.get("/is201", (req, res) => {
  res.sendFile(path.join(__dirname, "IS201/index.html"));
});

app.get("/is201/scratch", (req, res) => {
  res.sendFile(path.join(__dirname, "IS201/scratch.html"));
});

app.get("/is201/webapp", (req, res) => {
  res.sendFile(path.join(__dirname, "IS201/webapp.html"));
});

// ----------------------------------------------------
// Start Server
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

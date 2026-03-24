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

// ----------------------------------------------------
// Start Server
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

// ==============================
// Config básica
// ==============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==============================
// Base de datos (SQLite)
// ==============================
const db = new Database("calendar.db");

// Crear tabla de eventos si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,      -- YYYY-MM-DD
    time TEXT NOT NULL,      -- HH:MM
    title TEXT NOT NULL,     -- Ej: "Historia IG + TikTok"
    channel TEXT,            -- Ej: "Historia", "Reel", "TikTok", etc.
    platform TEXT,           -- Ej: "Instagram", "TikTok", "Facebook"
    notes TEXT,              -- Detalles del contenido
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ==============================
// Rutas API
// ==============================

// GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/api/events", (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res
      .status(400)
      .json({ error: "Los parámetros 'start' y 'end' son obligatorios (YYYY-MM-DD)." });
  }

  try {
    const stmt = db.prepare(`
      SELECT * FROM events
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC, time ASC
    `);
    const events = stmt.all(start, end);
    res.json(events);
  } catch (err) {
    console.error("Error al obtener eventos:", err);
    res.status(500).json({ error: "Error al obtener eventos" });
  }
});

// POST /api/events
// Body: { date, time, title, channel, platform, notes }
app.post("/api/events", (req, res) => {
  try {
    const { date, time, title, channel, platform, notes } = req.body;

    if (!date || !time || !title) {
      return res.status(400).json({
        error: "Los campos 'date', 'time' y 'title' son obligatorios.",
      });
    }

    const stmt = db.prepare(`
      INSERT INTO events (date, time, title, channel, platform, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(date, time, title, channel || "", platform || "", notes || "");

    const newEvent = db
      .prepare("SELECT * FROM events WHERE id = ?")
      .get(info.lastInsertRowid);

    res.status(201).json(newEvent);
  } catch (err) {
    console.error("Error al crear evento:", err);
    res.status(500).json({ error: "Error al crear evento" });
  }
});

// PUT /api/events/:id
app.put("/api/events/:id", (req, res) => {
  const { id } = req.params;
  const { date, time, title, channel, platform, notes } = req.body;

  if (!date || !time || !title) {
    return res.status(400).json({
      error: "Los campos 'date', 'time' y 'title' son obligatorios.",
    });
  }

  try {
    const stmt = db.prepare(`
      UPDATE events
      SET date = ?, time = ?, title = ?, channel = ?, platform = ?, notes = ?
      WHERE id = ?
    `);
    const result = stmt.run(
      date,
      time,
      title,
      channel || "",
      platform || "",
      notes || "",
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    const updated = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
    res.json(updated);
  } catch (err) {
    console.error("Error al actualizar evento:", err);
    res.status(500).json({ error: "Error al actualizar evento" });
  }
});

// DELETE /api/events/:id
app.delete("/api/events/:id", (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare("DELETE FROM events WHERE id = ?");
    const result = stmt.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error al eliminar evento:", err);
    res.status(500).json({ error: "Error al eliminar evento" });
  }
});

// ==============================
// Arrancar servidor
// ==============================
app.listen(PORT, () => {
  console.log(`Calendario de marketing escuchando en http://localhost:${PORT}`);
});

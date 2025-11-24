// server.js - Calendario Marketing + Supabase + Login con roles
import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// ==============================
// Config básica
// ==============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================
// Supabase
// ==============================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ==============================
// Middlewares
// ==============================
app.use(express.json());

// Sesiones (login simple con cookie)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "cambia-este-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // true en Render (HTTPS)
      sameSite: "lax",
    },
  })
);

// Frontend estático
app.use(express.static(path.join(__dirname, "public")));

// ==============================
// Middlewares de auth
// ==============================
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "No autenticado" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "No autenticado" });
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ error: "No autorizado (se requiere admin)" });
  }
  next();
}

// ==============================
// Rutas de auth
// ==============================

// POST /api/login  { email, password }
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "Email y contraseña son obligatorios." });
  }

  try {
    const { data: user, error } = await supabase
      .from("marketing_users")
      .select("id, email, password, role, active")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("Error buscando usuario:", error);
      return res.status(500).json({ error: "Error interno" });
    }

    if (!user || !user.active) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Comparación simple de password (texto plano).
    // IMPORTANTE: En un futuro, conviene cambiar a hash (bcrypt).
    if (user.password !== password) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Guardamos usuario en la sesión
    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// POST /api/logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ==============================
// Rutas de eventos (protegidas)
// ==============================

// GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/api/events", requireAuth, async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res
      .status(400)
      .json({ error: "Los parámetros 'start' y 'end' son obligatorios." });
  }

  try {
    const { data, error } = await supabase
      .from("marketing_events")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true })
      .order("time", { ascending: true });

    if (error) {
      console.error("Error obteniendo eventos:", error);
      return res.status(500).json({ error: "Error al obtener eventos" });
    }

    res.json(data || []);
  } catch (err) {
    console.error("Error al obtener eventos:", err);
    res.status(500).json({ error: "Error al obtener eventos" });
  }
});

// POST /api/events
// Body: { date, time, title, channel, platform, notes }
app.post("/api/events", requireAuth, async (req, res) => {
  const { date, time, title, channel, platform, notes } = req.body || {};

  if (!date || !time || !title) {
    return res.status(400).json({
      error: "Los campos 'date', 'time' y 'title' son obligatorios.",
    });
  }

  try {
    const { data, error } = await supabase
      .from("marketing_events")
      .insert({
        date,
        time,
        title,
        channel: channel || null,
        platform: platform || null,
        notes: notes || null,
        created_by: req.session.user.id,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creando evento:", error);
      return res.status(500).json({ error: "Error al crear evento" });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error("Error al crear evento:", err);
    res.status(500).json({ error: "Error al crear evento" });
  }
});

// PUT /api/events/:id  (editar - permitido a admin y editor)
app.put("/api/events/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { date, time, title, channel, platform, notes } = req.body || {};

  if (!date || !time || !title) {
    return res.status(400).json({
      error: "Los campos 'date', 'time' y 'title' son obligatorios.",
    });
  }

  try {
    const { data, error } = await supabase
      .from("marketing_events")
      .update({
        date,
        time,
        title,
        channel: channel || null,
        platform: platform || null,
        notes: notes || null,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Error actualizando evento:", error);
      return res.status(500).json({ error: "Error al actualizar evento" });
    }

    if (!data) {
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    res.json(data);
  } catch (err) {
    console.error("Error al actualizar evento:", err);
    res.status(500).json({ error: "Error al actualizar evento" });
  }
});

// DELETE /api/events/:id  (solo admin puede borrar)
app.delete("/api/events/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const { error, count } = await supabase
      .from("marketing_events")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      console.error("Error eliminando evento:", error);
      return res.status(500).json({ error: "Error al eliminar evento" });
    }

    if (count === 0) {
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

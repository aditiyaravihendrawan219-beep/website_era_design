import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const app = new Hono();

const tursoUrl = process.env.TURSO_DATABASE_URL || "";
const tursoToken = process.env.TURSO_AUTH_TOKEN || "";

if (!tursoUrl || !tursoToken) {
  console.warn("Peringatan: TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN belum diatur di .env");
}

const db = createClient({
  url: tursoUrl,
  authToken: tursoToken,
});

const ENV_INVITE_TOKEN = String(process.env.ADMIN_INVITE_TOKEN || "").trim();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

// Rahasia penandatangan token sesi (ambil dari AUTH_SECRET / ADMIN_PIN atau acak per proses)
const ephemSecret = crypto.randomBytes(32).toString("hex");
function getAuthSecret() {
  return String(
    process.env.AUTH_SECRET || process.env.ADMIN_PIN || ephemSecret
  ).trim();
}

// =========================================================================
// HASH PASSWORD (SCRYPT + RANDOM SALT) & SIGNED SESSION TOKEN (HMAC-SHA256)
// =========================================================================
function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPasswordHash(plainPassword, storedValue) {
  const raw = String(storedValue || "");
  if (!raw) return { valid: false, needsRehash: false };

  if (raw.startsWith("scrypt$")) {
    const parts = raw.split("$");
    if (parts.length !== 3) return { valid: false, needsRehash: false };
    const [, salt, expectedHex] = parts;
    const expectedBuf = Buffer.from(expectedHex, "hex");
    const actualBuf = crypto.scryptSync(plainPassword, salt, 64);
    if (expectedBuf.length !== actualBuf.length) {
      return { valid: false, needsRehash: false };
    }
    return {
      valid: crypto.timingSafeEqual(expectedBuf, actualBuf),
      needsRehash: false,
    };
  }

  // Fallback kompatibilitas jika ada password lama plaintext di database
  const a = Buffer.from(plainPassword, "utf8");
  const b = Buffer.from(raw, "utf8");
  if (a.length !== b.length) return { valid: false, needsRehash: false };
  const match = crypto.timingSafeEqual(a, b);
  return { valid: match, needsRehash: match };
}

function createSessionToken(adminId, username) {
  const payload = {
    uid: Number(adminId),
    usr: String(username),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${sig}`;
}

function verifySessionToken(token) {
  const clean = String(token || "").trim();
  const parts = clean.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, sig] = parts;

  const expectedSig = crypto
    .createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
      return null;
    }
    if (!parsed.uid || !parsed.usr) return null;
    return { id: Number(parsed.uid), username: String(parsed.usr) };
  } catch {
    return null;
  }
}

// =========================================================================
// RATE LIMITER SEDERHANA UNTUK ENDPOINT AUTH (ANTI BRUTE-FORCE)
// =========================================================================
const authAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 menit

function getClientKey(c, suffix = "") {
  const fwd = String(c.req.header("x-forwarded-for") || "").split(",")[0].trim();
  const realIp = String(c.req.header("x-real-ip") || "").trim();
  const ip = fwd || realIp || "local";
  return `${ip}:${suffix}`;
}

function isRateLimited(key) {
  const entry = authAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return true;
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    authAttempts.delete(key);
    return false;
  }
  return false;
}

function recordFailedAttempt(key) {
  const now = Date.now();
  const current = authAttempts.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - current.firstAt > LOCK_DURATION_MS) {
    current.count = 1;
    current.firstAt = now;
    current.lockedUntil = 0;
  } else {
    current.count += 1;
    if (current.count >= MAX_FAILED_ATTEMPTS) {
      current.lockedUntil = now + LOCK_DURATION_MS;
    }
  }
  authAttempts.set(key, current);
}

function clearFailedAttempts(key) {
  authAttempts.delete(key);
}

// =========================================================================
// INISIALISASI DATABASE & HELPER
// =========================================================================
async function ensureDatabaseSchema() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error("Init admin_users error:", err);
  }

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    if (ENV_INVITE_TOKEN) {
      await db.execute({
        sql: `INSERT INTO settings (key, value) VALUES ('admin_invite_token', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        args: [ENV_INVITE_TOKEN],
      });
    }
  } catch (err) {
    console.error("Init settings error:", err);
  }
}

await ensureDatabaseSchema();

async function getActiveInviteToken() {
  const tokenRes = await db.execute({
    sql: "SELECT value FROM settings WHERE key = 'admin_invite_token' LIMIT 1",
    args: [],
  });
  const dbToken = String(tokenRes.rows?.[0]?.value || "").trim();
  return dbToken || ENV_INVITE_TOKEN;
}

async function authenticateAdminUser(username, password) {
  const cleanUser = String(username || "").trim();
  const cleanPass = String(password || "").trim();
  if (!cleanUser || !cleanPass) return null;

  const res = await db.execute({
    sql: "SELECT id, username, password FROM admin_users WHERE username = ? LIMIT 1",
    args: [cleanUser],
  });

  if (!res.rows || res.rows.length === 0) return null;
  const row = res.rows[0];
  const check = verifyPasswordHash(cleanPass, row.password);
  if (!check.valid) return null;

  if (check.needsRehash) {
    await db.execute({
      sql: "UPDATE admin_users SET password = ? WHERE id = ?",
      args: [hashPassword(cleanPass), row.id],
    });
  }

  return {
    id: Number(row.id),
    username: String(row.username),
  };
}

// 1. Login admin menggunakan nama & sandi ter-hash di Turso
app.post("/api/admin/login", async (c) => {
  try {
    const body = await c.req.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();
    const rateKey = getClientKey(c, `login:${username.toLowerCase()}`);

    if (isRateLimited(rateKey)) {
      return c.json(
        { ok: false, error: "Terlalu banyak percobaan gagal. Coba lagi 10 menit lagi." },
        429
      );
    }

    if (!username || !password) {
      return c.json({ ok: false, error: "Nama admin dan sandi wajib diisi" }, 400);
    }

    const admin = await authenticateAdminUser(username, password);
    if (!admin) {
      recordFailedAttempt(rateKey);
      return c.json({ ok: false, error: "Nama admin atau sandi salah" }, 401);
    }

    clearFailedAttempts(rateKey);
    const token = createSessionToken(admin.id, admin.username);
    return c.json({ ok: true, admin, token });
  } catch (err) {
    console.error("Login admin error:", err);
    return c.json({ ok: false, error: "Terjadi kesalahan saat memverifikasi akun admin" }, 500);
  }
});

// 2. Register akun admin baru (3 input: username, password, invite_token)
app.post("/api/admin/register", async (c) => {
  try {
    const body = await c.req.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();
    const inviteToken = String(body?.invite_token || "").trim();
    const rateKey = getClientKey(c, "register");

    if (isRateLimited(rateKey)) {
      return c.json(
        { ok: false, error: "Terlalu banyak percobaan token gagal. Coba lagi 10 menit lagi." },
        429
      );
    }

    if (!username || !password || !inviteToken) {
      return c.json(
        { ok: false, error: "Nama admin, sandi, dan token pendaftaran wajib diisi" },
        400
      );
    }

    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
      return c.json(
        { ok: false, error: "Nama admin 3-30 karakter (huruf, angka, titik, strip, underscore)" },
        400
      );
    }

    if (password.length < 6) {
      return c.json({ ok: false, error: "Sandi minimal 6 karakter" }, 400);
    }

    const activeToken = await getActiveInviteToken();
    if (!activeToken) {
      return c.json({ ok: false, error: "Token pendaftaran belum diatur di server/database" }, 500);
    }

    const aBuf = Buffer.from(inviteToken, "utf8");
    const bBuf = Buffer.from(activeToken, "utf8");
    const tokenMatch = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
    if (!tokenMatch) {
      recordFailedAttempt(rateKey);
      return c.json({ ok: false, error: "Token pendaftaran tidak valid atau sudah diganti" }, 403);
    }

    const existing = await db.execute({
      sql: "SELECT id FROM admin_users WHERE username = ? LIMIT 1",
      args: [username],
    });
    if (existing.rows && existing.rows.length > 0) {
      return c.json({ ok: false, error: "Nama admin sudah terdaftar, gunakan nama lain" }, 409);
    }

    const hashedPass = hashPassword(password);
    const inserted = await db.execute({
      sql: "INSERT INTO admin_users (username, password) VALUES (?, ?) RETURNING id, username",
      args: [username, hashedPass],
    });

    clearFailedAttempts(rateKey);
    const newAdmin = inserted.rows[0];
    const token = createSessionToken(newAdmin.id, newAdmin.username);

    return c.json(
      {
        ok: true,
        admin: {
          id: Number(newAdmin.id),
          username: String(newAdmin.username),
        },
        token,
      },
      201
    );
  } catch (err) {
    console.error("Register admin error:", err);
    return c.json({ ok: false, error: "Gagal mendaftarkan akun admin ke database" }, 500);
  }
});

// 3. Lupa sandi (reset sandi memakai nama admin + token pendaftaran aktif di Turso)
app.post("/api/admin/reset-password", async (c) => {
  try {
    const body = await c.req.json();
    const username = String(body?.username || "").trim();
    const inviteToken = String(body?.invite_token || "").trim();
    const newPassword = String(body?.new_password || "").trim();
    const rateKey = getClientKey(c, "reset");

    if (isRateLimited(rateKey)) {
      return c.json(
        { ok: false, error: "Terlalu banyak percobaan gagal. Coba lagi 10 menit lagi." },
        429
      );
    }

    if (!username || !inviteToken || !newPassword) {
      return c.json({ ok: false, error: "Semua kolom wajib diisi" }, 400);
    }
    if (newPassword.length < 6) {
      return c.json({ ok: false, error: "Sandi baru minimal 6 karakter" }, 400);
    }

    const activeToken = await getActiveInviteToken();
    if (!activeToken) {
      return c.json({ ok: false, error: "Token pendaftaran belum diatur di server/database" }, 500);
    }

    const aBuf = Buffer.from(inviteToken, "utf8");
    const bBuf = Buffer.from(activeToken, "utf8");
    const tokenMatch = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
    if (!tokenMatch) {
      recordFailedAttempt(rateKey);
      return c.json({ ok: false, error: "Token pendaftaran tidak valid" }, 403);
    }

    const check = await db.execute({
      sql: "SELECT id FROM admin_users WHERE username = ? LIMIT 1",
      args: [username],
    });

    if (!check.rows || check.rows.length === 0) {
      recordFailedAttempt(rateKey);
      return c.json({ ok: false, error: "Nama admin tidak ditemukan" }, 404);
    }

    clearFailedAttempts(rateKey);
    await db.execute({
      sql: "UPDATE admin_users SET password = ? WHERE id = ?",
      args: [hashPassword(newPassword), check.rows[0].id],
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return c.json({ ok: false, error: "Gagal mereset sandi di database" }, 500);
  }
});

// Middleware autentikasi admin memakai Bearer session token
const publicApiPaths = new Set([
  "/api/admin/login",
  "/api/admin/register",
  "/api/admin/reset-password",
]);

app.use("/api/*", async (c, next) => {
  const isPublicGet = c.req.method === "GET" && (c.req.path === "/api/items" || c.req.path === "/api/logo");
  if (isPublicGet || publicApiPaths.has(c.req.path)) {
    await next();
    return;
  }

  const authHeader = String(c.req.header("authorization") || "");
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const session = verifySessionToken(bearerToken);

  if (!session) {
    return c.json({ error: "Sesi admin tidak valid atau kedaluwarsa. Silakan masuk ulang." }, 401);
  }

  c.set("adminSession", session);
  await next();
});

// 4. GET & PUT token pendaftaran admin di Turso (khusus admin terautentikasi)
app.get("/api/admin/invite-token", async (c) => {
  try {
    const token = await getActiveInviteToken();
    return c.json({ ok: true, invite_token: token });
  } catch (err) {
    console.error("GET /api/admin/invite-token error:", err);
    return c.json({ error: "Gagal mengambil token dari database" }, 500);
  }
});

app.put("/api/admin/invite-token", async (c) => {
  try {
    const body = await c.req.json();
    const nextToken = String(body?.invite_token || "").trim();

    if (nextToken.length < 6 || nextToken.length > 64 || /\s/.test(nextToken)) {
      return c.json(
        { error: "Token harus 6-64 karakter tanpa spasi" },
        400
      );
    }

    await db.execute({
      sql: `INSERT INTO settings (key, value) VALUES ('admin_invite_token', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [nextToken],
    });

    return c.json({ ok: true, invite_token: nextToken });
  } catch (err) {
    console.error("PUT /api/admin/invite-token error:", err);
    return c.json({ error: "Gagal menyimpan token ke database" }, 500);
  }
});

// GET semua item katalog
app.get("/api/items", async (c) => {
  try {
    const res = await db.execute("SELECT * FROM items ORDER BY id ASC");
    return c.json(res.rows);
  } catch (err) {
    console.error("GET /api/items error:", err);
    return c.json({ error: "Gagal mengambil data katalog" }, 500);
  }
});

// POST tambah item baru (dengan validasi input ke database)
app.post("/api/items", async (c) => {
  try {
    const body = await c.req.json();
    const name = String(body?.name || "").trim();
    const category = String(body?.category || "Desain Grafis").trim();
    const price = Number(body?.price);
    const unit = String(body?.unit || "paket").trim();
    const note = String(body?.note || "").trim();
    const imageUrl = String(body?.image_url || "").trim();

    if (name.length < 2 || name.length > 120) {
      return c.json({ error: "Nama layanan harus 2-120 karakter" }, 400);
    }
    if (!Number.isFinite(price) || price < 500) {
      return c.json({ error: "Harga minimal Rp 500 dan harus berupa angka valid" }, 400);
    }
    if (!unit) {
      return c.json({ error: "Satuan layanan wajib diisi" }, 400);
    }

    const res = await db.execute({
      sql: `INSERT INTO items (name, category, price, unit, note, image_url)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [name, category, Math.round(price), unit, note, imageUrl],
    });

    return c.json(res.rows[0], 201);
  } catch (err) {
    console.error("POST /api/items error:", err);
    return c.json({ error: "Gagal menambah item" }, 500);
  }
});

// PUT edit item / harga (dengan validasi input ke database)
app.put("/api/items/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "ID tidak valid" }, 400);
    }

    const body = await c.req.json();
    let nextPrice = null;
    if (body?.price !== undefined) {
      const parsedPrice = Number(body.price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 500) {
        return c.json({ error: "Harga minimal Rp 500 dan harus berupa angka valid" }, 400);
      }
      nextPrice = Math.round(parsedPrice);
    }

    let nextName = null;
    if (body?.name !== undefined) {
      const trimmed = String(body.name).trim();
      if (trimmed.length < 2 || trimmed.length > 120) {
        return c.json({ error: "Nama layanan harus 2-120 karakter" }, 400);
      }
      nextName = trimmed;
    }

    const res = await db.execute({
      sql: `UPDATE items
            SET name = COALESCE(?, name),
                category = COALESCE(?, category),
                price = COALESCE(?, price),
                unit = COALESCE(?, unit),
                note = COALESCE(?, note),
                image_url = COALESCE(?, image_url)
            WHERE id = ? RETURNING *`,
      args: [
        nextName,
        body?.category !== undefined ? String(body.category).trim() : null,
        nextPrice,
        body?.unit !== undefined ? String(body.unit).trim() : null,
        body?.note !== undefined ? String(body.note).trim() : null,
        body?.image_url !== undefined ? String(body.image_url).trim() : null,
        id,
      ],
    });

    if (res.rows.length === 0) {
      return c.json({ error: "Item tidak ditemukan" }, 404);
    }

    return c.json(res.rows[0]);
  } catch (err) {
    console.error("PUT /api/items/:id error:", err);
    return c.json({ error: "Gagal mengubah item" }, 500);
  }
});

// DELETE hapus item
app.delete("/api/items/:id", async (c) => {
  try {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "ID tidak valid" }, 400);
    }

    await db.execute({
      sql: "DELETE FROM items WHERE id = ?",
      args: [id],
    });

    return c.json({ ok: true, id });
  } catch (err) {
    console.error("DELETE /api/items/:id error:", err);
    return c.json({ error: "Gagal menghapus item" }, 500);
  }
});

// GET logo brand
app.get("/api/logo", async (c) => {
  try {
    const res = await db.execute({
      sql: "SELECT value FROM settings WHERE key = 'logo_url'",
      args: [],
    });
    const logoUrl = res.rows[0]?.value ? String(res.rows[0].value) : "";
    return c.json({ logo_url: logoUrl });
  } catch (err) {
    console.error("GET /api/logo error:", err);
    return c.json({ error: "Gagal mengambil logo" }, 500);
  }
});

// PUT update / reset logo brand
app.put("/api/logo", async (c) => {
  try {
    const body = await c.req.json();
    const logoUrl = String(body?.logo_url || "").trim();

    await db.execute({
      sql: `INSERT INTO settings (key, value) VALUES ('logo_url', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [logoUrl],
    });

    return c.json({ ok: true, logo_url: logoUrl });
  } catch (err) {
    console.error("PUT /api/logo error:", err);
    return c.json({ error: "Gagal menyimpan logo" }, 500);
  }
});

// Penyajian file statis dari folder public/
const publicDir = path.resolve(process.cwd(), "public");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

app.get("*", (c) => {
  const reqPath = new URL(c.req.url).pathname;
  const targetRel = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(publicDir, targetRel);

  if (!resolvedPath.startsWith(publicDir + path.sep) && resolvedPath !== publicDir) {
    return c.text("Forbidden", 403);
  }

  let fileToRead = resolvedPath;
  if (!fs.existsSync(fileToRead) || fs.statSync(fileToRead).isDirectory()) {
    const fallbackIndex = path.join(publicDir, "index.html");
    if (!fs.existsSync(fallbackIndex)) {
      return c.text("Not Found", 404);
    }
    fileToRead = fallbackIndex;
  }

  const ext = path.extname(fileToRead).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const content = fs.readFileSync(fileToRead);

  return c.body(content, 200, {
    "Content-Type": contentType,
  });
});

const port = Number(process.env.PORT || 3000);
console.log(`ERAS DESIGN (Node server.js) berjalan di http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
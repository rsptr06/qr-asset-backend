import dotenv from "dotenv";
import https from "https";
import http from "http";
import fs from "fs";
dotenv.config();
import path from "path";
import { fileURLToPath } from "url";
import fileUpload from "express-fileupload";
import assetsHistoryRouter from './assetsHistory.js';
import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";
const key = fs.readFileSync("localhost-key.pem");
const cert = fs.readFileSync("localhost.pem");
const app = express();
const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



// Koneksi dan buat database.db
const db = new sqlite3.Database("./database.db", (err) => {
  if (err) return console.error("❌ Gagal konek DB:", err.message);
  console.log("✅ Terhubung ke SQLite database.");
});

// Buat tabel users & assets
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT,
      location TEXT,
      description TEXT,
      unit TEXT,
      kondisi TEXT,
      jenis TEXT,
      nilai_perolehan INTEGER,
      tahun_perolehan TEXT,
      image_url TEXT
    )
  `);

  // Tambah admin default jika belum ada
  db.get("SELECT * FROM users WHERE username = ?", ["admin"], (err, row) => {
    if (!row) {
      db.run(
        "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
        ["admin", "admin123", "admin"]
      );
      console.log("🔐 Admin default dibuat: admin / admin123");
    }
  });
});

app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use('/api/assets-history', assetsHistoryRouter);

// ====== Endpoint Login ======
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal server error" });
    }
    if (!user) {
      return res.status(401).json({ error: "User tidak ditemukan" });
    }

    if (user.password !== password) {
      return res.status(401).json({ error: "Password salah" });
    }

    res.json({ username: user.username, role: user.role });
  });
});

// ====== CRUD Aset ======
app.get("/api/assets", (req, res) => {
  db.all("SELECT * FROM assets", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/api/assets/:id", (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM assets WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });
});

// ====== GET Semua User ======
app.get("/api/users", (req, res) => {
  db.all("SELECT id, username, role FROM users", [], (err, rows) => {
    if (err) {
      console.error("❌ Gagal mengambil data users:", err.message);
      return res.status(500).json({ error: "Gagal mengambil data users" });
    }
    res.json(rows);
  });
});

app.post("/api/users", (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Semua field wajib diisi" });
  }
  db.run(
    `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
    [username, password, role],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put("/api/users/:id", (req, res) => {
  const id = req.params.id;
  const { username, password, role } = req.body;

  if (!username || !role) {
    return res.status(400).json({ error: "Field tidak boleh kosong" });
  }

  const query = password
    ? `UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?`
    : `UPDATE users SET username = ?, role = ? WHERE id = ?`;

  const params = password
    ? [username, password, role, id]
    : [username, role, id];

  db.run(query, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, updated: this.changes });
  });
});

app.delete("/api/users/:id", (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});


app.get("/ping", (req, res) => {
  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="2;url=https://10.128.38.73:5173/login" />
      </head>
      <body style="background-color:#0f172a; color:white; display:flex; justify-content:center; align-items:center; height:100vh;">
        <h1>🔐 Menghubungkan ke backend...<br/>Silakan tunggu sebentar.</h1>
      </body>
    </html>
  `);
});

app.post("/api/assets", (req, res) => {
  const {
    id,
    name,
    location,
    description,
    unit,
    kondisi = "",
    jenis,
    nilai_perolehan,
    tahun_perolehan
  } = req.body;

  const parsedNilai = parseInt((nilai_perolehan || "0").toString().replace(/\./g, "")) || 0;
  let image_url = "";

  db.get("SELECT id FROM assets WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(400).json({ error: "ID aset sudah ada di database." });

    if (req.files && req.files.image) {
      const img = req.files.image;
      const filename = `${Date.now()}_${img.name}`;
      const filePath = path.join("uploads", filename);

      img.mv(path.join(__dirname, filePath), (err) => {
        if (err) return res.status(500).json({ error: err.message });

        image_url = filePath;
        db.run(
          `INSERT INTO assets (id, name, location, description, unit, kondisi, jenis, nilai_perolehan, tahun_perolehan, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, name, location, description, unit, kondisi, jenis, parsedNilai, tahun_perolehan, image_url],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id });
          }
        );
      });
    } else {
      db.run(
        `INSERT INTO assets (id, name, location, description, unit, kondisi, jenis, nilai_perolehan, tahun_perolehan, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, location, description, unit, kondisi, jenis, parsedNilai, tahun_perolehan, image_url],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, id });
        }
      );
    }
  });
});

app.put("/api/assets/:id", (req, res) => {
  const id = req.params.id;
  const {
    name,
    location,
    description,
    unit,
    kondisi = "",
    jenis,
    nilai_perolehan,
    tahun_perolehan
  } = req.body;

  const parsedNilai = parseInt((nilai_perolehan || "0").toString().replace(/\./g, "")) || 0;

  if (req.files && req.files.image) {
    const img = req.files.image;
    const filename = `${Date.now()}_${img.name}`;
    const filePath = path.join("uploads", filename);

    img.mv(path.join(__dirname, filePath), (err) => {
      if (err) return res.status(500).json({ error: err.message });

      db.run(
        `UPDATE assets SET name = ?, location = ?, description = ?, unit = ?, kondisi = ?, jenis = ?, nilai_perolehan = ?, tahun_perolehan = ?, image_url = ? WHERE id = ?`,
        [name, location, description, unit, kondisi, jenis, parsedNilai, tahun_perolehan, filePath, id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, updated: this.changes });
        }
      );
    });
  } else {
    db.run(
      `UPDATE assets SET name = ?, location = ?, description = ?, unit = ?, kondisi = ?, jenis = ?, nilai_perolehan = ?, tahun_perolehan = ? WHERE id = ?`,
      [name, location, description, unit, kondisi, jenis, parsedNilai, tahun_perolehan, id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, updated: this.changes });
      }
    );
  }
});

app.delete("/api/assets/:id", (req, res) => {
  db.run("DELETE FROM assets WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ====== Start Server ======
https.createServer({ key, cert }, app).listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server backend berjalan di https://10.128.38.73:${PORT}`);
});

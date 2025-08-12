import express from 'express';
import sqlite3 from "sqlite3";

const router = express.Router();
const db = new sqlite3.Database("./database.db", (err) => {
  if (err) return console.error("❌ Gagal konek DB:", err.message);
  console.log("✅ Terhubung ke SQLite database.");
});
router.post("/", (req, res) => {
  const {
    asset_id,
    name,
    location,
    description,
    unit,
    kondisi,
    jenis,
    nilai_perolehan,
    tahun_perolehan,
    tanggal_update
  } = req.body;

  const sql = `
    INSERT INTO assets_history 
    (asset_id, name, location, description, unit, kondisi, jenis, nilai_perolehan, tahun_perolehan, tanggal_update)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [
    asset_id, name, location, description, unit,
    kondisi, jenis, nilai_perolehan,
    tahun_perolehan, tanggal_update
  ];

  db.run(sql, values, (err) => {
    if (err) {
      console.error("Error inserting history:", err);
      return res.status(500).json({ error: "Gagal menyimpan riwayat." });
    }
    res.status(201).json({ message: "Riwayat aset disimpan." });
  });
});
router.get("/:id", (req, res) => {
  const assetId = req.params.id;
  const sql = `
    SELECT tanggal_update, location, unit, jenis, kondisi
    FROM assets_history
    WHERE asset_id = ?
    ORDER BY tanggal_update DESC
  `;
  db.all(sql, [assetId], (err, rows) => {
    if (err) {
      console.error("Gagal ambil data history:", err);
      return res.status(500).json({ error: "Gagal ambil data history" });
    }
    res.json(rows);
});
});

export default router;
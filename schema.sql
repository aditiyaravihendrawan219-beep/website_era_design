CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    unit TEXT NOT NULL,
    note TEXT,
    image_url TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('logo_url', '');

INSERT INTO items (name, category, price, unit, note, image_url)
SELECT * FROM (
    SELECT 'Logo', 'Desain Grafis', 50000, 'paket', 'Konsep logo UMKM/brand + file siap pakai & cetak', ''
    UNION ALL SELECT 'Banner / X-Banner', 'Banner & Dokumen', 65000, 'paket', 'Desain + cetak banner/X-banner (garansi 2x revisi)', ''
    UNION ALL SELECT 'Brosur / Poster', 'Banner & Dokumen', 35000, 'paket', 'Desain promosi tajam & siap cetak', ''
    UNION ALL SELECT 'Sertifikat', 'Banner & Dokumen', 25000, 'paket', 'Layout sertifikat acara/pelatihan siap cetak', ''
    UNION ALL SELECT 'Cover Buku', 'Desain Grafis', 50000, 'paket', 'Desain sampul depan-belakang-punggung siap cetak', ''
    UNION ALL SELECT 'Stiker', 'Cetak & Stiker', 15000, 'lembar', 'Cetak stiker produk / label kemasan', ''
    UNION ALL SELECT 'Kartu Nama', 'Cetak & Stiker', 30000, 'paket', 'Desain + cetak kartu nama usaha/kontak', ''
    UNION ALL SELECT 'ID Card', 'Cetak & Stiker', 20000, 'pcs', 'Desain + cetak ID card panitia/karyawan', ''
    UNION ALL SELECT 'Menu', 'Banner & Dokumen', 45000, 'paket', 'Desain daftar menu warung/kedai/cafe siap cetak', ''
    UNION ALL SELECT 'Edit Foto', 'Desain Grafis', 15000, 'foto', 'Retouch, hapus background, atau perbaikan foto', ''
)
WHERE NOT EXISTS (SELECT 1 FROM items);

CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
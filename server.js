// server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Carpeta temporales
const UPLOAD_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Estáticos
app.use('/tmp', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Body JSON (por si se usa en alguna feature)
app.use(express.json());

// Storage compartido (archivos en /tmp del proyecto)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) =>
    cb(null, `${randomUUID()}-${file.originalname.replace(/\s+/g, "_")}`)
});

// ====== Cargador de features (modular) ======
try {
  const { loadFeatures } = require('./api/feature-loader');
  if (process.env.ENABLE_MERGE_BATCH == null) {
    process.env.ENABLE_MERGE_BATCH = '1';
  }
  loadFeatures(app, { UPLOAD_DIR, storage, rootDir: __dirname });
  console.log('[features] loader activo');
} catch (e) {
  console.warn('[features] loader ausente o falló:', e.message);
}

// (opcional) manejo básico de errores de subida
app.use((err, _req, res, _next) => {
  if (!err) return res.status(500).json({ error: 'Error interno' });
  const msg = err.message || 'Error interno';
  const isClient = /Solo\s|file too large|Unexpected field/i.test(msg);
  res.status(isClient ? 400 : 500).json({ error: msg });
});

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Utilidades PDF Inalma en http://localhost:${PORT}`)
);

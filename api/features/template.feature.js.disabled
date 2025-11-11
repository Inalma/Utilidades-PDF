// api/feature-loader.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const mime = require('mime-types');

function getUploader(kind, storage) {
  // todos usan el mismo storage (tmp/) que ya tienes
  const base = { storage, limits: { fileSize: 50 * 1024 * 1024 } };

  if (kind === 'pdf') {
    return multer({
      ...base,
      fileFilter: (_req, file, cb) => {
        const type = file.mimetype || mime.lookup(file.originalname);
        cb(type === 'application/pdf' ? null : new Error('Solo PDF'), type === 'application/pdf');
      }
    });
  }

  if (kind === 'img') {
    return multer({
      ...base,
      limits: { fileSize: 30 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const type = (file.mimetype || mime.lookup(file.originalname) || '').toString();
        cb(/^image\/(jpeg|png)$/.test(type) ? null : new Error('Solo JPG o PNG'),
           /^image\/(jpeg|png)$/.test(type));
      }
    });
  }

  if (kind === 'docx') {
    return multer({
      ...base,
      limits: { fileSize: 30 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const type = (file.mimetype || mime.lookup(file.originalname) || '').toString();
        const ok = type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(file.originalname);
        cb(ok ? null : new Error('Solo .docx'), ok);
      }
    });
  }

  // sin archivos
  return (_req, _res, next) => next();
}

function isEnabled(name, flags) {
  // 1) env var precisa, ej: ENABLE_DOCX2EXCEL=1
  const envKey = `ENABLE_${name.replace(/[^A-Za-z0-9]/g,'_').toUpperCase()}`;
  if (process.env[envKey] != null) {
    return /^(1|true|yes)$/i.test(process.env[envKey]);
  }
  // 2) features.json (opcional)
  if (flags && Object.prototype.hasOwnProperty.call(flags, name)) {
    return !!flags[name];
  }
  // 3) por defecto, habilitado en dev, deshabilitado en prod
  return process.env.NODE_ENV !== 'production';
}

function loadFlags(rootDir) {
  const f = path.join(rootDir, 'features.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function loadFeatures(app, { UPLOAD_DIR, storage, rootDir = process.cwd() } = {}) {
  const flags = loadFlags(rootDir);
  const dir = path.join(rootDir, 'api', 'features');
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.feature.js'));
  for (const file of files) {
    const modPath = path.join(dir, file);
    // el módulo debe exportar function(ctx) => { name, path, uploadKind, router }
    const factory = require(modPath);
    const ctx = { express, UPLOAD_DIR, rootDir };
    const meta = factory(ctx);

    if (!meta || !meta.path || !meta.router) {
      console.warn(`[features] ${file} no exporta {path,router}`);
      continue;
    }

    const name = meta.name || path.basename(file, '.feature.js');
    if (!isEnabled(name, flags)) {
      console.log(`[features] ${name} DESHABILITADO`);
      continue;
    }

    const upload = getUploader(meta.uploadKind || 'none', storage);
    app.use(meta.path, upload.single?.('file') || upload, meta.router);
    console.log(`[features] montado ${name} en ${meta.path} (kind=${meta.uploadKind || 'none'})`);
  }
}

module.exports = { loadFeatures };

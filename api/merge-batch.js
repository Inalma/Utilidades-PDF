// api/merge-batch.js
const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const { PDFDocument } = require('pdf-lib');

module.exports = ({ upload, UPLOAD_DIR }) => {
  const router = express.Router();

  const uploader = upload.fields([
    { name: 'orders', maxCount: 100 },
    { name: 'invoices', maxCount: 100 }
  ]);

  const extractSeq = (name = '') => {
    const match = String(name).match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return Number.NaN;
    const num = Number(match[1].replace(',', '.'));
    return Number.isFinite(num) ? num : Number.NaN;
  };

  const sortBySequence = (list = []) => (
    [...list].sort((a, b) => {
      const na = extractSeq(a.originalname);
      const nb = extractSeq(b.originalname);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      if (!Number.isNaN(na) && Number.isNaN(nb)) return -1;
      if (Number.isNaN(na) && !Number.isNaN(nb)) return 1;
      return String(a.originalname || '').localeCompare(String(b.originalname || ''), 'es', { numeric: true });
    })
  );

  const toBuffer = (filePath) => fsp.readFile(filePath);

  const createZip = (entries, destPath) => new Promise((resolve, reject) => {
    if (!entries.length) return reject(new Error('Nada que comprimir'));
    const script = `
import sys, json, zipfile, os
entries = json.loads(sys.stdin.read())
dest = sys.argv[1]
with zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for item in entries:
        path = item['path']
        arc = item['name']
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        zf.write(path, arcname=arc)
`;
    const zip = spawn('python3', ['-c', script, destPath], {
      stdio: ['pipe', 'inherit', 'inherit']
    });
    zip.on('error', reject);
    zip.on('close', (code) => {
      if (code === 0 && fs.existsSync(destPath)) resolve();
      else reject(new Error(`zipfile exit ${code}`));
    });
    zip.stdin.end(JSON.stringify(entries));
  });

  const safeUnlink = async (filePath) => {
    if (!filePath) return;
    try { await fsp.unlink(filePath); } catch { /* ignore */ }
  };

  router.post('/', uploader, async (req, res) => {
    const orders = sortBySequence(req.files?.orders || []);
    const invoices = sortBySequence(req.files?.invoices || []);

    if (!orders.length || !invoices.length) {
      await Promise.all(orders.concat(invoices).map(f => safeUnlink(f?.path)));
      return res.status(400).json({ error: 'Debes adjuntar órdenes y facturas (formatos PDF).' });
    }

    if (orders.length !== invoices.length) {
      await Promise.all(orders.concat(invoices).map(f => safeUnlink(f?.path)));
      return res.status(400).json({
        error: 'La cantidad de órdenes y facturas no coincide',
        detail: `Órdenes: ${orders.length}, Facturas: ${invoices.length}`
      });
    }

    const created = [];
    const cleanupTargets = [];
    const runId = Date.now();
    let zipPath;
    const usedNames = new Set();

    try {
      for (let i = 0; i < orders.length; i += 1) {
        const order = orders[i];
        const invoice = invoices[i];

        if (order?.path) cleanupTargets.push(order.path);
        if (invoice?.path) cleanupTargets.push(invoice.path);

        const outDoc = await PDFDocument.create();

        const orderPdf = await PDFDocument.load(await toBuffer(order.path));
        const invoicePdf = await PDFDocument.load(await toBuffer(invoice.path));

        const orderPages = await outDoc.copyPages(orderPdf, orderPdf.getPageIndices());
        orderPages.forEach((p) => outDoc.addPage(p));

        const invoicePages = await outDoc.copyPages(invoicePdf, invoicePdf.getPageIndices());
        invoicePages.forEach((p) => outDoc.addPage(p));

        const bytes = await outDoc.save();

        const originalName = (order.originalname || `orden_${i + 1}.pdf`).trim() || `orden_${i + 1}.pdf`;
        const withExt = /\.pdf$/i.test(originalName) ? originalName : `${originalName}.pdf`;
        const sanitized = withExt.replace(/[\\/]/g, '_');

        let downloadName = sanitized;
        if (usedNames.has(downloadName)) {
          const ext = path.extname(downloadName);
          const stem = path.basename(downloadName, ext);
          let suffix = 1;
          while (usedNames.has(`${stem}_${suffix}${ext}`)) suffix += 1;
          downloadName = `${stem}_${suffix}${ext}`;
        }
        usedNames.add(downloadName);

        const mergedPath = path.join(UPLOAD_DIR, `${runId}_${i + 1}.pdf`);

        await fsp.writeFile(mergedPath, Buffer.from(bytes));
        created.push({ path: mergedPath, name: downloadName });
      }

      const zipName = `merge_batch_${runId}.zip`;
      zipPath = path.join(UPLOAD_DIR, zipName);

      await createZip(created, zipPath);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      const stream = fs.createReadStream(zipPath);
      stream.on('error', async () => {
        await Promise.all(cleanupTargets.map(safeUnlink));
        await Promise.all(created.map(f => safeUnlink(f.path)));
        await safeUnlink(zipPath);
      });
      stream.on('close', async () => {
        await Promise.all(cleanupTargets.map(safeUnlink));
        await Promise.all(created.map(f => safeUnlink(f.path)));
        await safeUnlink(zipPath);
      });
      stream.pipe(res);
    } catch (err) {
      await Promise.all(cleanupTargets.map(safeUnlink));
      await Promise.all(created.map(f => safeUnlink(f.path)));
      await safeUnlink(zipPath);
      return res.status(500).json({ error: 'No se pudo completar la fusión por lotes', detail: err.message || String(err) });
    }
  });

  return router;
};

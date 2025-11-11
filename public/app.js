// public/app.js
document.addEventListener('DOMContentLoaded', () => {
  // ---- Navegación de pestañas ----
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`panel-${tab}`)?.classList.add('active');
    });
  });

  // ---- Util: descargar Blob ----
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // =========================
  //  Compresión de PDF
  // =========================
  const fileInput = document.getElementById('file');
  const presetSel = document.getElementById('preset');
  const goBtn     = document.getElementById('go');
  const drop      = document.getElementById('drop');

  if (drop) {
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('drag');
      if (e.dataTransfer.files?.length) fileInput.files = e.dataTransfer.files;
    });
  }

  if (goBtn) {
    goBtn.addEventListener('click', async () => {
      const file = fileInput?.files?.[0];
      if (!file) return alert('Selecciona un PDF');

      const fd = new FormData();
      fd.append('file', file);

      try {
        const res = await fetch(`/api/compress?preset=${encodeURIComponent(presetSel.value)}`, {
          method: 'POST', body: fd
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return alert(`Error: ${err.error || res.statusText}\n${err.detail || ''}`);
        }
        const blob = await res.blob();
        downloadBlob(blob, file.name.replace(/\.pdf$/i, '') + '-compressed.pdf');
      } catch (e) {
        alert(`Fallo de red: ${e.message || e}`);
      }
    });
  }

  // =========================
  //  PDF → Word
  // =========================
  const fileInput2 = document.getElementById('file2');
  const goBtn2     = document.getElementById('go2');
  const ocrChk     = document.getElementById('ocr');
  const drop2      = document.getElementById('drop2');

  if (drop2) {
    drop2.addEventListener('dragover', e => { e.preventDefault(); drop2.classList.add('drag'); });
    drop2.addEventListener('dragleave', () => drop2.classList.remove('drag'));
    drop2.addEventListener('drop', e => {
      e.preventDefault(); drop2.classList.remove('drag');
      if (e.dataTransfer.files?.length) fileInput2.files = e.dataTransfer.files;
    });
  }

  if (goBtn2) {
    goBtn2.addEventListener('click', async () => {
      const file = fileInput2?.files?.[0];
      if (!file) return alert('Selecciona un PDF');

      const fd = new FormData();
      fd.append('file', file);

      try {
        const res = await fetch(`/api/pdf2word?ocr=${ocrChk?.checked ?? false}`, {
          method: 'POST', body: fd
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return alert(`Error: ${err.error || res.statusText}\n${err.detail || ''}`);
        }
        const blob = await res.blob();
        downloadBlob(blob, file.name.replace(/\.pdf$/i, '') + '.docx');
      } catch (e) {
        alert(`Fallo de red: ${e.message || e}`);
      }
    });
  }

  // =========================
  //  Fusionar 2 PDFs
  // =========================
  const mergeForm = document.getElementById('mergeForm');
  const mergeMsg  = document.getElementById('mergeMsg');
  const drop3     = document.getElementById('drop3');
  const goMerge   = document.getElementById('goMerge');
  const f1 = mergeForm?.querySelector('input[name="file1"]');
  const f2 = mergeForm?.querySelector('input[name="file2"]');

  if (drop3 && f1 && f2) {
    drop3.addEventListener('dragover', e => { e.preventDefault(); drop3.classList.add('drag'); });
    drop3.addEventListener('dragleave', () => drop3.classList.remove('drag'));
    drop3.addEventListener('drop', e => {
      e.preventDefault(); drop3.classList.remove('drag');
      const files = e.dataTransfer.files;
      if (!files?.length) return;
      const pdfs = [...files].filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      if (pdfs[0]) { const dt1 = new DataTransfer(); dt1.items.add(pdfs[0]); f1.files = dt1.files; }
      if (pdfs[1]) { const dt2 = new DataTransfer(); dt2.items.add(pdfs[1]); f2.files = dt2.files; }
    });
  }

  if (mergeForm && f1 && f2) {
    mergeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      mergeMsg.textContent = 'Procesando...';
      mergeMsg.classList.remove('ok', 'err');
      if (goMerge) goMerge.disabled = true;

      try {
        if (!f1.files?.[0] || !f2.files?.[0]) throw new Error('Selecciona ambos archivos');

        const fd = new FormData();
        fd.append('file1', f1.files[0]);
        fd.append('file2', f2.files[0]);

        const res = await fetch('/api/merge-two', { method: 'POST', body: fd });
        if (!res.ok) {
          let msg = 'Error al fusionar';
          try { const j = await res.json(); msg = j.error || msg; }
          catch { const t = await res.text(); if (t && t.length < 200) msg = t; }
          throw new Error(msg);
        }

        const blob = await res.blob();
        const ts   = new Date().toISOString().replace(/[:.]/g, '-');
        downloadBlob(blob, `fusion_${ts}.pdf`);
        mergeMsg.textContent = 'Listo: archivo descargado.'; mergeMsg.classList.add('ok');
        setTimeout(() => { mergeMsg.textContent = ''; mergeMsg.classList.remove('ok'); }, 2300);
        mergeForm.reset();
      } catch (err) {
        mergeMsg.textContent = err.message || 'No se pudo fusionar los PDFs';
        mergeMsg.classList.remove('ok'); mergeMsg.classList.add('err');
      } finally {
        if (goMerge) goMerge.disabled = false;
      }
    });
  }

  // =========================
  //  Fusión por lotes (OC + Factura)
  // =========================
  const batchDrop = document.getElementById('drop-batch');
  const batchOrders = document.getElementById('batch-orders');
  const batchInvoices = document.getElementById('batch-invoices');
  const batchBtn = document.getElementById('batch-run');
  const batchMsg = document.getElementById('batch-msg');

  const setBatchMsg = (text, status = '') => {
    if (!batchMsg) return;
    batchMsg.textContent = text || '';
    batchMsg.classList.remove('ok', 'err', 'loading');
    if (!text) return;
    if (status === 'ok') batchMsg.classList.add('ok');
    else if (status === 'err') batchMsg.classList.add('err');
    else batchMsg.classList.add('loading');
  };

  const makeFileList = (files = []) => {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    return dt.files;
  };

  if (batchDrop) {
    batchDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      batchDrop.classList.add('drag');
    });
    batchDrop.addEventListener('dragleave', () => batchDrop.classList.remove('drag'));
    batchDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      batchDrop.classList.remove('drag');
      const files = [...(e.dataTransfer?.files || [])].filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      if (!files.length) return;
      const oc = [];
      const fac = [];
      files.forEach((f) => {
        const name = f.name.toLowerCase();
        if (/fact/.test(name)) fac.push(f);
        else if (/oc|orden/.test(name)) oc.push(f);
        else {
          (oc.length <= fac.length ? oc : fac).push(f);
        }
      });
      if (oc.length && batchOrders) batchOrders.files = makeFileList(oc);
      if (fac.length && batchInvoices) batchInvoices.files = makeFileList(fac);
    });
  }

  if (batchBtn && batchOrders && batchInvoices) {
    batchBtn.addEventListener('click', async () => {
      const orders = [...(batchOrders.files || [])];
      const invoices = [...(batchInvoices.files || [])];

      if (!orders.length || !invoices.length) {
        setBatchMsg('Selecciona órdenes y facturas en PDF.', 'err');
        return;
      }
      if (orders.length !== invoices.length) {
        setBatchMsg(`Deben tener la misma cantidad. Órdenes: ${orders.length}, Facturas: ${invoices.length}`, 'err');
        return;
      }

      setBatchMsg('Procesando lotes...', 'loading');
      batchBtn.disabled = true;

      try {
        const fd = new FormData();
        orders.forEach(f => fd.append('orders', f));
        invoices.forEach(f => fd.append('invoices', f));

        const res = await fetch('/api/merge-batch', { method: 'POST', body: fd });
        if (!res.ok) {
          let detail = '';
          try { const err = await res.json(); detail = err.error + (err.detail ? `: ${err.detail}` : ''); }
          catch { detail = res.statusText; }
          throw new Error(detail || 'Fallo en la fusión por lotes');
        }

        const blob = await res.blob();
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        downloadBlob(blob, `fusion_lotes_${ts}.zip`);
        setBatchMsg('ZIP descargado correctamente ✅', 'ok');
        setTimeout(() => setBatchMsg('', ''), 4000);
      } catch (e) {
        setBatchMsg(`Error: ${e.message || e}`, 'err');
      } finally {
        batchBtn.disabled = false;
      }
    });
  }

  // =========================
  //  Imagen → PDF
  // =========================
  const imgInput = document.getElementById('imgFile');
  const goImgPdf = document.getElementById('goImgPdf');

  if (goImgPdf) {
    goImgPdf.addEventListener('click', async () => {
      const f = imgInput?.files?.[0];
      if (!f) return alert('Selecciona una imagen JPG o PNG');
      const size   = document.getElementById('page').value;
      const margin = document.getElementById('margin').value || 10;

      const fd = new FormData();
      fd.append('file', f);

      try {
        const r = await fetch(`/api/img2pdf?size=${encodeURIComponent(size)}&margin=${encodeURIComponent(margin)}`, {
          method: 'POST', body: fd
        });
        if (!r.ok) {
          let msg = 'Error';
          try { const e = await r.json(); msg = `${e.error}${e.detail ? `: ${e.detail}` : ''}`; } catch {}
          return alert(msg);
        }
        const blob = await r.blob();
        downloadBlob(blob, f.name.replace(/\.(jpe?g|png)$/i, '') + '.pdf');
      } catch (e) {
        alert(`Fallo de red: ${e.message || e}`);
      }
    });
  }
});

/* ===== DOCX → EXCEL ===== */
(() => {
  const file = document.getElementById('dx2xl-file');
  const run  = document.getElementById('dx2xl-run');
  const msg  = document.getElementById('dx2xl-msg');

  if (!file || !run) return;

  const setMsg = (t, ok = false) => {
    if (!msg) return;
    msg.textContent = t || '';
    msg.classList.remove('ok', 'err');
    if (t) msg.classList.add(ok ? 'ok' : 'err');
  };

  run.addEventListener('click', async () => {
    const f = file.files?.[0];
    if (!f) { alert('Selecciona un .docx con tablas'); return; }

    run.disabled = true;
    setMsg('Procesando...');

    try {
      const fd = new FormData();
      fd.append('file', f);

      const res = await fetch('/api/docx2excel', { method: 'POST', body: fd });
      if (!res.ok) {
        let detail = '';
        try { const e = await res.json(); detail = e.error + (e.detail ? `: ${e.detail}` : ''); } catch {}
        throw new Error(detail || res.statusText);
      }

      const blob = await res.blob();
      const name = f.name.replace(/\.docx$/i, '') + '.xlsx';
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);

      setMsg('Listo ✅', true);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg(`Error: ${e.message || e}`, false);
    } finally {
      run.disabled = false;
    }
  });
})();

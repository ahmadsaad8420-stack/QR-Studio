'use strict';

/* QR Studio — client-side QR generator, bulk tool and scanner.
   Everything runs in the browser; no QR content is sent anywhere. */

const $ = id => document.getElementById(id);
const typeSelect = $('type');
const fieldsHost = $('fields');
const qrBox = $('qrcode');
const DOWNLOAD_IDS = ['downloadPng', 'downloadSvg', 'downloadPdf'];

let qr = null;            // current QRCodeStyling instance
let fresh = false;        // true only while the preview matches the form
let logoData = '';
let bulkBlobs = [];
let scanner = null;
let scanning = false;

const HISTORY_KEY = 'qr-studio-history-v3';
const HISTORY_MAX = 12;
// Byte capacity of a QR code (version 40, byte mode) per error-correction level.
const CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };

const safeStore = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};
// Earlier releases could have kept Wi-Fi credentials in history — remove that legacy key.
safeStore.remove('qr-studio-history-v2');

/* ---------- helpers ---------- */

const byteLength = s => new TextEncoder().encode(s).length;
const val = id => (($(id) && $(id).value) || '').trim();
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+?[0-9]{5,15}$/;
const cleanPhone = s => s.replace(/[\s().-]/g, '');

function setMessage(text, kind) {
  const el = $('message');
  el.textContent = text;
  el.dataset.kind = kind || '';
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- form fields per content type ---------- */

const field = (id, label, placeholder = '', kind = 'text', extra = '') =>
  `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${kind}" placeholder="${placeholder}" ${extra}></div>`;

const TEMPLATES = {
  text: () => `<label for="content">Text content</label><textarea id="content" rows="4" maxlength="1200" placeholder="Type your message"></textarea>`,
  url: () => field('content', 'Website URL', 'https://example.com', 'url', 'inputmode="url" autocomplete="off" maxlength="1200"'),
  wifi: () => `${field('ssid', 'Network name (SSID)', 'My Wi-Fi', 'text', 'maxlength="32" autocomplete="off"')}
    ${field('password', 'Password', 'Wi-Fi password', 'password', 'maxlength="63" autocomplete="off" spellcheck="false"')}
    <label for="encryption">Security</label><select id="encryption"><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">No password</option></select>
    <label class="check"><input id="hidden" type="checkbox"> Hidden network</label>
    <p class="microcopy warn">Anyone who scans this code can read the Wi-Fi password. Share it only with people you trust.</p>`,
  email: () => `${field('email', 'Email address', 'name@example.com', 'email', 'autocomplete="off"')}${field('subject', 'Subject', 'Message subject', 'text', 'maxlength="200"')}${field('body', 'Message', 'Optional message', 'text', 'maxlength="800"')}`,
  phone: () => field('phone', 'Phone number', '+1 555 010 1234', 'tel', 'autocomplete="off"'),
  sms: () => `${field('phone', 'Phone number', '+1 555 010 1234', 'tel', 'autocomplete="off"')}<label for="smsbody">Message</label><textarea id="smsbody" rows="3" maxlength="600" placeholder="Your message"></textarea>`,
  vcard: () => `<div class="two-col">${field('first', 'First name', 'Alex', 'text', 'maxlength="60"')}${field('last', 'Last name', 'Morgan', 'text', 'maxlength="60"')}</div>${field('org', 'Organization', 'Company name', 'text', 'maxlength="100"')}${field('vphone', 'Phone', '+1 555 010 1234', 'tel')}${field('vemail', 'Email', 'alex@example.com', 'email')}${field('website', 'Website', 'https://example.com', 'url', 'inputmode="url"')}`,
  whatsapp: () => `${field('waPhone', 'WhatsApp number', '15550101234', 'tel')}<p class="microcopy">Include the country code; no +, spaces or dashes.</p><label for="waMessage">Prefilled message</label><textarea id="waMessage" rows="3" maxlength="600" placeholder="Hello! I would like to know more."></textarea>`
};

function renderFields() {
  fieldsHost.innerHTML = (TEMPLATES[typeSelect.value] || TEMPLATES.url)();
}

/* ---------- payload builders ---------- */

// Normalises user input to a safe http(s) URL, or returns '' if it is not one.
function normaliseUrl(input) {
  let s = input.trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;   // "example.com" -> https://example.com
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return '';
    return u.href;
  } catch { return ''; }
}

const wifiEsc = s => s.replace(/([\\;,:"])/g, '\\$1');
// Values that look like hex must be quoted so scanners don't read them as raw hex keys.
const wifiVal = s => /^[0-9A-Fa-f]+$/.test(s) ? `"${s}"` : wifiEsc(s);
const vcardEsc = v => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([;,])/g, '\\$1');

function buildPayload() {
  switch (typeSelect.value) {
    case 'text':
      return val('content');

    case 'url': {
      const raw = val('content');
      if (!raw) return '';
      return normaliseUrl(raw) || 'INVALID_URL';
    }

    case 'wifi': {
      const ssid = val('ssid');
      if (!ssid) return '';
      const security = $('encryption').value;
      const pass = security === 'nopass' ? '' : $('password').value;   // do not trim passwords
      if (security === 'WPA' && (pass.length < 8 || pass.length > 63)) return 'INVALID_WPA';
      if (security === 'WEP' && !pass) return 'INVALID_WEP';
      const parts = [`T:${security}`, `S:${wifiVal(ssid)}`];
      if (security !== 'nopass') parts.push(`P:${wifiVal(pass)}`);
      if ($('hidden').checked) parts.push('H:true');
      return `WIFI:${parts.join(';')};;`;
    }

    case 'email': {
      const to = val('email');
      if (!to) return '';
      if (!EMAIL_RE.test(to)) return 'INVALID_EMAIL';
      const q = [];
      if (val('subject')) q.push('subject=' + encodeURIComponent(val('subject')));
      if (val('body')) q.push('body=' + encodeURIComponent(val('body')));
      return `mailto:${to}${q.length ? '?' + q.join('&') : ''}`;
    }

    case 'phone': {
      const p = cleanPhone(val('phone'));
      if (!p) return '';
      return PHONE_RE.test(p) ? `tel:${p}` : 'INVALID_PHONE';
    }

    case 'sms': {
      const p = cleanPhone(val('phone'));
      if (!p) return '';
      if (!PHONE_RE.test(p)) return 'INVALID_PHONE';
      return `SMSTO:${p}:${val('smsbody')}`;
    }

    case 'vcard': {
      const first = val('first'), last = val('last'), phone = cleanPhone(val('vphone')), email = val('vemail'), site = val('website');
      if (!first && !last && !phone && !email) return '';
      if (email && !EMAIL_RE.test(email)) return 'INVALID_EMAIL';
      if (phone && !PHONE_RE.test(phone)) return 'INVALID_PHONE';
      let url = '';
      if (site) { url = normaliseUrl(site); if (!url) return 'INVALID_URL'; }
      return [
        'BEGIN:VCARD', 'VERSION:3.0',
        `N:${vcardEsc(last)};${vcardEsc(first)};;;`,
        `FN:${vcardEsc([first, last].filter(Boolean).join(' '))}`,
        val('org') ? `ORG:${vcardEsc(val('org'))}` : '',
        phone ? `TEL;TYPE=CELL:${vcardEsc(phone)}` : '',
        email ? `EMAIL:${vcardEsc(email)}` : '',
        url ? `URL:${vcardEsc(url)}` : '',
        'END:VCARD'
      ].filter(Boolean).join('\r\n');
    }

    case 'whatsapp': {
      const p = val('waPhone').replace(/\D/g, '');
      if (!p) return '';
      if (p.length < 8 || p.length > 15) return 'INVALID_NUMBER';
      const msg = val('waMessage');
      return `https://wa.me/${p}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
    }
  }
  return '';
}

const ERRORS = {
  INVALID_URL: 'Enter a valid website address, for example https://example.com.',
  INVALID_EMAIL: 'Enter a valid email address.',
  INVALID_WPA: 'WPA/WPA2/WPA3 passwords must be 8–63 characters.',
  INVALID_WEP: 'Enter the WEP password, or choose "No password".',
  INVALID_PHONE: 'Enter a valid phone number (5–15 digits, optional leading +).',
  INVALID_NUMBER: 'Enter a valid international WhatsApp number (8–15 digits).'
};

/* ---------- preview state ---------- */

function setDownloads(enabled) { DOWNLOAD_IDS.forEach(id => { $(id).disabled = !enabled; }); }

function resetPreview(hint = 'Update content and generate again') {
  qr = null; fresh = false;
  qrBox.classList.remove('stale');
  qrBox.replaceChildren();
  const ph = document.createElement('div');
  ph.className = 'placeholder';
  const icon = document.createElement('span'); icon.textContent = '▦';
  const title = document.createElement('b'); title.textContent = 'Your QR code';
  const small = document.createElement('small'); small.textContent = hint;
  ph.append(icon, title, small);
  qrBox.append(ph);
  setDownloads(false);
}

// Keep the old preview visible but block exports so a stale code can never be downloaded by mistake.
function markStale() {
  if (!qr || !fresh) return;
  fresh = false;
  qrBox.classList.add('stale');
  setDownloads(false);
  setMessage('Settings changed — click “Generate QR code” to update the preview.', 'info');
}

function updateMeta() {
  const names = { L: 'Low', M: 'Medium', Q: 'Quartile', H: 'High' };
  $('metaLevel').textContent = `${names[$('level').value]} error correction`;
}

function qrOptions(data, size) {
  const gradient = $('gradient').checked;
  return {
    width: size, height: size, type: 'canvas', data,
    image: logoData || undefined,
    margin: 18,
    qrOptions: { errorCorrectionLevel: $('level').value },
    imageOptions: { hideBackgroundDots: true, imageSize: 0.22, margin: 5, crossOrigin: 'anonymous' },
    dotsOptions: {
      type: $('dots').value,
      color: gradient ? undefined : $('fg').value,
      gradient: gradient ? { type: 'linear', rotation: 45, colorStops: [{ offset: 0, color: $('fg').value }, { offset: 1, color: $('gradientEnd').value }] } : undefined
    },
    backgroundOptions: { color: $('bg').value },
    cornersSquareOptions: { type: 'extra-rounded', color: $('fg').value },
    cornersDotOptions: { type: 'dot', color: $('fg').value }
  };
}

function scanabilityWarning() {
  const bg = $('bg').value, fg = $('fg').value, end = $('gradientEnd').value;
  const colours = $('gradient').checked ? [fg, end] : [fg];
  if (colours.some(c => contrastRatio(c, bg) < 3)) return 'Low contrast between the code and background — it may not scan reliably.';
  if (colours.some(c => luminance(c) > luminance(bg))) return 'Light code on a dark background (inverted) is not supported by every scanner. Test before printing.';
  if (logoData && $('level').value !== 'H') return 'A center logo works best with High error correction.';
  return '';
}

/* ---------- history ---------- */

function getHistory() {
  try {
    const raw = JSON.parse(safeStore.get(HISTORY_KEY) || '[]');
    return Array.isArray(raw)
      ? raw.filter(x => x && typeof x.payload === 'string' && typeof x.type === 'string' && typeof x.created === 'string').slice(0, HISTORY_MAX)
      : [];
  } catch { return []; }
}

// Wi-Fi (credentials) and contact cards (personal data) are never written to history.
const NO_HISTORY = new Set(['wifi', 'vcard']);

function saveHistory(payload) {
  if (NO_HISTORY.has(typeSelect.value)) return;
  const items = getHistory().filter(x => x.payload !== payload);
  items.unshift({ payload, type: typeSelect.value, created: new Date().toISOString() });
  if (!safeStore.set(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)))) {
    setMessage('QR code created, but browser storage is unavailable, so history was not saved.', 'warn');
  }
  renderHistory();
}

function renderHistory() {
  const host = $('historyList');
  const items = getHistory();
  host.replaceChildren();
  $('clearHistory').disabled = !items.length;
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Your generated QR codes will appear here.';
    host.append(p);
    return;
  }
  items.forEach((x, i) => {
    const row = document.createElement('div'); row.className = 'history-item';
    const symbol = document.createElement('div'); symbol.className = 'history-symbol'; symbol.textContent = '▦';
    const copy = document.createElement('div'); copy.className = 'history-copy';
    const label = document.createElement('b'); label.textContent = x.type.toUpperCase();
    const payload = document.createElement('span'); payload.textContent = x.payload.slice(0, 88); payload.title = x.payload;
    const date = document.createElement('small');
    const d = new Date(x.created);
    date.textContent = Number.isNaN(d.getTime()) ? 'Saved previously' : d.toLocaleString();
    copy.append(label, payload, date);
    const use = document.createElement('button');
    use.className = 'button subtle small'; use.type = 'button';
    use.dataset.history = String(i); use.textContent = 'Reuse as text';
    row.append(symbol, copy, use);
    host.append(row);
  });
}

/* ---------- generate ---------- */

async function generate() {
  const data = buildPayload();
  if (!data) { setMessage('Enter the required information first.', 'warn'); resetPreview('Enter your content, then generate'); return; }
  if (ERRORS[data]) { setMessage(ERRORS[data], 'error'); resetPreview(); return; }
  if (!window.QRCodeStyling) { setMessage('The QR engine could not be loaded. Refresh the page and try again.', 'error'); return; }

  const level = $('level').value;
  if (byteLength(data) > CAPACITY[level]) {
    setMessage(`This content is too long for ${level}-level error correction (limit ≈ ${CAPACITY[level]} bytes). Shorten it or choose a lower error-correction level.`, 'error');
    resetPreview();
    return;
  }

  try {
    qr = new QRCodeStyling(qrOptions(data, Number($('size').value)));
    qrBox.replaceChildren();
    qrBox.classList.remove('stale');
    qr.append(qrBox);
    fresh = true;
    setDownloads(true);
    const warning = scanabilityWarning();
    setMessage(warning ? `QR code generated. ${warning}` : 'QR code generated. Scan it with a phone before sharing or printing.', warning ? 'warn' : 'ok');
    saveHistory(data);
  } catch (err) {
    console.error(err);
    setMessage('Could not generate this QR code. Try shorter content or a different design.', 'error');
    resetPreview();
  }
}

/* ---------- exports ---------- */

async function exportPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF library unavailable');
  const blob = await qr.getRawData('png');
  // A data URL is passed (not a blob: URL) so jsPDF needs no network/XHR access, keeping connect-src strict.
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Could not read QR image'));
    fr.readAsDataURL(blob);
  });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const w = 120;
  pdf.addImage(dataUrl, 'PNG', (210 - w) / 2, 45, w, w);
  pdf.setFontSize(10);
  pdf.text('Created with QR Studio', 105, 180, { align: 'center' });
  pdf.save('qr-studio.pdf');
}

async function handleDownload(id) {
  if (!qr || !fresh) { setMessage('Generate the QR code first.', 'warn'); return; }
  try {
    if (id === 'downloadPng') await qr.download({ name: 'qr-studio', extension: 'png' });
    else if (id === 'downloadSvg') await qr.download({ name: 'qr-studio', extension: 'svg' });
    else await exportPdf();
  } catch (err) {
    console.error(err);
    setMessage(id === 'downloadPdf' ? 'PDF export failed. Please try PNG export.' : 'Export failed. Please try again.', 'error');
  }
}

/* ---------- logo upload ---------- */

$('logo').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 2 * 1024 * 1024) {
    setMessage('Choose a PNG, JPG or WebP image under 2 MB.', 'error');
    e.target.value = '';
    return;
  }
  const r = new FileReader();
  r.onload = () => { logoData = String(r.result); markStale(); setMessage('Logo added. Generate the QR code to apply it.', 'info'); };
  r.onerror = () => setMessage('Could not read that image. Try another file.', 'error');
  r.readAsDataURL(f);
});
$('removeLogo').addEventListener('click', () => {
  $('logo').value = ''; logoData = '';
  markStale();
  setMessage('Logo removed. Generate the QR code to update it.', 'info');
});

/* ---------- wiring ---------- */

typeSelect.addEventListener('change', () => { renderFields(); resetPreview(); setMessage('Enter your content to generate a QR code.', ''); });
fieldsHost.addEventListener('input', markStale);
fieldsHost.addEventListener('change', markStale);
fieldsHost.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); generate(); }
});
['fg', 'bg', 'gradientEnd', 'size', 'dots', 'level', 'gradient'].forEach(id => $(id).addEventListener('change', () => { updateMeta(); markStale(); }));
$('generate').addEventListener('click', generate);
DOWNLOAD_IDS.forEach(id => $(id).addEventListener('click', () => handleDownload(id)));

$('historyList').addEventListener('click', e => {
  const b = e.target.closest('[data-history]');
  if (!b) return;
  const item = getHistory()[Number(b.dataset.history)];
  if (!item) return;
  typeSelect.value = 'text';
  renderFields();
  $('content').value = item.payload;
  generate();
});
$('clearHistory').addEventListener('click', () => {
  safeStore.remove(HISTORY_KEY);
  renderHistory();
  setMessage('Local QR history cleared.', 'info');
});

/* ---------- bulk generation ---------- */

$('bulkGenerate').addEventListener('click', async () => {
  const status = $('bulkStatus');
  const lines = $('bulkInput').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) { status.textContent = 'Add at least one item.'; return; }
  if (lines.length > 50) { status.textContent = 'Please limit each batch to 50 items.'; return; }
  if (!window.QRCodeStyling || !window.JSZip) { status.textContent = 'Required libraries could not be loaded. Refresh and try again.'; return; }

  const btn = $('bulkGenerate');
  btn.disabled = true; $('bulkDownload').disabled = true;
  bulkBlobs = []; $('bulkResults').textContent = '';
  const skipped = [];
  for (let i = 0; i < lines.length; i++) {
    status.textContent = `Generating ${i + 1} of ${lines.length}…`;
    if (byteLength(lines[i]) > CAPACITY.H) { skipped.push(i + 1); continue; }
    try {
      const q = new QRCodeStyling({
        width: 512, height: 512, data: lines[i], margin: 18,
        qrOptions: { errorCorrectionLevel: 'H' },
        dotsOptions: { color: '#18243b', type: 'rounded' },
        backgroundOptions: { color: '#ffffff' }
      });
      const blob = await q.getRawData('png');
      bulkBlobs.push({ name: `qr-${String(i + 1).padStart(2, '0')}.png`, blob });
    } catch (e) {
      console.warn('Skipped batch item', i + 1, e);
      skipped.push(i + 1);
    }
  }
  status.textContent = `${bulkBlobs.length} of ${lines.length} QR codes generated.` +
    (skipped.length ? ` Skipped line${skipped.length > 1 ? 's' : ''} ${skipped.join(', ')} (too long).` : '');
  $('bulkResults').textContent = bulkBlobs.map(x => x.name).join(' · ');
  $('bulkDownload').disabled = !bulkBlobs.length;
  btn.disabled = false;
});

$('bulkDownload').addEventListener('click', async () => {
  if (!bulkBlobs.length) return;
  try {
    const zip = new JSZip();
    bulkBlobs.forEach(x => zip.file(x.name, x.blob));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'qr-studio-batch.zip';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    console.error(e);
    $('bulkStatus').textContent = 'Could not create the ZIP file. Please try again.';
  }
});

/* ---------- camera scanner ---------- */

async function stopScanner() {
  if (scanner && scanning) {
    scanning = false;
    try { await scanner.stop(); scanner.clear(); } catch (e) { console.warn(e); }
  }
  $('startScan').disabled = false;
  $('stopScan').disabled = true;
}

$('startScan').addEventListener('click', async () => {
  const status = $('scanStatus');
  if (!window.Html5Qrcode) { status.textContent = 'The scanner library could not be loaded. Refresh and try again.'; return; }
  $('startScan').disabled = true;
  try {
    scanner = new Html5Qrcode('reader');
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      text => {
        $('scanResult').value = text;
        $('copyScan').disabled = false;
        status.textContent = /^https?:\/\//i.test(text)
          ? 'QR code scanned. This is a link — check the address carefully before opening it.'
          : 'QR code scanned successfully.';
        stopScanner();
      },
      () => { /* no code in this frame */ }
    );
    scanning = true;
    $('stopScan').disabled = false;
    status.textContent = 'Camera is active. Point it at a QR code.';
  } catch (e) {
    console.error(e);
    $('startScan').disabled = false;
    status.textContent = (e && e.name === 'NotAllowedError') || /permission/i.test(String(e))
      ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
      : 'Could not start the camera. Check that a camera is available and the page is served over HTTPS or localhost.';
  }
});
$('stopScan').addEventListener('click', stopScanner);
document.addEventListener('visibilitychange', () => { if (document.hidden && scanning) stopScanner(); });
window.addEventListener('pagehide', () => { if (scanning) stopScanner(); });
$('copyScan').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('scanResult').value); $('scanStatus').textContent = 'Scanned content copied.'; }
  catch { $('scanStatus').textContent = 'Clipboard permission was denied. Select the text and copy it manually.'; }
});

/* ---------- init ---------- */

renderFields();
updateMeta();
renderHistory();

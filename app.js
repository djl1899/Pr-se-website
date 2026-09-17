/* =========================================================
   Laierdavid — Eventgalerie
   Reines Frontend (HTML/CSS/JS), kein Server nötig.

   Ablauf: Code eingeben -> passende Galerie laden ->
   Fotos UND Videos einzeln, als Auswahl oder komplett laden.

   Zwei Betriebsarten (siehe data/galleries.json -> "quelle"):
   A) "manuell"  – die Dateilisten stehen in galleries.json
   B) "github"   – die Dateien werden automatisch aus den
                   Ordnern fotos/<id>/ und videos/<id>/ gelesen.
                   Du lädst also nur hoch, sonst nichts.
   ========================================================= */

const state = {
  data: null,          // Inhalt von data/galleries.json
  gallery: null,       // aktuell geöffnete Galerie
  items: [],           // Medien: { typ:'foto'|'video', url, name, titel }
  view: [],            // gefilterte Indizes (Alle / Fotos / Videos)
  filter: 'alle',
  selected: new Set()  // Indizes der ausgewählten Medien
};

const $ = (id) => document.getElementById(id);

// Der eingegebene Code bleibt nur im Arbeitsspeicher. Damit ein Neuladen die
// Galerie nicht schließt, wird er zusätzlich in die Adresszeile geschrieben
// (?code=…) — genau der Link, den der Kunde sowieso bekommt.
let activeCode = null;

const FOTO_EXT  = /\.(jpe?g|png|webp|avif)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;

/* ---------------------------------------------------------
   Hilfsfunktionen
   --------------------------------------------------------- */

// Code wird nie im Klartext gespeichert, sondern als SHA-256-Hash verglichen.
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const normalizeCode = (v) => v.trim().replace(/\s+/g, '').toUpperCase();

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}

// "04-crowd-hoch.jpg" -> "Crowd hoch"
function titleFromName(name) {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d+[-_ ]*/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function showProgress(label) {
  $('progressLabel').textContent = label;
  $('progressBar').style.width = '0%';
  $('progress').hidden = false;
}
const setProgress = (pct) => { $('progressBar').style.width = Math.max(2, pct) + '%'; };
const hideProgress = () => { $('progress').hidden = true; };

/* ---------------------------------------------------------
   Daten laden
   --------------------------------------------------------- */
async function loadData() {
  const res = await fetch('data/galleries.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('galleries.json nicht gefunden');
  state.data = await res.json();

  const studio = state.data.studio || {};
  if (studio.name) {
    $('brandName').textContent = studio.name;
    $('footBrand').textContent = studio.name;
    document.title = studio.name + ' — Eventgalerie';
  }
  if (studio.contact) {
    $('footContact').innerHTML =
      'Fragen oder ein anderes Format? <a href="mailto:' + studio.contact +
      '" style="color:var(--accent)">' + studio.contact + '</a>';
  }
}

/* ---------------------------------------------------------
   Medien einer Galerie zusammenstellen
   --------------------------------------------------------- */
function toItem(url, typ) {
  const name = decodeURIComponent(String(url).split('/').pop().split('?')[0]);
  return { typ, url, name, titel: titleFromName(name) };
}

// Betriebsart B: Ordnerinhalt über die öffentliche GitHub-API lesen.
async function listGithubFolder(q, folder) {
  const api = 'https://api.github.com/repos/' + q.owner + '/' + q.repo +
              '/contents/' + folder + '?ref=' + (q.branch || 'main');
  const res = await fetch(api, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return [];
  const list = await res.json();
  if (!Array.isArray(list)) return [];
  return list
    .filter(f => f.type === 'file')
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
    .map(f => f.download_url);
}

async function collectItems(gallery) {
  const q = state.data.quelle || {};
  const items = [];

  if (q.typ === 'github' && q.owner && q.repo) {
    const fotoDir  = (q.fotosOrdner  || 'fotos')  + '/' + gallery.id;
    const videoDir = (q.videosOrdner || 'videos') + '/' + gallery.id;
    const [fotos, videos] = await Promise.all([
      listGithubFolder(q, fotoDir).catch(() => []),
      listGithubFolder(q, videoDir).catch(() => [])
    ]);
    fotos.filter(u => FOTO_EXT.test(u)).forEach(u => items.push(toItem(u, 'foto')));
    videos.filter(u => VIDEO_EXT.test(u)).forEach(u => items.push(toItem(u, 'video')));
    if (items.length) return items;
    // Wenn die API nichts liefert (z. B. Limit erreicht), auf die Listen zurückfallen.
  }

  (gallery.fotos  || []).forEach(u => items.push(toItem(u, 'foto')));
  (gallery.videos || []).forEach(u => items.push(toItem(u, 'video')));
  return items;
}

/* ---------------------------------------------------------
   1) Zugangscode prüfen
   --------------------------------------------------------- */
async function tryUnlock(rawCode, { silent = false } = {}) {
  const code = normalizeCode(rawCode);
  if (!code) return false;
  const hash = await sha256(code);
  const gallery = (state.data.galleries || []).find(g => g.codeHash === hash);

  if (!gallery) {
    if (!silent) {
      $('gateError').hidden = false;
      const input = $('codeInput');
      input.classList.remove('is-wrong');
      void input.offsetWidth;      // Reflow, damit die Animation neu startet
      input.classList.add('is-wrong');
      input.select();
    }
    return false;
  }

  activeCode = code;
  try {
    const url = new URL(location.href);
    url.searchParams.set('code', code);
    history.replaceState(null, '', url);
  } catch (e) { /* egal, rein kosmetisch */ }
  await openGallery(gallery);
  return true;
}

async function openGallery(gallery) {
  state.gallery = gallery;
  state.selected.clear();
  state.filter = 'alle';

  $('galTitle').textContent = gallery.title;
  $('galMeta').textContent = [formatDate(gallery.date), gallery.location]
    .filter(Boolean).join(' · ');

  $('gate').hidden = true;
  $('app').hidden = false;
  $('year').textContent = new Date().getFullYear();

  $('grid').innerHTML = '<p class="grid__empty">Medien werden geladen…</p>';
  state.items = await collectItems(gallery);

  applyFilter('alle');
  window.scrollTo(0, 0);
}

function logout() {
  activeCode = null;
  try {
    const url = new URL(location.href);
    url.searchParams.delete('code');
    history.replaceState(null, '', url);
  } catch (e) { /* egal */ }
  state.gallery = null;
  state.items = [];
  state.selected.clear();
  $('app').hidden = true;
  $('gate').hidden = false;
  $('gateError').hidden = true;
  $('codeInput').value = '';
  $('codeInput').focus();
}

/* ---------------------------------------------------------
   2) Raster aufbauen (echtes Masonry: Hoch- und Querformat
      passen sich automatisch ein, Reihenfolge bleibt korrekt)
   --------------------------------------------------------- */
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';

// Zeilenhöhe und Abstand kommen direkt aus dem Stylesheet (auch mobil korrekt).
function gridMetrics() {
  const cs = getComputedStyle($('grid'));
  return {
    row: parseFloat(cs.gridAutoRows) || 8,
    gap: parseFloat(cs.rowGap) || 18
  };
}

// Kartenhöhe aus dem Seitenverhältnis des Mediums ableiten.
function sizeCard(card, ratio) {
  if (!ratio || !isFinite(ratio)) return;
  const w = card.getBoundingClientRect().width;
  if (!w) return;
  const { row, gap } = gridMetrics();
  const h = w / ratio;
  card.style.gridRowEnd = 'span ' + Math.max(6, Math.round((h + gap) / (row + gap)));
  card.dataset.ratio = ratio;
}

function relayout() {
  document.querySelectorAll('.card').forEach(c => sizeCard(c, parseFloat(c.dataset.ratio)));
}

function applyFilter(f) {
  state.filter = f;
  state.view = state.items
    .map((it, i) => i)
    .filter(i => f === 'alle' || (f === 'fotos' ? state.items[i].typ === 'foto'
                                                : state.items[i].typ === 'video'));
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('is-active', t.dataset.filter === f));
  renderGrid();
  updateToolbar();
}

function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';

  if (!state.view.length) {
    grid.innerHTML = '<p class="grid__empty">Hier ist noch nichts drin.</p>';
    return;
  }

  state.view.forEach((i) => {
    const it = state.items[i];
    const card = document.createElement('article');
    card.className = 'card card--' + it.typ;
    card.dataset.index = i;
    if (state.selected.has(i)) card.classList.add('is-selected');

    let media;
    if (it.typ === 'foto') {
      media = document.createElement('img');
      media.className = 'card__media';
      media.loading = 'lazy';
      media.decoding = 'async';
      media.alt = it.titel;
      media.src = it.url;
      media.addEventListener('load', () => {
        media.classList.add('is-loaded');
        sizeCard(card, media.naturalWidth / media.naturalHeight);
      });
    } else {
      // Video: nur die Metadaten laden, erstes Bild dient als Vorschau.
      media = document.createElement('video');
      media.className = 'card__media';
      media.src = it.url + '#t=0.1';
      media.preload = 'metadata';
      media.muted = true;
      media.playsInline = true;
      media.addEventListener('loadedmetadata', () => {
        media.classList.add('is-loaded');
        sizeCard(card, media.videoWidth / media.videoHeight);
        const s = Math.round(media.duration);
        if (s) badge.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      });
      // Beim Zeigen kurz anspielen — wie bei Apple Fotos.
      card.addEventListener('mouseenter', () => media.play().catch(() => {}));
      card.addEventListener('mouseleave', () => { media.pause(); media.currentTime = 0.1; });
    }
    card.style.gridRowEnd = 'span 26';   // Startwert, bis das Format bekannt ist

    const check = document.createElement('button');
    check.className = 'check';
    check.type = 'button';
    check.title = 'Auswählen';
    check.setAttribute('aria-label', 'Auswählen');
    check.innerHTML = ICON_CHECK;
    check.addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(i); });

    const badge = document.createElement('span');
    badge.className = 'badge';
    if (it.typ === 'video') badge.innerHTML = ICON_PLAY + '<span>Video</span>';

    const overlay = document.createElement('div');
    overlay.className = 'card__overlay';
    overlay.innerHTML = '<span class="card__title">' + it.titel + '</span>';

    const dl = document.createElement('button');
    dl.className = 'icon-btn';
    dl.type = 'button';
    dl.title = 'Herunterladen';
    dl.setAttribute('aria-label', 'Herunterladen');
    dl.innerHTML = ICON_DL;
    dl.addEventListener('click', (e) => { e.stopPropagation(); downloadSingle(i); });
    overlay.appendChild(dl);

    card.append(media, check, overlay);
    if (it.typ === 'video') card.appendChild(badge);
    card.addEventListener('click', () => openLightbox(i));
    grid.appendChild(card);
  });
}

function toggleSelect(i) {
  state.selected.has(i) ? state.selected.delete(i) : state.selected.add(i);
  const card = document.querySelector('.card[data-index="' + i + '"]');
  if (card) card.classList.toggle('is-selected', state.selected.has(i));
  updateToolbar();
  if (!$('lightbox').hidden) updateLightboxSelectLabel();
}

function updateToolbar() {
  const fotos  = state.items.filter(it => it.typ === 'foto').length;
  const videos = state.items.length - fotos;
  const sichtbar = state.view.length;
  const sel = state.selected.size;

  const teile = [];
  if (fotos)  teile.push(fotos + (fotos === 1 ? ' Foto' : ' Fotos'));
  if (videos) teile.push(videos + (videos === 1 ? ' Video' : ' Videos'));
  $('countInfo').textContent = teile.join(' · ') || 'Noch keine Dateien';
  $('selInfo').textContent = sel + ' ausgewählt';

  $('dlSelBtn').disabled = sel === 0;
  $('clearSelBtn').disabled = sel === 0;
  $('dlSelBtn').textContent = sel > 0 ? 'Auswahl laden (' + sel + ')' : 'Auswahl als ZIP';
  const alleSichtbarGewaehlt = sichtbar > 0 && state.view.every(i => state.selected.has(i));
  $('selectAllBtn').textContent = alleSichtbarGewaehlt ? 'Auswahl umkehren' : 'Alle auswählen';

  const tabVideos = document.querySelector('.tab[data-filter="videos"]');
  if (tabVideos) tabVideos.hidden = videos === 0;
  const tabFotos = document.querySelector('.tab[data-filter="fotos"]');
  if (tabFotos) tabFotos.hidden = videos === 0;
  const tabAlle = document.querySelector('.tab[data-filter="alle"]');
  if (tabAlle) tabAlle.hidden = videos === 0;
}

/* ---------------------------------------------------------
   3) Downloads
   --------------------------------------------------------- */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Einzeldatei: als Blob laden, damit der Browser sicher speichert (statt zu öffnen).
async function downloadSingle(i) {
  const it = state.items[i];
  try {
    const res = await fetch(it.url);
    if (!res.ok) throw new Error(res.status);
    saveBlob(await res.blob(), it.name);
    toast(it.typ === 'video' ? 'Video gespeichert' : 'Foto gespeichert');
  } catch (err) {
    const a = document.createElement('a');   // Fallback, falls fetch blockiert wird
    a.href = it.url;
    a.download = it.name;
    a.click();
  }
}

// Mehrere Dateien: gesammelt in eine ZIP-Datei (Fotos in fotos/, Videos in videos/).
async function downloadZip(indices, zipName) {
  if (!indices.length) return;
  if (typeof JSZip === 'undefined') {
    toast('ZIP-Bibliothek nicht geladen — bitte Verbindung prüfen');
    return;
  }

  showProgress('Dateien werden gesammelt… (0/' + indices.length + ')');
  const zip = new JSZip();
  let done = 0, failed = 0;

  for (const i of indices) {
    const it = state.items[i];
    try {
      const res = await fetch(it.url);
      if (!res.ok) throw new Error(res.status);
      zip.file((it.typ === 'video' ? 'videos/' : 'fotos/') + it.name, await res.blob());
    } catch (err) {
      failed++;
    }
    done++;
    $('progressLabel').textContent =
      'Dateien werden gesammelt… (' + done + '/' + indices.length + ')';
    setProgress((done / indices.length) * 70);
  }

  $('progressLabel').textContent = 'ZIP wird gepackt…';
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },     // JPEGs und MP4s sind schon komprimiert
    (meta) => setProgress(70 + meta.percent * 0.3)
  );

  saveBlob(blob, zipName);
  hideProgress();
  toast(failed
    ? (indices.length - failed) + ' Dateien gepackt, ' + failed + ' fehlgeschlagen'
    : 'ZIP mit ' + indices.length + ' Dateien gespeichert');
}

const zipBaseName = () =>
  (state.gallery.id || 'galerie') + '_' + (state.gallery.date || '');

/* ---------------------------------------------------------
   4) Lightbox (Foto oder Video)
   --------------------------------------------------------- */
let lbIndex = 0;

function openLightbox(i) {
  lbIndex = i;
  const it = state.items[i];
  const img = $('lbImg'), vid = $('lbVideo');

  vid.pause();
  if (it.typ === 'foto') {
    vid.removeAttribute('src'); vid.hidden = true;
    img.src = it.url; img.alt = it.titel; img.hidden = false;
    $('lbDownload').textContent = 'Dieses Foto laden';
  } else {
    img.removeAttribute('src'); img.hidden = true;
    vid.src = it.url; vid.hidden = false;
    vid.play().catch(() => {});
    $('lbDownload').textContent = 'Dieses Video laden';
  }

  const pos = state.view.indexOf(i);
  $('lbCap').textContent = it.titel + '  ·  ' + (pos + 1) + ' / ' + state.view.length;
  $('lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
  updateLightboxSelectLabel();
}

function closeLightbox() {
  const vid = $('lbVideo');
  vid.pause();
  vid.removeAttribute('src');
  $('lightbox').hidden = true;
  document.body.style.overflow = '';
}

function stepLightbox(dir) {
  const n = state.view.length;
  if (!n) return;
  const pos = state.view.indexOf(lbIndex);
  openLightbox(state.view[(pos + dir + n) % n]);
}

function updateLightboxSelectLabel() {
  $('lbSelect').textContent = state.selected.has(lbIndex) ? 'Ausgewählt ✓' : 'Auswählen';
}

/* ---------------------------------------------------------
   5) Events verdrahten
   --------------------------------------------------------- */
function wire() {
  $('gateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    $('gateError').hidden = true;
    tryUnlock($('codeInput').value);
  });

  $('logoutBtn').addEventListener('click', logout);

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => applyFilter(t.dataset.filter)));

  $('selectAllBtn').addEventListener('click', () => {
    const alle = state.view.every(i => state.selected.has(i));
    state.view.forEach(i => alle ? state.selected.delete(i) : state.selected.add(i));
    document.querySelectorAll('.card').forEach(c =>
      c.classList.toggle('is-selected', state.selected.has(+c.dataset.index)));
    updateToolbar();
  });

  $('clearSelBtn').addEventListener('click', () => {
    state.selected.clear();
    document.querySelectorAll('.card').forEach(c => c.classList.remove('is-selected'));
    updateToolbar();
  });

  $('dlSelBtn').addEventListener('click', () =>
    downloadZip([...state.selected].sort((a, b) => a - b),
      zipBaseName() + '_auswahl.zip'));

  $('dlAllBtn').addEventListener('click', () =>
    downloadZip(state.items.map((_, i) => i), zipBaseName() + '_alle.zip'));

  $('lbClose').addEventListener('click', closeLightbox);
  $('lbPrev').addEventListener('click', () => stepLightbox(-1));
  $('lbNext').addEventListener('click', () => stepLightbox(1));
  $('lbSelect').addEventListener('click', () => toggleSelect(lbIndex));
  $('lbDownload').addEventListener('click', () => downloadSingle(lbIndex));
  $('lightbox').addEventListener('click', (e) => {
    if (e.target === $('lightbox')) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if ($('lightbox').hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 120);
  });
}

/* ---------------------------------------------------------
   Start
   --------------------------------------------------------- */
(async function init() {
  wire();
  try {
    await loadData();
  } catch (err) {
    $('gateError').hidden = false;
    $('gateError').textContent = 'Galeriedaten konnten nicht geladen werden.';
    return;
  }

  // Code aus dem Link (?code=XYZ) direkt übernehmen
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) await tryUnlock(urlCode, { silent: true });

  if ($('app').hidden) $('codeInput').focus();
})();

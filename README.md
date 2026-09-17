# Laierdavid — Eventgalerie

Kostenlose, rein statische Kundengalerie mit Zugangscode und Download-Funktionen.
Keine Datenbank, kein Server, keine laufenden Kosten.

## Dateien

```
eventgalerie/
├── index.html            Code-Eingabe + Galerie + Lightbox
├── styles.css            Design (dunkel, Amber-Akzent)
├── app.js                Logik: Code prüfen, Raster, Downloads, ZIP
├── admin.html            Werkzeug: Galerie anlegen, Vorschaubilder, JSON
├── data/galleries.json   Alle Events, Codes (als Hash) und Bildlisten
└── images/               Bearbeitete Bilder + -thumb.jpg Vorschauen
```

## Neues Event veröffentlichen

1. `admin.html` öffnen, Event-Daten eintragen, bearbeitete Bilder auswählen.
2. „Galerie erzeugen“ → JSON kopieren → in `data/galleries.json` in die Liste `galleries` einfügen.
3. „Vorschaubilder als ZIP“ → entpacken → alle `-thumb.jpg` nach `images/`.
4. Die großen Bilder ebenfalls nach `images/` legen (gleiche Dateinamen wie im JSON).
5. Ordner hochladen (Netlify Drop / Cloudflare Pages / GitHub Pages — alle kostenlos).
6. Kunden Link + Code schicken, oder Direktlink: `.../index.html?code=DEINCODE`

## Demo-Codes

- `HOCKENHEIM26` → Hockenheim Trackday
- `NACHTFAHRT26` → Nachtfahrt Festival

## Funktionen

- Zugangscode pro Event, Vergleich über SHA-256 — der Code steht nirgends im Klartext
- Zugang bleibt beim Neuladen erhalten (Code landet als `?code=…` im Link)
- Masonry-Raster, Lazy Loading, Lightbox mit Pfeiltasten
- Download einzeln, ausgewählt (ZIP) und „Alle herunterladen“ (ZIP) mit Fortschrittsanzeige
- Vollständig responsiv, Tastatur- und Screenreader-taugliche Bedienelemente

## Grenze der Sicherheit

Der Code schützt gut gegen ungewolltes Stöbern, aber bei einer statischen Seite liegen die
Bilddateien technisch unter ihrer URL. Wer eine URL kennt, kann sie direkt öffnen.
Für echten Serverschutz (Bilder ohne Code nicht erreichbar) wäre Supabase Storage mit
signierten URLs der nächste Schritt — sag Bescheid, dann baue ich das darauf um.

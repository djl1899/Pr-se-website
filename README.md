# Laierdavid — Eventgalerie

Code-geschützte Kundengalerie für Fotos **und** Videos. Reines HTML/CSS/JS,
kein Server, keine laufenden Kosten.

## Dateien

```
index.html              Galerie (Codeeingabe, Raster, Lightbox, Downloads)
styles.css              Design (hell, Apple-Stil)
app.js                  Logik
admin.html              Werkzeug: Zugangscode-Hash + JSON-Block erzeugen
data/galleries.json     Galerien: Titel, Datum, Ort, Code-Hash, Dateilisten
fotos/<galerie-id>/     Fotos einer Galerie
videos/<galerie-id>/    Videos derselben Galerie
```

Wichtig: Fotos und Videos einer Galerie liegen in Ordnern mit **derselben ID**,
z. B. `fotos/sommerparty26/` und `videos/sommerparty26/`.

## Zwei Betriebsarten

In `data/galleries.json` steuert der Block `quelle` das Verhalten.

### A) manuell (Standard)

```json
"quelle": { "typ": "manuell" }
```

Die Dateien stehen in den Listen `fotos` und `videos` der Galerie. Volle
Kontrolle über Reihenfolge, aber jede neue Datei muss eingetragen werden.

### B) github (automatisch)

```json
"quelle": {
  "typ": "github",
  "owner": "DEIN-GITHUB-NAME",
  "repo": "galerie",
  "branch": "main",
  "fotosOrdner": "fotos",
  "videosOrdner": "videos"
}
```

Die Website liest die Ordner `fotos/<id>/` und `videos/<id>/` selbst aus
(öffentliche GitHub-API) und sortiert nach Dateinamen. Du lädst also nur noch
hoch — `galleries.json` musst du nur bei einer **neuen** Galerie anfassen
(Titel, Datum, Ort, Code-Hash). Die Listen `fotos`/`videos` dienen dann als
Reserve, falls die API gerade nicht antwortet.

Dateinamen mit führender Nummer bestimmen die Reihenfolge und den angezeigten
Titel: `04-crowd-hoch.jpg` → „Crowd hoch".

## Neues Event einstellen

1. Bilder exportieren (JPEG, Langseite ca. 2000 px, Qualität ~85) und Videos
   als MP4/H.264.
2. `admin.html` öffnen, Titel/Datum/Ort/Code eintragen → Code-Hash und
   JSON-Block kopieren, in `data/galleries.json` einfügen.
3. Ordner `fotos/<id>/` und `videos/<id>/` anlegen und Dateien hochladen.
4. Kunden den Link mit Code schicken: `…/index.html?code=DEINCODE`

## Hosting (kostenlos)

| Ort | Grenze | Hinweis |
| --- | --- | --- |
| GitHub Pages | 100 MB pro Datei, Repo möglichst < 1 GB | Repo muss öffentlich sein; Automatikmodus B funktioniert nur hier |
| Cloudflare Pages | 25 MB pro Datei, 20 000 Dateien | schnell, gute Wahl für viele Fotos |
| Netlify Drop | 100 GB Traffic/Monat | Ordner einfach hineinziehen, kein Repo nötig |

Große Videos gehören nicht ins Repo. Lade sie stattdessen zu einem kostenlosen
Speicher (z. B. Cloudflare R2, 10 GB Freikontingent) und trage die vollständige
Adresse in die `videos`-Liste ein:

```json
"videos": ["https://media.deine-domain.de/sommerparty26/aftermovie.mp4"]
```

Damit „Alle herunterladen" auch dort funktioniert, muss der Speicher
`Access-Control-Allow-Origin` senden (bei R2 in den CORS-Einstellungen).

## Sicherheitshinweis

Der Code schützt vor neugierigen Blicken, nicht gegen Fachleute: Auf einer
statischen Seite bleiben die Dateien über ihre direkte Adresse erreichbar.
Für echten Schutz braucht es signierte Links (z. B. Supabase Storage oder
Cloudflare R2 mit Signatur).

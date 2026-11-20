# Abakus

Persönliche App zur Auswertung von Wertpapier- und Krypto-Umsätzen – läuft auf dem iPhone wie eine App,
ohne App Store. **Alle Daten bleiben auf dem Gerät**; es gibt keinen Server.

## Was die App kann

- **HVB-Abrechnungen (PDF) importieren** – beliebig viele auf einmal (Sparpläne!). Erkannt werden
  Kauf, Verkauf, Ertragszahlung/Ausschüttung, Dividendengutschrift und Zinszahlung (Anleihen).
  Abrechnungen in Fremdwährung (z. B. USD) werden in EUR übernommen.
- **Krypto-Umsätze (CSV)** von **BISON** und **Trade Republic** importieren. Überträge auf den
  **Ledger** werden als Übertrag gebucht (kein Verkauf).
- **Doppelte werden erkannt** (über die Bank-Referenz bzw. Inhalt) und automatisch abgewählt.
- **Auswertung je Position:** Bestand, Ø-Kaufkurs, Ø-Preis nach Ausschüttungen (Dividenden senken
  den Preis), Kursgewinn, realisierte Gewinne, Erträge, Gebühren, Gesamtergebnis.
- **Gebührenerstattung (HVB-Mitarbeiter):** je Kalenderjahr die tatsächlichen Gebühren, höchstens
  400 € – je Jahr manuell überschreibbar.
- **Krypto-Reiter:** Bestand je Plattform/Wallet, Haltefrist (Anteil älter als 1 Jahr), aktuelle
  Kurse per Knopfdruck (CoinGecko).
- **Jede Buchung ist bearbeitbar**, fehlende Buchungen lassen sich von Hand nachtragen.
- **Positionen schließen** – geschlossene Fonds bleiben mit Gewinn/Verlust in der Historie.
- **Backup** als Datei exportieren/einspielen (z. B. in iCloud Drive).

## Auf dem iPhone installieren

1. **https://x4k-de.github.io/abakus/** in **Safari** öffnen.
2. Unten auf **Teilen** tippen → **Zum Home-Bildschirm**.
3. Abakus startet nun wie eine normale App (auch offline).

> Wichtig: Die Daten liegen nur in dieser App auf diesem Gerät. Regelmäßig unter **Mehr → Backup
> exportieren** sichern.

## Für Entwickler

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Tests (nur erfundene Beispieldaten in tests/fixtures)
npm run build      # Produktions-Build nach dist/
```

Technik: Vite, React, TypeScript, PWA (vite-plugin-pwa), IndexedDB (Dexie), pdf.js, Papa Parse.
Details zu Aufbau und Berechnung: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).
Alle Änderungen: [CHANGELOG.md](CHANGELOG.md).

Veröffentlichung: Jeder Merge nach `main` baut die App und stellt sie automatisch über GitHub Pages bereit
(`.github/workflows/deploy.yml`).

**Datenschutz:** Niemals echte Abrechnungen, CSV-Exporte oder Backups einchecken
(siehe `.gitignore`). Tests verwenden ausschließlich erfundene Daten.

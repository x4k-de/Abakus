# Änderungsprotokoll

Alle Änderungen an Abakus werden hier dokumentiert (neueste oben).
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [0.1.0] – 2026-11-20

Erste Version.

### Neu
- Web-App (PWA), auf dem iPhone über Safari „Zum Home-Bildschirm“ installierbar, offline nutzbar.
- Lokale Datenbank im Browser (IndexedDB) – keine Daten verlassen das Gerät.
- Import von HVB-Abrechnungen (PDF, Mehrfachauswahl): Kauf, Verkauf, Ertragszahlung, Dividendengutschrift,
  Zinszahlung. Gebühren werden aus Belastung − Kurswert bestimmt.
- Abrechnungen in Fremdwährung (z. B. USD): Betrag in EUR, Originalkurs und Devisenkurs werden gespeichert.
- Import von Krypto-CSV: BISON (Kauf, Verkauf, Ein-/Auszahlung als Übertrag Ledger) und Trade Republic
  (nur Krypto; Aktien/Fonds folgen später).
- Duplikat-Erkennung über Bank-Referenz bzw. Inhalt; Import-Vorschau mit Status „neu / prüfen / schon vorhanden“.
- Auswertung je Position: Ø-Kaufkurs, Ø-Preis nach Ausschüttungen, Kursgewinn, realisierter Gewinn,
  Erträge, Gebühren, Gesamtergebnis.
- Jahresübersicht mit Gebühren und Mitarbeiter-Gebührenerstattung (tatsächliche Gebühren, max. 400 € je Jahr,
  je Jahr überschreibbar).
- Einstellung, ob Gebühren in den Ø-Kaufkurs einfließen (Standard: nein, wie in der bisherigen Numbers-Tabelle).
- Krypto: Bestand je Plattform/Wallet, Haltefrist nach FIFO, Kurse über CoinGecko.
- Buchungen bearbeiten, löschen und von Hand nachtragen (Kennzeichnung „manuell“ / „angepasst“).
- Positionen schließen (Restbestand verkaufen oder als wertlos ausbuchen) und Historie geschlossener Positionen
  mit Gewinn/Verlust; Warnhinweis, wenn Kaufabrechnungen fehlen.
- Backup als JSON-Datei exportieren und wieder einspielen.
- Dunkles Design in Grüntönen mit Glas-Karten und Leuchteffekten.
- Automatische Veröffentlichung über GitHub Pages bei jeder Änderung auf `main`
  (Adresse: https://x4k-de.github.io/abakus/).

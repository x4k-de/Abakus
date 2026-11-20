# Änderungsprotokoll

Alle Änderungen an Abakus werden hier dokumentiert (neueste oben).
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [0.4.0] – 2026-11-20

### Geändert
- **Neues, ruhigeres Design** nach den Vorlagen (Glas-Karte mit Leuchtkante, dunkles Neumorphism-Bedienfeld,
  Grün-Palette):
  - Depotwert als Glas-Karte mit feinen Höhenlinien und leuchtendem Glasteil für Kursgewinn und Gesamtergebnis;
    der Kurs-Knopf sitzt als runder Neumorphism-Knopf in der Karte.
  - Kennzahlen in einer gemeinsamen Fläche mit Haarlinien statt vieler Einzelkacheln; „Gebühren netto“ (nach
    Erstattung) statt zwei Werten nebeneinander.
  - Positionen als ruhige Liste; Hinweise („kein aktueller Kurs“, „Käufe fehlen?“) nur noch als kleiner Punkt.
  - Detailansicht: Glas-Karte oben, darunter eine schlichte Werteliste statt neun Kacheln.
  - Buchungen einzeilig, ohne Etiketten „angepasst/manuell“; zu Prüfendes als Punkt.
  - Schwebende Tab-Leiste mit Linien-Icons und eingelassenem, leuchtendem aktivem Reiter.
  - Ruhigere Schrift: keine Großbuchstaben-Beschriftungen, dünnere große Zahlen, mehr Weißraum.
- Das App-Icon bleibt unverändert.

## [0.3.0] – 2026-11-20

### Neu
- **Alte HVB-Belege (etwa bis 2021) per Texterkennung:** Diese PDFs enthalten keinen auslesbaren Text (Schrift
  ohne Zeichenzuordnung). Die App erkennt das, rendert die erste Seite und liest sie mit einer Texterkennung
  (tesseract.js) – komplett auf dem Gerät. Die Dateien dafür (~15 MB) liefert die App selbst aus und lädt sie
  nur bei Bedarf. Gelesene Werte werden gegengeprüft (ISIN-Prüfziffer, Stück × Kurs = Kurswert); nur wenn etwas
  nicht zusammenpasst, wird die Buchung zum Prüfen markiert. Bei deutschen ISINs wird die WKN aus der ISIN
  übernommen.
- **Wertpapier-Einlösung** (Rückzahlung z. B. eines Zertifikats) wird als Verkauf gebucht.
- **„Wertpapier-Abrechnung Bezug“** (Kauf aus Bezug ohne Kurs) wird erkannt.

## [0.2.0] – 2026-11-20

### Neu
- Aktuelle Wertpapierkurse werden automatisch online geholt (onvista, per ISIN; bevorzugt EUR-Kurs von Xetra
  bzw. Tradegate). Beim Öffnen des Depots werden Kurse, die nicht von heute sind, nachgeladen; zusätzlich gibt
  es den Knopf „Kurse aktualisieren“ jetzt auch im Depot. Übertragen wird nur die ISIN. Manuell eingetragene
  Kurse werden nicht überschrieben (außer per Knopf).

- Abrechnungen ohne Kurs („Wertpapier-Abrechnung Kauf“ über die Bezugsstelle, z. B. neue Aktien aus
  Bezugsrechten bzw. Scrip-Dividende) werden erkannt: Kauf mit 0 € Kurswert, die Provision zählt als Gebühr
  (und damit zur Mitarbeiter-Erstattung).

### Behoben
- Realisierter Gewinn war viel zu hoch, wenn für verkaufte Stücke keine Kaufabrechnung importiert war: Der
  komplette Erlös zählte als Gewinn. Jetzt zählt nur der durch erfasste Käufe gedeckte Anteil; der übrige Erlös
  wird in der Position mit dem Hinweis „Käufe fehlen?“ ausgewiesen. Der Bestand kann nicht mehr negativ werden.

## [0.1.3] – 2026-11-20

### Behoben
- Ältere Ertrags- und Zinsmitteilungen (Jahrgang 2025) wurden mit „Keine HVB-Wertpapierabrechnung erkannt“
  abgelehnt: Auf ihrer ersten Seite stehen weder Bankname noch Umsatzsteuer-ID. Erkannt wird jetzt auch über
  die HVB-Bankleitzahl bzw. den typischen Aufbau („Wertpapiermitteilung – … für Depotnummer“ mit WKN/ISIN).

## [0.1.2] – 2026-11-20

### Geändert
- Erträge (Ausschüttungen, Dividenden, Zinsen) aus HVB-PDFs zählen jetzt automatisch mit dem Betrag, der
  auf dem Konto gutgeschrieben wird. Ausländische Quellensteuer und Spesen sind ein reiner Abzug (keine
  Erstattung) und stehen nur noch als Notiz an der Buchung („brutto …, Quellensteuer … einbehalten“).
  Der Hinweis „bitte prüfen“ entfällt.
- Erträge in USD: Die EUR-Gutschrift wird ohne Prüfhinweis übernommen; der Umrechnungskurs wird gespeichert.
- Schon importierte Erträge werden beim ersten Start einmalig auf netto umgestellt (Datenbank-Version 2).
  Von Hand bearbeitete Buchungen bleiben unverändert. Das Gesamtergebnis ändert sich dadurch nicht.

### Behoben
- Einige Verkaufsabrechnungen wurden mit „Belegart noch nicht unterstützt“ abgelehnt, weil der PDF-Leser
  den gesperrten Titel in zwei Stücke teilt („Verk auf“). Wird jetzt erkannt.
- USD-Verkäufe zeigten 0,00 €: Der Beleg nennt den „Umrechnungskurs 1 EUR = … USD“ statt „Devisenkurs“.
  Wird jetzt gelesen; ausgewiesene Devisenkosten zählen als Gebühr. Fehlt jeder Kurs, wird der EUR-Betrag
  aus Belastung bzw. Gutschrift und Provision abgeleitet. Kein Prüfhinweis mehr bei Umrechnungen.

## [0.1.1] – 2026-11-20

### Behoben
- HVB-Kauf- und Verkaufsabrechnungen wurden beim Import mit „Keine HVB-Wertpapierabrechnung erkannt“
  abgelehnt. Ursache: Die HVB setzt den Titel „Wertpapier-Abrechnung Kauf“ gesperrt (mit Buchstabenabstand),
  und der PDF-Leser im Browser liefert Stückzahl, Kurs und Datum in anderer Zeilenlage als die Druckansicht.
  Gesperrte Titel werden jetzt zusammengezogen, und Stück, Name, WKN/ISIN, Kurs und Datum werden
  abschnittsweise statt zeilengenau gesucht. Geprüft mit den echten Beispiel-Abrechnungen.
- Wörter innerhalb von Namen werden nicht mehr fälschlich als Spalten getrennt.

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
  (Adresse: https://x4k-de.github.io/Abakus/).

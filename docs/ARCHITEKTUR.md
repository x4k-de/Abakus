# Architektur & Berechnung

## Aufbau

| Bereich | Datei(en) |
|---|---|
| Datenmodell | `src/lib/types.ts` |
| Lokale Datenbank (IndexedDB) | `src/lib/db.ts` |
| Berechnung | `src/lib/calc.ts` |
| HVB-PDF-Erkennung | `src/lib/import/hvb.ts`, Textauslese `pdfText.ts` |
| Krypto-CSV | `src/lib/import/crypto.ts` |
| Import-Ablauf / Duplikate | `src/lib/import/importService.ts` |
| Backup | `src/lib/backup.ts` |
| Kurse | `src/lib/prices.ts` |
| Oberfläche | `src/pages/*`, `src/components/*` |

Es gibt keinen Server. Die App ist eine statische Webseite; Daten liegen in der IndexedDB des Browsers.
Netzwerkzugriffe: nur für Kurse – CoinGecko für Krypto (es werden nur Coin-Namen übertragen) und onvista für
Wertpapiere (es wird nur die ISIN übertragen, keine Stückzahlen oder Beträge). Beim Öffnen des Depots werden
Kurse, die nicht von heute sind, automatisch nachgeladen; manuell eingetragene Kurse bleiben unangetastet.

## Datenmodell

- **Asset** = Wertpapier oder Coin (ISIN/WKN bzw. Kürzel, aktueller Kurs, ggf. `closedAt`).
- **Booking** = eine Buchung: `kauf`, `verkauf`, `dividende`, `zinsen`, `einlieferung`, `auslieferung`,
  `transfer`, `gebuehr`, `steuer`. Beträge immer in EUR und positiv; Fremdwährung zusätzlich in
  `currency`, `priceOriginal`, `fxRate`. `reference` = Bank-Referenz zur Duplikat-Erkennung.

## Berechnung (Durchschnittsmethode)

- **Kauf:** Bestand + Menge; Einstand + Kurswert (+ Gebühr, falls „Gebühren im Einstand“ aktiv).
- **Verkauf:** anteiliger Einstand = Ø-Einstand × Menge; realisiert = Erlös − anteiliger Einstand
  (− Gebühr, falls aktiv).
- **Dividende/Zinsen:** Ertrag netto = Betrag − Steuer − Gebühr. Beim PDF-Import ist der Betrag bereits die
  Gutschrift aufs Konto (nach ausländischer Quellensteuer); die Quellensteuer steht nur in der Notiz.
- **Ø-Kaufkurs** = Einstand / Bestand. **Ø nach Ausschüttungen** = (Einstand − Erträge netto) / Bestand.
- **Verkauf ohne erfassten Kauf:** Nur der gedeckte Anteil zählt als realisierter Gewinn; der Erlös der
  übrigen Stücke wird separat ausgewiesen (Hinweis „Käufe fehlen?“). Der Bestand wird nie negativ.
- **Gesamtergebnis** = Kursgewinn + realisiert + Erträge − separate Kosten (Gebühren, Steuern).
  Das Ergebnis ist unabhängig davon, ob Gebühren im Einstand stecken.
- **Anleihen:** Menge = Nennwert, Kurs in Prozent (Faktor 0,01).
- **Gebührenerstattung je Jahr** = min(Maximalbetrag, Gebühren des Erstattungskontos im Jahr),
  sofern kein manueller Wert gesetzt ist. Fließt im Depot-Gesamtergebnis ein.
- **Krypto-Haltefrist:** FIFO-Lose; Anteil, dessen Kauf mehr als ein Jahr zurückliegt, wird als
  „steuerfrei“ angezeigt (Hinweis, keine Steuerberatung). Überträge ändern nur die Verteilung auf
  Konten/Wallets.

## Bekannte Grenzen

- Kapitalertragsteuer steht nicht in den HVB-Belegen (separat auf dem Kontoauszug) → bei Bedarf als
  Buchung „Steuer“ erfassen.
- Wertpapierkurse: onvista-Suche per ISIN, dann bester EUR-Kurs (Xetra, Tradegate, … ). Fonds ohne
  Börsenkurs bzw. ohne EUR-Notiz bleiben ohne Kurs und können manuell gepflegt werden.
- Trade-Republic-Wertpapiere werden beim Import noch übersprungen.

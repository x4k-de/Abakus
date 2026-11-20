// Lokale Datenbank im Browser (IndexedDB). Es gibt keinen Server: Die Daten verlassen das Gerät nur,
// wenn du selbst ein Backup exportierst.

import Dexie, { type Table } from 'dexie';
import { type Asset, type Booking, DEFAULT_SETTINGS, type Settings } from './types';

export class AbakusDB extends Dexie {
  assets!: Table<Asset, string>;
  bookings!: Table<Booking, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'abakus') {
    super(name);
    this.version(1).stores({
      assets: 'id, kind, isin, wkn, symbol',
      bookings: 'id, assetId, type, date, konto, reference',
      settings: 'id',
    });
  }
}

export const db = new AbakusDB();

export async function getSettings(database: AbakusDB = db): Promise<Settings> {
  const s = await database.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch: Partial<Settings>, database: AbakusDB = db): Promise<void> {
  const cur = await getSettings(database);
  await database.settings.put({ ...cur, ...patch, id: 'settings' });
}

/** Browser bitten, die Daten dauerhaft zu speichern (schützt vor automatischem Löschen). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignorieren */
  }
  return false;
}

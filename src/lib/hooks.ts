import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { type Asset, type Booking, DEFAULT_SETTINGS, type Settings } from './types';

export interface AppData {
  assets: Asset[];
  bookings: Booking[];
  settings: Settings;
  loaded: boolean;
}

export function useAppData(): AppData {
  const assets = useLiveQuery(() => db.assets.toArray(), []);
  const bookings = useLiveQuery(() => db.bookings.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  return {
    assets: assets ?? [],
    bookings: bookings ?? [],
    settings: { ...DEFAULT_SETTINGS, ...settings },
    loaded: assets !== undefined && bookings !== undefined,
  };
}

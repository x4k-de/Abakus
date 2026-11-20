import { useEffect, useState } from 'react';
import { requestPersistence } from './lib/db';
import { useAppData } from './lib/hooks';
import { BookingsPage } from './pages/BookingsPage';
import { ImportPage } from './pages/ImportPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { SettingsPage } from './pages/SettingsPage';

type Tab = 'depot' | 'krypto' | 'buchungen' | 'import' | 'mehr';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'depot', label: 'Depot', icon: '▤' },
  { id: 'krypto', label: 'Krypto', icon: '₿' },
  { id: 'buchungen', label: 'Buchungen', icon: '≡' },
  { id: 'import', label: 'Import', icon: '⇪' },
  { id: 'mehr', label: 'Mehr', icon: '⚙' },
];

function initialTab(): Tab {
  const h = location.hash.replace('#', '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'depot';
}

export default function App() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    void requestPersistence();
  }, []);
  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="icon.svg" alt="" width={26} height={26} />
          <span>Abakus</span>
        </div>
        <nav className="toptabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'depot' && <PortfolioPage data={data} kind="wertpapier" onGoImport={() => setTab('import')} />}
        {tab === 'krypto' && <PortfolioPage data={data} kind="krypto" onGoImport={() => setTab('import')} />}
        {tab === 'buchungen' && <BookingsPage data={data} />}
        {tab === 'import' && <ImportPage onDone={() => setTab('depot')} />}
        {tab === 'mehr' && <SettingsPage data={data} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ti">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

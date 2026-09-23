import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, type CloseAction, type SaveStatus } from './api';
import { useLang, type Strings } from './i18n';
import { clearRegression, useLive } from './live';
import { derive } from './model';
import { loadPresets } from './presets';
import { Counters } from './views/Counters';
import { Achievements, Challenges, Items } from './views/Lists';
import { Marks } from './views/Marks';
import { Overview } from './views/Overview';
import { OverlaySetup } from './views/OverlaySetup';
import { Source } from './views/Source';
import { Void } from './ui';

declare global {
  interface Window {
    __trackerAskClose?: () => void;
  }
}

type Tab = 'overview' | 'counters' | 'achievements' | 'marks' | 'challenges' | 'items' | 'overlay' | 'source';

const TABS: Tab[] = ['overview', 'counters', 'achievements', 'marks', 'challenges', 'items', 'overlay', 'source'];

function tabFromHash(): Tab | null {
  const raw = location.hash.replace(/^#\/?/, '');
  return TABS.includes(raw as Tab) ? (raw as Tab) : null;
}

function clock(ms: number | null | undefined, locale: string): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Readout({ status, connection, s }: { status: SaveStatus | null; connection: string; s: Strings }) {
  const name = status?.path ? status.path.split(/[\\/]/).pop() : null;
  const fault = status?.errorCode ? (s.errors[status.errorCode] ?? status.error) : null;
  return (
    <div className="readout" title={status?.path ?? undefined}>
      <b>{name ?? s.noFile}</b>
      {name ? <span>{clock(status?.lastReadAt, s.locale)}</span> : null}
      {fault ? <span className="fault">{fault}</span> : null}
      {connection !== 'online' ? <span className="fault">{connection === 'connecting' ? s.connecting : s.noService}</span> : null}
    </div>
  );
}

function CloseAsk({ s, onDone }: { s: Strings; onDone: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const choose = (action: CloseAction) => {
    onDone();
    api.close(action).catch(() => undefined);
  };

  return (
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onDone()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="close-ask-title">
        <div className="modal-title" id="close-ask-title">
          {s.closeTitle}
        </div>
        <p>{s.closeBody}</p>
        <p className="modal-note">{s.closeWhere}</p>
        <div className="modal-actions">
          <button type="button" className="btn primary" autoFocus onClick={() => choose('tray')}>
            {s.closeActions.tray}
          </button>
          <button type="button" className="btn" onClick={() => choose('exit')}>
            {s.closeActions.exit}
          </button>
          <button type="button" className="btn ghost" onClick={onDone}>
            {s.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const live = useLive();
  const { lang, s, setLang } = useLang();
  const [tab, setTabState] = useState<Tab>(() => tabFromHash() ?? 'overview');
  const [port, setPort] = useState<number | null>(null);
  const content = useRef<HTMLElement | null>(null);
  const [askClose, setAskClose] = useState(false);

  useEffect(() => {
    api
      .status()
      .then((response) => {
        setPort(response.port);
        loadPresets(response.settings);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api.saveSettings({ lang }).catch(() => undefined);
  }, [lang]);

  useEffect(() => {
    window.__trackerAskClose = () => setAskClose(true);
    return () => {
      delete window.__trackerAskClose;
    };
  }, []);

  const closeAskDone = useCallback(() => setAskClose(false), []);

  useEffect(() => {
    const sync = () => setTabState(tabFromHash() ?? 'overview');
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const setTab = (next: Tab) => {
    setTabState(next);
    location.hash = `/${next}`;
    content.current?.scrollTo({ top: 0 });
  };

  const derived = useMemo(() => (live.parsed ? derive(live.parsed.save) : null), [live.parsed]);
  const needsFile = !live.status?.path;

  return (
    <div className="app">
      <header className="rail">
        <div className="wordmark">DEADGOD TRACKER</div>
        <Readout status={live.status} connection={live.connection} s={s} />
        {derived ? (
          <div className="rail-count" data-done={derived.isDeadGod ? '1' : '0'}>
            <span className="now">{derived.deadGod.done}</span>
            <span className="of">/{derived.deadGod.total}</span>
          </div>
        ) : null}
        <button type="button" className="lang" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')} title={s.langToggleTitle}>
          {s.langToggle}
        </button>
      </header>

      <nav className="tabs">
        {TABS.map((item) => (
          <button key={item} type="button" data-on={tab === item ? '1' : '0'} onClick={() => setTab(item)}>
            {s.tabs[item]}
          </button>
        ))}
      </nav>

      <main className="content" ref={content}>
        {live.regression ? (
          <div className="fault-line">
            <b>{s.regression}</b>
            <span>{s.regressionBody(live.regression.before, live.regression.after)}</span>
            <button type="button" className="btn" onClick={clearRegression}>
              {s.hide}
            </button>
          </div>
        ) : null}

        {live.parseError ? <div className="fault-line">{live.parseError}</div> : null}

        {needsFile ? (
          <Source status={live.status} />
        ) : !derived || !live.parsed ? (
          <Void>{s.reading}</Void>
        ) : (
          <>
            {tab === 'overview' && <Overview live={live} derived={derived} />}
            {tab === 'counters' && <Counters save={live.parsed.save} derived={derived} />}
            {tab === 'achievements' && <Achievements save={live.parsed.save} live={live} />}
            {tab === 'marks' && <Marks derived={derived} />}
            {tab === 'challenges' && <Challenges save={live.parsed.save} derived={derived} />}
            {tab === 'items' && <Items save={live.parsed.save} derived={derived} />}
            {tab === 'overlay' && <OverlaySetup port={port} />}
            {tab === 'source' && <Source status={live.status} />}
          </>
        )}
      </main>
      {askClose ? <CloseAsk s={s} onDone={closeAskDone} /> : null}
    </div>
  );
}

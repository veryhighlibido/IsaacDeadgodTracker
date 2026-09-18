import { useEffect, useState } from 'react';

import { api, type SaveStatus, type SlotInfo, type SourceInfo } from '../api';
import { parseSave } from '../core/format';
import { useLang, type Strings } from '../i18n';
import { derive } from '../model';
import { Meter, Sheet, Void } from '../ui';

interface SlotSummary {
  state: 'loading' | 'ok' | 'other' | 'error';
  done?: number;
  total?: number;
  deadGod?: boolean;
  edition?: string;
  message?: string;
}

function stamp(ms: number | null | undefined, locale: string): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' });
}

function useSlotSummary(path: string, version: number, s: Strings): SlotSummary {
  const [summary, setSummary] = useState<SlotSummary>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    setSummary({ state: 'loading' });
    api
      .preview(path)
      .then((bytes) => {
        if (!alive) return;
        const parsed = parseSave(bytes);
        if (parsed.save.achievements.length < 638) {
          setSummary({ state: 'other', edition: s.editions[parsed.edition] ?? parsed.edition });
          return;
        }
        const derived = derive(parsed.save);
        setSummary({
          state: 'ok',
          done: derived.deadGod.done,
          total: derived.deadGod.total,
          deadGod: derived.isDeadGod,
        });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setSummary({ state: 'error', message: error instanceof Error ? error.message : s.unread });
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return summary;
}

function Slot({
  slot,
  active,
  version,
  onSelect,
  s,
}: {
  slot: SlotInfo;
  active: boolean;
  version: number;
  onSelect: (path: string) => void;
  s: Strings;
}) {
  const summary = useSlotSummary(slot.path, version, s);

  return (
    <li className="slot" data-active={active ? '1' : '0'}>
      <div className="slot-id">{s.slot(slot.slot)}</div>
      <div>
        <div className="slot-state">
          {summary.state === 'loading' && '…'}
          {summary.state === 'ok' && (
            <>
              {summary.done}
              <span className="of">/{summary.total}</span>
              {summary.deadGod ? ` · ${s.deadGod}` : ''}
            </>
          )}
          {summary.state === 'other' && summary.edition}
          {summary.state === 'error' && (summary.message ?? s.unread)}
        </div>
        <div className="slot-meta">{stamp(slot.modified, s.locale)}</div>
      </div>
      <div className="slot-meter">
        {summary.state === 'ok' ? <Meter value={summary.done ?? 0} goal={summary.total ?? 1} /> : null}
      </div>
      <button type="button" className={active ? 'btn primary' : 'btn'} disabled={active} onClick={() => onSelect(slot.path)}>
        {active ? s.watching : s.watch}
      </button>
    </li>
  );
}

export function Source({ status }: { status: SaveStatus | null }) {
  const { lang, s } = useLang();
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);

  useEffect(() => {
    api
      .status()
      .then((response) => setFollow(response.settings.followSlot === true))
      .catch(() => undefined);
  }, []);

  const changeFollow = (next: boolean) => {
    setFollow(next);
    api.saveSettings({ followSlot: next }).catch(() => setFollow(!next));
  };

  useEffect(() => {
    api
      .sources()
      .then((response) => setSources(response.sources))
      .catch(() => setSources([]));
  }, [version]);

  const select = (path: string) => {
    setBusy(true);
    setFault(null);
    api
      .select(path)
      .catch((error: unknown) => setFault(error instanceof Error ? error.message : s.failed))
      .finally(() => setBusy(false));
  };

  const pick = () => {
    setBusy(true);
    api
      .pick(lang)
      .then((response) => {
        if (response.path) select(response.path);
      })
      .catch((error: unknown) => setFault(error instanceof Error ? error.message : s.dialogFailed))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Sheet title={s.source}>
        <div className="facts">
          <div className="fact wide">
            <span>{s.path}</span>
            <code title={status?.path ?? undefined}>{status?.path ?? '—'}</code>
          </div>
          <div className="fact">
            <span>{s.lastRead}</span>
            <code>{stamp(status?.lastReadAt, s.locale)}</code>
          </div>
          <div className="fact">
            <span>{s.gameWrote}</span>
            <code>{stamp(status?.mtime, s.locale)}</code>
          </div>
          <div className="fact">
            <span>{s.snapshots}</span>
            <code>{status?.reads ?? 0}</code>
          </div>
          {status?.errorCode ? (
            <div className="fact">
              <span>{s.failure}</span>
              <code className="fault">{s.errors[status.errorCode] ?? status.error}</code>
            </div>
          ) : null}
        </div>
        <div className="toolbar">
          <button type="button" className="btn" onClick={pick} disabled={busy}>
            {s.pickFile}
          </button>
          <button type="button" className="btn" onClick={() => api.refresh()}>
            {s.reread}
          </button>
          <button type="button" className="btn" onClick={() => setVersion((value) => value + 1)}>
            {s.refreshList}
          </button>
          {status?.path ? (
            <button type="button" className="btn" onClick={() => api.reveal(status.path as string)}>
              {s.revealInFolder}
            </button>
          ) : null}
          <label className="follow" title={s.followSlotHint}>
            <input type="checkbox" checked={follow} onChange={(event) => changeFollow(event.target.checked)} />
            {s.followSlot}
          </label>
        </div>
        {fault ? <div className="fault-line">{fault}</div> : null}
      </Sheet>

      {sources.map((source) => (
        <Sheet key={source.dir} title={source.editionLabel} note={source.dir}>
          <ul className="slots">
            {source.slots.map((slot) => (
              <Slot
                key={slot.path}
                slot={slot}
                version={version}
                active={status?.path === slot.path}
                onSelect={select}
                s={s}
              />
            ))}
          </ul>
        </Sheet>
      ))}

      {sources.length === 0 ? <Void>{s.noSaves}</Void> : null}
    </>
  );
}

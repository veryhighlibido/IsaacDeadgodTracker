import { useCallback, useEffect, useState } from 'react';

import {
  api,
  ApiError,
  type CloseAction,
  type SaveStatus,
  type SlotInfo,
  type SourceInfo,
  type StorageLocation,
  type StorageReport,
} from '../api';
import { parseSave } from '../core/format';
import { useLang, type Strings } from '../i18n';
import { useLive } from '../live';
import { derive } from '../model';
import { Meter, SegKnob, Sheet, Void } from '../ui';

const CLOSE_ACTIONS: CloseAction[] = ['tray', 'exit'];

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

function SlotBrief({ slot, s }: { slot: SlotInfo; s: Strings }) {
  const summary = useSlotSummary(slot.path, 0, s);
  return (
    <li>
      <span>{s.slot(slot.slot)}</span>
      <b>
        {summary.state === 'ok' ? (
          <>
            {summary.done}
            <span className="of">/{summary.total}</span>
          </>
        ) : summary.state === 'loading' ? (
          '…'
        ) : summary.state === 'other' ? (
          summary.edition
        ) : (
          s.unread
        )}
      </b>
    </li>
  );
}

function PlaceBrief({ place, tag, s }: { place: StorageLocation; tag: string; s: Strings }) {
  return (
    <div className="switch-place">
      <div className="switch-place-head">
        <span>{tag}</span>
        <b>{s.places[place.kind]}</b>
      </div>
      {place.slots.length > 0 ? (
        <ul>
          {place.slots.map((slot) => (
            <SlotBrief key={slot.path} slot={slot} s={s} />
          ))}
        </ul>
      ) : (
        <div className="switch-empty">{s.placeEmpty}</div>
      )}
    </div>
  );
}

function SwitchAsk({
  report,
  s,
  onCancel,
  onConfirm,
}: {
  report: StorageReport;
  s: Strings;
  onCancel: () => void;
  onConfirm: (copy: boolean) => void;
}) {
  const enable = report.steamCloud !== true;
  const from = report.locations.find((place) => place.kind === (enable ? 'documents' : 'cloud'));
  const to = report.locations.find((place) => place.kind === (enable ? 'cloud' : 'documents'));
  const [copy, setCopy] = useState(false);
  const canCopy = Boolean(from && from.slots.length > 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (!from || !to) return null;
  const fromName = s.places[from.kind];
  const toName = s.places[to.kind];

  return (
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="switch-title">
        <div className="modal-title" id="switch-title">
          {s.switchTitle(enable)}
        </div>
        <p>{s.switchBody(toName)}</p>
        <div className="switch-compare">
          <PlaceBrief place={from} tag={s.switchFrom} s={s} />
          <span className="switch-arrow">→</span>
          <PlaceBrief place={to} tag={s.switchTo} s={s} />
        </div>
        <label className="switch-copy" data-off={canCopy ? '0' : '1'}>
          <input type="checkbox" checked={copy && canCopy} disabled={!canCopy} onChange={(event) => setCopy(event.target.checked)} />
          <span>{s.copySlots(fromName, toName)}</span>
        </label>
        {copy && canCopy ? (
          <p className="modal-note">
            {s.copyNote}
            {to.kind === 'cloud' ? ` ${s.copyCloudNote}` : ''}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn primary" autoFocus onClick={() => onConfirm(copy && canCopy)}>
            {s.switchConfirm(enable)}
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            {s.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Place({
  place,
  status,
  version,
  onSelect,
  s,
}: {
  place: StorageLocation;
  status: SaveStatus | null;
  version: number;
  onSelect: (path: string) => void;
  s: Strings;
}) {
  return (
    <section className="place" data-active={place.active ? '1' : '0'}>
      <header className="place-head">
        <span className="place-name">{s.places[place.kind]}</span>
        {place.active ? <span className="place-tag">{s.placeActive}</span> : null}
        <button
          type="button"
          className="btn"
          disabled={!place.exists}
          onClick={() => api.openDir(place.dir).catch(() => undefined)}
        >
          {s.openFolder}
        </button>
      </header>
      <code className="place-path" title={place.dir}>
        {place.dir}
      </code>
      {place.account ? <div className="place-meta">{s.placeAccount(place.account)}</div> : null}
      {place.slots.length > 0 ? (
        <ul className="slots">
          {place.slots.map((slot) => (
            <Slot
              key={slot.path}
              slot={slot}
              version={version}
              active={status?.path === slot.path}
              onSelect={onSelect}
              s={s}
            />
          ))}
        </ul>
      ) : (
        <div className="place-empty">{place.exists ? s.placeEmpty : s.placeMissing}</div>
      )}
    </section>
  );
}

export function Source({ status }: { status: SaveStatus | null }) {
  const { lang, s } = useLang();
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [report, setReport] = useState<StorageReport | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState<{ text: string; backup: string | null; failed: boolean } | null>(null);
  const closeAction = useLive().prefs?.closeAction ?? null;

  useEffect(() => {
    api
      .status()
      .then((response) => setFollow(response.settings.followSlot === true))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .storage()
        .then((next) => alive && setReport(next))
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [version]);

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

  const closeAsk = useCallback(() => setAsking(false), []);

  const switchCloud = (copy: boolean) => {
    if (!report) return;
    const enable = report.steamCloud !== true;
    setAsking(false);
    setBusy(true);
    api
      .switchCloud(enable, copy)
      .then((result) => setOutcome({ text: s.switched(enable, result.copied), backup: result.backup, failed: false }))
      .catch((error: unknown) =>
        setOutcome({
          text: (error instanceof ApiError ? s.switchErrors[error.code] : undefined) ?? s.failed,
          backup: null,
          failed: true,
        }),
      )
      .finally(() => {
        setBusy(false);
        setVersion((value) => value + 1);
      });
  };

  const placeDirs = new Set(report?.locations.map((place) => place.dir) ?? []);
  const others = sources.filter((source) => !(source.edition === 'repentancePlus' && placeDirs.has(source.dir)));
  const cloudOn = report?.steamCloud ?? null;
  const cloudState = cloudOn === null ? 'unknown' : cloudOn ? 'on' : 'off';
  const hasCloud = Boolean(report?.locations.some((place) => place.kind === 'cloud'));
  const lock = !report
    ? null
    : report.gameRunning
      ? s.cloudLocked
      : !report.optionsFound
        ? s.cloudNoOptions
        : !hasCloud
          ? s.switchErrors.noSteam
          : null;

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

      {report ? (
        <Sheet title={s.storageTitle} note={s.storageNote}>
          <div className="cloud-bar">
            <div className="cloud-state" title={report.optionsPath}>
              <span className="cloud-key">Steam Cloud</span>
              <b data-state={cloudState}>{s.cloudStates[cloudState]}</b>
              <code>options.ini · SteamCloud={cloudOn === null ? '—' : cloudOn ? '1' : '0'}</code>
            </div>
            <div className="cloud-act">
              {lock ? <span className="cloud-lock">{lock}</span> : null}
              <button type="button" className="btn" disabled={Boolean(lock) || busy} onClick={() => setAsking(true)}>
                {s.cloudTurn(cloudOn !== true)}
              </button>
            </div>
          </div>
          {outcome ? (
            <div className="cloud-outcome" data-failed={outcome.failed ? '1' : '0'}>
              <span>{outcome.text}</span>
              {outcome.backup ? (
                <button type="button" className="btn" onClick={() => api.openDir(report.backups).catch(() => undefined)}>
                  {s.openBackup}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="places">
            {report.locations.map((place) => (
              <Place key={place.kind} place={place} status={status} version={version} onSelect={select} s={s} />
            ))}
          </div>
        </Sheet>
      ) : null}

      {others.length > 0 ? (
        <Sheet title={s.otherSaves}>
          {others.map((source) => (
            <div className="other-source" key={source.dir + source.edition}>
              <div className="other-head">
                <b>{source.editionLabel}</b>
                <span>{source.cloud ? s.places.cloud : s.places.documents}</span>
                <code title={source.dir}>{source.dir}</code>
              </div>
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
            </div>
          ))}
        </Sheet>
      ) : null}

      <Sheet title={s.windowSheet} note={closeAction ? undefined : s.closeUnset}>
        <div className="knobs">
          <SegKnob
            title={s.closeButton}
            value={closeAction}
            options={CLOSE_ACTIONS}
            label={(option) => s.closeActions[option]}
            onChange={(option) => api.saveSettings({ closeAction: option }).catch(() => undefined)}
          />
        </div>
      </Sheet>

      {sources.length === 0 && report && report.locations.every((place) => place.slots.length === 0) ? (
        <Void>{s.noSaves}</Void>
      ) : null}

      {asking && report ? <SwitchAsk report={report} s={s} onCancel={closeAsk} onConfirm={switchCloud} /> : null}
    </>
  );
}

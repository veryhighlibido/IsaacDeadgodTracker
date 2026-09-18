import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import { api, API_PARAM } from '../api';
import { LANGS, useLang, type Lang, type Strings } from '../i18n';
import {
  CAPTIONS,
  DEFAULT_ORDER,
  DONE_LOOKS,
  FONTS,
  LAYOUT_PRESETS,
  LAYOUTS,
  LOCKED_LOOKS,
  decodeOverlayCode,
  encodeOverlayCode,
  normalizeOverlay,
  OVERLAY_SETS,
  overlayQuery,
  isSecretKey,
  sizeTicks,
  spriteSize,
  type OverlayConfig,
  type OverlaySet,
} from '../overlay-config';
import { itemMeta } from '../overlay-items';
import { Sprite } from '../sprite';
import { Sheet } from '../ui';

function Seg<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: readonly T[];
  label: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((option) => (
        <button key={option} type="button" data-on={value === option ? '1' : '0'} onClick={() => onChange(option)}>
          {label(option)}
        </button>
      ))}
    </div>
  );
}

function SegKnob<T extends string>(props: {
  title: string;
  value: T;
  options: readonly T[];
  label: (option: T) => string;
  onChange: (option: T) => void;
}) {
  const { title, ...seg } = props;
  return (
    <div className="knob">
      <span className="knob-head">{title}</span>
      <Seg {...seg} />
    </div>
  );
}

function FineTune({
  config,
  patch,
  s,
}: {
  config: OverlayConfig;
  patch: (next: Partial<OverlayConfig>) => void;
  s: Strings;
}) {
  const [open, setOpen] = useState(false);
  const blind = config.set === 'blind';
  return (
    <section className="sheet">
      <button type="button" className="sheet-head sheet-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <i className="caret" data-open={open ? '1' : '0'} />
          {s.fineTune}
        </span>
        <em>{s.fineTuneNote}</em>
      </button>
      {open ? (
        <div className="knobs">
          {blind ? (
            <SegKnob
              title={s.layout}
              value={config.layout}
              options={LAYOUTS}
              label={(option) => s.layouts[option]}
              onChange={(layout) => patch({ layout, ...LAYOUT_PRESETS[layout] })}
            />
          ) : null}
          {blind && config.layout === 'tiles' ? (
            <label className="knob">
              <span className="knob-head">
                {s.rows} <em>{config.rows}</em>
              </span>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={config.rows}
                onChange={(event) => patch({ rows: Number(event.target.value) })}
              />
            </label>
          ) : null}
          {blind ? (
            <SegKnob
              title={s.caption}
              value={config.caption}
              options={CAPTIONS}
              label={(option) => s.captions[option]}
              onChange={(caption) => patch({ caption })}
            />
          ) : null}
          {blind ? (
            <SegKnob
              title={s.font}
              value={config.font}
              options={FONTS}
              label={(option) => s.fonts[option]}
              onChange={(font) => patch({ font })}
            />
          ) : null}
          <SegKnob
            title={s.lockedLook}
            value={config.locked}
            options={LOCKED_LOOKS}
            label={(option) => s.lockedLooks[option]}
            onChange={(locked) => patch({ locked })}
          />
          <SegKnob
            title={s.doneLook}
            value={config.done}
            options={DONE_LOOKS}
            label={(option) => s.doneLooks[option]}
            onChange={(done) => patch({ done })}
          />
          {blind ? (
            <label className="knob switch">
              <input type="checkbox" checked={config.meter} onChange={(event) => patch({ meter: event.target.checked })} />
              {s.meterToggle}
            </label>
          ) : null}
          {blind && config.layout === 'tiles' ? (
            <label className="knob switch">
              <input type="checkbox" checked={config.apart} onChange={(event) => patch({ apart: event.target.checked })} />
              {s.totalsApart}
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function moveKey(order: string[], key: string, target: string, after: boolean): string[] {
  if (key === target) return order;
  const rest = order.filter((item) => item !== key);
  const index = rest.indexOf(target);
  if (index < 0) return order;
  rest.splice(after ? index + 1 : index, 0, key);
  return rest;
}

function resetSubset(order: string[], subset: string[]): string[] {
  const members = new Set(subset);
  const sorted = DEFAULT_ORDER.filter((key) => members.has(key));
  let cursor = 0;
  return order.map((key) => (members.has(key) ? sorted[cursor++] : key));
}

function Elements({
  config,
  patch,
  s,
}: {
  config: OverlayConfig;
  patch: (next: Partial<OverlayConfig>) => void;
  s: Strings;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null);
  const off = new Set(config.off);
  const bare = new Set(config.bare);
  const caps = config.labels || config.meter;
  const secretsOnly = config.set === 'watch';
  const grouped = config.set === 'blind' && config.layout === 'classic';
  const all = config.order.filter((key) => !secretsOnly || isSecretKey(key));
  const groups: Array<{ title: string | null; keys: string[] }> = secretsOnly
    ? [{ title: null, keys: all }]
    : grouped
      ? [
          { title: s.counters, keys: all.filter((key) => !isSecretKey(key)) },
          { title: s.secrets, keys: all.filter(isSecretKey) },
        ]
      : [{ title: null, keys: all }];
  const shown = all.filter((key) => !off.has(key)).length;
  const listed = new Set(all);

  const toggle = (key: string) =>
    patch({ off: off.has(key) ? config.off.filter((item) => item !== key) : [...config.off, key] });

  const toggleCap = (key: string) =>
    patch({ bare: bare.has(key) ? config.bare.filter((item) => item !== key) : [...config.bare, key] });

  const sameGroup = (a: string, b: string) => !grouped || isSecretKey(a) === isSecretKey(b);

  const endDrag = () => {
    setDragging(null);
    setDrop(null);
  };

  const onDragOver = (event: DragEvent<HTMLLIElement>, key: string) => {
    if (!dragging || !sameGroup(dragging, key)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    if (drop?.key !== key || drop.after !== after) setDrop({ key, after });
  };

  const onDrop = (event: DragEvent<HTMLLIElement>, key: string) => {
    event.preventDefault();
    if (dragging && drop && sameGroup(dragging, key)) {
      patch({ order: moveKey(config.order, dragging, drop.key, drop.after) });
    }
    endDrag();
  };

  return (
    <Sheet title={s.elements} note={s.elementsNote(shown, all.length)}>
      <div className="el-tools">
        <button
          type="button"
          className="btn"
          disabled={shown === all.length}
          onClick={() => patch({ off: config.off.filter((key) => !listed.has(key)) })}
        >
          {s.showAll}
        </button>
        <button
          type="button"
          className="btn"
          disabled={shown === 0}
          onClick={() => patch({ off: [...config.off.filter((key) => !listed.has(key)), ...all] })}
        >
          {s.hideAll}
        </button>
        <button type="button" className="btn" onClick={() => patch({ order: resetSubset(config.order, all) })}>
          {s.resetOrder}
        </button>
      </div>
      {groups.map((group) => (
        <div className="el-group" key={group.title ?? 'all'}>
          {group.title ? <div className="el-title">{group.title}</div> : null}
          <ol className="el-list" data-cap={secretsOnly ? '0' : '1'}>
            {group.keys.map((key, index) => {
              const meta = itemMeta(key, s);
              const on = !off.has(key);
              const prev = group.keys[index - 1];
              const next = group.keys[index + 1];
              return (
                <li
                  key={key}
                  className="el"
                  data-on={on ? '1' : '0'}
                  data-dragging={dragging === key ? '1' : '0'}
                  data-drop={drop?.key === key && dragging !== key ? (drop.after ? 'after' : 'before') : undefined}
                  onDragOver={(event) => onDragOver(event, key)}
                  onDrop={(event) => onDrop(event, key)}
                >
                  <span
                    className="el-grip"
                    draggable
                    title={s.dragHint}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', key);
                      const row = event.currentTarget.parentElement;
                      if (row) event.dataTransfer.setDragImage(row, 16, row.offsetHeight / 2);
                      setDragging(key);
                    }}
                    onDragEnd={endDrag}
                  />
                  <label className="el-pick">
                    <input type="checkbox" checked={on} onChange={() => toggle(key)} />
                    <Sprite src={meta.icon} alt="" draggable={false} />
                    <span className="el-name">{meta.name}</span>
                    <span className="el-note">{meta.note}</span>
                  </label>
                  {isSecretKey(key) ? null : (
                    <button
                      type="button"
                      className="el-cap"
                      data-on={bare.has(key) ? '0' : '1'}
                      aria-pressed={!bare.has(key)}
                      title={caps ? s.capToggle : s.capToggleNone}
                      aria-label={s.capToggle}
                      disabled={!caps}
                      onClick={() => toggleCap(key)}
                    >
                      <i />
                    </button>
                  )}
                  <span className="el-move">
                    <button
                      type="button"
                      title={s.moveUp}
                      aria-label={s.moveUp}
                      disabled={!prev}
                      onClick={() => prev && patch({ order: moveKey(config.order, key, prev, false) })}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title={s.moveDown}
                      aria-label={s.moveDown}
                      disabled={!next}
                      onClick={() => next && patch({ order: moveKey(config.order, key, next, true) })}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </Sheet>
  );
}

const STAGE_PAD = 24;

function Preview({
  config,
  size,
  s,
}: {
  config: OverlayConfig;
  size: { width: number; height: number } | null;
  s: Strings;
}) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [pane, setPane] = useState<HTMLIFrameElement | null>(null);
  const [room, setRoom] = useState(0);

  useEffect(() => {
    if (!stage) return;
    const observer = new ResizeObserver(() => setRoom(stage.clientWidth));
    observer.observe(stage);
    setRoom(stage.clientWidth);
    return () => observer.disconnect();
  }, [stage]);

  const width = size ? size.width + STAGE_PAD * 2 : 0;
  const height = size ? Math.max(120, size.height + STAGE_PAD * 2) : 360;
  const fit = size && room > 0 ? Math.min(1, room / width) : 1;
  const frame = size
    ? { width, height, transform: fit < 1 ? `scale(${fit})` : undefined }
    : { width: '100%', height };

  useEffect(() => {
    pane?.contentWindow?.postMessage({ type: 'overlay-fit', fit }, '*');
  }, [pane, fit, size]);

  return (
    <Sheet title={s.preview} note={fit < 1 ? s.previewFit(Math.round(fit * 100)) : undefined}>
      <div className="stage" ref={setStage} style={{ height: Math.min(820, Math.ceil(height * fit)) }}>
        <iframe
          ref={setPane}
          title={s.overlayTitle}
          style={frame}
          src={`/overlay?${overlayQuery(config)}${API_PARAM ? `&${API_PARAM}` : ''}`}
        />
      </div>
    </Sheet>
  );
}

export function OverlaySetup({
  port,
  saved,
  onChange,
}: {
  port: number | null;
  saved: unknown;
  onChange: (config: OverlayConfig) => void;
}) {
  const { lang, s } = useLang();
  const [config, setConfig] = useState<OverlayConfig>(() => normalizeOverlay(saved, lang));
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [share, setShare] = useState<'copied' | 'applied' | 'invalid' | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hydrated = useRef(Boolean(saved));
  const dirty = useRef(false);
  const report = useRef(onChange);
  report.current = onChange;
  const latest = useRef(config);
  latest.current = config;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; width?: number; height?: number };
      if (data?.type === 'overlay-size' && data.width && data.height) {
        setSize({ width: data.width, height: data.height });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (hydrated.current || dirty.current || !saved) return;
    hydrated.current = true;
    setConfig(normalizeOverlay(saved, lang));
  }, [saved, lang]);

  useEffect(() => {
    if (!dirty.current) return;
    report.current(config);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      api.saveSettings({ overlay: config }).catch(() => undefined);
    }, 400);
  }, [config]);

  useEffect(() => {
    return () => {
      if (timer.current === undefined) return;
      window.clearTimeout(timer.current);
      api.saveSettings({ overlay: latest.current }).catch(() => undefined);
    };
  }, []);

  const base = port ? `http://127.0.0.1:${port}` : location.origin;
  const url = `${base}/overlay?${overlayQuery(config)}`;
  const patch = (next: Partial<OverlayConfig>) => {
    dirty.current = true;
    setConfig((current) => ({ ...current, ...next }));
  };
  const listed = config.set === 'blind' || config.set === 'watch';
  const tiles = config.set === 'blind' && config.layout === 'tiles';
  const ticks = sizeTicks(config.set);
  const clean = ticks.includes(config.size);

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => undefined);
  };

  const copyCode = () => {
    encodeOverlayCode(config)
      .then((text) => navigator.clipboard.writeText(text))
      .then(() => setShare('copied'))
      .catch(() => undefined);
  };

  const applyCode = () => {
    decodeOverlayCode(code, lang).then((next) => {
      if (!next) {
        setShare('invalid');
        return;
      }
      dirty.current = true;
      setConfig(next);
      setCode('');
      setShare('applied');
    });
  };

  const preview = <Preview config={config} size={size} s={s} />;

  return (
    <>
      <Sheet title={s.overlayLink} note={size ? `${size.width}×${size.height} px` : s.overlayLinkNote}>
        <div className="url-row">
          <code className="url">{url}</code>
          <button type="button" className="btn primary" onClick={copy}>
            {copied ? s.copied : s.copy}
          </button>
        </div>
      </Sheet>

      <Sheet title={s.shareTitle} note={s.shareNote}>
        <div className="share-row">
          <button type="button" className="btn" onClick={copyCode}>
            {share === 'copied' ? s.copied : s.copyCode}
          </button>
          <input
            type="text"
            value={code}
            placeholder={s.codePlaceholder}
            spellCheck={false}
            onChange={(event) => {
              setCode(event.target.value);
              setShare(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && code.trim()) applyCode();
            }}
          />
          <button type="button" className="btn" disabled={!code.trim()} onClick={applyCode}>
            {s.applyCode}
          </button>
        </div>
        {share === 'applied' || share === 'invalid' ? (
          <div className="share-state" data-state={share}>
            {share === 'applied' ? s.codeApplied : s.codeInvalid}
          </div>
        ) : null}
      </Sheet>

      <Sheet title={s.view}>
        <div className="picks">
          {OVERLAY_SETS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="pick"
              data-on={config.set === option.id ? '1' : '0'}
              onClick={() => patch({ set: option.id as OverlaySet })}
            >
              {s.overlaySets[option.label]}
            </button>
          ))}
        </div>

        <div className="knobs">
          <label className="knob">
            <span className="knob-head">
              {s.iconSize} <em data-clean={clean ? '1' : '0'}>{config.size}px</em>
            </span>
            <input
              type="range"
              min={16}
              max={96}
              step={2}
              list="icon-ticks"
              value={config.size}
              onChange={(event) => patch({ size: Number(event.target.value) })}
            />
            <datalist id="icon-ticks">
              {ticks.map((tick) => (
                <option key={tick} value={tick} />
              ))}
            </datalist>
            <span className="knob-note">{s.nativeSize(spriteSize(config.set))}</span>
          </label>
          {tiles ? null : (
            <label className="knob">
              <span className="knob-head">
                {s.columns} <em>{config.columns === 0 ? s.auto : config.columns}</em>
              </span>
              <input
                type="range"
                min={0}
                max={24}
                step={1}
                value={config.columns}
                onChange={(event) => patch({ columns: Number(event.target.value) })}
              />
            </label>
          )}
          <label className="knob">
            <span className="knob-head">
              {s.gap} <em>{config.gap}px</em>
            </span>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={config.gap}
              onChange={(event) => patch({ gap: Number(event.target.value) })}
            />
          </label>
          <label className="knob">
            <span className="knob-head">
              {s.scale} <em>{config.scale.toFixed(2)}</em>
            </span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={config.scale}
              onChange={(event) => patch({ scale: Number(event.target.value) })}
            />
          </label>
          <label className="knob">
            <span className="knob-head">
              {s.iconLimit} <em>{config.max === 0 ? s.none : config.max}</em>
            </span>
            <input
              type="range"
              min={0}
              max={120}
              step={5}
              value={config.max}
              onChange={(event) => patch({ max: Number(event.target.value) })}
            />
          </label>
          <SegKnob
            title={s.overlayLang}
            value={config.lang}
            options={LANGS}
            label={(option) => option.toUpperCase()}
            onChange={(option: Lang) => patch({ lang: option })}
          />
          <label className="knob switch">
            <input type="checkbox" checked={config.labels} onChange={(event) => patch({ labels: event.target.checked })} />
            {s.numbers}
          </label>
          <label className="knob switch">
            <input
              type="checkbox"
              checked={config.background}
              onChange={(event) => patch({ background: event.target.checked })}
            />
            {s.backdrop}
          </label>
        </div>
      </Sheet>

      {listed ? (
        <>
          <FineTune config={config} patch={patch} s={s} />
          <div className="overlay-split">
            <Elements config={config} patch={patch} s={s} />
            <div className="overlay-split-preview">{preview}</div>
          </div>
        </>
      ) : (
        preview
      )}
    </>
  );
}

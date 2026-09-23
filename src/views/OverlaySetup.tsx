import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';

import { API_PARAM } from '../api';
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
import {
  activate,
  activePreset,
  createPreset,
  duplicatePreset,
  editorConfig,
  movePreset,
  patchDraft,
  removePreset,
  renamePreset,
  revertDraft,
  saveDraft,
  setDraft,
  usePresets,
  type Preset,
  type PresetState,
} from '../presets';
import { Seg, SegKnob, Sheet, Void } from '../ui';

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

type LinkMode = 'live' | 'preset' | 'snapshot';

const LINK_MODES: LinkMode[] = ['live', 'preset', 'snapshot'];

function LinkPicker({ base, preset, config, s }: { base: string; preset: Preset; config: OverlayConfig; s: Strings }) {
  const [mode, setMode] = useState<LinkMode>('live');
  const [copied, setCopied] = useState(false);
  const url =
    mode === 'live'
      ? `${base}/overlay?live=1`
      : mode === 'preset'
        ? `${base}/overlay?preset=${encodeURIComponent(preset.id)}`
        : `${base}/overlay?${overlayQuery(config)}`;
  const hint = mode === 'live' ? s.linkHints.live : mode === 'preset' ? s.linkHints.preset(preset.name) : s.linkHints.snapshot;

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => undefined);
  };

  return (
    <>
      <div className="link-row">
        <Seg
          value={mode}
          options={LINK_MODES}
          label={(option) => s.linkModes[option]}
          onChange={(option) => {
            setMode(option);
            setCopied(false);
          }}
        />
        <code className="url" title={url}>
          {url}
        </code>
        <button type="button" className="btn primary" onClick={copy}>
          {copied ? s.copied : s.copy}
        </button>
      </div>
      <div className="link-hint">{hint}</div>
    </>
  );
}

function PresetBar({ state, s }: { state: PresetState; s: Strings }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [asking, setAsking] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null);
  const current = activePreset(state);

  const startRename = (preset: Preset | null | undefined) => {
    if (!preset) return;
    setAsking(false);
    setRenaming(preset.id);
    setName(preset.name);
  };

  const finishRename = () => {
    if (renaming) renamePreset(renaming, name);
    setRenaming(null);
  };

  const endDrag = () => {
    setDragging(null);
    setDrop(null);
  };

  const onDragOver = (event: DragEvent<HTMLLIElement>, key: string) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    if (drop?.key !== key || drop.after !== after) setDrop({ key, after });
  };

  const onDrop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    if (dragging && drop) movePreset(dragging, drop.key, drop.after);
    endDrag();
  };

  const dirty = Boolean(current?.draft);

  return (
    <Sheet title={s.presets} note={s.presetsNote}>
      <div className="presets">
        <ol className="preset-list">
          {state.presets.map((preset) => (
            <li
              key={preset.id}
              className="preset"
              data-on={preset.id === current?.id ? '1' : '0'}
              data-dragging={dragging === preset.id ? '1' : '0'}
              data-drop={drop?.key === preset.id && dragging !== preset.id ? (drop.after ? 'after' : 'before') : undefined}
              onDragOver={(event) => onDragOver(event, preset.id)}
              onDrop={onDrop}
            >
              {renaming === preset.id ? (
                <input
                  type="text"
                  className="preset-input"
                  value={name}
                  maxLength={40}
                  aria-label={s.presetName}
                  spellCheck={false}
                  autoFocus
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') finishRename();
                    if (event.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  draggable
                  title={s.dragHint}
                  onClick={() => activate(preset.id)}
                  onDoubleClick={() => startRename(preset)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', preset.id);
                    setDragging(preset.id);
                  }}
                  onDragEnd={endDrag}
                >
                  <span>{preset.name}</span>
                  {preset.draft ? <i className="preset-dot" title={s.draftMark} aria-label={s.draftMark} /> : null}
                </button>
              )}
            </li>
          ))}
        </ol>
        <div className="preset-tools">
          {asking && current ? (
            <>
              <span className="preset-ask">{s.deleteAsk(current.name)}</span>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  removePreset(current.id);
                  setAsking(false);
                }}
              >
                {s.deleteYes}
              </button>
              <button type="button" className="btn" onClick={() => setAsking(false)}>
                {s.deleteNo}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => startRename(createPreset())}>
                {s.newPreset}
              </button>
              <button type="button" className="btn" onClick={() => startRename(duplicatePreset())}>
                {s.duplicatePreset}
              </button>
              <button type="button" className="btn" onClick={() => startRename(current)}>
                {s.renamePreset}
              </button>
              <button type="button" className="btn" disabled={state.presets.length < 2} onClick={() => setAsking(true)}>
                {s.deletePreset}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="draft-row" data-dirty={dirty ? '1' : '0'}>
        <span>{dirty ? s.draftDirty : s.draftClean}</span>
        <button type="button" className="btn primary" disabled={!dirty} onClick={saveDraft}>
          {s.saveDraft}
        </button>
        <button type="button" className="btn" disabled={!dirty} onClick={revertDraft}>
          {s.revertDraft}
        </button>
      </div>
    </Sheet>
  );
}

export function OverlaySetup({ port }: { port: number | null }) {
  const { lang, s } = useLang();
  const presets = usePresets();
  const current = activePreset(presets);
  const [code, setCode] = useState('');
  const [share, setShare] = useState<'copied' | 'applied' | 'invalid' | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

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

  useEffect(() => setShare(null), [presets.active]);

  if (!current) return <Void>{s.reading}</Void>;

  const config = editorConfig(current);
  const base = port ? `http://127.0.0.1:${port}` : location.origin;
  const patch = patchDraft;
  const listed = config.set === 'blind' || config.set === 'watch';
  const tiles = config.set === 'blind' && config.layout === 'tiles';
  const ticks = sizeTicks(config.set);
  const clean = ticks.includes(config.size);

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
      setDraft(next);
      setCode('');
      setShare('applied');
    });
  };

  const preview = <Preview config={config} size={size} s={s} />;

  return (
    <>
      <PresetBar state={presets} s={s} />

      <Sheet title={s.overlayLink} note={size ? `${size.width}×${size.height} px` : s.overlayLinkNote}>
        <LinkPicker base={base} preset={current} config={config} s={s} />
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
          {config.set === 'locked' ? (
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
          ) : null}
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

import { useEffect, useRef, useState } from 'react';

import { api, API_PARAM } from '../api';
import { LANGS, useLang, type Lang } from '../i18n';
import { DEFAULT_OVERLAY, OVERLAY_SETS, overlayQuery, type OverlayConfig, type OverlaySet } from '../overlay-config';
import { Sheet } from '../ui';

export function OverlaySetup({ port, saved }: { port: number | null; saved: OverlayConfig | null }) {
  const { lang, s } = useLang();
  const [config, setConfig] = useState<OverlayConfig>(saved ?? { ...DEFAULT_OVERLAY, lang });
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

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
    if (saved) setConfig({ ...saved, lang: saved.lang ?? lang });
  }, [saved, lang]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.saveSettings({ overlay: config }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer.current);
  }, [config]);

  const base = port ? `http://127.0.0.1:${port}` : location.origin;
  const url = `${base}/overlay?${overlayQuery(config)}`;
  const patch = (next: Partial<OverlayConfig>) => setConfig((current) => ({ ...current, ...next }));

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
      <Sheet title={s.overlayLink} note={size ? `${size.width}×${size.height} px` : s.overlayLinkNote}>
        <div className="url-row">
          <code className="url">{url}</code>
          <button type="button" className="btn primary" onClick={copy}>
            {copied ? s.copied : s.copy}
          </button>
        </div>
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
              {s.iconSize} <em>{config.size}px</em>
            </span>
            <input
              type="range"
              min={16}
              max={96}
              step={2}
              value={config.size}
              onChange={(event) => patch({ size: Number(event.target.value) })}
            />
          </label>
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
          <div className="knob">
            <span className="knob-head">{s.overlayLang}</span>
            <div className="seg">
              {LANGS.map((option) => (
                <button
                  key={option}
                  type="button"
                  data-on={config.lang === option ? '1' : '0'}
                  onClick={() => patch({ lang: option as Lang })}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
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

      <Sheet title={s.preview}>
        <div className="stage">
          <iframe
            title={s.overlayTitle}
            style={{ height: size ? Math.min(820, Math.max(140, size.height + 48)) : 360 }}
            src={`/overlay?${overlayQuery(config)}${API_PARAM ? `&${API_PARAM}` : ''}`}
          />
        </div>
      </Sheet>
    </>
  );
}

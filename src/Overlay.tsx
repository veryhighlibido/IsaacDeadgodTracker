import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { MARK_BOSSES } from './core/domain';
import { sprite } from './data';
import { currentLang, langFromParams, strings, type Strings } from './i18n';
import { MARK_IMAGE } from './labels';
import { useLive } from './live';
import { achievementName, characterName, derive, type Derived } from './model';
import { isSecretKey, parseOverlayParams, type OverlayConfig } from './overlay-config';
import { itemMeta, itemState } from './overlay-items';
import { Meter } from './ui';

function Sprites({ ids, config }: { ids: number[]; config: OverlayConfig }) {
  return (
    <div className="ov-cells" style={cellColumns(config, ids.length)}>
      {ids.map((id) => (
        <div className="cell" key={id} data-on="1">
          <img src={sprite.achievement(id)} alt="" draggable={false} title={achievementName(id)} />
        </div>
      ))}
    </div>
  );
}

function Tile({ itemKey, derived, config, s, fresh }: TileProps) {
  const meta = itemMeta(itemKey, s);
  const state = itemState(itemKey, derived);
  const counter = state.goal !== undefined;
  return (
    <div className={fresh ? 'ov-tile fresh' : 'ov-tile'} data-done={state.done ? '1' : '0'}>
      <span className="ov-icon">
        <img src={meta.icon} alt="" draggable={false} title={meta.name} />
        {state.done && config.done === 'check' ? (
          <img className="ov-check" src={sprite.ui('check')} alt="" draggable={false} />
        ) : null}
      </span>
      {counter && (config.labels || config.meter) ? (
        <span className="ov-cap">
          {config.labels ? (
            <span className="ov-num">
              <b>{state.value}</b>
              <i>/{state.goal}</i>
            </span>
          ) : null}
          {config.meter ? <Meter value={state.value ?? 0} goal={state.goal ?? 0} /> : null}
        </span>
      ) : null}
    </div>
  );
}

interface TileProps {
  itemKey: string;
  derived: Derived;
  config: OverlayConfig;
  s: Strings;
  fresh?: boolean;
}

function Tiles({
  keys,
  derived,
  config,
  s,
  fresh,
  className,
  style,
}: {
  keys: string[];
  derived: Derived;
  config: OverlayConfig;
  s: Strings;
  fresh: Set<number>;
  className: string;
  style?: CSSProperties;
}) {
  if (keys.length === 0) return null;
  return (
    <div className={className} style={style}>
      {keys.map((key) => (
        <Tile
          key={key}
          itemKey={key}
          derived={derived}
          config={config}
          s={s}
          fresh={isSecretKey(key) && fresh.has(Number(key.slice(1)))}
        />
      ))}
    </div>
  );
}

function visibleKeys(config: OverlayConfig, derived: Derived, secretsOnly: boolean): string[] {
  const off = new Set(config.off);
  return config.order.filter(
    (key) =>
      !off.has(key) &&
      (!secretsOnly || isSecretKey(key)) &&
      (config.done !== 'hide' || !itemState(key, derived).done),
  );
}

function cellColumns(config: OverlayConfig, count: number): CSSProperties {
  const columns = config.columns > 0 ? config.columns : Math.max(1, Math.min(count, 10));
  return { gridTemplateColumns: `repeat(${columns}, var(--tile))` };
}

function Blind({ derived, config, s, fresh }: { derived: Derived; config: OverlayConfig; s: Strings; fresh: Set<number> }) {
  const keys = visibleKeys(config, derived, false);
  if (config.layout === 'tiles') {
    const rows = Math.max(1, Math.min(config.rows, keys.length));
    return (
      <Tiles
        keys={keys}
        derived={derived}
        config={config}
        s={s}
        fresh={fresh}
        className="ov-grid"
        style={{ gridTemplateRows: `repeat(${rows}, auto)` }}
      />
    );
  }
  const counters = keys.filter((key) => !isSecretKey(key));
  const secrets = keys.filter(isSecretKey);
  return (
    <>
      <Tiles keys={counters} derived={derived} config={config} s={s} fresh={fresh} className="ov-counters" />
      <Tiles
        keys={secrets}
        derived={derived}
        config={config}
        s={s}
        fresh={fresh}
        className="ov-cells"
        style={cellColumns(config, secrets.length)}
      />
    </>
  );
}

function Score({ derived, s }: { derived: Derived; s: Strings }) {
  return (
    <div>
      <div className="ov-score">
        <span className="now">{derived.deadGod.done}</span>
        <span className="of">/{derived.deadGod.total}</span>
      </div>
      <div className="ov-sub">
        {s.overlaySub(
          `${derived.marksHard.done}/${derived.marksHard.total}`,
          `${derived.challenges.done}/${derived.challenges.total}`,
        )}
      </div>
    </div>
  );
}

function MarksBlock({ derived, config }: { derived: Derived; config: OverlayConfig }) {
  return (
    <table className="ov-matrix" style={{ '--tile': `${config.size}px` } as CSSProperties}>
      <tbody>
        {derived.marks.map((row, characterId) => (
          <tr key={characterId}>
            <th>
              <img src={sprite.character(characterName(characterId))} alt="" />
            </th>
            {row.map((cell) => (
              <td key={cell.boss} data-level={cell.offline}>
                {cell.offline > 0 ? (
                  <img src={sprite.mark(MARK_IMAGE[cell.boss], cell.offline === 2 ? 'hard' : 'normal')} alt="" />
                ) : (
                  <span className="void" />
                )}
              </td>
            ))}
          </tr>
        ))}
        <tr className="ov-matrix-foot">
          <th />
          {MARK_BOSSES.map((boss) => (
            <td key={boss}>
              <img src={sprite.mark(MARK_IMAGE[boss], 'hard')} alt="" />
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function useReportSize(node: HTMLDivElement | null) {
  useEffect(() => {
    if (!node || window.parent === window) return;
    const report = () => {
      const rect = node.getBoundingClientRect();
      window.parent.postMessage(
        { type: 'overlay-size', width: Math.ceil(rect.width), height: Math.ceil(rect.height) },
        '*',
      );
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    const timer = window.setInterval(report, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [node]);
}

export function Overlay() {
  const live = useLive();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const config = useMemo(() => parseOverlayParams(location.search, langFromParams(location.search, currentLang())), []);
  const s = strings(config.lang);
  const derived = useMemo(() => (live.parsed ? derive(live.parsed.save) : null), [live.parsed]);

  const fresh = useMemo(() => {
    const edge = Date.now() - 8000;
    return new Set(live.events.filter((e) => e.kind === 'achievement' && e.at >= edge).map((e) => e.index));
  }, [live.events]);

  useEffect(() => {
    document.documentElement.dataset.surface = 'overlay';
    document.documentElement.lang = config.lang;
  }, [config.lang]);

  useReportSize(root);

  const style = {
    '--tile': `${config.size}px`,
    '--gap': `${config.gap}px`,
    zoom: config.scale === 1 ? undefined : config.scale,
  } as CSSProperties;

  const look = {
    'data-bg': config.background ? '1' : '0',
    'data-layout': config.set === 'blind' ? config.layout : 'classic',
    'data-cap': config.caption,
    'data-font': config.font,
    'data-look-locked': config.locked,
    'data-look-done': config.done,
  };

  if (!derived) {
    return (
      <div className="overlay" {...look} style={style} ref={setRoot}>
        <div className="ov-line">{live.connection === 'online' ? s.overlayNoFile : s.noService}</div>
      </div>
    );
  }

  const watchKeys = visibleKeys(config, derived, true);
  const lockedIds = config.max > 0 ? derived.lockedAchievements.slice(0, config.max) : derived.lockedAchievements;

  return (
    <div className="overlay" {...look} style={style} ref={setRoot}>
      {config.set === 'blind' && <Blind derived={derived} config={config} s={s} fresh={fresh} />}
      {config.set === 'watch' && (
        <Tiles
          keys={watchKeys}
          derived={derived}
          config={config}
          s={s}
          fresh={fresh}
          className="ov-cells"
          style={cellColumns(config, watchKeys.length)}
        />
      )}
      {config.set === 'locked' && (
        <>
          {config.labels ? (
            <div className="ov-line">
              {s.left} <b>{derived.lockedAchievements.length}</b>
            </div>
          ) : null}
          <Sprites ids={lockedIds} config={config} />
        </>
      )}
      {config.set === 'progress' && <Score derived={derived} s={s} />}
      {config.set === 'marks' && <MarksBlock derived={derived} config={config} />}
    </div>
  );
}

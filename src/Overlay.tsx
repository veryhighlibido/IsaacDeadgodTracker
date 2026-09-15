import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { MARK_BOSSES } from './core/domain';
import { sprite } from './data';
import { currentLang, langFromParams, strings, type Strings } from './i18n';
import { MARK_IMAGE } from './labels';
import { useLive } from './live';
import { achievementName, characterName, derive, type Derived } from './model';
import { parseOverlayParams, type OverlayConfig } from './overlay-config';
import { Meter } from './ui';

function Sprites({
  ids,
  on,
  config,
  fresh,
}: {
  ids: number[];
  on: (id: number) => boolean;
  config: OverlayConfig;
  fresh?: Set<number>;
}) {
  const columns = config.columns > 0 ? config.columns : Math.max(1, Math.min(ids.length, 10));
  const style = {
    gridTemplateColumns: `repeat(${columns}, var(--tile))`,
  } as CSSProperties;
  return (
    <div className="ov-cells" style={style}>
      {ids.map((id) => (
        <div className={fresh?.has(id) ? 'cell fresh' : 'cell'} key={id} data-on={on(id) ? '1' : '0'}>
          <img src={sprite.achievement(id)} alt="" draggable={false} title={achievementName(id)} />
        </div>
      ))}
    </div>
  );
}

function Counters({ derived, config }: { derived: Derived; config: OverlayConfig }) {
  return (
    <div className="ov-counters">
      {derived.counterGoals.map((goal) => {
        const done = goal.unlocked || goal.value >= goal.goal;
        return (
          <div className="ov-counter" key={goal.achievementId} data-done={done ? '1' : '0'}>
            <img src={sprite.achievement(goal.achievementId)} alt="" title={achievementName(goal.achievementId)} />
            {config.labels ? (
              <span>
                <b>{Math.min(goal.value, goal.goal)}</b>
                <i>/{goal.goal}</i>
              </span>
            ) : null}
            <Meter value={Math.min(goal.value, goal.goal)} goal={goal.goal} />
          </div>
        );
      })}
    </div>
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

  if (!derived) {
    return (
      <div className="overlay" data-bg={config.background ? '1' : '0'} style={style} ref={setRoot}>
        <div className="ov-line">{live.connection === 'online' ? s.overlayNoFile : s.noService}</div>
      </div>
    );
  }

  const watched = derived.watched.map((item) => item.id);
  const unlocked = new Set(derived.watched.filter((item) => item.unlocked).map((item) => item.id));
  const lockedIds = config.max > 0 ? derived.lockedAchievements.slice(0, config.max) : derived.lockedAchievements;

  return (
    <div className="overlay" data-bg={config.background ? '1' : '0'} style={style} ref={setRoot}>
      {config.set === 'blind' && (
        <>
          <Counters derived={derived} config={config} />
          <Sprites ids={watched} on={(id) => unlocked.has(id)} config={config} fresh={fresh} />
        </>
      )}
      {config.set === 'watch' && (
        <Sprites ids={watched} on={(id) => unlocked.has(id)} config={config} fresh={fresh} />
      )}
      {config.set === 'locked' && (
        <>
          {config.labels ? (
            <div className="ov-line">
              {s.left} <b>{derived.lockedAchievements.length}</b>
            </div>
          ) : null}
          <Sprites ids={lockedIds} on={() => true} config={config} />
        </>
      )}
      {config.set === 'progress' && <Score derived={derived} s={s} />}
      {config.set === 'marks' && <MarksBlock derived={derived} config={config} />}
    </div>
  );
}

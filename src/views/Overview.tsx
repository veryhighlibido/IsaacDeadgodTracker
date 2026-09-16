import { useMemo } from 'react';

import { MARK_BOSSES, MARK_MATRIX } from '../core/domain';
import { ITEM_BY_ID, sprite } from '../data';
import { useLang, type Strings } from '../i18n';
import { MARK_IMAGE } from '../labels';
import type { LiveState } from '../live';
import { achievementName, challengeName, characterName, type Derived } from '../model';
import { Sprite } from '../sprite';
import { Cell, Cells, Row, Rows, Sheet } from '../ui';

const FRESH_MS = 8000;

function logLine(kind: string, index: number, s: Strings): { name: string; icon?: string; kind?: string } {
  if (kind === 'achievement') return { name: achievementName(index), icon: sprite.achievement(index) };
  if (kind === 'challenge') return { name: challengeName(index), kind: s.kinds.challenge };
  if (kind === 'item') return { name: ITEM_BY_ID.get(index)?.name ?? `#${index}`, icon: sprite.item(index), kind: s.kinds.item };
  for (let characterId = 0; characterId < MARK_MATRIX.length; characterId++) {
    const bossIndex = MARK_MATRIX[characterId].indexOf(index);
    if (bossIndex >= 0) {
      const boss = MARK_BOSSES[bossIndex];
      return {
        name: `${characterName(characterId)} · ${MARK_IMAGE[boss]}`,
        icon: sprite.mark(MARK_IMAGE[boss], 'hard'),
        kind: s.kinds.mark,
      };
    }
  }
  return { name: s.counterN(index) };
}

export function Overview({ live, derived }: { live: LiveState; derived: Derived }) {
  const { s } = useLang();
  const fresh = useMemo(() => {
    const edge = Date.now() - FRESH_MS;
    return new Set(live.events.filter((e) => e.kind === 'achievement' && e.at >= edge).map((e) => e.index));
  }, [live.events]);

  const rest = (done: number, total: number) => (done >= total ? '—' : `−${total - done}`);

  return (
    <>
      <Sheet title={s.remaining}>
        <Rows>
          <Row
            label={s.secrets}
            value={derived.deadGod.done}
            total={derived.deadGod.total}
            rest={rest(derived.deadGod.done, derived.deadGod.total)}
          />
          <Row
            label={s.marksHard}
            value={derived.marksHard.done}
            total={derived.marksHard.total}
            rest={rest(derived.marksHard.done, derived.marksHard.total)}
          />
          <Row
            label={s.marksAny}
            value={derived.marksAny.done}
            total={derived.marksAny.total}
            rest={rest(derived.marksAny.done, derived.marksAny.total)}
          />
          <Row
            label={s.challenges}
            value={derived.challenges.done}
            total={derived.challenges.total}
            rest={rest(derived.challenges.done, derived.challenges.total)}
          />
          <Row
            label={s.items}
            value={derived.items.done}
            total={derived.items.total}
            rest={rest(derived.items.done, derived.items.total)}
          />
          <Row label={s.extras} value={derived.extras.done} total={derived.extras.total} rest="—" />
        </Rows>
      </Sheet>

      <Sheet title={s.counters}>
        <Rows>
          {derived.counterGoals.map((goal) => (
            <Row
              key={goal.achievementId}
              label={
                <span className="row-sprite">
                  <Sprite src={sprite.achievement(goal.achievementId)} alt="" />
                  <b>{achievementName(goal.achievementId)}</b>
                  <i>{s.counterGoals[goal.title]}</i>
                </span>
              }
              value={Math.min(goal.value, goal.goal)}
              total={goal.goal}
              done={goal.unlocked || goal.value >= goal.goal}
              rest={goal.unlocked || goal.value >= goal.goal ? '—' : `−${goal.goal - goal.value}`}
            />
          ))}
        </Rows>
      </Sheet>

      <Sheet title={s.watched} note={`${derived.watched.filter((w) => w.unlocked).length}/${derived.watched.length}`}>
        <Cells size={40}>
          {derived.watched.map((item) => (
            <Cell
              key={item.id}
              src={sprite.achievement(item.id)}
              title={achievementName(item.id)}
              on={item.unlocked}
              fresh={fresh.has(item.id)}
            />
          ))}
        </Cells>
      </Sheet>

      {live.events.length > 0 ? (
        <Sheet title={s.unlockLog} note={String(live.events.length)}>
          <ul className="log">
            {live.events.slice(0, 40).map((event, index) => {
              const line = logLine(event.kind, event.index, s);
              const isFresh = event.kind === 'achievement' && fresh.has(event.index);
              return (
                <li key={`${event.kind}-${event.index}-${index}`} className={isFresh ? 'fresh' : undefined}>
                  <time>
                    {new Date(event.at).toLocaleTimeString(s.locale, { hour: '2-digit', minute: '2-digit' })}
                  </time>
                  {line.icon ? <Sprite src={line.icon} alt="" /> : <span />}
                  <span className="log-name">
                    {line.name}
                    {line.kind ? <span className="log-kind"> · {line.kind}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Sheet>
      ) : null}
    </>
  );
}

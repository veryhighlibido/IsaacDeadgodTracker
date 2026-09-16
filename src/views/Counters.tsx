import type { SaveData } from '../core/format';
import { sprite } from '../data';
import { useLang } from '../i18n';
import { achievementName, ROUTE_COUNTERS, type Derived } from '../model';
import { Sprite } from '../sprite';
import { Row, Rows, Sheet } from '../ui';

export function Counters({ save, derived }: { save: SaveData; derived: Derived }) {
  const { s } = useLang();
  return (
    <>
      <Sheet title={s.thresholds}>
        <Rows>
          {derived.counterGoals.map((goal) => {
            const done = goal.unlocked || goal.value >= goal.goal;
            return (
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
                done={done}
                rest={done ? '—' : `−${goal.goal - goal.value}`}
              />
            );
          })}
        </Rows>
      </Sheet>

      <Sheet title={s.statistics}>
        <div className="stats">
          {ROUTE_COUNTERS.map((counter) => (
            <div className="stat" key={counter.index}>
              <span className="stat-label">{s.routeCounters[counter.title]}</span>
              <span className="stat-value">{save.counters[counter.index] ?? 0}</span>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}

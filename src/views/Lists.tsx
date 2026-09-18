import { useMemo, useState } from 'react';

import type { SaveData } from '../core/format';
import { ACHIEVEMENTS, CHALLENGES, ITEMS, sprite } from '../data';
import { useLang, type Strings } from '../i18n';
import type { LiveState } from '../live';
import { DEAD_GOD_LAST_REQUIRED, type Derived } from '../model';
import { Cell, Cells, Sheet, Void } from '../ui';

type Filter = 'locked' | 'all' | 'unlocked';

const FILTERS: Filter[] = ['locked', 'all', 'unlocked'];

function Bar({
  filter,
  onFilter,
  query,
  onQuery,
  right,
  s,
}: {
  filter: Filter;
  onFilter: (value: Filter) => void;
  query: string;
  onQuery: (value: string) => void;
  right: string;
  s: Strings;
}) {
  return (
    <div className="toolbar">
      <div className="seg">
        {FILTERS.map((option) => (
          <button key={option} type="button" data-on={filter === option ? '1' : '0'} onClick={() => onFilter(option)}>
            {s.filters[option]}
          </button>
        ))}
      </div>
      <input type="search" value={query} placeholder={s.search} onChange={(event) => onQuery(event.target.value)} />
      <div className="toolbar-right">{right}</div>
    </div>
  );
}

export function Achievements({ save, live }: { save: SaveData; live: LiveState }) {
  const { s } = useLang();
  const [filter, setFilter] = useState<Filter>('locked');
  const [query, setQuery] = useState('');

  const fresh = useMemo(() => {
    const edge = Date.now() - 8000;
    return new Set(live.events.filter((e) => e.kind === 'achievement' && e.at >= edge).map((e) => e.index));
  }, [live.events]);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ACHIEVEMENTS.filter((achievement) => {
      const unlocked = save.achievements[achievement.id] === 1;
      if (filter === 'locked' && unlocked) return false;
      if (filter === 'unlocked' && !unlocked) return false;
      if (needle && !achievement.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [save, filter, query]);

  const required = list.filter((achievement) => achievement.id <= DEAD_GOD_LAST_REQUIRED).length;

  return (
    <>
      <Bar
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        right={`${list.length} · ${s.countsToward(required)}`}
        s={s}
      />
      <Sheet title={s.secrets}>
        {list.length === 0 ? (
          <Void>{s.empty}</Void>
        ) : (
          <Cells size={44}>
            {list.map((achievement) => (
              <Cell
                key={achievement.id}
                src={sprite.achievement(achievement.id)}
                title={`${achievement.name} · ${achievement.id}`}
                on={save.achievements[achievement.id] === 1}
                fresh={fresh.has(achievement.id)}
              />
            ))}
          </Cells>
        )}
      </Sheet>
    </>
  );
}

export function Challenges({ save, derived }: { save: SaveData; derived: Derived }) {
  const { s } = useLang();
  const [filter, setFilter] = useState<Filter>('locked');
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CHALLENGES.filter((challenge) => {
      const done = save.challenges[challenge.id] === 1;
      if (filter === 'locked' && done) return false;
      if (filter === 'unlocked' && !done) return false;
      if (needle && !challenge.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [save, filter, query]);

  return (
    <>
      <Bar
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        right={`${derived.challenges.done}/${derived.challenges.total}`}
        s={s}
      />
      <Sheet title={s.challenges}>
        {list.length === 0 ? (
          <Void>{s.empty}</Void>
        ) : (
          <div className={filter === 'all' ? 'rows list' : 'rows list bare'}>
            {list.map((challenge) => {
              const done = save.challenges[challenge.id] === 1;
              return (
                <div className="row" key={challenge.id} data-done={done ? '1' : '0'}>
                  <div className="row-key">{challenge.id}</div>
                  <div className="row-name">{challenge.name}</div>
                  {filter === 'all' ? (
                    <div className="row-mark">
                      <span className="tick" data-on={done ? '1' : '0'} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}

export function Items({ save, derived }: { save: SaveData; derived: Derived }) {
  const { s } = useLang();
  const [filter, setFilter] = useState<Filter>('locked');
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ITEMS.filter((item) => {
      const seen = save.collectibles[item.id] === 1;
      if (filter === 'locked' && seen) return false;
      if (filter === 'unlocked' && !seen) return false;
      if (needle && !item.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [save, filter, query]);

  return (
    <>
      <Bar
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        right={`${derived.items.done}/${derived.items.total}`}
        s={s}
      />
      <Sheet title={s.items}>
        {list.length === 0 ? (
          <Void>{s.empty}</Void>
        ) : (
          <Cells size={40}>
            {list.map((item) => (
              <Cell
                key={item.id}
                src={sprite.item(item.id)}
                title={`${item.name} · ${item.id}`}
                on={save.collectibles[item.id] === 1}
              />
            ))}
          </Cells>
        )}
        <div className="hidden-items">
          <p>{s.hiddenItemsNote}</p>
          <ul>
            {derived.hiddenItems.map((item) => (
              <li key={item.id} data-on={item.seen ? '1' : '0'}>
                <b>{item.id}</b>
                <span>{s.hiddenItems[item.title]}</span>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}

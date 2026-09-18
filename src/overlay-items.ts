import { ACHIEVEMENTS, sprite } from './data';
import type { Strings } from './i18n';
import { achievementName, COUNTER_GOALS, ITEMS_TOTAL, type Derived } from './model';

export interface ItemMeta {
  icon: string;
  name: string;
  note: string;
  secret: boolean;
}

export interface ItemState {
  done: boolean;
  value?: number;
  goal?: number;
}

const GOAL_BY_KEY = new Map(COUNTER_GOALS.map((goal) => [`c${goal.achievementId}`, goal]));

function idOf(key: string): number {
  return Number(key.slice(1));
}

export function itemMeta(key: string, s: Strings): ItemMeta {
  if (key === 'ach') {
    return { icon: sprite.ui('trophy'), name: s.totals.ach, note: s.goalOf(ACHIEVEMENTS.length), secret: false };
  }
  if (key === 'items') {
    return { icon: sprite.ui('breakfast'), name: s.totals.items, note: s.goalOf(ITEMS_TOTAL), secret: false };
  }
  const goal = GOAL_BY_KEY.get(key);
  if (goal) {
    return {
      icon: sprite.achievement(goal.achievementId),
      name: achievementName(goal.achievementId),
      note: `${s.counterGoals[goal.title]} · ${s.goalOf(goal.goal)}`,
      secret: false,
    };
  }
  const id = idOf(key);
  return { icon: sprite.achievement(id), name: achievementName(id), note: s.secretKind, secret: true };
}

export function itemState(key: string, derived: Derived): ItemState {
  if (key === 'ach' || key === 'items') {
    const progress = key === 'ach' ? derived.achievements : derived.items;
    return { done: progress.done >= progress.total, value: progress.done, goal: progress.total };
  }
  const goal = derived.counterGoals.find((item) => `c${item.achievementId}` === key);
  if (goal) {
    return {
      done: goal.unlocked || goal.value >= goal.goal,
      value: Math.min(goal.value, goal.goal),
      goal: goal.goal,
    };
  }
  const id = idOf(key);
  const tracked = derived.watched.find((item) => item.id === id) ?? derived.optional.find((item) => item.id === id);
  return { done: tracked?.unlocked ?? false };
}

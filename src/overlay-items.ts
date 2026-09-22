import { sprite } from './data';
import type { Strings } from './i18n';
import { achievementName, ACHIEVEMENT_GOAL, COUNTER_GOALS, DEAD_GOD_ID, ITEMS_TOTAL, MARK_TOTAL, type Derived } from './model';

const DEATH_CERTIFICATE_ID = 636;

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
    return { icon: sprite.achievement(DEAD_GOD_ID), name: s.totals.ach, note: s.goalOf(ACHIEVEMENT_GOAL), secret: false };
  }
  if (key === 'hard') {
    return {
      icon: sprite.achievement(DEATH_CERTIFICATE_ID),
      name: achievementName(DEATH_CERTIFICATE_ID),
      note: `${s.totals.hard} · ${s.goalOf(MARK_TOTAL)}`,
      secret: false,
    };
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
  if (key === 'ach' || key === 'items' || key === 'hard') {
    const progress = key === 'ach' ? derived.deadGod : key === 'items' ? derived.items : derived.marksHard;
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

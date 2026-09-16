import { decodeMark, MARK_BOSSES, MARK_MATRIX, type MarkBoss } from './core/domain';
import type { SaveData } from './core/format';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, CHALLENGES, CHARACTERS, ITEMS } from './data';
import type { Strings } from './i18n';

export const DEAD_GOD_ID = 637;
export const DEAD_GOD_LAST_REQUIRED = 636;
export const EXTRA_ACHIEVEMENTS = [638, 639, 640, 641];

export interface CounterGoal {
  achievementId: number;
  counterIndex: number;
  goal: number;
  title: keyof Strings['counterGoals'];
}

export const COUNTER_GOALS: CounterGoal[] = [
  { achievementId: 64, counterIndex: 14, goal: 100, title: 'thimble' },
  { achievementId: 354, counterIndex: 192, goal: 7, title: 'dailyStreak' },
  { achievementId: 382, counterIndex: 201, goal: 5, title: 'rubberCement' },
  { achievementId: 385, counterIndex: 202, goal: 10, title: 'beds' },
  { achievementId: 523, counterIndex: 495, goal: 5, title: 'batteryBum' },
];

export const WATCHED_ACHIEVEMENTS = [23, 24, 25, 19, 27, 82, 258, 324, 337, 361, 366, 378, 384, 386, 406];

export const ROUTE_COUNTERS: Array<{ index: number; title: keyof Strings['routeCounters'] }> = [
  { index: 20, title: 'donation' },
  { index: 115, title: 'greedDonation' },
  { index: 190, title: 'dailies' },
  { index: 192, title: 'dailyStreak' },
  { index: 14, title: 'thimble' },
  { index: 202, title: 'beds' },
  { index: 17, title: 'bloodDonor' },
  { index: 9, title: 'arcades' },
  { index: 111, title: 'bossRush' },
  { index: 16, title: 'devilDeals' },
  { index: 15, title: 'angelDeals' },
  { index: 494, title: 'batteryBum' },
];

export interface Progress {
  done: number;
  total: number;
}

export interface MarkCell {
  characterId: number;
  boss: MarkBoss;
  offline: number;
}

export interface Derived {
  deadGod: Progress;
  achievements: Progress;
  extras: Progress;
  challenges: Progress;
  items: Progress;
  marksHard: Progress;
  marksAny: Progress;
  lockedAchievements: number[];
  lockedChallenges: number[];
  counterGoals: Array<CounterGoal & { value: number; unlocked: boolean }>;
  watched: Array<{ id: number; unlocked: boolean }>;
  marks: MarkCell[][];
  isDeadGod: boolean;
}

function progress(done: number, total: number): Progress {
  return { done, total };
}

export function derive(save: SaveData): Derived {
  const achievements = save.achievements;
  const lockedAchievements: number[] = [];
  let unlocked = 0;
  for (let id = 1; id <= DEAD_GOD_LAST_REQUIRED; id++) {
    if (achievements[id]) unlocked++;
    else lockedAchievements.push(id);
  }
  let extras = 0;
  for (const id of EXTRA_ACHIEVEMENTS) if (achievements[id]) extras++;
  let achievementsDone = 0;
  for (const achievement of ACHIEVEMENTS) if (achievements[achievement.id]) achievementsDone++;

  const lockedChallenges: number[] = [];
  let challengesDone = 0;
  for (const challenge of CHALLENGES) {
    if (save.challenges[challenge.id]) challengesDone++;
    else lockedChallenges.push(challenge.id);
  }

  let itemsSeen = 0;
  for (const item of ITEMS) if (save.collectibles[item.id]) itemsSeen++;

  const marks: MarkCell[][] = [];
  let hard = 0;
  let any = 0;
  for (let characterId = 0; characterId < MARK_MATRIX.length; characterId++) {
    const row: MarkCell[] = [];
    for (const boss of MARK_BOSSES) {
      const index = MARK_MATRIX[characterId][MARK_BOSSES.indexOf(boss)];
      const state = decodeMark(save.counters[index]);
      if (state.offline === 2) hard++;
      if (state.offline > 0) any++;
      row.push({ characterId, boss, offline: state.offline });
    }
    marks.push(row);
  }
  const markTotal = MARK_MATRIX.length * MARK_BOSSES.length;

  return {
    deadGod: progress(unlocked, DEAD_GOD_LAST_REQUIRED),
    achievements: progress(achievementsDone, ACHIEVEMENTS.length),
    extras: progress(extras, EXTRA_ACHIEVEMENTS.length),
    challenges: progress(challengesDone, CHALLENGES.length),
    items: progress(itemsSeen, ITEMS.length),
    marksHard: progress(hard, markTotal),
    marksAny: progress(any, markTotal),
    lockedAchievements,
    lockedChallenges,
    counterGoals: COUNTER_GOALS.map((goal) => ({
      ...goal,
      value: save.counters[goal.counterIndex] ?? 0,
      unlocked: achievements[goal.achievementId] === 1,
    })),
    watched: WATCHED_ACHIEVEMENTS.map((id) => ({ id, unlocked: achievements[id] === 1 })),
    marks,
    isDeadGod: achievements[DEAD_GOD_ID] === 1,
  };
}

export function achievementName(id: number): string {
  return ACHIEVEMENT_BY_ID.get(id)?.name ?? `#${id}`;
}

export function challengeName(id: number): string {
  return CHALLENGES.find((challenge) => challenge.id === id)?.name ?? `#${id}`;
}

export function characterName(id: number): string {
  return CHARACTERS[id]?.name ?? `#${id}`;
}

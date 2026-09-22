import { decodeMark, MARK_BOSSES, MARK_MATRIX, type MarkBoss } from './core/domain';
import type { SaveData } from './core/format';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, CHALLENGES, CHARACTERS, ITEMS } from './data';
import type { Strings } from './i18n';

export const DEAD_GOD_ID = 637;
export const MARK_TOTAL = MARK_MATRIX.length * MARK_BOSSES.length;

export const ACHIEVEMENT_GOAL = 641;

export const HIDDEN_ITEMS: Array<{ id: number; title: keyof Strings['hiddenItems'] }> = [
  { id: 43, title: 'pill' },
  { id: 61, title: 'card' },
  { id: 656, title: 'damocles' },
];

export const ITEMS_TOTAL = ITEMS.length + HIDDEN_ITEMS.length;

export interface CounterGoal {
  achievementId: number;
  counterIndex: number;
  goal: number;
  title: keyof Strings['counterGoals'];
}

export const COUNTER_GOALS: CounterGoal[] = [
  { achievementId: 64, counterIndex: 14, goal: 100, title: 'thimble' },
  { achievementId: 354, counterIndex: 193, goal: 7, title: 'dailiesWon' },
  { achievementId: 382, counterIndex: 201, goal: 5, title: 'rubberCement' },
  { achievementId: 385, counterIndex: 202, goal: 10, title: 'beds' },
  { achievementId: 523, counterIndex: 495, goal: 5, title: 'batteryBum' },
  { achievementId: 336, counterIndex: 192, goal: 5, title: 'dailyStreak' },
  { achievementId: 147, counterIndex: 17, goal: 30, title: 'bloodDonations' },
  { achievementId: 36, counterIndex: 7, goal: 4, title: 'deathCards' },
  { achievementId: 148, counterIndex: 18, goal: 30, title: 'slotsBroken' },
  { achievementId: 545, counterIndex: 494, goal: 10, title: 'batteryBumsKilled' },
  { achievementId: 377, counterIndex: 200, goal: 10, title: 'bloodClot' },
  { achievementId: 138, counterIndex: 20, goal: 999, title: 'donationCoins' },
  { achievementId: 12, counterIndex: 3, goal: 100, title: 'tintedRocks' },
  { achievementId: 34, counterIndex: 1, goal: 11, title: 'momsHeartKills' },
  { achievementId: 57, counterIndex: 11, goal: 5, title: 'isaacKills' },
  { achievementId: 66, counterIndex: 15, goal: 10, title: 'angelItems' },
  { achievementId: 78, counterIndex: 13, goal: 5, title: 'satanKills' },
  { achievementId: 407, counterIndex: 158, goal: 3, title: 'hushKills' },
  { achievementId: 409, counterIndex: 493, goal: 10, title: 'babyPlumKills' },
];

export const OPTIONAL_GOALS = [147, 36, 148, 545, 377, 138, 12, 34, 57, 66, 78, 407, 409];

export const WATCHED_ACHIEVEMENTS = [23, 24, 25, 19, 27, 82, 258, 324, 337, 361, 366, 378, 384, 386, 406];

export const OPTIONAL_ACHIEVEMENTS = [65, 1, 389, 326, 330, 327, 155, 408, 410, 276, 547, 583, 635];

export const ROUTE_COUNTERS: Array<{ index: number; title: keyof Strings['routeCounters'] }> = [
  { index: 20, title: 'donation' },
  { index: 115, title: 'greedDonation' },
  { index: 190, title: 'dailies' },
  { index: 193, title: 'dailiesWon' },
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
  challenges: Progress;
  items: Progress;
  hiddenItems: Array<{ id: number; title: keyof Strings['hiddenItems']; seen: boolean }>;
  marksHard: Progress;
  marksAny: Progress;
  lockedAchievements: number[];
  lockedChallenges: number[];
  counterGoals: Array<CounterGoal & { value: number; unlocked: boolean }>;
  watched: Array<{ id: number; unlocked: boolean }>;
  optional: Array<{ id: number; unlocked: boolean }>;
  marks: MarkCell[][];
  isDeadGod: boolean;
}

function progress(done: number, total: number): Progress {
  return { done, total };
}

export function derive(save: SaveData): Derived {
  const achievements = save.achievements;
  const lockedAchievements: number[] = [];
  const total = achievements.length - 1;
  let unlocked = 0;
  for (let id = 1; id <= total; id++) {
    if (achievements[id]) unlocked++;
    else lockedAchievements.push(id);
  }
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
  const hiddenItems = HIDDEN_ITEMS.map((item) => ({ ...item, seen: save.collectibles[item.id] === 1 }));
  for (const item of hiddenItems) if (item.seen) itemsSeen++;

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

  return {
    deadGod: progress(unlocked, total),
    achievements: progress(achievementsDone, ACHIEVEMENTS.length),
    challenges: progress(challengesDone, CHALLENGES.length),
    items: progress(itemsSeen, ITEMS_TOTAL),
    hiddenItems,
    marksHard: progress(hard, MARK_TOTAL),
    marksAny: progress(any, MARK_TOTAL),
    lockedAchievements,
    lockedChallenges,
    counterGoals: COUNTER_GOALS.map((goal) => ({
      ...goal,
      value: save.counters[goal.counterIndex] ?? 0,
      unlocked: achievements[goal.achievementId] === 1,
    })),
    watched: WATCHED_ACHIEVEMENTS.map((id) => ({ id, unlocked: achievements[id] === 1 })),
    optional: OPTIONAL_ACHIEVEMENTS.map((id) => ({ id, unlocked: achievements[id] === 1 })),
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

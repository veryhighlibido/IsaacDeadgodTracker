import type { MarkBoss } from './core/domain';
import type { Strings } from './i18n';

export const MARK_IMAGE: Record<MarkBoss, string> = {
  momsHeart: "Mom's Heart",
  isaac: 'Isaac',
  satan: 'Satan',
  bossRush: 'Boss Rush',
  blueBaby: 'Blue Baby',
  lamb: 'The Lamb',
  megaSatan: 'Mega Satan',
  greed: 'Greed',
  hush: 'Hush',
  delirium: 'Delirium',
  mother: 'Mother',
  beast: 'The Beast',
};

export const MARK_SHORT: Record<MarkBoss, string> = {
  momsHeart: 'Heart',
  isaac: 'Isaac',
  satan: 'Satan',
  bossRush: 'Rush',
  blueBaby: '???',
  lamb: 'Lamb',
  megaSatan: 'M. Satan',
  greed: 'Greed',
  hush: 'Hush',
  delirium: 'Delirium',
  mother: 'Mother',
  beast: 'Beast',
};

export function markLevelWord(boss: MarkBoss, level: 1 | 2, s: Strings): string {
  if (boss === 'greed') return level === 2 ? s.markLevel.greedier : s.markLevel.greed;
  return level === 2 ? s.markLevel.hard : s.markLevel.normal;
}

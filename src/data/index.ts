import achievementsJson from './achievements.json';
import itemsJson from './items.json';
import challengesJson from './challenges.json';
import charactersJson from './characters.json';

export interface AchievementDef {
  id: number;
  name: string;
  key: string;
}
export interface ItemDef {
  id: number;
  name: string;
}
export interface ChallengeDef {
  id: number;
  name: string;
}
export interface CharacterDef {
  id: number;
  name: string;
  tainted: boolean;
}

export const ACHIEVEMENTS = achievementsJson as AchievementDef[];
export const ITEMS = itemsJson as ItemDef[];
export const CHALLENGES = challengesJson as ChallengeDef[];
export const CHARACTERS = charactersJson as CharacterDef[];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

const enc = (s: string) => encodeURIComponent(s);

export const sprite = {
  achievement: (id: number) => `/gfx/achievements/${id}.png`,
  item: (id: number) => `/gfx/items/${String(id).padStart(3, '0')}.png`,
  character: (name: string) => `/gfx/characters/${name.replace(/ & /g, '_and_').replace(/ /g, '_')}.png`,
  mark: (name: string, layer: 'normal' | 'hard' | 'online_normal' | 'online_hard') => `/gfx/marks/${layer}/${enc(name)}.png`,
};

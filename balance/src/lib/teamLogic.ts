// Rules for teams of 3 to 5 people. Pure, so they are unit-tested.
import { addDays, WEEKLY_ACTIVE_MIN } from './calc';

export const MIN_TEAM = 3;
export const MAX_TEAM = 5;
export const MAX_BREAK_DAYS = 7;

/** What a member shares for one day. It never includes calories or weight. */
export interface DayCard {
  /** Anything was logged that day. */
  logged: boolean;
  /** Eaten minus credit fell inside the member's range. */
  inRange: boolean;
  activeMin: number;
}

export interface Member {
  uid: string;
  name: string;
  /** Last day (inclusive) of a break, as a date key, or undefined. */
  breakUntil?: string;
  /** First day the member counts for the streak. */
  joined: string;
}

/** cards[date][uid] */
export type TeamCards = Record<string, Record<string, DayCard | undefined> | undefined>;

export function onBreak(m: Member, day: string): boolean {
  return m.breakUntil !== undefined && day <= m.breakUntil;
}

/** 0 for Monday through 6 for Sunday. */
function mondayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** The Monday on or before a date key. */
export function weekStart(day: string): string {
  return addDays(day, -mondayIndex(day));
}

export interface GoalProgress {
  done: number;
  goal: number;
  daysLeft: number;
}

/** Shared goal: 150 active minutes per member, summed over the team for Monday to Sunday. */
export function weeklyGoal(cards: TeamCards, members: Member[], today: string): GoalProgress {
  const start = weekStart(today);
  let done = 0;
  for (let i = 0; i < 7; i++) {
    const day = cards[addDays(start, i)];
    if (!day) continue;
    for (const m of members) done += day[m.uid]?.activeMin ?? 0;
  }
  const daysLeft = 6 - mondayIndex(today);
  return { done, goal: members.length * WEEKLY_ACTIVE_MIN, daysLeft };
}

export type DayState = 'complete' | 'waiting' | 'missed' | 'neutral';

/** Every member not on break must have logged. With nobody active the day is neutral. */
export function dayState(cards: TeamCards, members: Member[], day: string, today: string): { state: DayState; waitingFor: string[] } {
  const active = members.filter((m) => m.joined <= day && !onBreak(m, day));
  if (active.length === 0) return { state: 'neutral', waitingFor: [] };
  const missing = active.filter((m) => !cards[day]?.[m.uid]?.logged).map((m) => m.uid);
  if (missing.length === 0) return { state: 'complete', waitingFor: [] };
  return { state: day < today ? 'missed' : 'waiting', waitingFor: missing };
}

/**
 * Consecutive complete days. Today counts once everyone has logged; until
 * then it neither adds to the streak nor breaks it.
 */
export function streak(cards: TeamCards, members: Member[], today: string, maxDays = 400): number {
  if (members.length === 0) return 0;
  const earliest = members.reduce((min, m) => (m.joined < min ? m.joined : min), members[0].joined);
  let count = 0;
  for (let i = 0; i < maxDays; i++) {
    const day = addDays(today, -i);
    if (day < earliest) break;
    const { state } = dayState(cards, members, day, today);
    if (state === 'complete') count++;
    else if (state === 'neutral') continue;
    else if (state === 'waiting') continue;
    else break;
  }
  return count;
}

/** One nudge per person per day. */
export function canNudge(lastNudgeDay: string | undefined, today: string): boolean {
  return lastNudgeDay !== today;
}

/** The last day of a break that starts today and lasts `days` days (1 to 7). */
export function breakEnd(today: string, days: number): string {
  const n = Math.min(MAX_BREAK_DAYS, Math.max(1, Math.round(days)));
  return addDays(today, n - 1);
}

export function canJoin(memberCount: number): boolean {
  return memberCount < MAX_TEAM;
}

/** Display name: trimmed, single-spaced, capped at 20 characters. */
export function cleanName(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 20);
}

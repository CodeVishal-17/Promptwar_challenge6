import type { Place, Plan, Profile } from '../../shared/types.js';

/** Plans already fetched this visit, by place, profile and local hour. Small and bounded. */
const MAX_PLANS = 20;
const plans = new Map<string, Plan>();

const pad = (n: number): string => String(n).padStart(2, '0');

/** `lat,lon|profile|YYYY-MM-DDTHH` in the browser's local time: a new hour means a new plan. */
export function planKey(place: Place, profile: Profile, now = new Date()): string {
  const hour = `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}`;
  return `${String(place.lat)},${String(place.lon)}|${JSON.stringify(profile)}|${hour}`;
}

export const cachedPlan = (key: string): Plan | undefined => plans.get(key);

/** Stores a plan as the most recent, dropping the oldest once there are more than MAX_PLANS. */
export function rememberPlan(key: string, plan: Plan): void {
  plans.delete(key);
  plans.set(key, plan);
  if (plans.size <= MAX_PLANS) return;
  const oldest = plans.keys().next().value;
  if (oldest !== undefined) plans.delete(oldest);
}

export function clearPlans(): void {
  plans.clear();
}

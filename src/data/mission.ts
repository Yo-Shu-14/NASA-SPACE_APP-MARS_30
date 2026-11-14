import { MissionPhaseInfo, MissionPhaseNumber } from '../types/game';

export const MAX_MISSION_DAYS = 30;
export const SOL_DURATION_MINUTES = 24 * 60 + 39; // 24 hours 39 minutes = 1479 minutes per Martian sol
export const WORK_START_HOUR = 5; // 5:00 AM (16 available working hours until 9:00 PM)
export const WORK_END_HOUR = 21; // 9:00 PM normal bedtime
export const MAX_DAILY_HOURS = WORK_END_HOUR - WORK_START_HOUR; // 16 normal working hours
export const TOTAL_DAY_HOURS = SOL_DURATION_MINUTES / 60; // 24.65 hours (12:39 AM Martian sol limit; 9:00 PM – 12:39 AM is overtime)

export const NORMAL_BEDTIME_HOUR = 21; // 9:00 PM
export const NORMAL_WAKE_HOUR = 7; // 7:00 AM
export const NORMAL_SLEEP_HOURS = 10; // 9:00 PM to 7:00 AM = 10 sleeping hours
export const STAMINA_RECOVERY_PER_SLEEP_HOUR = 10;
export const MAX_CREW_STAMINA = 100;

export function computeWorkClockMetrics(nextHoursElapsed: number): {
  hoursElapsed: number;
  hoursRemaining: number;
  overtimeHours: number;
} {
  const clamped = Math.max(WORK_START_HOUR, Math.min(TOTAL_DAY_HOURS, nextHoursElapsed));
  return {
    hoursElapsed: clamped,
    hoursRemaining: Math.max(0, WORK_END_HOUR - clamped),
    overtimeHours: Math.max(0, clamped - WORK_END_HOUR),
  };
}

/**
 * Converts elapsed hours since midnight (0..24.65) into a 12-hour clock string (12:00 AM – 12:39 AM next sol).
 */
export function formatMartianClock(hoursElapsed: number): string {
  const clamped = Math.max(0, Math.min(TOTAL_DAY_HOURS, hoursElapsed));
  if (clamped >= TOTAL_DAY_HOURS) {
    return '12:39 AM';
  }
  const totalMinutes = Math.round(clamped * 60);
  if (totalMinutes >= SOL_DURATION_MINUTES) {
    return '12:39 AM';
  }
  const h24 = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const period = h24 >= 24 || h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins.toString().padStart(2, '0')} ${period}`;
}

/**
 * Sleeping hours = max(0, 10 - overtimeHours); recovers 10 stamina per sleeping hour (capped at 100).
 */
export function calculateSleepRecovery(overtimeHours: number): {
  sleepHours: number;
  staminaRecovery: number;
} {
  const sleepHours = Math.max(0, NORMAL_SLEEP_HOURS - Math.max(0, overtimeHours));
  const staminaRecovery = Math.min(
    MAX_CREW_STAMINA,
    Math.round(sleepHours * STAMINA_RECOVERY_PER_SLEEP_HOUR)
  );
  return { sleepHours, staminaRecovery };
}

/**
 * Lost sleep recovery (10 stamina per overtime hour past 9:00 PM).
 */
export function calculateOvertimeFatigue(overtimeHours: number): number {
  if (overtimeHours <= 0) return 0;
  return Math.min(
    MAX_CREW_STAMINA,
    Math.round(overtimeHours * STAMINA_RECOVERY_PER_SLEEP_HOUR)
  );
}

export const MISSION_PHASES: Record<MissionPhaseNumber, MissionPhaseInfo> = {
  1: {
    phase: 1,
    title: 'Arrival and Discovery',
    dayRangeLabel: 'Sol 1',
    objectives: [
      'Inspect the damaged Jezero Crater outpost facilities.',
      'Restore the Solar Panels so the outpost has steady electricity.',
      'End Sol 1 when ready to begin Phase 2.',
    ],
  },
  2: {
    phase: 2,
    title: 'Establish the Outpost',
    dayRangeLabel: 'Sols 2–10',
    objectives: [
      'Restore the Oxygen Generation System and Water Recovery System.',
      'Restore the Greenhouse and plant crops early for future harvests.',
      'Handle your first minor and major Mars environmental events.',
    ],
  },
  3: {
    phase: 3,
    title: 'Survival and Adaptation',
    dayRangeLabel: 'Sols 11–20',
    objectives: [
      'Harvest mature crops and replant to build food reserves.',
      'Restore the Radiation Storm Shelter and backup storage facilities.',
      'Keep facility conditions high through dust storms and quakes.',
    ],
  },
  4: {
    phase: 4,
    title: 'Final Test',
    dayRangeLabel: 'Sols 21–30',
    objectives: [
      'Prepare reserves and shelter protection for the Sol 29 Global Dust Storm.',
      'Repair critical damage on Sol 30 before the 150-sol assessment.',
    ],
  },
};

export function getPhaseForDay(day: number): MissionPhaseNumber {
  if (day <= 1) return 1;
  if (day <= 10) return 2;
  if (day <= 20) return 3;
  return 4;
}

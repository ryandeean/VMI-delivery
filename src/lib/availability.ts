import { isoWeekday } from "./time";

export type DriverLike = {
  id: string;
  name: string;
  active: boolean;
  workingDays: string;
  licenceCategories: string;
};

export type AbsenceLike = { driverId: string; startDate: string; endDate: string; reason: string };

export type AvailabilityStatus = "AVAILABLE" | "BUSY" | "OFF" | "ABSENT" | "INACTIVE";

export type Availability = { status: AvailabilityStatus; label: string; canAssign: boolean };

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Is this driver free on the given day? Absences (holiday, sick) and non-working
 * days block assignment; a driver who already has a run is "busy" but can still be
 * given a second run (e.g. a morning and an afternoon round).
 */
export function driverAvailability(driver: DriverLike, date: string, absences: AbsenceLike[], runsToday: { driverId: string | null }[]): Availability {
  if (!driver.active) return { status: "INACTIVE", label: "Inactive", canAssign: false };
  const absence = absences.find((a) => a.driverId === driver.id && a.startDate <= date && a.endDate >= date);
  if (absence) return { status: "ABSENT", label: absence.reason ? `Off: ${absence.reason}` : "Off (absence)", canAssign: false };
  const wd = isoWeekday(date);
  const working = driver.workingDays.split(",").map((s) => Number(s.trim())).filter(Boolean);
  if (!working.includes(wd)) return { status: "OFF", label: `Not working ${DAY_NAMES[wd]}s`, canAssign: false };
  const runs = runsToday.filter((r) => r.driverId === driver.id).length;
  if (runs > 0) return { status: "BUSY", label: runs === 1 ? "Has a run" : `Has ${runs} runs`, canAssign: true };
  return { status: "AVAILABLE", label: "Available", canAssign: true };
}

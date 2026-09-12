import type { Contact } from "../currentrms/types";
import type { JobItem } from "../vehicles";

export type StoredItem = JobItem & { currentItemId?: number | null };

export function parseContacts(raw: string | null | undefined): Contact[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((c) => c && typeof c.name === "string").map((c) => ({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", role: c.role || undefined })) : [];
  } catch {
    return [];
  }
}

export function parseItems(raw: string | null | undefined): StoredItem[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((i) => i && typeof i.name === "string") : [];
  } catch {
    return [];
  }
}

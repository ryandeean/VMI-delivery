/**
 * Turns a Current RMS opportunity (plus its items and contacts) into the
 * delivery / collection jobs we schedule. Pure functions: easy to test and to
 * adjust when an account uses different fields.
 */
import { toDateString, zonedDateTime } from "../time";
import type { JobItem } from "../vehicles";
import type { Contact, CrmAddress, CrmMember, CrmOpportunity, CrmOpportunityItem, CrmProduct, CrmUser, ImportedJob } from "./types";

export type MapperSettings = {
  timezone: string;
  dayStart: string;
  dayEnd: string;
  importStates: string[];
  deliveryField: string;
  deliveryValues: string[];
  volumeField: string;
  weightField: string;
  /** Remembered sizes per product id (from the ProductProfile table). */
  productProfiles?: Map<number, { volumeM3: number | null; weightKg: number | null }>;
};

export type OpportunityContext = {
  opportunity: CrmOpportunity;
  items: CrmOpportunityItem[];
  contact?: CrmMember | null;
  organisation?: CrmMember | null;
  people?: CrmMember[];
  owner?: CrmUser | null;
};

const SERVICE_PATTERN = /\b(deliver|delivery|collection|collect|transport|courier|labour|labor|crew|technician|operator|insurance|damage waiver|discount|surcharge|carnet)\b/i;

export function isConfirmed(opp: CrmOpportunity, importStates: string[]): boolean {
  const name = (opp.state_name ?? "").toLowerCase();
  const status = (opp.status_name ?? "").toLowerCase();
  if (status.includes("cancel") || status.includes("dead") || status.includes("lost")) return false;
  if (name) return importStates.some((s) => name.includes(s));
  // Fall back to numeric state codes when the name is missing (2 = Reserved, 3 = Order in Current RMS).
  const numeric: Record<string, number> = { provisional: 1, reserved: 2, order: 3 };
  return importStates.some((s) => numeric[s] !== undefined && numeric[s] === opp.state);
}

export function needsTransport(opp: CrmOpportunity, items: CrmOpportunityItem[], settings: MapperSettings): { needed: boolean; reason: string } {
  if (settings.deliveryField) {
    const raw = opp.custom_fields?.[settings.deliveryField];
    const value = raw === undefined || raw === null ? "" : String(raw).toLowerCase().trim();
    const match = settings.deliveryValues.some((v) => value.includes(v));
    return { needed: match, reason: match ? `${settings.deliveryField}: ${value}` : `${settings.deliveryField} is "${value || "blank"}"` };
  }
  const transportLine = items.find((it) => /\b(deliver|delivery|collection|collect|transport|courier)\b/i.test(it.name ?? ""));
  if (transportLine) return { needed: true, reason: `Transport line: ${transportLine.name}` };
  return { needed: true, reason: "" };
}

function addressLines(a: CrmAddress | null | undefined): { addressLine1: string; addressLine2: string; city: string; postcode: string; country: string; lat: number | null; lng: number | null } {
  if (!a) return { addressLine1: "", addressLine2: "", city: "", postcode: "", country: "United Kingdom", lat: null, lng: null };
  const streetLines = (a.street ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const line1 = a.address_line_1 || streetLines[0] || "";
  const line2 = [a.address_line_2, a.address_line_3, ...streetLines.slice(1)].filter(Boolean).join(", ");
  const lat = a.latitude !== undefined && a.latitude !== null && a.latitude !== "" ? Number(a.latitude) : null;
  const lng = a.longitude !== undefined && a.longitude !== null && a.longitude !== "" ? Number(a.longitude) : null;
  return {
    addressLine1: a.name && a.name !== line1 ? `${a.name}, ${line1}`.replace(/, $/, "") : line1,
    addressLine2: line2,
    city: a.city || a.county || "",
    postcode: a.postcode || "",
    country: a.country_name || "United Kingdom",
    lat: Number.isFinite(lat as number) ? lat : null,
    lng: Number.isFinite(lng as number) ? lng : null,
  };
}

export function pickAddress(opp: CrmOpportunity, organisation?: CrmMember | null): CrmAddress | null {
  return opp.destination?.address ?? opp.delivery_address ?? opp.venue?.address ?? opp.venue?.primary_address ?? organisation?.primary_address ?? opp.member?.primary_address ?? null;
}

function memberEmail(m: CrmMember | null | undefined): string {
  if (!m) return "";
  if (typeof m.primary_email === "string") return m.primary_email;
  if (m.primary_email && typeof m.primary_email === "object" && m.primary_email.address) return m.primary_email.address;
  if (m.email) return m.email;
  const e = m.emails?.find((x) => x.address || x.email);
  return e?.address ?? e?.email ?? "";
}

function memberPhone(m: CrmMember | null | undefined): string {
  if (!m) return "";
  if (typeof m.primary_phone === "string") return m.primary_phone;
  if (m.primary_phone && typeof m.primary_phone === "object" && m.primary_phone.number) return m.primary_phone.number;
  if (m.phone) return m.phone;
  const mobile = m.phones?.find((p) => /mobile|cell/i.test(p.phone_type_name ?? "")) ?? m.phones?.[0];
  return mobile?.number ?? "";
}

export function contactFromMember(m: CrmMember | null | undefined): Contact | null {
  if (!m || !m.name) return null;
  return { name: m.name, phone: memberPhone(m), email: memberEmail(m), role: m.job_title || undefined };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Volume in m³ from whatever dimension data the product carries. */
export function productVolumeM3(product: CrmProduct | null | undefined, settings: MapperSettings): number | null {
  if (!product) return null;
  if (settings.volumeField) {
    const v = num(product.custom_fields?.[settings.volumeField]);
    if (v) return v;
  }
  let l = num(product.length);
  let w = num(product.width);
  let h = num(product.height);
  if (product.dimensions && typeof product.dimensions === "object") {
    l = l ?? num(product.dimensions.length);
    w = w ?? num(product.dimensions.width);
    h = h ?? num(product.dimensions.height);
  } else if (typeof product.dimensions === "string") {
    const m = product.dimensions.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)/i);
    if (m) {
      l = l ?? num(m[1]);
      w = w ?? num(m[2]);
      h = h ?? num(m[3]);
    }
  }
  if (l && w && h) {
    // Values above 5 are almost certainly centimetres, otherwise metres.
    const factor = Math.max(l, w, h) > 5 ? 1e-6 : 1;
    return Math.round(l * w * h * factor * 10000) / 10000;
  }
  return null;
}

export function productWeightKg(product: CrmProduct | null | undefined, item?: CrmOpportunityItem, settings?: MapperSettings): number | null {
  if (settings?.weightField && product) {
    const v = num(product.custom_fields?.[settings.weightField]);
    if (v) return v;
  }
  return num(product?.weight) ?? num(item?.weight);
}

export function mapItems(items: CrmOpportunityItem[], settings: MapperSettings): ImportedJob["items"] {
  return items
    .filter((it) => (Number(it.quantity) || 0) > 0)
    .map((it) => {
      const name = it.name ?? it.item?.name ?? "Item";
      const typeName = `${it.transaction_type_name ?? ""} ${it.item_type ?? ""} ${it.opportunity_item_type_name ?? ""}`.toLowerCase();
      const isService = it.transaction_type === 2 || /service|labour|labor|surcharge|discount/.test(typeName) || SERVICE_PATTERN.test(name);
      const profile = it.item_id ? settings.productProfiles?.get(it.item_id) : undefined;
      const volumeM3 = profile?.volumeM3 ?? productVolumeM3(it.item, settings);
      const weightKg = profile?.weightKg ?? productWeightKg(it.item, it, settings);
      return { name, quantity: Number(it.quantity) || 0, volumeM3, weightKg, isService, currentItemId: it.item_id ?? null };
    });
}

function clampWindow(rawStart: Date | null, rawEnd: Date | null, date: string, settings: MapperSettings): { windowStart: Date; windowEnd: Date } {
  const dayStart = zonedDateTime(date, settings.dayStart, settings.timezone);
  const dayEnd = zonedDateTime(date, settings.dayEnd, settings.timezone);
  let start = rawStart && rawStart > dayStart ? rawStart : dayStart;
  let end = rawEnd && rawEnd < dayEnd ? rawEnd : dayEnd;
  if (start > dayEnd) start = dayStart;
  if (end.getTime() - start.getTime() < 15 * 60_000) end = dayEnd;
  if (end <= start) {
    start = dayStart;
    end = dayEnd;
  }
  return { windowStart: start, windowEnd: end };
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Work out the delivery and collection slots. Current RMS has optional
 * "deliver" and "collect" phases; when they are not filled in we deliver
 * before the hire starts and collect after it ends.
 */
export function transportWindows(opp: CrmOpportunity, settings: MapperSettings): { delivery: { date: string; windowStart: Date; windowEnd: Date } | null; collection: { date: string; windowStart: Date; windowEnd: Date } | null } {
  const tz = settings.timezone;
  const starts = parseDate(opp.starts_at ?? opp.charge_starts_at);
  const ends = parseDate(opp.ends_at ?? opp.charge_ends_at);
  const deliverStart = parseDate(opp.deliver_starts_at);
  const deliverEnd = parseDate(opp.deliver_ends_at);
  const collectStart = parseDate(opp.collect_starts_at);
  const collectEnd = parseDate(opp.collect_ends_at);

  let delivery = null;
  if (deliverStart || starts) {
    const anchor = (deliverStart ?? starts) as Date;
    const date = toDateString(anchor, tz);
    const explicit = Boolean(deliverStart && deliverEnd && deliverEnd.getTime() !== deliverStart.getTime());
    const w = explicit ? clampWindow(deliverStart, deliverEnd, date, settings) : clampWindow(null, starts && toDateString(starts, tz) === date ? starts : null, date, settings);
    delivery = { date, ...w };
  }
  let collection = null;
  if (collectStart || ends) {
    const anchor = (collectStart ?? ends) as Date;
    const date = toDateString(anchor, tz);
    const explicit = Boolean(collectStart && collectEnd && collectEnd.getTime() !== collectStart.getTime());
    const w = explicit ? clampWindow(collectStart, collectEnd, date, settings) : clampWindow(ends && toDateString(ends, tz) === date ? ends : null, null, date, settings);
    collection = { date, ...w };
  }
  return { delivery, collection };
}

export function opportunityToJobs(ctx: OpportunityContext, settings: MapperSettings, range: { from: string; to: string }): ImportedJob[] {
  const { opportunity: opp } = ctx;
  if (!isConfirmed(opp, settings.importStates)) return [];
  const transport = needsTransport(opp, ctx.items, settings);
  if (!transport.needed) return [];

  const organisation = ctx.organisation ?? opp.member ?? null;
  const primary = contactFromMember(ctx.contact ?? opp.contact) ?? contactFromMember(organisation && organisation.member_type_name?.toLowerCase() === "person" ? organisation : null);
  const secondary: Contact[] = [];
  const seen = new Set<string>([primary?.name.toLowerCase() ?? ""]);
  for (const p of ctx.people ?? []) {
    const c = contactFromMember(p);
    if (c && !seen.has(c.name.toLowerCase()) && (c.phone || c.email)) {
      secondary.push(c);
      seen.add(c.name.toLowerCase());
    }
  }
  const orgContact = contactFromMember(organisation);
  if (orgContact && (orgContact.phone || orgContact.email) && orgContact.name !== primary?.name) {
    secondary.push({ ...orgContact, role: "Main office" });
  }

  const address = addressLines(pickAddress(opp, organisation));
  const items = mapItems(ctx.items, settings);
  const owner = ctx.owner ?? opp.owner ?? null;
  const windows = transportWindows(opp, settings);
  const base = {
    opportunityId: opp.id,
    opportunityNumber: String(opp.number ?? opp.id),
    subject: opp.subject ?? "",
    clientName: organisation?.name ?? opp.member?.name ?? primary?.name ?? "Unknown client",
    contactName: primary?.name ?? "",
    contactPhone: primary?.phone ?? "",
    contactEmail: primary?.email ?? "",
    secondaryContacts: secondary.slice(0, 5),
    accountHandlerName: owner?.name ?? [owner?.first_name, owner?.last_name].filter(Boolean).join(" "),
    accountHandlerEmail: owner?.email ?? "",
    ...address,
    items,
    notes: [transport.reason, opp.description?.trim()].filter(Boolean).join("\n"),
  };
  const jobs: ImportedJob[] = [];
  if (windows.delivery && windows.delivery.date >= range.from && windows.delivery.date <= range.to) {
    jobs.push({ ...base, externalId: `${opp.id}:DELIVERY`, type: "DELIVERY", ...windows.delivery });
  }
  if (windows.collection && windows.collection.date >= range.from && windows.collection.date <= range.to) {
    jobs.push({ ...base, externalId: `${opp.id}:COLLECTION`, type: "COLLECTION", ...windows.collection });
  }
  return jobs;
}

export type { JobItem };

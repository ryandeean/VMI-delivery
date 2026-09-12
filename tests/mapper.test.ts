import { describe, expect, it } from "vitest";
import { isConfirmed, mapItems, needsTransport, opportunityToJobs, productVolumeM3, transportWindows, type MapperSettings } from "@/lib/currentrms/mapper";
import type { CrmOpportunity, CrmOpportunityItem } from "@/lib/currentrms/types";
import { formatTime } from "@/lib/time";

const settings: MapperSettings = {
  timezone: "Europe/London",
  dayStart: "07:00",
  dayEnd: "19:00",
  importStates: ["order", "reserved"],
  deliveryField: "",
  deliveryValues: ["delivery"],
  volumeField: "",
  weightField: "",
};

const opp: CrmOpportunity = {
  id: 501,
  subject: "Alexa 35 package",
  number: "Q501",
  member_id: 10,
  member: { id: 10, name: "Pinewood Studios", member_type_name: "Organisation" },
  contact_id: 11,
  owner: { id: 3, name: "Tom Barker", email: "tom@example.com" },
  state: 3,
  state_name: "Order",
  status_name: "Open",
  starts_at: "2026-09-14T09:00:00+01:00",
  ends_at: "2026-09-16T17:00:00+01:00",
  deliver_starts_at: "2026-09-14T08:00:00+01:00",
  deliver_ends_at: "2026-09-14T10:00:00+01:00",
  destination: { address: { street: "Pinewood Road\nStage 5", city: "Iver Heath", postcode: "SL0 0NH", country_name: "United Kingdom" } },
  custom_fields: { delivery_method: "Delivery & Collection" },
};

const items: CrmOpportunityItem[] = [
  { id: 1, name: "ARRI Alexa 35", quantity: 1, item_id: 900, item: { id: 900, name: "ARRI Alexa 35", weight: "12", length: 40, width: 30, height: 25 } },
  { id: 2, name: "Delivery", quantity: 1, transaction_type: 2, item_id: 901 },
  { id: 3, name: "Cable drum", quantity: 3, item_id: 902, item: { id: 902, name: "Cable drum" } },
];

describe("Current RMS mapper", () => {
  it("only imports confirmed, live opportunities", () => {
    expect(isConfirmed(opp, settings.importStates)).toBe(true);
    expect(isConfirmed({ ...opp, state_name: "Provisional" }, settings.importStates)).toBe(false);
    expect(isConfirmed({ ...opp, status_name: "Cancelled" }, settings.importStates)).toBe(false);
    expect(isConfirmed({ ...opp, state_name: undefined, state: 2 }, settings.importStates)).toBe(true);
  });

  it("uses the delivery custom field when configured", () => {
    const s = { ...settings, deliveryField: "delivery_method", deliveryValues: ["delivery"] };
    expect(needsTransport(opp, items, s).needed).toBe(true);
    expect(needsTransport({ ...opp, custom_fields: { delivery_method: "Collect from us" } }, items, s).needed).toBe(false);
    expect(needsTransport(opp, items, settings).needed).toBe(true);
  });

  it("reads product dimensions in cm and marks services", () => {
    expect(productVolumeM3(items[0].item, settings)).toBeCloseTo(0.03, 3);
    const mapped = mapItems(items, settings);
    expect(mapped[0]).toMatchObject({ name: "ARRI Alexa 35", quantity: 1, weightKg: 12, isService: false });
    expect(mapped[1].isService).toBe(true);
    expect(mapped[2]).toMatchObject({ quantity: 3, volumeM3: null, weightKg: null });
  });

  it("takes the delivery slot from the deliver phase and collection from the hire end", () => {
    const w = transportWindows(opp, settings);
    expect(w.delivery?.date).toBe("2026-09-14");
    expect(formatTime(w.delivery!.windowStart)).toBe("08:00");
    expect(formatTime(w.delivery!.windowEnd)).toBe("10:00");
    expect(w.collection?.date).toBe("2026-09-16");
    expect(formatTime(w.collection!.windowStart)).toBe("17:00");
    expect(formatTime(w.collection!.windowEnd)).toBe("19:00");
  });

  it("delivers before the hire starts when no deliver phase is set", () => {
    const w = transportWindows({ ...opp, deliver_starts_at: null, deliver_ends_at: null }, settings);
    expect(formatTime(w.delivery!.windowStart)).toBe("07:00");
    expect(formatTime(w.delivery!.windowEnd)).toBe("09:00");
  });

  it("builds delivery and collection jobs with contacts and address", () => {
    const jobs = opportunityToJobs(
      {
        opportunity: opp,
        items,
        contact: { id: 11, name: "Hannah Reid", phones: [{ number: "07700 900101", phone_type_name: "Mobile" }], emails: [{ address: "hannah@example.com" }] },
        organisation: { id: 10, name: "Pinewood Studios", member_type_name: "Organisation", phone: "01753 000000", email: "info@example.com" },
        people: [{ id: 12, name: "Priya Shah", job_title: "Producer", phone: "07700 900112" }, { id: 11, name: "Hannah Reid" }],
        owner: opp.owner,
      },
      settings,
      { from: "2026-09-14", to: "2026-09-20" },
    );
    expect(jobs.map((j) => j.type)).toEqual(["DELIVERY", "COLLECTION"]);
    const d = jobs[0];
    expect(d.externalId).toBe("501:DELIVERY");
    expect(d.clientName).toBe("Pinewood Studios");
    expect(d.contactName).toBe("Hannah Reid");
    expect(d.contactPhone).toBe("07700 900101");
    expect(d.contactEmail).toBe("hannah@example.com");
    expect(d.secondaryContacts.map((c) => c.name)).toEqual(["Priya Shah", "Pinewood Studios"]);
    expect(d.addressLine1).toBe("Pinewood Road");
    expect(d.addressLine2).toBe("Stage 5");
    expect(d.postcode).toBe("SL0 0NH");
    expect(d.accountHandlerEmail).toBe("tom@example.com");
    expect(d.items).toHaveLength(3);
  });

  it("only returns jobs inside the requested date range", () => {
    const jobs = opportunityToJobs({ opportunity: opp, items }, settings, { from: "2026-09-16", to: "2026-09-16" });
    expect(jobs.map((j) => j.type)).toEqual(["COLLECTION"]);
  });
});

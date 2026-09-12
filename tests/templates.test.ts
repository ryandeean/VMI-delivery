import { describe, expect, it } from "vitest";
import { calendarDescription, clientNotice, driverRunSheet, handlerSummary, problemAlert, type CompanyView, type RunView, type StopView } from "@/lib/email/templates";
import { zonedDateTime } from "@/lib/time";

const day = "2026-09-14";
const t = (hhmm: string) => zonedDateTime(day, hhmm);
const company: CompanyView = { companyName: "VMI", timezone: "Europe/London", depotName: "Warehouse", depotAddress: "Park Royal", dispatchEmail: "dispatch@example.com", dispatchPhone: "020 8000 0000", loadingMinutes: 30, clientEtaWindowMinutes: 60 };
const stop: StopView = {
  id: "s1", sequence: 1, type: "DELIVERY", clientName: "Pinewood <Studios>", contactName: "Hannah Reid", contactPhone: "07700 900101", contactEmail: "hannah@example.com",
  secondaryContacts: [{ name: "Priya Shah", phone: "07700 900112", email: "", role: "Producer" }], addressLine1: "Pinewood Road", addressLine2: "Stage 5", city: "Iver Heath", postcode: "SL0 0NH",
  subject: "Alexa 35 package", opportunityNumber: "Q501", items: [{ name: "ARRI Alexa 35", quantity: 1 }, { name: "Delivery", quantity: 1, isService: true }],
  windowStart: t("08:00"), windowEnd: t("10:00"), plannedArrival: t("08:45"), plannedDeparture: t("09:05"), serviceMinutes: 20, driverNotes: "Ask for stage 5", accountHandlerName: "Tom Barker", accountHandlerEmail: "tom@example.com", volumeM3: 1, weightKg: 20,
};
const run: RunView = { id: "r1", date: day, driverName: "Sam Patel", driverPhone: "07700 900201", driverEmail: "sam@example.com", vehicleName: "Van 2", vehicleRegistration: "LX22 BBB", plannedStart: t("08:15"), plannedEnd: t("12:30"), totalDistanceM: 32000, totalDurationS: 4 * 3600, stops: [stop], portalUrl: "https://example.com/driver/abc" };

describe("email templates", () => {
  it("driver run sheet has the essentials and escapes HTML", () => {
    const m = driverRunSheet(run, company);
    expect(m.subject).toContain("Monday 14 September 2026");
    expect(m.subject).toContain("leave 08:15");
    expect(m.html).toContain("Pinewood &lt;Studios&gt;");
    expect(m.html).toContain("07:45"); // load from
    expect(m.html).toContain("https://example.com/driver/abc");
    expect(m.html).toContain("Priya Shah");
    expect(m.html).toContain("Ask for stage 5");
    expect(m.html).not.toContain("<Studios>");
  });

  it("client out-for-delivery gives an arrival window around the ETA", () => {
    const m = clientNotice("OUT_FOR_DELIVERY", stop, run, company);
    expect(m.subject).toContain("Out for delivery today");
    expect(m.html).toContain("08:15 and 09:15");
    expect(m.html).toContain("Sam Patel");
    expect(m.html).not.toContain("Delivery</li>"); // service lines hidden from clients
  });

  it("collection wording differs", () => {
    const m = clientNotice("OUT_FOR_DELIVERY", { ...stop, type: "COLLECTION" }, run, company);
    expect(m.subject).toContain("Collection today");
    expect(m.html).toContain("Collecting from");
  });

  it("on the way and completed notices carry the live time and the receiver", () => {
    expect(clientNotice("ON_THE_WAY", stop, run, company, { eta: t("09:12") }).subject).toContain("09:12");
    const done = clientNotice("COMPLETED", stop, run, company, { eta: t("09:20"), podName: "Reception" });
    expect(done.subject).toContain("Delivered");
    expect(done.html).toContain("Reception");
  });

  it("handler summary and problem alert address the office side", () => {
    const h = handlerSummary("Tom Barker", day, [{ stop, run }], company);
    expect(h.subject).toContain("1 of your job scheduled");
    expect(h.html).toContain("Sam Patel");
    const p = problemAlert(stop, run, company, "Nobody on site");
    expect(p.subject).toContain("Driver problem");
    expect(p.html).toContain("Nobody on site");
    expect(p.html).toContain("has not been emailed");
  });

  it("calendar description lists stops in order with contacts", () => {
    const d = calendarDescription(run, company);
    expect(d).toContain("1. 08:45 DELIVER - Pinewood <Studios> #Q501");
    expect(d).toContain("Contact: Hannah Reid · 07700 900101 · hannah@example.com");
    expect(d).toContain("Leave Warehouse: 08:15 (load from 07:45)");
  });
});

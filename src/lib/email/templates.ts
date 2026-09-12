/**
 * Email content. Plain, inline-styled HTML that renders in every mail client.
 * Templates take simple view objects so they can be previewed and tested
 * without a database.
 */
import { formatDistance, formatDuration, formatLongDate, formatTime } from "../time";
import type { Contact } from "../currentrms/types";

export type StopView = {
  id: string;
  sequence: number;
  type: "DELIVERY" | "COLLECTION";
  clientName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  secondaryContacts: Contact[];
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  subject: string;
  opportunityNumber: string;
  items: { name: string; quantity: number; isService?: boolean }[];
  windowStart: Date | null;
  windowEnd: Date | null;
  plannedArrival: Date | null;
  plannedDeparture: Date | null;
  serviceMinutes: number;
  driverNotes: string;
  accountHandlerName: string;
  accountHandlerEmail: string;
  volumeM3: number;
  weightKg: number;
};

export type RunView = {
  id: string;
  date: string;
  driverName: string;
  driverPhone: string;
  driverEmail: string;
  vehicleName: string;
  vehicleRegistration: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  totalDistanceM: number;
  totalDurationS: number;
  stops: StopView[];
  portalUrl: string;
};

export type CompanyView = {
  companyName: string;
  timezone: string;
  depotName: string;
  depotAddress: string;
  dispatchEmail: string;
  dispatchPhone: string;
  loadingMinutes: number;
  clientEtaWindowMinutes: number;
};

export type EmailContent = { subject: string; html: string; text: string };

export function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function fullAddress(s: Pick<StopView, "addressLine1" | "addressLine2" | "city" | "postcode">): string {
  return [s.addressLine1, s.addressLine2, s.city, s.postcode].filter(Boolean).join(", ");
}

export function mapsLink(s: Pick<StopView, "addressLine1" | "addressLine2" | "city" | "postcode">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress(s))}`;
}

function typeWord(type: StopView["type"], capital = false): string {
  const w = type === "DELIVERY" ? "delivery" : "collection";
  return capital ? w[0].toUpperCase() + w.slice(1) : w;
}

function layout(title: string, bodyHtml: string, company: CompanyView): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#0f172a;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold;">${esc(company.companyName)} Deliveries</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.5;"><h1 style="font-size:20px;margin:0 0 16px;">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;">${esc(company.companyName)}${company.dispatchPhone ? ` · ${esc(company.dispatchPhone)}` : ""}${company.dispatchEmail ? ` · ${esc(company.dispatchEmail)}` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}

function itemsList(items: StopView["items"]): string {
  const goods = items.filter((i) => !i.isService);
  if (!goods.length) return "";
  return `<ul style="margin:6px 0 0;padding-left:18px;">${goods.map((i) => `<li>${i.quantity} × ${esc(i.name)}</li>`).join("")}</ul>`;
}

function contactsHtml(s: StopView): string {
  const rows: string[] = [];
  if (s.contactName || s.contactPhone || s.contactEmail) {
    rows.push(`<b>${esc(s.contactName || "Contact")}</b>${s.contactPhone ? ` · <a href="tel:${esc(s.contactPhone)}">${esc(s.contactPhone)}</a>` : ""}${s.contactEmail ? ` · <a href="mailto:${esc(s.contactEmail)}">${esc(s.contactEmail)}</a>` : ""}`);
  }
  for (const c of s.secondaryContacts) {
    rows.push(`${esc(c.name)}${c.role ? ` (${esc(c.role)})` : ""}${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}`);
  }
  return rows.join("<br>");
}

function etaWindow(stop: StopView, company: CompanyView): { from: Date; to: Date } | null {
  if (!stop.plannedArrival) return null;
  const half = (company.clientEtaWindowMinutes / 2) * 60_000;
  return { from: new Date(stop.plannedArrival.getTime() - half), to: new Date(stop.plannedArrival.getTime() + half) };
}

/* ------------------------------------------------------------------------ */
/* Driver run sheet                                                          */
/* ------------------------------------------------------------------------ */

export function driverRunSheet(run: RunView, company: CompanyView): EmailContent {
  const tz = company.timezone;
  const date = formatLongDate(run.date);
  const start = run.plannedStart ? formatTime(run.plannedStart, tz) : "TBC";
  const loadFrom = run.plannedStart ? formatTime(new Date(run.plannedStart.getTime() - company.loadingMinutes * 60_000), tz) : "";
  const subject = `Your run for ${date}: ${run.stops.length} stop${run.stops.length === 1 ? "" : "s"}, leave ${start} in ${run.vehicleName}`;
  const stopsHtml = run.stops
    .map(
      (s) => `<tr>
<td style="padding:10px 8px;border-top:1px solid #e2e8f0;vertical-align:top;font-weight:bold;">${s.sequence}</td>
<td style="padding:10px 8px;border-top:1px solid #e2e8f0;vertical-align:top;">
<div><b>${s.plannedArrival ? formatTime(s.plannedArrival, tz) : "--:--"}</b> · ${typeWord(s.type, true)}${s.windowStart && s.windowEnd ? ` <span style="color:#64748b">(slot ${formatTime(s.windowStart, tz)}–${formatTime(s.windowEnd, tz)})</span>` : ""}</div>
<div style="font-size:16px;margin-top:2px;"><b>${esc(s.clientName)}</b>${s.subject ? ` · ${esc(s.subject)}` : ""}${s.opportunityNumber ? ` <span style="color:#64748b">#${esc(s.opportunityNumber)}</span>` : ""}</div>
<div><a href="${mapsLink(s)}">${esc(fullAddress(s))}</a></div>
<div style="margin-top:4px;">${contactsHtml(s)}</div>
${s.driverNotes ? `<div style="margin-top:6px;padding:6px 8px;background:#fff7ed;border-left:3px solid #f59e0b;">${esc(s.driverNotes)}</div>` : ""}
${itemsList(s.items)}
</td></tr>`,
    )
    .join("");
  const body = `
<p>Hi ${esc(run.driverName.split(" ")[0])},</p>
<p>Here is your run for <b>${esc(date)}</b>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0;font-size:15px;">
<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Vehicle</td><td><b>${esc(run.vehicleName)}</b>${run.vehicleRegistration ? ` (${esc(run.vehicleRegistration)})` : ""}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Start loading</td><td><b>${esc(loadFrom || "TBC")}</b> at ${esc(company.depotName)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Leave depot</td><td><b>${esc(start)}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Back at depot</td><td>about <b>${run.plannedEnd ? formatTime(run.plannedEnd, tz) : "TBC"}</b></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Driving</td><td>${formatDistance(run.totalDistanceM)}, ${formatDuration(run.totalDurationS)} door to door</td></tr>
</table>
<p style="margin:16px 0;"><a href="${esc(run.portalUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold;">Open your run on your phone</a></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${stopsHtml}</table>
<p style="margin-top:16px;color:#64748b;font-size:13px;">Use the phone link to tap "On my way" at each stop so the client gets a live arrival time, and "Done" when the kit is handed over.</p>`;
  const text = [`Run for ${date}`, `Vehicle: ${run.vehicleName} ${run.vehicleRegistration}`, `Leave depot: ${start}`, ...run.stops.map((s) => `${s.sequence}. ${s.plannedArrival ? formatTime(s.plannedArrival, tz) : ""} ${typeWord(s.type, true)} ${s.clientName}, ${fullAddress(s)} (${s.contactName} ${s.contactPhone})`), `Phone view: ${run.portalUrl}`].join("\n");
  return { subject, html: layout(`Run sheet: ${date}`, body, company), text };
}

/* ------------------------------------------------------------------------ */
/* Account handler summary                                                   */
/* ------------------------------------------------------------------------ */

export function handlerSummary(handlerName: string, date: string, entries: { stop: StopView; run: RunView }[], company: CompanyView): EmailContent {
  const tz = company.timezone;
  const dateLabel = formatLongDate(date);
  const subject = `Transport plan for ${dateLabel}: ${entries.length} of your job${entries.length === 1 ? "" : "s"} scheduled`;
  const rows = entries
    .map(({ stop, run }) => {
      const w = etaWindow(stop, company);
      return `<tr>
<td style="padding:8px;border-top:1px solid #e2e8f0;vertical-align:top;"><b>${w ? `${formatTime(w.from, tz)}–${formatTime(w.to, tz)}` : "TBC"}</b><br><span style="color:#64748b">${typeWord(stop.type, true)}</span></td>
<td style="padding:8px;border-top:1px solid #e2e8f0;vertical-align:top;"><b>${esc(stop.clientName)}</b>${stop.opportunityNumber ? ` #${esc(stop.opportunityNumber)}` : ""}<br>${esc(stop.subject)}<br><span style="color:#64748b">${esc(fullAddress(stop))}</span></td>
<td style="padding:8px;border-top:1px solid #e2e8f0;vertical-align:top;">${esc(run.driverName)}<br><span style="color:#64748b">${esc(run.vehicleName)}${run.driverPhone ? `<br>${esc(run.driverPhone)}` : ""}</span></td>
</tr>`;
    })
    .join("");
  const body = `<p>Hi ${esc(handlerName.split(" ")[0] || "there")},</p>
<p>Your ${typeWordPlural(entries)} for <b>${esc(dateLabel)}</b> are scheduled as follows. Clients on these jobs will get an email when the kit is out for ${entries.some((e) => e.stop.type === "DELIVERY") ? "delivery" : "collection"} with a live arrival time.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;"><tr><th align="left" style="padding:8px;">Expected</th><th align="left" style="padding:8px;">Job</th><th align="left" style="padding:8px;">Driver</th></tr>${rows}</table>`;
  const text = entries.map(({ stop, run }) => `${stop.plannedArrival ? formatTime(stop.plannedArrival, tz) : "TBC"} ${typeWord(stop.type, true)} ${stop.clientName} #${stop.opportunityNumber} - ${run.driverName} (${run.vehicleName})`).join("\n");
  return { subject, html: layout(`Transport plan: ${dateLabel}`, body, company), text };
}

function typeWordPlural(entries: { stop: StopView }[]): string {
  const hasD = entries.some((e) => e.stop.type === "DELIVERY");
  const hasC = entries.some((e) => e.stop.type === "COLLECTION");
  return hasD && hasC ? "deliveries and collections" : hasC ? "collections" : "deliveries";
}

/* ------------------------------------------------------------------------ */
/* Client notices                                                            */
/* ------------------------------------------------------------------------ */

export type ClientNoticeKind = "OUT_FOR_DELIVERY" | "ON_THE_WAY" | "ETA_UPDATE" | "COMPLETED" | "PROBLEM";

export function clientNotice(kind: ClientNoticeKind, stop: StopView, run: RunView, company: CompanyView, extra: { eta?: Date | null; message?: string; podName?: string } = {}): EmailContent {
  const tz = company.timezone;
  const dateLabel = formatLongDate(run.date);
  const who = stop.contactName ? stop.contactName.split(" ")[0] : "there";
  const ref = stop.opportunityNumber ? ` (order #${stop.opportunityNumber})` : "";
  const goods = stop.items.filter((i) => !i.isService);
  const kitLine = stop.subject ? `<b>${esc(stop.subject)}</b>${ref}` : `your equipment${ref}`;
  const driverLine = `Your driver is <b>${esc(run.driverName)}</b>${run.driverPhone ? ` (${esc(run.driverPhone)})` : ""} in a ${esc(run.vehicleName)}.`;
  let subject = "";
  let title = "";
  let body = "";
  const w = etaWindow(stop, company);
  const verb = stop.type === "DELIVERY" ? "delivery" : "collection";

  if (kind === "OUT_FOR_DELIVERY") {
    subject = stop.type === "DELIVERY" ? `Out for delivery today: ${stop.subject || "your equipment"}${ref}` : `Collection today: ${stop.subject || "your equipment"}${ref}`;
    title = stop.type === "DELIVERY" ? "Your equipment is out for delivery" : "We are collecting today";
    body = `<p>Hi ${esc(who)},</p>
<p>${kitLine} is scheduled for ${verb} on <b>${esc(dateLabel)}</b>.</p>
<p style="font-size:18px;">Expected between <b>${w ? `${formatTime(w.from, tz)} and ${formatTime(w.to, tz)}` : "TBC"}</b></p>
<p>${driverLine}</p>
<p>${verb === "delivery" ? "Delivering to" : "Collecting from"}: ${esc(fullAddress(stop))}</p>
${goods.length ? `<p style="margin-bottom:4px;">What is coming:</p>${itemsList(stop.items)}` : ""}
<p>We will email again when the driver is on the way with a live arrival time. If anything changes at your end, reply to this email${company.dispatchPhone ? ` or call ${esc(company.dispatchPhone)}` : ""}.</p>`;
  } else if (kind === "ON_THE_WAY" || kind === "ETA_UPDATE") {
    const eta = extra.eta ?? stop.plannedArrival;
    subject = kind === "ON_THE_WAY" ? `Driver on the way: arriving about ${eta ? formatTime(eta, tz) : "soon"}${ref}` : `Updated arrival time: about ${eta ? formatTime(eta, tz) : "TBC"}${ref}`;
    title = kind === "ON_THE_WAY" ? "Your driver is on the way" : "Updated arrival time";
    body = `<p>Hi ${esc(who)},</p>
<p>${esc(run.driverName)} is ${kind === "ON_THE_WAY" ? "now heading to you" : "running to a new time"} with ${kitLine}.</p>
<p style="font-size:20px;">Arriving at about <b>${eta ? formatTime(eta, tz) : "TBC"}</b></p>
${extra.message ? `<p>${esc(extra.message)}</p>` : ""}
<p>${verb === "delivery" ? "Delivering to" : "Collecting from"}: ${esc(fullAddress(stop))}${run.driverPhone ? `<br>Driver's phone: ${esc(run.driverPhone)}` : ""}</p>`;
  } else if (kind === "COMPLETED") {
    subject = stop.type === "DELIVERY" ? `Delivered: ${stop.subject || "your equipment"}${ref}` : `Collected: ${stop.subject || "your equipment"}${ref}`;
    title = stop.type === "DELIVERY" ? "Delivered" : "Collected";
    body = `<p>Hi ${esc(who)},</p>
<p>${kitLine} was ${stop.type === "DELIVERY" ? "delivered" : "collected"} at <b>${extra.eta ? formatTime(extra.eta, tz) : formatTime(new Date(), tz)}</b>${extra.podName ? `, received by <b>${esc(extra.podName)}</b>` : ""}.</p>
${extra.message ? `<p>Driver's note: ${esc(extra.message)}</p>` : ""}
<p>Thank you for hiring from ${esc(company.companyName)}.</p>`;
  } else {
    subject = `Problem with today's ${verb}${ref}`;
    title = `A problem with your ${verb}`;
    body = `<p>Hi ${esc(who)},</p>
<p>Our driver ${esc(run.driverName)} has hit a problem with ${kitLine}:</p>
<p style="padding:8px 12px;background:#fef2f2;border-left:3px solid #ef4444;">${esc(extra.message || "Please contact us.")}</p>
<p>Someone from our team will be in touch shortly${company.dispatchPhone ? `, or call us on ${esc(company.dispatchPhone)}` : ""}.</p>`;
  }
  const text = `${title}\n${stop.clientName} ${ref}\n${extra.message ?? ""}`.trim();
  return { subject, html: layout(title, body, company), text };
}

/* ------------------------------------------------------------------------ */
/* Google Calendar description                                               */
/* ------------------------------------------------------------------------ */

export function calendarDescription(run: RunView, company: CompanyView): string {
  const tz = company.timezone;
  const lines: string[] = [];
  lines.push(`Vehicle: ${run.vehicleName}${run.vehicleRegistration ? ` (${run.vehicleRegistration})` : ""}`);
  lines.push(`Leave ${company.depotName}: ${run.plannedStart ? formatTime(run.plannedStart, tz) : "TBC"} (load from ${run.plannedStart ? formatTime(new Date(run.plannedStart.getTime() - company.loadingMinutes * 60_000), tz) : "TBC"})`);
  lines.push(`Back at depot: about ${run.plannedEnd ? formatTime(run.plannedEnd, tz) : "TBC"}`);
  lines.push(`${formatDistance(run.totalDistanceM)}, ${formatDuration(run.totalDurationS)}`);
  lines.push("");
  run.stops.forEach((s) => {
    lines.push(`${s.sequence}. ${s.plannedArrival ? formatTime(s.plannedArrival, tz) : "--:--"} ${s.type === "DELIVERY" ? "DELIVER" : "COLLECT"} - ${s.clientName}${s.opportunityNumber ? ` #${s.opportunityNumber}` : ""}`);
    if (s.subject) lines.push(`   ${s.subject}`);
    lines.push(`   ${fullAddress(s)}`);
    if (s.windowStart && s.windowEnd) lines.push(`   Slot ${formatTime(s.windowStart, tz)}-${formatTime(s.windowEnd, tz)}`);
    if (s.contactName || s.contactPhone) lines.push(`   Contact: ${[s.contactName, s.contactPhone, s.contactEmail].filter(Boolean).join(" · ")}`);
    for (const c of s.secondaryContacts) lines.push(`   Also: ${[c.name, c.role ? `(${c.role})` : "", c.phone, c.email].filter(Boolean).join(" ")}`);
    if (s.driverNotes) lines.push(`   Note: ${s.driverNotes}`);
    lines.push("");
  });
  lines.push(`Open on your phone: ${run.portalUrl}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------------ */
/* Internal alert when a driver reports a problem                            */
/* ------------------------------------------------------------------------ */

export function problemAlert(stop: StopView, run: RunView, company: CompanyView, message: string): EmailContent {
  const tz = company.timezone;
  const ref = stop.opportunityNumber ? ` #${stop.opportunityNumber}` : "";
  const subject = `Driver problem: ${stop.clientName}${ref} (${typeWord(stop.type)})`;
  const body = `<p>${esc(run.driverName)} reported a problem at <b>${formatTime(new Date(), tz)}</b> on the ${typeWord(stop.type)} for <b>${esc(stop.clientName)}</b>${ref}${stop.subject ? ` (${esc(stop.subject)})` : ""}.</p>
<p style="padding:8px 12px;background:#fef2f2;border-left:3px solid #ef4444;font-size:16px;">${esc(message || "No details given")}</p>
<p>Address: ${esc(fullAddress(stop))}<br>Client contact: ${esc([stop.contactName, stop.contactPhone, stop.contactEmail].filter(Boolean).join(" · "))}<br>Driver: ${esc(run.driverName)}${run.driverPhone ? ` · ${esc(run.driverPhone)}` : ""}</p>
<p>The client has not been emailed about this automatically.</p>`;
  return { subject, html: layout("Driver reported a problem", body, company), text: `${subject}\n${message}` };
}

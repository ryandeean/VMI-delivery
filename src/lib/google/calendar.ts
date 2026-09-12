/**
 * Google Calendar sync: one event per run on a shared "Deliveries" calendar,
 * with the driver invited when the credentials allow it.
 */
import { google, type calendar_v3 } from "googleapis";
import { config } from "../config";

export function calendarConfigured(): boolean {
  const c = config.googleCalendar();
  if (!c.calendarId) return false;
  if (c.serviceAccountJson) return true;
  return Boolean(c.oauthClientId && c.oauthClientSecret && c.oauthRefreshToken);
}

function parseServiceAccount(raw: string): { client_email: string; private_key: string } {
  let text = raw.trim();
  if (!text.startsWith("{")) text = Buffer.from(text, "base64").toString("utf8");
  const json = JSON.parse(text) as { client_email: string; private_key: string };
  return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, "\n") };
}

function calendarClient(): calendar_v3.Calendar {
  const c = config.googleCalendar();
  if (c.serviceAccountJson) {
    const sa = parseServiceAccount(c.serviceAccountJson);
    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
      subject: c.impersonate || undefined,
    });
    return google.calendar({ version: "v3", auth });
  }
  const oauth = new google.auth.OAuth2(c.oauthClientId, c.oauthClientSecret);
  oauth.setCredentials({ refresh_token: c.oauthRefreshToken });
  return google.calendar({ version: "v3", auth: oauth });
}

export type RunEventInput = {
  eventId?: string;
  summary: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  timezone: string;
  attendees: string[];
};

export type RunEventResult = { eventId: string; htmlLink: string; attendeesInvited: boolean };

export async function upsertRunEvent(input: RunEventInput): Promise<RunEventResult> {
  const cal = calendarClient();
  const calendarId = config.googleCalendar().calendarId;
  const body: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start.toISOString(), timeZone: input.timezone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timezone },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "email", minutes: 12 * 60 }] },
  };
  const attendees = input.attendees.filter(Boolean).map((email) => ({ email }));

  const attempt = async (withAttendees: boolean) => {
    const requestBody = withAttendees && attendees.length ? { ...body, attendees } : body;
    const sendUpdates = withAttendees && attendees.length ? "all" : "none";
    if (input.eventId) {
      try {
        const res = await cal.events.patch({ calendarId, eventId: input.eventId, requestBody, sendUpdates });
        return res.data;
      } catch (e) {
        const status = (e as { code?: number }).code;
        if (status !== 404 && status !== 410) throw e;
      }
    }
    const res = await cal.events.insert({ calendarId, requestBody, sendUpdates });
    return res.data;
  };

  try {
    const ev = await attempt(true);
    return { eventId: ev.id ?? "", htmlLink: ev.htmlLink ?? "", attendeesInvited: attendees.length > 0 };
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    // Service accounts without domain-wide delegation cannot invite attendees.
    if (attendees.length && /attendee|forbiddenForServiceAccounts|Domain-Wide/i.test(msg)) {
      const ev = await attempt(false);
      return { eventId: ev.id ?? "", htmlLink: ev.htmlLink ?? "", attendeesInvited: false };
    }
    throw e;
  }
}

export async function deleteRunEvent(eventId: string): Promise<void> {
  if (!eventId) return;
  const cal = calendarClient();
  try {
    await cal.events.delete({ calendarId: config.googleCalendar().calendarId, eventId, sendUpdates: "all" });
  } catch (e) {
    const status = (e as { code?: number }).code;
    if (status !== 404 && status !== 410) throw e;
  }
}

export async function calendarPing(): Promise<{ ok: boolean; message: string }> {
  try {
    const cal = calendarClient();
    const res = await cal.calendars.get({ calendarId: config.googleCalendar().calendarId });
    return { ok: true, message: `Connected to "${res.data.summary ?? res.data.id}"` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

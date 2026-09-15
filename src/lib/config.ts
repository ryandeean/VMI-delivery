/**
 * Central place for reading environment configuration and reporting which
 * integrations are switched on. Everything degrades gracefully: with no keys
 * the app runs in demo mode (sample orders, estimated routes, email previews).
 */

function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === null || v === "" ? fallback : v;
}

export const config = {
  // Render sets RENDER_EXTERNAL_URL to the service address, so APP_URL is optional there.
  appUrl: () => (env("APP_URL") || env("RENDER_EXTERNAL_URL") || "http://localhost:3000").replace(/\/$/, ""),
  appPassword: () => env("APP_PASSWORD"),
  appSecret: () => env("APP_SECRET", "dev-secret-not-for-production"),
  cronSecret: () => env("CRON_SECRET"),

  currentRms: () => ({
    subdomain: env("CURRENT_RMS_SUBDOMAIN"),
    apiKey: env("CURRENT_RMS_API_KEY"),
    importStates: env("CURRENT_RMS_IMPORT_STATES", "order,reserved")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    deliveryField: env("CURRENT_RMS_DELIVERY_FIELD"),
    deliveryValues: env("CURRENT_RMS_DELIVERY_VALUES", "delivery,deliver,delivery & collection,courier")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    volumeField: env("CURRENT_RMS_VOLUME_FIELD"),
    weightField: env("CURRENT_RMS_WEIGHT_FIELD"),
  }),

  googleMapsKey: () => env("GOOGLE_MAPS_API_KEY"),
  googleMapsBrowserKey: () => env("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY"),

  googleCalendar: () => ({
    serviceAccountJson: env("GOOGLE_SERVICE_ACCOUNT_JSON"),
    impersonate: env("GOOGLE_CALENDAR_IMPERSONATE"),
    oauthClientId: env("GOOGLE_OAUTH_CLIENT_ID"),
    oauthClientSecret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    oauthRefreshToken: env("GOOGLE_OAUTH_REFRESH_TOKEN"),
    calendarId: env("GOOGLE_CALENDAR_ID"),
  }),

  smtp: () => ({
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT", "587")),
    secure: env("SMTP_SECURE", "false") === "true",
    user: env("SMTP_USER"),
    pass: env("SMTP_PASS"),
    from: env("EMAIL_FROM", "VMI Deliveries <deliveries@example.com>"),
  }),
};

export type IntegrationStatus = {
  key: string;
  label: string;
  configured: boolean;
  detail: string;
};

export function integrationStatus(): IntegrationStatus[] {
  const c = config.currentRms();
  const cal = config.googleCalendar();
  const smtp = config.smtp();
  const calConfigured =
    Boolean(cal.calendarId) &&
    (Boolean(cal.serviceAccountJson) ||
      (Boolean(cal.oauthClientId) && Boolean(cal.oauthClientSecret) && Boolean(cal.oauthRefreshToken)));
  return [
    {
      key: "current",
      label: "Current RMS",
      configured: Boolean(c.subdomain && c.apiKey),
      detail: c.subdomain && c.apiKey ? `Connected to ${c.subdomain}.current-rms.com` : "Demo mode: sample orders are used until CURRENT_RMS_SUBDOMAIN and CURRENT_RMS_API_KEY are set.",
    },
    {
      key: "maps",
      label: "Google Maps (routes & traffic)",
      configured: Boolean(config.googleMapsKey()),
      detail: config.googleMapsKey()
        ? "Traffic-aware routing and geocoding are on."
        : "Estimated routes only (straight-line distances, average speeds). Set GOOGLE_MAPS_API_KEY for live traffic.",
    },
    {
      key: "map-display",
      label: "Map on dispatch screen",
      configured: Boolean(config.googleMapsBrowserKey()),
      detail: config.googleMapsBrowserKey() ? "Interactive Google map is on." : "Simple schematic map is shown. Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY for the Google map.",
    },
    {
      key: "calendar",
      label: "Google Calendar",
      configured: calConfigured,
      detail: calConfigured ? `Runs are written to calendar "${cal.calendarId}".` : "Calendar sync is off until Google credentials and GOOGLE_CALENDAR_ID are set.",
    },
    {
      key: "email",
      label: "Email",
      configured: Boolean(smtp.host && smtp.user),
      detail: smtp.host && smtp.user ? `Sending via ${smtp.host} as ${smtp.from}.` : "Preview mode: emails are saved to the Notifications page instead of being sent.",
    },
  ];
}

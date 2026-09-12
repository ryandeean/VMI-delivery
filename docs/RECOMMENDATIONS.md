# What to add next

This app already covers the brief: importing from Current RMS, sizing vans, checking who is in, planning runs against traffic and delivery slots, Google Calendar, driver and account-handler emails, live client updates, and a driver phone view with all contact details. Below are the features that similar tools (Onfleet, Circuit for Teams, Routific, OptimoRoute, Detrack, Bringg, Rentman's transport module) treat as standard, in the order they are likely to pay off for a hire company. Each is a natural extension of what is here.

## First priorities

1. **Proof of delivery.** Signature on the driver's phone (finger drawn), a photo of the kit where it was left, and the checklist of items ticked off against the order. Cuts "we never received the second tripod" disputes to nothing. The driver view already collects the receiver's name and notes; adding a signature pad and photo upload to the *Delivered* step is a small change, and the images can be attached to the "Delivered" email and stored against the Current RMS opportunity as an attachment.

2. **Text messages to clients and drivers.** Email is fine for "out for delivery" but a text at "driver is 10 minutes away" gets read. Twilio (or Vonage) can be added behind the same notification layer, with a per-job toggle. Drivers can also get their run link and any changes by text.

3. **Live tracking link for the client.** A page the client opens from the email showing the van moving on a map with a countdown, like a takeaway delivery. It needs the driver's phone to share its location (a couple of lines in the driver view using the browser's geolocation) and gives the office a live picture of every van without ringing anyone.

4. **Write back to Current RMS.** When a stop is completed, post an activity note or update the opportunity ("Delivered 10:42, signed by H. Reid") so the account handler sees it where they already work. Collections could also flag missing items to speed up check-in.

5. **Kit-ready flag from the warehouse.** A run should not be published until prep has finished. A simple "ready to load" tick per order (or reading a Current RMS custom field / status) stops drivers being sent out before the kit is picked, and lets the loading order match the drop order (last drop loaded first).

## Operational extras

6. **Week view and capacity warnings.** A screen showing the next seven days with jobs, drivers available and vans free per day, highlighting days that are overbooked before they arrive. The data for this is already in the system.

7. **Vehicle and driver compliance.** Daily walk-around checklist with defect reporting, MOT, tax, insurance and service reminders per vehicle, and a warning when a planned run would push a driver past their allowed hours or through a break.

8. **Preferred drivers and site knowledge.** Remember per client address: access instructions, parking, gate codes, who usually signs, preferred driver. Today these can be typed into the job's driver notes; saving them per address means they appear automatically next time.

9. **Third-party couriers.** When the fleet is full, book a courier (or record one booked by hand) so the job still appears on the board with its own status and cost, and the client still gets tracking emails.

10. **Costing and reporting.** Mileage, drive time and driver time per job so transport can be charged back accurately, plus simple reports: on-time percentage, stops per driver per day, distance per week, late or failed stops with reasons.

11. **Recurring and standing orders.** Weekly studio drops or regular collections created automatically, with the usual driver and slot.

12. **Slot booking for account handlers.** Let account handlers pick a delivery slot from what is actually free on that day when they take the booking (a small form or an embedded page), instead of promising a time and hoping.

## Platform improvements

13. **Proper user accounts.** Sign in with Google Workspace; roles for dispatcher (edit everything), account handler (see their own jobs, add notes) and driver. The current shared password is adequate to start but not long term.

14. **Push notifications and offline use.** Turning the driver view into an installable web app with push messages ("your run has changed") and offline caching of the day's stops for basements and studio lots with no signal.

15. **Two-way calendar and holiday sync.** Read driver holidays from the HR or Workspace calendar instead of typing them, and let drivers accept or decline the run invitation to confirm they have seen it.

16. **Automatic re-planning during the day.** If a stop runs 40 minutes late, re-check the rest of the run against traffic and warn the office (and email the affected clients) without anyone pressing a button. The live-ETA reflow is already there; this adds a timer and thresholds.

17. **Postgres and hosting.** Move from SQLite to Postgres when more than one office user is planning at once or when hosting on a serverless platform (a one-line change described in the README).

## Things to check with the team before going live

* Which Current RMS states and custom fields mark an order as "needs delivery", and where product dimensions are kept, so the importer can be pointed at the right fields.
* Real usable capacities for each van (the defaults are typical figures).
* Whether drivers should receive one calendar event per run (current) or one per stop.
* Who should be copied on client emails, and the wording of the templates (all in one file, `src/lib/email/templates.ts`).

/**
 * Sample orders used when Current RMS is not connected, so the app can be
 * explored (and demonstrated) straight away. Addresses are real London
 * locations with coordinates, so routing works without a Google key.
 */
import { addDays, zonedDateTime } from "../time";
import type { ImportedJob } from "./types";

type DemoClient = {
  client: string;
  contact: string;
  phone: string;
  email: string;
  secondary: { name: string; phone: string; email: string; role?: string }[];
  address1: string;
  address2: string;
  city: string;
  postcode: string;
  lat: number;
  lng: number;
  handler: string;
  handlerEmail: string;
};

const CLIENTS: DemoClient[] = [
  { client: "Pinewood Studios", contact: "Hannah Reid", phone: "07700 900101", email: "hannah.reid@example.com", secondary: [{ name: "Stage 5 reception", phone: "01753 000000", email: "stage5@example.com", role: "Reception" }], address1: "Pinewood Road", address2: "Stage 5", city: "Iver Heath", postcode: "SL0 0NH", lat: 51.5487, lng: -0.5347, handler: "Tom Barker", handlerEmail: "tom@example.com" },
  { client: "BBC Television Centre", contact: "Marcus Osei", phone: "07700 900102", email: "marcus.osei@example.com", secondary: [{ name: "Priya Shah", phone: "07700 900112", email: "priya.shah@example.com", role: "Producer" }], address1: "101 Wood Lane", address2: "", city: "London", postcode: "W12 7FA", lat: 51.5103, lng: -0.2262, handler: "Tom Barker", handlerEmail: "tom@example.com" },
  { client: "Shoreditch Studios", contact: "Ella Fitzgerald", phone: "07700 900103", email: "ella@example.com", secondary: [], address1: "37 Bateman's Row", address2: "", city: "London", postcode: "EC2A 3HH", lat: 5.0 + 46.5254, lng: -0.0781, handler: "Jess Cole", handlerEmail: "jess@example.com" },
  { client: "Warner Bros. Studios Leavesden", contact: "Daniel Kim", phone: "07700 900104", email: "dkim@example.com", secondary: [{ name: "Security gate", phone: "01923 000000", email: "", role: "Gatehouse" }], address1: "Warner Drive", address2: "", city: "Leavesden", postcode: "WD25 7LR", lat: 51.6905, lng: -0.4181, handler: "Jess Cole", handlerEmail: "jess@example.com" },
  { client: "Sky Studios Elstree", contact: "Sophie Turner", phone: "07700 900105", email: "sophie.t@example.com", secondary: [], address1: "Rowley Lane", address2: "", city: "Borehamwood", postcode: "WD6 5PL", lat: 51.6634, lng: -0.2941, handler: "Tom Barker", handlerEmail: "tom@example.com" },
  { client: "Big Sky Studios", contact: "Omar Haddad", phone: "07700 900106", email: "omar@example.com", secondary: [{ name: "Loading bay", phone: "020 7000 0000", email: "", role: "Goods in" }], address1: "Brewery Road", address2: "", city: "London", postcode: "N7 9QJ", lat: 51.5432, lng: -0.1191, handler: "Jess Cole", handlerEmail: "jess@example.com" },
  { client: "Ealing Studios", contact: "Grace Lee", phone: "07700 900107", email: "grace@example.com", secondary: [], address1: "Ealing Green", address2: "", city: "London", postcode: "W5 5EP", lat: 51.5093, lng: -0.3054, handler: "Tom Barker", handlerEmail: "tom@example.com" },
  { client: "Three Mills Studios", contact: "Ben Carter", phone: "07700 900108", email: "ben.carter@example.com", secondary: [{ name: "Amy Wong", phone: "07700 900118", email: "amy@example.com", role: "Production coordinator" }], address1: "Three Mill Lane", address2: "", city: "London", postcode: "E3 3DU", lat: 51.5279, lng: -0.0074, handler: "Jess Cole", handlerEmail: "jess@example.com" },
  { client: "Twickenham Film Studios", contact: "Laura Green", phone: "07700 900109", email: "laura@example.com", secondary: [], address1: "The Barons", address2: "St Margarets", city: "Twickenham", postcode: "TW1 2AW", lat: 51.4573, lng: -0.3197, handler: "Tom Barker", handlerEmail: "tom@example.com" },
  { client: "Wimbledon Studios", contact: "James Patel", phone: "07700 900110", email: "james.p@example.com", secondary: [], address1: "1 Deer Park Road", address2: "", city: "London", postcode: "SW19 3TL", lat: 51.4102, lng: -0.1917, handler: "Jess Cole", handlerEmail: "jess@example.com" },
  { client: "Riverside Studios", contact: "Chloe Adams", phone: "07700 900111", email: "chloe@example.com", secondary: [], address1: "101 Queen Caroline Street", address2: "", city: "London", postcode: "W6 9BN", lat: 51.4896, lng: -0.2237, handler: "Tom Barker", handlerEmail: "tom@example.com" },
  { client: "Canary Wharf Group", contact: "Ravi Menon", phone: "07700 900113", email: "ravi@example.com", secondary: [{ name: "Loading dock", phone: "020 7418 0000", email: "", role: "Dock office" }], address1: "One Canada Square", address2: "Level 30", city: "London", postcode: "E14 5AB", lat: 51.5049, lng: -0.0197, handler: "Jess Cole", handlerEmail: "jess@example.com" },
];

// Fix a typo-proof latitude for Shoreditch (kept simple to read above).
CLIENTS[2].lat = 51.5254;

const KITS: { subject: string; items: ImportedJob["items"] }[] = [
  { subject: "ARRI Alexa 35 package", items: [{ name: "ARRI Alexa 35 body", quantity: 1, volumeM3: 0.08, weightKg: 12 }, { name: "Zeiss Supreme Prime set (7)", quantity: 1, volumeM3: 0.12, weightKg: 22 }, { name: "Sachtler Flowtech tripod", quantity: 1, volumeM3: 0.06, weightKg: 9 }, { name: "V-mount batteries (8)", quantity: 1, volumeM3: 0.03, weightKg: 8 }, { name: "Delivery", quantity: 1, isService: true }] },
  { subject: "Sony FX9 doc kit", items: [{ name: "Sony FX9 body", quantity: 1, volumeM3: 0.05, weightKg: 6 }, { name: "Sony 28-135 f4", quantity: 1, volumeM3: 0.01, weightKg: 2 }, { name: "Sennheiser MKH 416 + boom", quantity: 1, volumeM3: 0.02, weightKg: 2 }, { name: "Delivery", quantity: 1, isService: true }] },
  { subject: "Lighting: Skypanel package", items: [{ name: "ARRI Skypanel S60-C", quantity: 4, volumeM3: 0.25, weightKg: 22 }, { name: "Combo stands", quantity: 6, volumeM3: 0.08, weightKg: 9 }, { name: "Sandbags (12)", quantity: 1, volumeM3: 0.15, weightKg: 90 }, { name: "Distro & cable", quantity: 1, volumeM3: 0.3, weightKg: 40 }, { name: "Delivery", quantity: 1, isService: true }] },
  { subject: "Multicam studio package", items: [{ name: "Sony FX6 body", quantity: 3, volumeM3: 0.05, weightKg: 5 }, { name: "ATEM Mini Extreme", quantity: 1, volumeM3: 0.02, weightKg: 2 }, { name: '27" monitors', quantity: 3, volumeM3: 0.09, weightKg: 8 }, { name: "Cable trunk", quantity: 2, volumeM3: 0.35, weightKg: 45 }, { name: "Delivery", quantity: 1, isService: true }] },
  { subject: "Grip: dolly & track", items: [{ name: "Panther Classic dolly", quantity: 1, volumeM3: 0.9, weightKg: 140 }, { name: "Track 8ft (6)", quantity: 1, volumeM3: 0.6, weightKg: 70 }, { name: "Apple boxes set", quantity: 2, volumeM3: 0.25, weightKg: 18 }, { name: "Delivery", quantity: 1, isService: true }] },
  { subject: "Big set lighting", items: [{ name: "ARRI M18 HMI", quantity: 4, volumeM3: 0.4, weightKg: 35 }, { name: "12x12 frame & rags", quantity: 2, volumeM3: 0.5, weightKg: 30 }, { name: "Skypanel S360", quantity: 2, volumeM3: 0.6, weightKg: 45 }, { name: "Distro 63A", quantity: 1, volumeM3: 0.5, weightKg: 80 }, { name: "Stands & sandbags", quantity: 1, volumeM3: 1.4, weightKg: 200 }, { name: "Delivery", quantity: 1, isService: true }] },
  { subject: "RED V-Raptor package", items: [{ name: "RED V-Raptor 8K", quantity: 1, volumeM3: 0.06, weightKg: 8 }, { name: "Cooke S7/i set", quantity: 1, volumeM3: 0.15, weightKg: 28 }, { name: "Easyrig Vario 5", quantity: 1, volumeM3: 0.08, weightKg: 6 }, { name: "Delivery", quantity: 1, isService: true }] },
  { subject: "Audio & monitors", items: [{ name: "Sound Devices 888", quantity: 1, volumeM3: 0.02, weightKg: 3 }, { name: "Wireless lav kit (4)", quantity: 1, volumeM3: 0.03, weightKg: 4 }, { name: "SmallHD 24\" monitor", quantity: 2, volumeM3: 0.08, weightKg: 7 }, { name: "Delivery", quantity: 1, isService: true }] },
];

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Deterministic sample jobs for a date range (weekdays get 4-6 jobs, weekends 1). */
export function demoJobs(from: string, to: string, tz: string): ImportedJob[] {
  const jobs: ImportedJob[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const n = dayNumber(date);
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    const count = dow === 0 || dow === 6 ? 1 : 4 + (n % 3);
    for (let i = 0; i < count; i++) {
      const c = CLIENTS[(n * 5 + i * 7) % CLIENTS.length];
      const kit = KITS[(n + i * 3) % KITS.length];
      const type: ImportedJob["type"] = i % 3 === 2 ? "COLLECTION" : "DELIVERY";
      const oppId = 10_000 + ((n * 17 + i * 31) % 9000);
      const slot = type === "DELIVERY" ? [["08:00", "10:00"], ["09:00", "12:00"], ["07:30", "09:00"], ["10:00", "13:00"]][i % 4] : [["14:00", "17:00"], ["16:00", "18:30"], ["13:00", "16:00"]][i % 3];
      jobs.push({
        externalId: `demo-${oppId}:${type}`,
        opportunityId: oppId,
        opportunityNumber: `Q${oppId}`,
        subject: kit.subject,
        type,
        clientName: c.client,
        contactName: c.contact,
        contactPhone: c.phone,
        contactEmail: c.email,
        secondaryContacts: c.secondary,
        accountHandlerName: c.handler,
        accountHandlerEmail: c.handlerEmail,
        addressLine1: c.address1,
        addressLine2: c.address2,
        city: c.city,
        postcode: c.postcode,
        country: "United Kingdom",
        lat: c.lat,
        lng: c.lng,
        date,
        windowStart: zonedDateTime(date, slot[0], tz),
        windowEnd: zonedDateTime(date, slot[1], tz),
        items: kit.items,
        notes: i === 0 ? "Ring the contact 15 minutes before arrival; parking via the gatehouse." : "",
      });
    }
  }
  return jobs;
}

export const DEMO_DEPOT = { name: "VMI Warehouse (demo)", address: "Unit 3, Chase Road, Park Royal, London NW10 6PS", lat: 51.5297, lng: -0.2696 };

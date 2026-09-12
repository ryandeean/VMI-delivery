/**
 * Demo seed: a small fleet, a few drivers and a week of sample orders so the
 * app is usable the moment it starts. Safe to re-run.
 */
import { PrismaClient } from "@prisma/client";
import { DEMO_DEPOT } from "../src/lib/currentrms/demo";
import { syncJobs } from "../src/lib/services/sync";
import { addDays, todayString } from "../src/lib/time";

const prisma = new PrismaClient();

async function main() {
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, depotName: DEMO_DEPOT.name, depotAddress: DEMO_DEPOT.address, depotLat: DEMO_DEPOT.lat, depotLng: DEMO_DEPOT.lng, dispatchEmail: "dispatch@example.com", dispatchPhone: "020 8000 0000" },
    update: {},
  });

  const vehicles = [
    { name: "Van 1 (Caddy)", registration: "LX21 AAA", vehicleClass: "SMALL_VAN", capacityVolumeM3: 3.5, capacityWeightKg: 650, licenceRequired: "B" },
    { name: "Van 2 (Transit Custom)", registration: "LX22 BBB", vehicleClass: "MEDIUM_VAN", capacityVolumeM3: 6.5, capacityWeightKg: 1000, licenceRequired: "B" },
    { name: "Van 3 (Sprinter LWB)", registration: "LX23 CCC", vehicleClass: "LARGE_VAN", capacityVolumeM3: 13, capacityWeightKg: 1200, licenceRequired: "B" },
    { name: "Luton (tail lift)", registration: "LX20 DDD", vehicleClass: "LUTON", capacityVolumeM3: 20, capacityWeightKg: 1000, licenceRequired: "B" },
  ];
  for (const v of vehicles) {
    const existing = await prisma.vehicle.findFirst({ where: { registration: v.registration } });
    if (!existing) await prisma.vehicle.create({ data: v });
  }

  const drivers = [
    { name: "Sam Patel", email: "sam@example.com", phone: "07700 900201", licenceCategories: "B", workingDays: "1,2,3,4,5" },
    { name: "Alex Murphy", email: "alex@example.com", phone: "07700 900202", licenceCategories: "B,C1", workingDays: "1,2,3,4,5,6" },
    { name: "Jordan Lee", email: "jordan@example.com", phone: "07700 900203", licenceCategories: "B", workingDays: "2,3,4,5,6" },
  ];
  for (const d of drivers) {
    const existing = await prisma.driver.findFirst({ where: { email: d.email } });
    if (!existing) await prisma.driver.create({ data: d });
  }

  const today = todayString();
  const summary = await syncJobs(today, addDays(today, 7));
  console.log(`Seeded ${vehicles.length} vehicles, ${drivers.length} drivers. ${summary.message}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

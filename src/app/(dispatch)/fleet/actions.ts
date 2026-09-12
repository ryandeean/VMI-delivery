"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { vehicleClass } from "@/lib/vehicles";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function vehicleData(fd: FormData) {
  const cls = vehicleClass(str(fd, "vehicleClass"));
  return {
    name: str(fd, "name") || cls.label,
    registration: str(fd, "registration").toUpperCase(),
    vehicleClass: cls.code,
    capacityVolumeM3: Number(str(fd, "capacityVolumeM3")) || cls.typicalVolumeM3,
    capacityWeightKg: Number(str(fd, "capacityWeightKg")) || cls.typicalWeightKg,
    licenceRequired: str(fd, "licenceRequired") || cls.licence,
    notes: str(fd, "notes"),
    active: fd.get("active") !== "off",
  };
}

export async function addVehicleAction(formData: FormData) {
  await prisma.vehicle.create({ data: vehicleData(formData) });
  revalidatePath("/fleet");
}

export async function updateVehicleAction(formData: FormData) {
  const id = str(formData, "id");
  await prisma.vehicle.update({ where: { id }, data: { ...vehicleData(formData), active: formData.get("active") === "on" } });
  revalidatePath("/fleet");
}

export async function deleteVehicleAction(formData: FormData) {
  const id = str(formData, "id");
  await prisma.vehicle.delete({ where: { id } });
  revalidatePath("/fleet");
}

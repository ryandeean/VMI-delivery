-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT 'VMI',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "depotName" TEXT NOT NULL DEFAULT 'VMI Warehouse',
    "depotAddress" TEXT NOT NULL DEFAULT '',
    "depotLat" REAL,
    "depotLng" REAL,
    "dayStart" TEXT NOT NULL DEFAULT '07:00',
    "dayEnd" TEXT NOT NULL DEFAULT '19:00',
    "loadingMinutes" INTEGER NOT NULL DEFAULT 30,
    "defaultServiceMinutes" INTEGER NOT NULL DEFAULT 20,
    "startBufferMinutes" INTEGER NOT NULL DEFAULT 15,
    "packingFactor" REAL NOT NULL DEFAULT 1.3,
    "defaultItemVolumeM3" REAL NOT NULL DEFAULT 0.05,
    "defaultItemWeightKg" REAL NOT NULL DEFAULT 5,
    "clientEtaWindowMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxStopsPerRun" INTEGER NOT NULL DEFAULT 10,
    "maxRunHours" REAL NOT NULL DEFAULT 9,
    "dispatchEmail" TEXT NOT NULL DEFAULT '',
    "dispatchPhone" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "registration" TEXT NOT NULL DEFAULT '',
    "vehicleClass" TEXT NOT NULL,
    "capacityVolumeM3" REAL NOT NULL,
    "capacityWeightKg" REAL NOT NULL,
    "licenceRequired" TEXT NOT NULL DEFAULT 'B',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "licenceCategories" TEXT NOT NULL DEFAULT 'B',
    "workingDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "portalToken" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DriverAbsence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverAbsence_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "opportunityId" INTEGER,
    "opportunityNumber" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "clientName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "secondaryContacts" TEXT NOT NULL DEFAULT '[]',
    "accountHandlerName" TEXT NOT NULL DEFAULT '',
    "accountHandlerEmail" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'United Kingdom',
    "lat" REAL,
    "lng" REAL,
    "date" TEXT NOT NULL,
    "windowStart" DATETIME,
    "windowEnd" DATETIME,
    "serviceMinutes" INTEGER NOT NULL DEFAULT 20,
    "volumeM3" REAL NOT NULL DEFAULT 0,
    "weightKg" REAL NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "items" TEXT NOT NULL DEFAULT '[]',
    "loadOverride" BOOLEAN NOT NULL DEFAULT false,
    "requiredVehicleClass" TEXT NOT NULL DEFAULT 'SMALL_VAN',
    "status" TEXT NOT NULL DEFAULT 'UNSCHEDULED',
    "notes" TEXT NOT NULL DEFAULT '',
    "driverNotes" TEXT NOT NULL DEFAULT '',
    "clientNotify" BOOLEAN NOT NULL DEFAULT true,
    "runId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "plannedArrival" DATETIME,
    "plannedDeparture" DATETIME,
    "legDistanceM" INTEGER NOT NULL DEFAULT 0,
    "legDurationS" INTEGER NOT NULL DEFAULT 0,
    "waitS" INTEGER NOT NULL DEFAULT 0,
    "lateS" INTEGER NOT NULL DEFAULT 0,
    "liveEta" DATETIME,
    "enRouteAt" DATETIME,
    "arrivedAt" DATETIME,
    "completedAt" DATETIME,
    "outcome" TEXT NOT NULL DEFAULT '',
    "podName" TEXT NOT NULL DEFAULT '',
    "podNotes" TEXT NOT NULL DEFAULT '',
    "lastClientEmailAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "plannedStart" DATETIME,
    "plannedEnd" DATETIME,
    "startLocked" BOOLEAN NOT NULL DEFAULT false,
    "manualOrder" BOOLEAN NOT NULL DEFAULT false,
    "totalDistanceM" INTEGER NOT NULL DEFAULT 0,
    "totalDurationS" INTEGER NOT NULL DEFAULT 0,
    "polyline" TEXT NOT NULL DEFAULT '',
    "routeSource" TEXT NOT NULL DEFAULT '',
    "optimisedAt" DATETIME,
    "calendarEventId" TEXT NOT NULL DEFAULT '',
    "publishedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Run_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Run_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT NOT NULL DEFAULT '',
    "runId" TEXT,
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NotificationLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currentItemId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "volumeM3" REAL,
    "weightKg" REAL,
    "source" TEXT NOT NULL DEFAULT 'CURRENT_RMS',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "message" TEXT NOT NULL DEFAULT '',
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_portalToken_key" ON "Driver"("portalToken");

-- CreateIndex
CREATE UNIQUE INDEX "Job_externalId_key" ON "Job"("externalId");

-- CreateIndex
CREATE INDEX "Job_date_idx" ON "Job"("date");

-- CreateIndex
CREATE INDEX "Job_runId_idx" ON "Job"("runId");

-- CreateIndex
CREATE INDEX "Run_date_idx" ON "Run"("date");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductProfile_currentItemId_key" ON "ProductProfile"("currentItemId");

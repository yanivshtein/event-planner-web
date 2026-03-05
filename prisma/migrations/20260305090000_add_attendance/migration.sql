CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Attendance_eventId_userId_key" ON "Attendance"("eventId", "userId");
CREATE INDEX "Attendance_eventId_idx" ON "Attendance"("eventId");
CREATE INDEX "Attendance_userId_idx" ON "Attendance"("userId");

ALTER TABLE "Attendance"
ADD CONSTRAINT "Attendance_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attendance"
ADD CONSTRAINT "Attendance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

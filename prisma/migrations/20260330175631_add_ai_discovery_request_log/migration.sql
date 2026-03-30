-- CreateTable
CREATE TABLE "public"."AiDiscoveryRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "queryLength" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDiscoveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiDiscoveryRequest_userId_createdAt_idx" ON "public"."AiDiscoveryRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiDiscoveryRequest_createdAt_idx" ON "public"."AiDiscoveryRequest"("createdAt");

-- CreateIndex
CREATE INDEX "AiDiscoveryRequest_userId_status_createdAt_idx" ON "public"."AiDiscoveryRequest"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."AiDiscoveryRequest" ADD CONSTRAINT "AiDiscoveryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

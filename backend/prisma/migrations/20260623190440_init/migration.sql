-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DATA_ENTRY');

-- CreateEnum
CREATE TYPE "ScoringCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REPORTING', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('FINAL_COMPETITION', 'FAMILY', 'COMMITTEE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('GENERATED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "committee_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "families" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stage_id" UUID NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committees" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weight_percentage" DECIMAL(5,2) NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria" (
    "id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "max_score" DECIMAL(8,2) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_cycles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "center_name" TEXT,
    "event_name" TEXT,
    "period_label" TEXT,
    "status" "ScoringCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scoring_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" UUID NOT NULL,
    "scoring_cycle_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "score" DECIMAL(8,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" UUID NOT NULL,
    "scoring_cycle_id" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'GENERATED',
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "checksum_sha256" TEXT,
    "generated_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_archives" (
    "id" UUID NOT NULL,
    "scoring_cycle_id" UUID NOT NULL,
    "snapshot_version" INTEGER NOT NULL DEFAULT 1,
    "archived_by" UUID NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formula_version" TEXT NOT NULL DEFAULT 'normalized-v1',

    CONSTRAINT "score_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_archive_items" (
    "id" UUID NOT NULL,
    "archive_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "family_name" TEXT NOT NULL,
    "stage_id" UUID NOT NULL,
    "stage_name" TEXT NOT NULL,
    "committee_id" UUID NOT NULL,
    "committee_name" TEXT NOT NULL,
    "committee_weight" DECIMAL(5,2) NOT NULL,
    "criterion_id" UUID NOT NULL,
    "criterion_title" TEXT NOT NULL,
    "criterion_max_score" DECIMAL(8,2) NOT NULL,
    "score" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "score_archive_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_archive_rankings" (
    "id" UUID NOT NULL,
    "archive_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "family_name" TEXT NOT NULL,
    "stage_id" UUID NOT NULL,
    "stage_name" TEXT NOT NULL,
    "final_score" DECIMAL(10,4) NOT NULL,
    "overall_rank" INTEGER NOT NULL,
    "stage_rank" INTEGER NOT NULL,
    "breakdown" JSONB,

    CONSTRAINT "score_archive_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "stages_name_key" ON "stages"("name");

-- CreateIndex
CREATE UNIQUE INDEX "families_stage_id_name_key" ON "families"("stage_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "committees_name_key" ON "committees"("name");

-- CreateIndex
CREATE INDEX "criteria_committee_id_idx" ON "criteria"("committee_id");

-- CreateIndex
CREATE INDEX "scores_scoring_cycle_id_criterion_id_idx" ON "scores"("scoring_cycle_id", "criterion_id");

-- CreateIndex
CREATE INDEX "scores_family_id_idx" ON "scores"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "scores_scoring_cycle_id_family_id_criterion_id_key" ON "scores"("scoring_cycle_id", "family_id", "criterion_id");

-- CreateIndex
CREATE INDEX "report_exports_scoring_cycle_id_idx" ON "report_exports"("scoring_cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "score_archives_scoring_cycle_id_snapshot_version_key" ON "score_archives"("scoring_cycle_id", "snapshot_version");

-- CreateIndex
CREATE INDEX "score_archive_items_archive_id_family_id_idx" ON "score_archive_items"("archive_id", "family_id");

-- CreateIndex
CREATE INDEX "score_archive_items_archive_id_committee_id_idx" ON "score_archive_items"("archive_id", "committee_id");

-- CreateIndex
CREATE INDEX "score_archive_rankings_archive_id_stage_id_idx" ON "score_archive_rankings"("archive_id", "stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "score_archive_rankings_archive_id_family_id_key" ON "score_archive_rankings"("archive_id", "family_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_scoring_cycle_id_fkey" FOREIGN KEY ("scoring_cycle_id") REFERENCES "scoring_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_scoring_cycle_id_fkey" FOREIGN KEY ("scoring_cycle_id") REFERENCES "scoring_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_archives" ADD CONSTRAINT "score_archives_scoring_cycle_id_fkey" FOREIGN KEY ("scoring_cycle_id") REFERENCES "scoring_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_archives" ADD CONSTRAINT "score_archives_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_archive_items" ADD CONSTRAINT "score_archive_items_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "score_archives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_archive_rankings" ADD CONSTRAINT "score_archive_rankings_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "score_archives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

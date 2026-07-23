CREATE TYPE "OnboardingMilestoneType" AS ENUM (
  'operator_received',
  'homepage_ready',
  'live_software_ready',
  'helper_software_ready',
  'prejob_learning_completed',
  'prelive_check_completed',
  'first_live_completed',
  'first_live_review_completed'
);

CREATE TYPE "OnboardingMilestoneStatus" AS ENUM ('pending', 'completed');
CREATE TYPE "SubmissionAssignmentStatus" AS ENUM ('pending_confirmation', 'confirmed');

CREATE TABLE "anchor_onboarding_progress" (
  "id" UUID NOT NULL,
  "anchor_profile_id" UUID NOT NULL,
  "current_stage" "OnboardingMilestoneType" NOT NULL DEFAULT 'operator_received',
  "first_live_at" TIMESTAMP(3),
  "first_live_blocked_reason" TEXT,
  "first_review_completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "anchor_onboarding_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "anchor_onboarding_milestones" (
  "id" UUID NOT NULL,
  "progress_id" UUID NOT NULL,
  "type" "OnboardingMilestoneType" NOT NULL,
  "status" "OnboardingMilestoneStatus" NOT NULL DEFAULT 'pending',
  "completed_at" TIMESTAMP(3),
  "completed_by" VARCHAR(64),
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "anchor_onboarding_milestones_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "submissions"
  ADD COLUMN "anchor_profile_id" UUID,
  ADD COLUMN "operator_assignment_id" UUID,
  ADD COLUMN "anchor_display_name_snapshot" VARCHAR(100),
  ADD COLUMN "operator_name_snapshot" VARCHAR(100),
  ADD COLUMN "operator_assignment_status" "SubmissionAssignmentStatus" NOT NULL DEFAULT 'confirmed';

UPDATE "submissions" s
SET
  "anchor_display_name_snapshot" = s."anchor_name",
  "operator_name_snapshot" = o."display_name"
FROM "operator_accounts" o
WHERE o."id" = s."operator_id";

CREATE UNIQUE INDEX "anchor_onboarding_progress_anchor_profile_id_key"
  ON "anchor_onboarding_progress"("anchor_profile_id");
CREATE UNIQUE INDEX "anchor_onboarding_milestones_progress_id_type_key"
  ON "anchor_onboarding_milestones"("progress_id", "type");
CREATE INDEX "idx_submissions_anchor_assignment_status"
  ON "submissions"("anchor_profile_id", "operator_assignment_status");

ALTER TABLE "anchor_onboarding_progress"
  ADD CONSTRAINT "anchor_onboarding_progress_anchor_profile_id_fkey"
  FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "anchor_onboarding_milestones"
  ADD CONSTRAINT "anchor_onboarding_milestones_progress_id_fkey"
  FOREIGN KEY ("progress_id") REFERENCES "anchor_onboarding_progress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_anchor_profile_id_fkey"
  FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_operator_assignment_id_fkey"
  FOREIGN KEY ("operator_assignment_id") REFERENCES "anchor_operator_assignments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

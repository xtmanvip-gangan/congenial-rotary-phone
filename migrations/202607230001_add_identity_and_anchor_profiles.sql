CREATE TYPE "StaffRole" AS ENUM (
  'audit_teacher',
  'operator',
  'training_teacher',
  'training_admin'
);

CREATE TYPE "ActivationTaskStatus" AS ENUM (
  'pending',
  'invited',
  'activated',
  'cancelled'
);

CREATE TYPE "AnchorProfileStatus" AS ENUM (
  'active',
  'paused',
  'exited'
);

CREATE TYPE "OperatorAssignmentStatus" AS ENUM (
  'pending_confirmation',
  'confirmed',
  'rejected',
  'ended'
);

CREATE TABLE "staff_role_assignments" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "role" "StaffRole" NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_role_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_role_assignments_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "operator_accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "staff_role_assignments_account_id_role_key"
  ON "staff_role_assignments"("account_id", "role");

CREATE TABLE "anchor_profiles" (
  "id" UUID NOT NULL,
  "wecom_user_record_id" UUID NOT NULL,
  "anchor_display_name" VARCHAR(100) NOT NULL,
  "current_operator_id" UUID,
  "assignment_status" "OperatorAssignmentStatus",
  "source" VARCHAR(30) NOT NULL DEFAULT 'activation',
  "status" "AnchorProfileStatus" NOT NULL DEFAULT 'active',
  "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "anchor_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "anchor_profiles_wecom_user_record_id_fkey"
    FOREIGN KEY ("wecom_user_record_id") REFERENCES "wecom_users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "anchor_profiles_current_operator_id_fkey"
    FOREIGN KEY ("current_operator_id") REFERENCES "operator_accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "anchor_profiles_wecom_user_record_id_key"
  ON "anchor_profiles"("wecom_user_record_id");
CREATE INDEX "anchor_profiles_current_operator_id_assignment_status_idx"
  ON "anchor_profiles"("current_operator_id", "assignment_status");

CREATE TABLE "anchor_name_history" (
  "id" UUID NOT NULL,
  "anchor_profile_id" UUID NOT NULL,
  "old_name" VARCHAR(100) NOT NULL,
  "new_name" VARCHAR(100) NOT NULL,
  "changed_by_type" VARCHAR(30) NOT NULL,
  "changed_by_id" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "anchor_name_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "anchor_name_history_anchor_profile_id_fkey"
    FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "anchor_operator_assignments" (
  "id" UUID NOT NULL,
  "anchor_profile_id" UUID NOT NULL,
  "operator_id" UUID NOT NULL,
  "status" "OperatorAssignmentStatus" NOT NULL DEFAULT 'pending_confirmation',
  "started_at" TIMESTAMP(3),
  "ended_at" TIMESTAMP(3),
  "initiated_by" VARCHAR(64) NOT NULL,
  "confirmed_by" VARCHAR(64),
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "anchor_operator_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "anchor_operator_assignments_anchor_profile_id_fkey"
    FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "anchor_operator_assignments_operator_id_fkey"
    FOREIGN KEY ("operator_id") REFERENCES "operator_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "anchor_operator_assignments_anchor_profile_id_status_idx"
  ON "anchor_operator_assignments"("anchor_profile_id", "status");
CREATE INDEX "anchor_operator_assignments_operator_id_status_idx"
  ON "anchor_operator_assignments"("operator_id", "status");
CREATE UNIQUE INDEX "uq_anchor_one_open_assignment"
  ON "anchor_operator_assignments"("anchor_profile_id")
  WHERE "status" IN ('pending_confirmation', 'confirmed');

CREATE TABLE "anchor_activation_tasks" (
  "id" UUID NOT NULL,
  "expected_wecom_user_id" VARCHAR(64) NOT NULL,
  "wecom_display_name_snapshot" VARCHAR(100) NOT NULL,
  "audit_teacher_id" UUID NOT NULL,
  "membership_completed_at" TIMESTAMP(3) NOT NULL,
  "device_ready_at" TIMESTAMP(3) NOT NULL,
  "status" "ActivationTaskStatus" NOT NULL DEFAULT 'pending',
  "invitation_sent_at" TIMESTAMP(3),
  "invitation_count" INTEGER NOT NULL DEFAULT 0,
  "activated_anchor_profile_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "anchor_activation_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "anchor_activation_tasks_audit_teacher_id_fkey"
    FOREIGN KEY ("audit_teacher_id") REFERENCES "operator_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "anchor_activation_tasks_activated_anchor_profile_id_fkey"
    FOREIGN KEY ("activated_anchor_profile_id") REFERENCES "anchor_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "anchor_activation_tasks_expected_wecom_user_id_key"
  ON "anchor_activation_tasks"("expected_wecom_user_id");
CREATE UNIQUE INDEX "anchor_activation_tasks_activated_anchor_profile_id_key"
  ON "anchor_activation_tasks"("activated_anchor_profile_id");
CREATE INDEX "anchor_activation_tasks_status_created_at_idx"
  ON "anchor_activation_tasks"("status", "created_at");

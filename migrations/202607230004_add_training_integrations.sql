-- Phase D: Tencent Meeting attendance, generic notifications and training operations loop.
-- Apply only after backing up the production database. This migration is additive except
-- for making notification_logs.submission_id nullable.

CREATE TYPE "TrainingMeetingCreateStatus" AS ENUM ('pending', 'created', 'failed', 'cancelled');
CREATE TYPE "TrainingAttendanceSource" AS ENUM ('api', 'excel');
CREATE TYPE "TrainingAttendanceImportStatus" AS ENUM ('preview', 'confirmed', 'failed');
CREATE TYPE "TrainingAttendanceMatchStatus" AS ENUM ('matched', 'conflict', 'unmatched');
CREATE TYPE "TrainingAttendanceOutcome" AS ENUM ('pending_confirmation', 'learned', 'needs_makeup');
CREATE TYPE "TrainingRecommendationSource" AS ENUM ('system', 'operator', 'training_staff');
CREATE TYPE "TrainingApplicationStatus" AS ENUM ('unobserved', 'practicing', 'applied', 'needs_support');
CREATE TYPE "TrainingQuestionUrgency" AS ENUM ('normal', 'urgent');
CREATE TYPE "TrainingQuestionStatus" AS ENUM ('pending', 'categorized', 'scheduled', 'resolved', 'transferred');
CREATE TYPE "TrainingQuestionResolutionType" AS ENUM (
  'standard_course',
  'review_session',
  'saturday_qa',
  'special_course',
  'new_course_need',
  'operator_followup'
);
CREATE TYPE "TrainingWeeklyActionStatus" AS ENUM ('pending', 'completed', 'cancelled');

ALTER TABLE "notification_logs"
  ALTER COLUMN "submission_id" DROP NOT NULL,
  ADD COLUMN "business_type" VARCHAR(50),
  ADD COLUMN "business_id" VARCHAR(100),
  ADD COLUMN "template_code" VARCHAR(80),
  ADD COLUMN "dedupe_key" VARCHAR(180),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "scheduled_at" TIMESTAMP(3),
  ADD COLUMN "last_attempt_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "notification_logs_dedupe_key_key"
  ON "notification_logs"("dedupe_key");
CREATE INDEX "idx_notification_logs_business"
  ON "notification_logs"("business_type", "business_id");
CREATE INDEX "idx_notification_logs_retry"
  ON "notification_logs"("status", "scheduled_at");

CREATE TABLE "training_meetings" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "external_meeting_id" VARCHAR(64),
  "meeting_code" VARCHAR(32),
  "join_url" TEXT,
  "create_status" "TrainingMeetingCreateStatus" NOT NULL DEFAULT 'pending',
  "response_summary" JSONB,
  "create_attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "last_sync_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_meetings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_meetings_session_id_key"
  ON "training_meetings"("session_id");
CREATE UNIQUE INDEX "training_meetings_external_meeting_id_key"
  ON "training_meetings"("external_meeting_id");
CREATE INDEX "training_meetings_create_status_updated_at_idx"
  ON "training_meetings"("create_status", "updated_at");

CREATE TABLE "training_attendance_imports" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "source" "TrainingAttendanceSource" NOT NULL,
  "status" "TrainingAttendanceImportStatus" NOT NULL DEFAULT 'preview',
  "idempotency_key" VARCHAR(128) NOT NULL,
  "file_name" VARCHAR(255),
  "source_summary" JSONB,
  "preview_summary" JSONB,
  "imported_by" VARCHAR(64) NOT NULL,
  "confirmed_by" VARCHAR(64),
  "confirmed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_attendance_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_attendance_imports_session_id_source_idempotency_key_key"
  ON "training_attendance_imports"("session_id", "source", "idempotency_key");
CREATE INDEX "training_attendance_imports_session_id_created_at_idx"
  ON "training_attendance_imports"("session_id", "created_at");

CREATE TABLE "training_attendance_raw_records" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "external_record_key" VARCHAR(160) NOT NULL,
  "external_user_id" VARCHAR(128),
  "external_identity_key" VARCHAR(160) NOT NULL,
  "raw_display_name" VARCHAR(255) NOT NULL,
  "display_name" VARCHAR(100) NOT NULL,
  "joined_at" TIMESTAMP(3),
  "left_at" TIMESTAMP(3),
  "duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "raw_payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_attendance_raw_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_attendance_raw_records_import_id_external_record_key_key"
  ON "training_attendance_raw_records"("import_id", "external_record_key");
CREATE INDEX "training_attendance_raw_records_import_id_external_identity_key_idx"
  ON "training_attendance_raw_records"("import_id", "external_identity_key");

CREATE TABLE "training_attendance_records" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "registration_id" UUID,
  "anchor_profile_id" UUID,
  "external_identity_key" VARCHAR(160) NOT NULL,
  "external_user_id" VARCHAR(128),
  "display_name" VARCHAR(100) NOT NULL,
  "intervals" JSONB NOT NULL DEFAULT '[]',
  "total_duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "session_duration_seconds" INTEGER NOT NULL,
  "attendance_ratio" DECIMAL(6,4) NOT NULL DEFAULT 0,
  "match_status" "TrainingAttendanceMatchStatus" NOT NULL,
  "match_method" VARCHAR(40),
  "outcome" "TrainingAttendanceOutcome" NOT NULL DEFAULT 'pending_confirmation',
  "matched_by" VARCHAR(64),
  "matched_at" TIMESTAMP(3),
  "outcome_by" VARCHAR(64),
  "outcome_at" TIMESTAMP(3),
  "manual_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_attendance_records_registration_id_idx"
  ON "training_attendance_records"("registration_id");
CREATE UNIQUE INDEX "training_attendance_records_session_id_external_identity_key_key"
  ON "training_attendance_records"("session_id", "external_identity_key");
CREATE INDEX "training_attendance_records_session_id_match_status_outcome_idx"
  ON "training_attendance_records"("session_id", "match_status", "outcome");

CREATE TABLE "training_attendance_audit_logs" (
  "id" UUID NOT NULL,
  "attendance_record_id" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "before_snapshot" JSONB,
  "after_snapshot" JSONB,
  "reason" TEXT,
  "operated_by" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_attendance_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_attendance_audit_logs_attendance_record_id_created_at_idx"
  ON "training_attendance_audit_logs"("attendance_record_id", "created_at");

CREATE TABLE "training_course_recommendations" (
  "id" UUID NOT NULL,
  "anchor_profile_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "source" "TrainingRecommendationSource" NOT NULL,
  "recommended_by_account_id" UUID,
  "reason" TEXT,
  "viewed_at" TIMESTAMP(3),
  "registered_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_course_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_course_recommendations_anchor_profile_id_completed_at_created_at_idx"
  ON "training_course_recommendations"("anchor_profile_id", "completed_at", "created_at");
CREATE UNIQUE INDEX "training_course_recommendations_anchor_profile_id_course_id_source_key"
  ON "training_course_recommendations"("anchor_profile_id", "course_id", "source");

CREATE TABLE "training_application_feedback" (
  "id" UUID NOT NULL,
  "anchor_profile_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "operator_id" UUID NOT NULL,
  "week_start" DATE NOT NULL,
  "status" "TrainingApplicationStatus" NOT NULL DEFAULT 'unobserved',
  "observation_note" TEXT,
  "replay_issue" TEXT,
  "next_course_id" UUID,
  "intervention_needed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_application_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_application_feedback_anchor_profile_id_course_id_week_start_key"
  ON "training_application_feedback"("anchor_profile_id", "course_id", "week_start");
CREATE INDEX "training_application_feedback_operator_id_week_start_status_idx"
  ON "training_application_feedback"("operator_id", "week_start", "status");

CREATE TABLE "training_questions" (
  "id" UUID NOT NULL,
  "anchor_profile_id" UUID,
  "course_id" UUID,
  "submitted_by_account_id" UUID NOT NULL,
  "category" VARCHAR(80),
  "urgency" "TrainingQuestionUrgency" NOT NULL DEFAULT 'normal',
  "description" TEXT NOT NULL,
  "case_note" TEXT,
  "status" "TrainingQuestionStatus" NOT NULL DEFAULT 'pending',
  "resolution_type" "TrainingQuestionResolutionType",
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_questions_urgency_status_created_at_idx"
  ON "training_questions"("urgency", "status", "created_at");
CREATE INDEX "training_questions_anchor_profile_id_created_at_idx"
  ON "training_questions"("anchor_profile_id", "created_at");

CREATE TABLE "training_question_actions" (
  "id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "action" VARCHAR(50) NOT NULL,
  "note" TEXT,
  "operated_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_question_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_question_actions_question_id_created_at_idx"
  ON "training_question_actions"("question_id", "created_at");

CREATE TABLE "training_weekly_meetings" (
  "id" UUID NOT NULL,
  "week_start" DATE NOT NULL,
  "held_at" TIMESTAMP(3),
  "attendee_ids" JSONB NOT NULL DEFAULT '[]',
  "summary" TEXT,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_weekly_meetings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_weekly_meetings_week_start_key"
  ON "training_weekly_meetings"("week_start");

CREATE TABLE "training_weekly_actions" (
  "id" UUID NOT NULL,
  "meeting_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "owner_account_id" UUID,
  "due_at" TIMESTAMP(3),
  "status" "TrainingWeeklyActionStatus" NOT NULL DEFAULT 'pending',
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_weekly_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_weekly_actions_owner_account_id_status_due_at_idx"
  ON "training_weekly_actions"("owner_account_id", "status", "due_at");

ALTER TABLE "training_meetings"
  ADD CONSTRAINT "training_meetings_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attendance_imports"
  ADD CONSTRAINT "training_attendance_imports_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attendance_raw_records"
  ADD CONSTRAINT "training_attendance_raw_records_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "training_attendance_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attendance_records"
  ADD CONSTRAINT "training_attendance_records_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_attendance_records"
  ADD CONSTRAINT "training_attendance_records_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "training_attendance_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_attendance_records"
  ADD CONSTRAINT "training_attendance_records_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "training_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_attendance_records"
  ADD CONSTRAINT "training_attendance_records_anchor_profile_id_fkey"
  FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_attendance_audit_logs"
  ADD CONSTRAINT "training_attendance_audit_logs_attendance_record_id_fkey"
  FOREIGN KEY ("attendance_record_id") REFERENCES "training_attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_course_recommendations"
  ADD CONSTRAINT "training_course_recommendations_anchor_profile_id_fkey"
  FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_course_recommendations"
  ADD CONSTRAINT "training_course_recommendations_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_course_recommendations"
  ADD CONSTRAINT "training_course_recommendations_recommended_by_account_id_fkey"
  FOREIGN KEY ("recommended_by_account_id") REFERENCES "operator_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_application_feedback"
  ADD CONSTRAINT "training_application_feedback_anchor_profile_id_fkey"
  FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_application_feedback"
  ADD CONSTRAINT "training_application_feedback_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_application_feedback"
  ADD CONSTRAINT "training_application_feedback_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "operator_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_application_feedback"
  ADD CONSTRAINT "training_application_feedback_next_course_id_fkey"
  FOREIGN KEY ("next_course_id") REFERENCES "training_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_questions"
  ADD CONSTRAINT "training_questions_anchor_profile_id_fkey"
  FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_questions"
  ADD CONSTRAINT "training_questions_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_questions"
  ADD CONSTRAINT "training_questions_submitted_by_account_id_fkey"
  FOREIGN KEY ("submitted_by_account_id") REFERENCES "operator_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_question_actions"
  ADD CONSTRAINT "training_question_actions_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "training_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_question_actions"
  ADD CONSTRAINT "training_question_actions_operated_by_id_fkey"
  FOREIGN KEY ("operated_by_id") REFERENCES "operator_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_weekly_meetings"
  ADD CONSTRAINT "training_weekly_meetings_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "operator_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_weekly_actions"
  ADD CONSTRAINT "training_weekly_actions_meeting_id_fkey"
  FOREIGN KEY ("meeting_id") REFERENCES "training_weekly_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_weekly_actions"
  ADD CONSTRAINT "training_weekly_actions_owner_account_id_fkey"
  FOREIGN KEY ("owner_account_id") REFERENCES "operator_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

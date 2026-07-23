CREATE TYPE "TrainingCourseLevel" AS ENUM (
  'basic_required', 'growth', 'advanced', 'special'
);
CREATE TYPE "TrainingWeekParity" AS ENUM ('every', 'a', 'b');
CREATE TYPE "TrainingSessionStatus" AS ENUM (
  'draft', 'published', 'in_progress', 'ended', 'cancelled',
  'rescheduled', 'publish_failed'
);
CREATE TYPE "TrainingRegistrationStatus" AS ENUM (
  'registered', 'waitlisted', 'cancelled', 'learned', 'leave',
  'absent', 'abnormal_exit', 'needs_makeup'
);
CREATE TYPE "TrainingRegistrationSource" AS ENUM (
  'anchor', 'operator', 'training_staff'
);
CREATE TYPE "TrainingLearningType" AS ENUM (
  'first_learning', 'review', 'makeup'
);
CREATE TYPE "TrainingProgressStatus" AS ENUM (
  'not_started', 'registered', 'learned'
);
CREATE TYPE "TrainingMakeupStatus" AS ENUM (
  'none', 'needs_relearning', 'waiting_makeup', 'made_up'
);

CREATE TABLE "training_courses" (
  "id" UUID NOT NULL,
  "code" VARCHAR(30) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "level" "TrainingCourseLevel" NOT NULL,
  "sequence" INTEGER,
  "summary" TEXT,
  "objectives" JSONB NOT NULL DEFAULT '[]',
  "practice_tasks" JSONB NOT NULL DEFAULT '[]',
  "faq" JSONB NOT NULL DEFAULT '[]',
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_material_links" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "url" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_material_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_schedule_templates" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "teacher_id" UUID,
  "weekday" INTEGER NOT NULL,
  "week_parity" "TrainingWeekParity" NOT NULL DEFAULT 'every',
  "start_time" VARCHAR(5) NOT NULL,
  "duration_minutes" INTEGER NOT NULL DEFAULT 60,
  "capacity" INTEGER NOT NULL DEFAULT 50,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_schedule_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_sessions" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "schedule_template_id" UUID,
  "teacher_id" UUID,
  "scheduled_start_at" TIMESTAMP(3) NOT NULL,
  "scheduled_end_at" TIMESTAMP(3) NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 50,
  "status" "TrainingSessionStatus" NOT NULL DEFAULT 'draft',
  "published_at" TIMESTAMP(3),
  "cancellation_reason" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_registrations" (
  "id" UUID NOT NULL,
  "anchor_profile_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "operator_id_snapshot" UUID,
  "operator_name_snapshot" VARCHAR(100),
  "anchor_name_snapshot" VARCHAR(100) NOT NULL,
  "source" "TrainingRegistrationSource" NOT NULL,
  "status" "TrainingRegistrationStatus" NOT NULL,
  "learning_type" "TrainingLearningType" NOT NULL,
  "waitlist_position" INTEGER,
  "registered_by" VARCHAR(64) NOT NULL,
  "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMP(3),
  "outcome_reason" TEXT,
  "outcome_by" VARCHAR(64),
  "outcome_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_learning_progress" (
  "id" UUID NOT NULL,
  "anchor_profile_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "status" "TrainingProgressStatus" NOT NULL DEFAULT 'not_started',
  "makeup_status" "TrainingMakeupStatus" NOT NULL DEFAULT 'none',
  "first_learned_at" TIMESTAMP(3),
  "last_learned_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_learning_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "training_courses_code_key" ON "training_courses"("code");
CREATE INDEX "training_courses_status_sequence_idx" ON "training_courses"("status", "sequence");
CREATE INDEX "training_material_links_course_id_sort_order_idx" ON "training_material_links"("course_id", "sort_order");
CREATE INDEX "training_schedule_templates_active_weekday_idx" ON "training_schedule_templates"("active", "weekday");
CREATE UNIQUE INDEX "training_sessions_schedule_template_id_scheduled_start_at_key"
  ON "training_sessions"("schedule_template_id", "scheduled_start_at");
CREATE INDEX "training_sessions_status_scheduled_start_at_idx"
  ON "training_sessions"("status", "scheduled_start_at");
CREATE INDEX "training_sessions_course_id_scheduled_start_at_idx"
  ON "training_sessions"("course_id", "scheduled_start_at");
CREATE UNIQUE INDEX "training_registrations_anchor_profile_id_session_id_key"
  ON "training_registrations"("anchor_profile_id", "session_id");
CREATE INDEX "training_registrations_session_id_status_waitlist_position_idx"
  ON "training_registrations"("session_id", "status", "waitlist_position");
CREATE INDEX "training_registrations_anchor_profile_id_status_idx"
  ON "training_registrations"("anchor_profile_id", "status");
CREATE UNIQUE INDEX "training_learning_progress_anchor_profile_id_course_id_key"
  ON "training_learning_progress"("anchor_profile_id", "course_id");
CREATE INDEX "training_learning_progress_anchor_profile_id_status_idx"
  ON "training_learning_progress"("anchor_profile_id", "status");

ALTER TABLE "training_material_links" ADD CONSTRAINT "training_material_links_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_schedule_templates" ADD CONSTRAINT "training_schedule_templates_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_schedule_templates" ADD CONSTRAINT "training_schedule_templates_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "operator_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_schedule_template_id_fkey"
  FOREIGN KEY ("schedule_template_id") REFERENCES "training_schedule_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "operator_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "training_registrations" ADD CONSTRAINT "training_registrations_anchor_profile_id_fkey"
  FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_registrations" ADD CONSTRAINT "training_registrations_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "training_learning_progress" ADD CONSTRAINT "training_learning_progress_anchor_profile_id_fkey"
  FOREIGN KEY ("anchor_profile_id") REFERENCES "anchor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_learning_progress" ADD CONSTRAINT "training_learning_progress_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "training_courses"
  ("id", "code", "title", "level", "sequence", "summary", "objectives", "practice_tasks", "faq", "updated_at")
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'course_1', '台宣、Q新、互动与话题延展', 'basic_required', 1, '掌握最基础的开场、欢迎、互动和话题延展。', '[]', '[]', '[]', CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000002', 'course_2', '礼物、心愿单与基础感谢', 'basic_required', 2, '掌握礼物识别、心愿单设置和基础感谢。', '[]', '[]', '[]', CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000003', 'course_3', '语音电台内容方向', 'basic_required', 3, '建立适合自身的语音电台内容方向。', '[]', '[]', '[]', CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000004', 'course_4', '私信维护与游客信息记录', 'growth', 4, '学习私信维护和游客信息记录。', '[]', '[]', '[]', CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000005', 'course_5', '大哥分类与粉丝分层', 'advanced', 5, '学习用户分类和粉丝分层。', '[]', '[]', '[]', CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000006', 'course_6', 'PK全流程与礼物录屏', 'advanced', 6, '掌握PK流程、互动和礼物录屏。', '[]', '[]', '[]', CURRENT_TIMESTAMP),
  ('c1000000-0000-4000-8000-000000000007', 'course_7', '大哥经营深化', 'advanced', 7, '深化核心用户关系经营。', '[]', '[]', '[]', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

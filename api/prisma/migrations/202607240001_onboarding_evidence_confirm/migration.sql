-- 岗前节点：证据 + 主播确认

ALTER TYPE "OnboardingMilestoneType" ADD VALUE IF NOT EXISTS 'initial_communication';
ALTER TYPE "OnboardingMilestoneStatus" ADD VALUE IF NOT EXISTS 'awaiting_anchor_confirm';

ALTER TABLE "anchor_onboarding_milestones"
  ADD COLUMN IF NOT EXISTS "evidence" JSONB,
  ADD COLUMN IF NOT EXISTS "attachment_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submitted_by" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "anchor_confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "anchor_rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reject_reason" TEXT;

-- 为已有进度补齐「初次沟通」节点（若不存在）
INSERT INTO "anchor_onboarding_milestones" (
  "id",
  "progress_id",
  "type",
  "status",
  "created_at",
  "updated_at",
  "attachment_urls"
)
SELECT
  gen_random_uuid(),
  p."id",
  'initial_communication'::"OnboardingMilestoneType",
  'pending'::"OnboardingMilestoneStatus",
  NOW(),
  NOW(),
  ARRAY[]::TEXT[]
FROM "anchor_onboarding_progress" p
WHERE NOT EXISTS (
  SELECT 1
  FROM "anchor_onboarding_milestones" m
  WHERE m."progress_id" = p."id"
    AND m."type" = 'initial_communication'::"OnboardingMilestoneType"
);

-- 新默认当前阶段：若仍停在运营接收，切到初次沟通
UPDATE "anchor_onboarding_progress"
SET "current_stage" = 'initial_communication'::"OnboardingMilestoneType"
WHERE "current_stage" = 'operator_received'::"OnboardingMilestoneType";

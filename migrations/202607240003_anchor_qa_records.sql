-- 运营答疑记录（结果跟踪须在答疑后 7 日内填写）

CREATE TABLE IF NOT EXISTS "anchor_qa_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "anchor_profile_id" UUID NOT NULL REFERENCES "anchor_profiles"("id") ON DELETE CASCADE,
  "operator_id" UUID REFERENCES "operator_accounts"("id"),
  "qa_at" TIMESTAMPTZ NOT NULL,
  "question" TEXT NOT NULL,
  "reply" TEXT NOT NULL,
  "result_follow_up" TEXT,
  "follow_up_at" TIMESTAMPTZ,
  "created_by" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "anchor_qa_records_anchor_qa_idx"
  ON "anchor_qa_records" ("anchor_profile_id", "qa_at" DESC);

CREATE INDEX IF NOT EXISTS "anchor_qa_records_operator_qa_idx"
  ON "anchor_qa_records" ("operator_id", "qa_at" DESC);

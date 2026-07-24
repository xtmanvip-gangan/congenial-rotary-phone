-- 主播日复盘表（附件六字段）

CREATE TABLE IF NOT EXISTS "anchor_daily_reviews" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "anchor_profile_id" UUID NOT NULL REFERENCES "anchor_profiles"("id") ON DELETE CASCADE,
  "operator_id" UUID REFERENCES "operator_accounts"("id"),
  "review_date" DATE NOT NULL,
  "live_duration_minutes" INT,
  "session_viewers" INT,
  "peak_online" INT,
  "avg_online" INT,
  "new_fans" INT,
  "gift_revenue_yuan" DECIMAL(12, 2),
  "pk_count" INT,
  "best_thing" TEXT,
  "biggest_problem" TEXT,
  "tomorrow_focus" TEXT,
  "leader_note" TEXT,
  "created_by" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "anchor_daily_reviews_anchor_date_key" UNIQUE ("anchor_profile_id", "review_date")
);

CREATE INDEX IF NOT EXISTS "anchor_daily_reviews_anchor_date_idx"
  ON "anchor_daily_reviews" ("anchor_profile_id", "review_date" DESC);

CREATE INDEX IF NOT EXISTS "anchor_daily_reviews_operator_date_idx"
  ON "anchor_daily_reviews" ("operator_id", "review_date" DESC);

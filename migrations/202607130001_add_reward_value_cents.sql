ALTER TABLE reward_rules
ADD COLUMN IF NOT EXISTS reward_value_cents integer NOT NULL DEFAULT 0;


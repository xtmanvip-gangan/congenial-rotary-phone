ALTER TABLE anchor_activation_tasks
  ADD COLUMN operator_id uuid;

UPDATE anchor_activation_tasks AS task
SET operator_id = profile.current_operator_id
FROM anchor_profiles AS profile
WHERE task.activated_anchor_profile_id = profile.id
  AND profile.current_operator_id IS NOT NULL;

ALTER TABLE anchor_activation_tasks
  ADD CONSTRAINT anchor_activation_tasks_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES operator_accounts(id);

CREATE INDEX anchor_activation_tasks_operator_id_idx
  ON anchor_activation_tasks(operator_id);

ALTER TABLE anchor_activation_tasks
  DROP COLUMN device_ready_at;

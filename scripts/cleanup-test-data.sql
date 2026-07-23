-- 只读预览模板。先在超管运维中心核对同口径预览，再由数据库管理员复核。
-- 本文件默认不包含可执行 DELETE，避免部署时误清空业务数据。

BEGIN TRANSACTION READ ONLY;

WITH test_anchors AS (
  SELECT id
  FROM anchor_profiles
  WHERE anchor_display_name ILIKE '%测试%'
     OR anchor_display_name ILIKE 'test%'
     OR anchor_display_name ILIKE 'demo%'
     OR source IN ('test', 'demo', 'seed')
),
test_submissions AS (
  SELECT id
  FROM submissions
  WHERE anchor_profile_id IN (SELECT id FROM test_anchors)
     OR anchor_name ILIKE '%测试%'
     OR anchor_display_name_snapshot ILIKE 'test%'
)
SELECT
  (SELECT count(*) FROM test_anchors) AS anchor_profiles,
  (SELECT count(*) FROM test_submissions) AS submissions,
  (SELECT count(*) FROM review_logs WHERE submission_id IN (SELECT id FROM test_submissions)) AS review_logs,
  (SELECT count(*) FROM reward_grants WHERE submission_id IN (SELECT id FROM test_submissions)) AS reward_grants,
  (SELECT count(*) FROM notification_logs WHERE submission_id IN (SELECT id FROM test_submissions)) AS notification_logs;

ROLLBACK;

-- 真正清理必须另建经人工审阅的变更单，把明确 ID 写入白名单表，
-- 在一个事务内核对影响行数，并由第二人确认后提交。

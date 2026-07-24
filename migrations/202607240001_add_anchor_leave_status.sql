-- 主播档案状态增加「请假」，供全景稳定期使用
-- 展示口径：待首播/孵化中由首播进度自动算；稳定期用 active=正常 paused=断播 leave=请假 exited=退会

ALTER TYPE "AnchorProfileStatus" ADD VALUE IF NOT EXISTS 'leave';

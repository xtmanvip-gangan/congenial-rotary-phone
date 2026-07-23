#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SHOUJI_DATABASE_URL:-}" ]]; then
  echo "必须通过 SHOUJI_DATABASE_URL 提供明确的目标数据库。" >&2
  exit 1
fi
if [[ -z "${SHOUJI_RESTORE_FILE:-}" || "${SHOUJI_RESTORE_FILE}" != /* ]]; then
  echo "SHOUJI_RESTORE_FILE 必须是明确的绝对备份文件路径。" >&2
  exit 1
fi
if [[ ! -f "${SHOUJI_RESTORE_FILE}" ]]; then
  echo "指定备份文件不存在。" >&2
  exit 1
fi
if [[ "${CONFIRM_RESTORE:-}" != "RESTORE_SHOUJI_DATABASE" ]]; then
  echo "恢复会覆盖目标库对象；请设置 CONFIRM_RESTORE=RESTORE_SHOUJI_DATABASE。" >&2
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="${SHOUJI_DATABASE_URL}" "${SHOUJI_RESTORE_FILE}"
echo "数据库恢复完成，请立即执行健康检查和关键业务冒烟。"

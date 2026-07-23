#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SHOUJI_DATABASE_URL:-}" ]]; then
  echo "必须通过 SHOUJI_DATABASE_URL 提供明确的 PostgreSQL 连接串。" >&2
  exit 1
fi
if [[ -z "${SHOUJI_BACKUP_DIR:-}" || "${SHOUJI_BACKUP_DIR}" != /* ]]; then
  echo "SHOUJI_BACKUP_DIR 必须是明确的绝对目录。" >&2
  exit 1
fi

mkdir -p "${SHOUJI_BACKUP_DIR}"
backup_file="${SHOUJI_BACKUP_DIR}/shouji-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --no-acl \
  --file="${backup_file}" "${SHOUJI_DATABASE_URL}"
chmod 600 "${backup_file}"
echo "数据库备份已生成：${backup_file}"

#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  DATABASE_URL JWT_SECRET WECOM_CORP_ID WECOM_AGENT_ID WECOM_AGENT_SECRET
  TENCENT_MEETING_APP_ID TENCENT_MEETING_SECRET_ID
  TENCENT_MEETING_SECRET_KEY TENCENT_MEETING_USER_ID CORS_ALLOWED_ORIGINS
)

missing=()
for variable_name in "${required_vars[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    missing+=("${variable_name}")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "上线预检失败，缺少环境变量：${missing[*]}" >&2
  exit 1
fi

if [[ "${NODE_ENV:-}" != "production" ]]; then
  echo "上线预检失败：NODE_ENV 必须为 production" >&2
  exit 1
fi

echo "环境变量名称检查通过（未输出任何密钥值）。"
echo "请继续执行数据库备份、Prisma validate、构建和人工冒烟。"

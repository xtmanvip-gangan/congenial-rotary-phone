CREATE TYPE "SystemJobRunStatus" AS ENUM ('running', 'succeeded', 'partial', 'failed');
CREATE TYPE "IntegrationIncidentStatus" AS ENUM ('open', 'recovered', 'closed');
CREATE TYPE "IntegrationIncidentSeverity" AS ENUM ('warning', 'error', 'critical');

CREATE TABLE "system_job_runs" (
  "id" UUID NOT NULL,
  "job_code" VARCHAR(100) NOT NULL,
  "idempotency_key" VARCHAR(180) NOT NULL,
  "status" "SystemJobRunStatus" NOT NULL DEFAULT 'running',
  "triggered_by" VARCHAR(64),
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "scanned_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "result_summary" JSONB,
  "last_error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_job_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_job_runs_job_code_idempotency_key_key"
  ON "system_job_runs"("job_code", "idempotency_key");
CREATE INDEX "system_job_runs_status_started_at_idx"
  ON "system_job_runs"("status", "started_at");

CREATE TABLE "integration_incidents" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "operation" VARCHAR(100) NOT NULL,
  "business_type" VARCHAR(50),
  "business_id" VARCHAR(100),
  "dedupe_key" VARCHAR(180) NOT NULL,
  "status" "IntegrationIncidentStatus" NOT NULL DEFAULT 'open',
  "severity" "IntegrationIncidentSeverity" NOT NULL DEFAULT 'error',
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "error_code" VARCHAR(80),
  "error_message" TEXT NOT NULL,
  "first_occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolved_by" VARCHAR(64),
  "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_incidents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_incidents_dedupe_key_key"
  ON "integration_incidents"("dedupe_key");
CREATE INDEX "integration_incidents_status_severity_last_occurred_at_idx"
  ON "integration_incidents"("status", "severity", "last_occurred_at");
CREATE INDEX "integration_incidents_provider_operation_last_occurred_at_idx"
  ON "integration_incidents"("provider", "operation", "last_occurred_at");

CREATE TABLE "system_audit_logs" (
  "id" UUID NOT NULL,
  "actor_id" VARCHAR(64),
  "actor_role" VARCHAR(40) NOT NULL,
  "login_type" VARCHAR(40) NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "object_type" VARCHAR(80) NOT NULL,
  "object_id" VARCHAR(100),
  "before_snapshot" JSONB,
  "after_snapshot" JSONB,
  "reason" TEXT,
  "request_trace_id" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_audit_logs_object_type_object_id_created_at_idx"
  ON "system_audit_logs"("object_type", "object_id", "created_at");
CREATE INDEX "system_audit_logs_actor_id_created_at_idx"
  ON "system_audit_logs"("actor_id", "created_at");

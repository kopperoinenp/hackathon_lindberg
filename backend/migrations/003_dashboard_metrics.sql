-- Immutable, scoped read models; only the background role writes calculated results.
CREATE TABLE IF NOT EXISTS dashboard_jobs (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  requested_by text NOT NULL,
  dataset_version text NOT NULL,
  calculation_version text NOT NULL,
  scope jsonb NOT NULL,
  scope_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','ready','failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,customer_id,dataset_version,calculation_version,scope_key),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customer_datasets(tenant_id,customer_id),
  FOREIGN KEY(tenant_id,requested_by) REFERENCES prototype_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS dashboard_jobs_queue ON dashboard_jobs(created_at) WHERE status='queued';
ALTER TABLE dashboard_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dashboard_read ON dashboard_jobs;
CREATE POLICY dashboard_read ON dashboard_jobs FOR SELECT USING (
  tenant_id=current_setting('app.tenant',true) AND EXISTS (
    SELECT 1 FROM customer_access a WHERE a.tenant_id=dashboard_jobs.tenant_id AND a.customer_id=dashboard_jobs.customer_id
  )
);
DROP POLICY IF EXISTS dashboard_request ON dashboard_jobs;
CREATE POLICY dashboard_request ON dashboard_jobs FOR INSERT WITH CHECK (
  tenant_id=current_setting('app.tenant',true) AND requested_by=current_setting('app.user',true)
  AND status='queued' AND result IS NULL AND error IS NULL AND EXISTS (
    SELECT 1 FROM customer_access a WHERE a.tenant_id=dashboard_jobs.tenant_id AND a.customer_id=dashboard_jobs.customer_id
  )
);

-- Phase two: durable, customer-scoped fixture imports. Payload is staging, not browser data.
ALTER TABLE customer_datasets ADD COLUMN IF NOT EXISTS publication_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE customer_datasets ADD COLUMN IF NOT EXISTS active_import_id uuid;
CREATE TABLE IF NOT EXISTS source_customer_mapping (
  tenant_id text NOT NULL,
  source_id text NOT NULL,
  external_id text NOT NULL,
  customer_id text NOT NULL,
  PRIMARY KEY (tenant_id, source_id, external_id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES customer_datasets(tenant_id,customer_id)
);
CREATE TABLE IF NOT EXISTS data_imports (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  requested_by text NOT NULL,
  source_id text NOT NULL,
  checksum text NOT NULL,
  calculation_version text NOT NULL,
  payload jsonb NOT NULL,
  expected_controls jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','ready','failed','superseded')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  report jsonb,
  error jsonb,
  UNIQUE (tenant_id,customer_id,source_id,checksum,calculation_version),
  UNIQUE (tenant_id,customer_id,id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES customer_datasets(tenant_id,customer_id),
  FOREIGN KEY (tenant_id,requested_by) REFERENCES prototype_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS data_imports_queue ON data_imports(available_at,sequence) WHERE status='queued';
CREATE INDEX IF NOT EXISTS data_imports_customer ON data_imports(tenant_id,customer_id,sequence DESC);
CREATE TABLE IF NOT EXISTS dataset_versions (
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  import_id uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  report jsonb NOT NULL,
  PRIMARY KEY (tenant_id,customer_id,import_id),
  FOREIGN KEY (tenant_id,customer_id,import_id) REFERENCES data_imports(tenant_id,customer_id,id)
);
ALTER TABLE source_customer_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_customer_mapping FORCE ROW LEVEL SECURITY;
ALTER TABLE data_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mapping_read ON source_customer_mapping;
CREATE POLICY mapping_read ON source_customer_mapping FOR SELECT USING (
  tenant_id=current_setting('app.tenant',true) AND EXISTS (
    SELECT 1 FROM customer_access a WHERE a.tenant_id=source_customer_mapping.tenant_id AND a.customer_id=source_customer_mapping.customer_id
  )
);
DROP POLICY IF EXISTS import_read ON data_imports;
CREATE POLICY import_read ON data_imports FOR SELECT USING (
  tenant_id=current_setting('app.tenant',true) AND EXISTS (
    SELECT 1 FROM customer_access a WHERE a.tenant_id=data_imports.tenant_id AND a.customer_id=data_imports.customer_id
  )
);
DROP POLICY IF EXISTS import_insert ON data_imports;
CREATE POLICY import_insert ON data_imports FOR INSERT WITH CHECK (
  tenant_id=current_setting('app.tenant',true) AND requested_by=current_setting('app.user',true)
  AND status='queued' AND attempts=0 AND EXISTS (
    SELECT 1 FROM customer_access a WHERE a.tenant_id=data_imports.tenant_id AND a.customer_id=data_imports.customer_id AND a.can_write
  )
);
DROP POLICY IF EXISTS version_read ON dataset_versions;
CREATE POLICY version_read ON dataset_versions FOR SELECT USING (
  tenant_id=current_setting('app.tenant',true) AND EXISTS (
    SELECT 1 FROM customer_access a WHERE a.tenant_id=dataset_versions.tenant_id AND a.customer_id=dataset_versions.customer_id
  )
);

-- Prototype identities are selectable, not authenticated. Only the local launcher provisions users.
CREATE TABLE IF NOT EXISTS prototype_users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  display_name text NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS customer_datasets (
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  name text NOT NULL,
  dataset jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id)
);
CREATE TABLE IF NOT EXISTS customer_access (
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  customer_id text NOT NULL,
  can_write boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, user_id, customer_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES prototype_users(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_datasets(tenant_id, customer_id)
);
CREATE TABLE IF NOT EXISTS customer_reviews (
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  owner_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  workspace jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id, owner_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_datasets(tenant_id, customer_id),
  FOREIGN KEY (tenant_id, owner_id) REFERENCES prototype_users(tenant_id, id),
  CHECK (workspace #>> '{scope,customer}' IS NOT NULL AND workspace #>> '{scope,customer}' = customer_id)
);
CREATE TABLE IF NOT EXISTS review_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  user_id text NOT NULL,
  revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_datasets FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_access FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE review_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_grants ON customer_access;
CREATE POLICY own_grants ON customer_access FOR SELECT USING (
  tenant_id = current_setting('app.tenant', true) AND user_id = current_setting('app.user', true)
);
DROP POLICY IF EXISTS allowed_datasets ON customer_datasets;
CREATE POLICY allowed_datasets ON customer_datasets FOR SELECT USING (
  tenant_id = current_setting('app.tenant', true) AND EXISTS (
    SELECT 1 FROM customer_access a WHERE a.tenant_id = customer_datasets.tenant_id
      AND a.customer_id = customer_datasets.customer_id
  )
);
DROP POLICY IF EXISTS own_review_read ON customer_reviews;
CREATE POLICY own_review_read ON customer_reviews FOR SELECT USING (
  tenant_id = current_setting('app.tenant', true) AND owner_id = current_setting('app.user', true)
  AND EXISTS (SELECT 1 FROM customer_access a WHERE a.tenant_id = customer_reviews.tenant_id AND a.customer_id = customer_reviews.customer_id)
);
DROP POLICY IF EXISTS own_review_insert ON customer_reviews;
CREATE POLICY own_review_insert ON customer_reviews FOR INSERT WITH CHECK (
  tenant_id = current_setting('app.tenant', true) AND owner_id = current_setting('app.user', true)
  AND EXISTS (SELECT 1 FROM customer_access a WHERE a.tenant_id = customer_reviews.tenant_id AND a.customer_id = customer_reviews.customer_id AND a.can_write)
);
DROP POLICY IF EXISTS own_review_update ON customer_reviews;
CREATE POLICY own_review_update ON customer_reviews FOR UPDATE USING (
  tenant_id = current_setting('app.tenant', true) AND owner_id = current_setting('app.user', true)
  AND EXISTS (SELECT 1 FROM customer_access a WHERE a.tenant_id = customer_reviews.tenant_id AND a.customer_id = customer_reviews.customer_id AND a.can_write)
) WITH CHECK (
  tenant_id = current_setting('app.tenant', true) AND owner_id = current_setting('app.user', true)
  AND EXISTS (SELECT 1 FROM customer_access a WHERE a.tenant_id = customer_reviews.tenant_id AND a.customer_id = customer_reviews.customer_id AND a.can_write)
);
DROP POLICY IF EXISTS own_audit ON review_audit;
CREATE POLICY own_audit ON review_audit FOR ALL USING (
  tenant_id = current_setting('app.tenant', true) AND user_id = current_setting('app.user', true)
) WITH CHECK (
  tenant_id = current_setting('app.tenant', true) AND user_id = current_setting('app.user', true)
  AND EXISTS (SELECT 1 FROM customer_access a WHERE a.tenant_id = review_audit.tenant_id AND a.customer_id = review_audit.customer_id AND a.can_write)
);

-- ShedQuarters initial schema.
-- All money is stored as integer pence to avoid floating point rounding and
-- to sidestep the pg driver returning `numeric` columns as strings.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind               TEXT NOT NULL CHECK (kind IN ('quote', 'invoice', 'job_card')),
  number             TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft',

  issue_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date           DATE,

  customer_name      TEXT NOT NULL DEFAULT '',
  customer_address   TEXT NOT NULL DEFAULT '',
  customer_phone     TEXT NOT NULL DEFAULT '',
  customer_email     TEXT NOT NULL DEFAULT '',

  vehicle_reg        TEXT NOT NULL DEFAULT '',
  vehicle_make       TEXT NOT NULL DEFAULT '',
  vehicle_model      TEXT NOT NULL DEFAULT '',
  vehicle_colour     TEXT NOT NULL DEFAULT '',
  vehicle_vin        TEXT NOT NULL DEFAULT '',
  vehicle_year       INTEGER,
  vehicle_mileage    INTEGER,
  mot_due            DATE,
  next_service_due   DATE,

  work_performed     TEXT NOT NULL DEFAULT '',
  technician         TEXT NOT NULL DEFAULT '',
  notes              TEXT NOT NULL DEFAULT '',
  internal_notes     TEXT NOT NULL DEFAULT '',

  discount_type      TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none', 'percent', 'fixed')),
  discount_value     NUMERIC(12, 2) NOT NULL DEFAULT 0,

  vat_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate           NUMERIC(5, 2) NOT NULL DEFAULT 20,

  amount_paid_pence  BIGINT NOT NULL DEFAULT 0,
  paid_date          DATE,
  payment_method     TEXT NOT NULL DEFAULT '',

  converted_from_id  UUID REFERENCES documents (id) ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_kind_number_idx ON documents (kind, number);
CREATE INDEX IF NOT EXISTS documents_kind_status_idx ON documents (kind, status);
CREATE INDEX IF NOT EXISTS documents_issue_date_idx ON documents (issue_date DESC);
CREATE INDEX IF NOT EXISTS documents_vehicle_reg_idx ON documents (vehicle_reg);
CREATE INDEX IF NOT EXISTS documents_customer_name_idx ON documents (customer_name);

CREATE TABLE IF NOT EXISTS line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  type              TEXT NOT NULL DEFAULT 'labour' CHECK (type IN ('labour', 'part', 'other')),
  description       TEXT NOT NULL DEFAULT '',
  part_number       TEXT NOT NULL DEFAULT '',
  quantity          NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit              TEXT NOT NULL DEFAULT 'each' CHECK (unit IN ('hrs', 'each', 'litres', 'job')),
  unit_price_pence  BIGINT NOT NULL DEFAULT 0,
  taxable           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS line_items_document_idx ON line_items (document_id, sort_order);

-- Single-row table; `id` is pinned to 1 so upserts can never create a second.
CREATE TABLE IF NOT EXISTS settings (
  id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name               TEXT NOT NULL DEFAULT 'ShedQuarters',
  address_line1               TEXT NOT NULL DEFAULT '',
  address_line2               TEXT NOT NULL DEFAULT '',
  city                        TEXT NOT NULL DEFAULT '',
  postcode                    TEXT NOT NULL DEFAULT '',
  phone                       TEXT NOT NULL DEFAULT '',
  email                       TEXT NOT NULL DEFAULT '',
  website                     TEXT NOT NULL DEFAULT '',
  logo_data_url               TEXT NOT NULL DEFAULT '',
  bank_name                   TEXT NOT NULL DEFAULT '',
  bank_account_name           TEXT NOT NULL DEFAULT '',
  bank_sort_code              TEXT NOT NULL DEFAULT '',
  bank_account_number         TEXT NOT NULL DEFAULT '',
  payment_terms               TEXT NOT NULL DEFAULT 'Payment due within 14 days of invoice date.',
  invoice_footer              TEXT NOT NULL DEFAULT 'Thank you for your business.',
  vat_enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
  vat_rate                    NUMERIC(5, 2) NOT NULL DEFAULT 20,
  vat_number                  TEXT NOT NULL DEFAULT '',
  company_number              TEXT NOT NULL DEFAULT '',
  quote_prefix                TEXT NOT NULL DEFAULT 'QUO-',
  invoice_prefix              TEXT NOT NULL DEFAULT 'INV-',
  job_card_prefix             TEXT NOT NULL DEFAULT 'JOB-',
  default_labour_rate_pence   BIGINT NOT NULL DEFAULT 4500,
  default_payment_terms_days  INTEGER NOT NULL DEFAULT 14,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Document numbering. Incremented inside a transaction so two browser tabs
-- can never be handed the same invoice number.
CREATE TABLE IF NOT EXISTS counters (
  kind        TEXT PRIMARY KEY,
  next_value  INTEGER NOT NULL DEFAULT 1
);

INSERT INTO counters (kind, next_value) VALUES
  ('quote', 1),
  ('invoice', 1),
  ('job_card', 1)
ON CONFLICT (kind) DO NOTHING;

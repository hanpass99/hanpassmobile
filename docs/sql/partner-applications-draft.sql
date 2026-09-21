-- =====================================================================
-- OBSOLETE / ABANDONED — DO NOT RUN, EVER.
--
-- Superseded on 2026-09-21 by the append-only design: no new tables are
-- created in this back office. The application ledger, original payload,
-- idempotency records and failed/needs-review cases live exclusively in
-- the partner's own encrypted store (Railway); public.customers only
-- receives the operational copy of a new application.
--
-- This file is retained for history only. It was never applied and was
-- never verified against a real PostgreSQL database.
-- =====================================================================
-- DRAFT ONLY — NOT APPLIED, AND NOT YET VERIFIED AGAINST A REAL
-- POSTGRESQL DATABASE.

--
-- This file intentionally lives in docs/sql/ and NOT in supabase/migrations/,
-- so it is never picked up and applied automatically. Applying it to any
-- database requires a separate, explicit approval step. Nothing in this file
-- has been executed; the logic below has only been reviewed and simulated in
-- JavaScript mock tests, which is NOT a PostgreSQL correctness or concurrency
-- proof.
--
-- Scope: partner application ledger + atomic submit RPC for the external
-- HANPASS product application site.
--
-- Non-goals (deliberately absent):
--   * no product master table (the partner site owns the product ledger)
--   * no changes to public.customers columns (no is_test, no new columns)
--   * no changes to existing triggers, indexes, RLS or sync code paths
--   * no raw request bodies are stored anywhere (only a SHA-256 hash plus a
--     minimal applicant snapshot needed for manual review)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Phone normalization helper (same rule as the API layer)
--
-- Digits only; +82 / 0082 country forms are folded into the national 010
-- form so that an existing customers.phone row and an incoming partner
-- number compare equal regardless of how they were originally stored.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_normalize_phone(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  d text;
BEGIN
  d := regexp_replace(coalesce(_raw, ''), '\D', '', 'g');
  IF left(d, 4) = '0082' THEN
    d := substr(d, 5);
  END IF;
  IF length(d) = 13 AND left(d, 5) = '82010' THEN
    d := substr(d, 3);
  ELSIF length(d) = 12 AND left(d, 4) = '8210' THEN
    d := '0' || substr(d, 3);
  END IF;
  IF length(d) = 11 AND left(d, 3) = '010' THEN
    RETURN d;
  END IF;
  RETURN NULL;
END;
$$;

-- Name comparison key: case-folded, punctuation stripped, whitespace collapsed.
CREATE OR REPLACE FUNCTION public.partner_normalize_name(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(_raw, '')), '[.''`_,-]', '', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 1. Application-level status (independent from customers.status)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_application_status') THEN
    CREATE TYPE public.partner_application_status AS ENUM (
      'received',        -- accepted, waiting for operator pickup
      'needs_review',    -- ambiguous customer match, manual confirmation required
      'in_progress',
      'activated',
      'rejected',
      'cancelled'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 2. Application ledger
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_applications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id              text NOT NULL,
  external_application_id text NOT NULL,
  idempotency_key         text NOT NULL,
  request_hash            text NOT NULL,             -- SHA-256 of canonical payload; raw body never stored
  customer_id             uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_link_mode      text NOT NULL,             -- 'created' | 'linked' | 'unlinked_needs_review'
  applicant_snapshot      jsonb NOT NULL,            -- MINIMAL review data (name, phone, nationality) — restricted, never returned by the API
  product_snapshot        jsonb NOT NULL,            -- per-application product record (partner-provided prices)
  locale                  text NOT NULL,
  source                  text NOT NULL,
  consent_version         text NOT NULL,
  consent_accepted_at     timestamptz NOT NULL,
  submitted_at            timestamptz NOT NULL,
  received_at             timestamptz NOT NULL DEFAULT now(),
  status                  public.partner_application_status NOT NULL DEFAULT 'received',
  status_changed_at       timestamptz NOT NULL DEFAULT now(),
  review_reason           text,                      -- e.g. 'multiple_customer_matches' (no PII)
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_applications_link_mode_chk
    CHECK (customer_link_mode IN ('created', 'linked', 'unlinked_needs_review')),
  CONSTRAINT partner_applications_locale_chk
    CHECK (locale IN ('ko','en','zh','vi','ru','ne','km','id','my','th','mn','si','ja','lo')),
  CONSTRAINT partner_applications_source_chk
    CHECK (source IN ('nh_allone','hanpass_web'))
);

-- Idempotency + external uniqueness, both scoped per partner.
CREATE UNIQUE INDEX IF NOT EXISTS partner_applications_idem_idx
  ON public.partner_applications (partner_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS partner_applications_external_idx
  ON public.partner_applications (partner_id, external_application_id);
CREATE INDEX IF NOT EXISTS partner_applications_customer_idx
  ON public.partner_applications (customer_id);
CREATE INDEX IF NOT EXISTS partner_applications_received_idx
  ON public.partner_applications (received_at DESC);

-- NOTE: the same customer submitting a different product creates a NEW row.
-- The existing customers_activation_request_dedup_idx (name, phone, signup_date)
-- is deliberately NOT used for idempotency — doing so would silently drop a
-- second, different product application from the same person on the same day.

-- Column-level privileges: applicant_snapshot holds personal data needed only
-- for manual review, so it is NOT granted to ordinary authenticated sessions.
GRANT SELECT (
  id, partner_id, external_application_id, idempotency_key, request_hash,
  customer_id, customer_link_mode, product_snapshot, locale, source,
  consent_version, consent_accepted_at, submitted_at, received_at,
  status, status_changed_at, review_reason, created_at, updated_at
) ON public.partner_applications TO authenticated;
GRANT UPDATE (status, status_changed_at, review_reason, customer_id)
  ON public.partner_applications TO authenticated;
GRANT ALL ON public.partner_applications TO service_role;

ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

-- Back-office visibility only; the public endpoints use the service role.
CREATE POLICY "partner_applications_admin_read"
  ON public.partner_applications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "partner_applications_admin_write"
  ON public.partner_applications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Reviewer-facing read of the restricted snapshot goes through this function
-- instead of a direct column grant, so access stays auditable and admin-only.
CREATE OR REPLACE FUNCTION public.partner_application_review_data(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  snap jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT a.applicant_snapshot INTO snap
  FROM public.partner_applications a
  WHERE a.id = _application_id;
  RETURN snap;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_application_review_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_application_review_data(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.touch_partner_applications()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_partner_applications ON public.partner_applications;
CREATE TRIGGER trg_touch_partner_applications
BEFORE UPDATE ON public.partner_applications
FOR EACH ROW EXECUTE FUNCTION public.touch_partner_applications();

-- ---------------------------------------------------------------------
-- 3. Atomic submit RPC
--
-- One transaction: resolve/create the customer and insert the application.
-- Concurrency is settled by the unique indexes above, not by application code.
--
-- Customer linking rule (deliberately strict; comparison uses the normalized
-- phone on BOTH sides and the normalized name on both sides):
--   exactly one row with same name + phone + pool -> link
--                         (never overwrite any existing customer field)
--   no row with a matching phone at all           -> create a new customer
--   phone matches but the name differs            -> DO NOT create, DO NOT
--                                                    link: needs_review
--   several rows match name + phone               -> needs_review
-- A phone-number-only match never merges and never silently creates a
-- duplicate person.
--
-- When the outcome is needs_review the application carries
-- applicant_snapshot, so the applicant's name/phone/nationality are preserved
-- for the reviewer even though customer_id is NULL.
--
-- Assignment: none. assigned_to stays NULL and operators assign manually.
-- There is no approved auto-assignment policy, so none is implemented.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_submit_application(
  _partner_id              text,
  _external_application_id text,
  _idempotency_key         text,
  _request_hash            text,
  _full_name               text,
  _phone                   text,
  _nationality             text,
  _locale                  text,
  _source                  text,
  _applicant_snapshot      jsonb,
  _product_snapshot        jsonb,
  _consent_version         text,
  _consent_accepted_at     timestamptz,
  _submitted_at            timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing            public.partner_applications%ROWTYPE;
  norm_phone          text;
  norm_name           text;
  phone_matches       integer;
  name_matches        integer;
  matched_customer_id uuid;
  link_mode           text;
  app_status          public.partner_application_status := 'received';
  review              text := NULL;
  inserted            public.partner_applications%ROWTYPE;
  country             uuid;
BEGIN
  -- 3a. Idempotency: same key?
  SELECT * INTO existing
  FROM public.partner_applications
  WHERE partner_id = _partner_id AND idempotency_key = _idempotency_key;

  IF FOUND THEN
    IF existing.request_hash = _request_hash THEN
      RETURN jsonb_build_object(
        'outcome', 'replayed',
        'application_id', existing.id,
        'external_application_id', existing.external_application_id,
        'status', existing.status,
        'received_at', existing.received_at
      );
    END IF;
    RETURN jsonb_build_object('outcome', 'conflict', 'reason', 'idempotency_key_conflict');
  END IF;

  -- 3b. External id must stay unique per partner.
  SELECT * INTO existing
  FROM public.partner_applications
  WHERE partner_id = _partner_id AND external_application_id = _external_application_id;

  IF FOUND THEN
    IF existing.request_hash = _request_hash THEN
      RETURN jsonb_build_object(
        'outcome', 'replayed',
        'application_id', existing.id,
        'external_application_id', existing.external_application_id,
        'status', existing.status,
        'received_at', existing.received_at
      );
    END IF;
    RETURN jsonb_build_object('outcome', 'conflict', 'reason', 'external_application_id_conflict');
  END IF;

  -- 3c. Strict customer resolution.
  --     Counts and id lookup are separate statements: min()/max() have no
  --     aggregate for uuid in PostgreSQL, so the id is read with ORDER BY
  --     ... LIMIT 1 instead of an aggregate over c.id.
  norm_phone := public.partner_normalize_phone(_phone);
  norm_name  := public.partner_normalize_name(_full_name);

  SELECT count(*) INTO phone_matches
  FROM public.customers c
  WHERE c.pool = 'activation_request'::public.customer_pool
    AND public.partner_normalize_phone(c.phone) = norm_phone;

  SELECT count(*) INTO name_matches
  FROM public.customers c
  WHERE c.pool = 'activation_request'::public.customer_pool
    AND public.partner_normalize_phone(c.phone) = norm_phone
    AND public.partner_normalize_name(c.name) = norm_name;

  IF name_matches = 1 THEN
    SELECT c.id INTO matched_customer_id
    FROM public.customers c
    WHERE c.pool = 'activation_request'::public.customer_pool
      AND public.partner_normalize_phone(c.phone) = norm_phone
      AND public.partner_normalize_name(c.name) = norm_name
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1;

    link_mode := 'linked';           -- link only; no existing field is overwritten

  ELSIF name_matches > 1 THEN
    matched_customer_id := NULL;
    link_mode := 'unlinked_needs_review';
    app_status := 'needs_review';
    review := 'multiple_customer_matches';

  ELSIF phone_matches > 0 THEN
    -- Same normalized phone, different name: never auto-merge, never create a
    -- second person on the same number. Hand it to a reviewer.
    matched_customer_id := NULL;
    link_mode := 'unlinked_needs_review';
    app_status := 'needs_review';
    review := 'phone_match_name_mismatch';

  ELSE
    SELECT id INTO country FROM public.countries WHERE upper(code) = upper(_nationality) LIMIT 1;

    INSERT INTO public.customers (name, phone, country_id, pool, status, signup_date, application_date)
    VALUES (_full_name, _phone, country, 'activation_request'::public.customer_pool,
            'new'::public.customer_status, current_date, current_date)
    RETURNING id INTO matched_customer_id;

    link_mode := 'created';
  END IF;

  -- 3d. Application row (always its own row, even for an existing customer).
  INSERT INTO public.partner_applications (
    partner_id, external_application_id, idempotency_key, request_hash,
    customer_id, customer_link_mode, applicant_snapshot, product_snapshot,
    locale, source, consent_version, consent_accepted_at, submitted_at,
    status, review_reason
  )
  VALUES (
    _partner_id, _external_application_id, _idempotency_key, _request_hash,
    matched_customer_id, link_mode, _applicant_snapshot, _product_snapshot,
    _locale, _source, _consent_version, _consent_accepted_at, _submitted_at,
    app_status, review
  )
  RETURNING * INTO inserted;

  RETURN jsonb_build_object(
    'outcome', 'created',
    'application_id', inserted.id,
    'external_application_id', inserted.external_application_id,
    'status', inserted.status,
    'received_at', inserted.received_at
  );

EXCEPTION
  -- Concurrent duplicate submissions land here; re-read and replay.
  WHEN unique_violation THEN
    SELECT * INTO existing
    FROM public.partner_applications
    WHERE partner_id = _partner_id
      AND (idempotency_key = _idempotency_key OR external_application_id = _external_application_id)
    LIMIT 1;

    IF FOUND AND existing.request_hash = _request_hash THEN
      RETURN jsonb_build_object(
        'outcome', 'replayed',
        'application_id', existing.id,
        'external_application_id', existing.external_application_id,
        'status', existing.status,
        'received_at', existing.received_at
      );
    END IF;
    RETURN jsonb_build_object('outcome', 'conflict', 'reason', 'idempotency_key_conflict');
END;
$$;

-- Least privilege: only the service role (used by the verified server route)
-- may execute. No anon/authenticated/public execution.
REVOKE ALL ON FUNCTION public.partner_submit_application(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_submit_application(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, timestamptz, timestamptz
) TO service_role;

-- ---------------------------------------------------------------------
-- 4. Partner-scoped status lookup (no PII in the result)
--
-- applicant_snapshot is deliberately NOT selected here; the status endpoint
-- must never return applicant data.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_get_application(
  _partner_id              text,
  _external_application_id text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'application_id', a.id,
    'external_application_id', a.external_application_id,
    'status', a.status,
    'received_at', a.received_at
  )
  FROM public.partner_applications a
  WHERE a.partner_id = _partner_id
    AND a.external_application_id = _external_application_id;
$$;

REVOKE ALL ON FUNCTION public.partner_get_application(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_get_application(text, text) TO service_role;

-- ---------------------------------------------------------------------
-- 5. Rollback note
--
-- Rollback = disable the feature (PARTNER_API_ENABLED unset / key removed).
-- The application ledger is RETAINED; do not drop partner_applications.
-- ---------------------------------------------------------------------

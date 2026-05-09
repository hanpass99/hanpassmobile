
-- 1) 고객 상태 enum 재정의 (순서 보장 위해 재생성)
ALTER TYPE public.customer_status RENAME TO customer_status_old;

CREATE TYPE public.customer_status AS ENUM (
  'new',
  'in_progress',
  'no_answer',
  'not_interested',
  'callback',
  'activated',
  'stay_expired',
  'delinquent',
  'line_exceeded',
  'minor'
);

-- customers.status: 매핑하며 새 enum으로 변환
ALTER TABLE public.customers
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.customer_status USING (
    CASE status::text
      WHEN 'new' THEN 'new'
      WHEN 'contacted' THEN 'in_progress'
      WHEN 'in_progress' THEN 'in_progress'
      WHEN 'activated' THEN 'activated'
      WHEN 'failed' THEN 'no_answer'
      WHEN 'do_not_call' THEN 'not_interested'
      ELSE 'new'
    END
  )::public.customer_status,
  ALTER COLUMN status SET DEFAULT 'new'::public.customer_status;

DROP TYPE public.customer_status_old;

-- 2) Pool enum + 컬럼
CREATE TYPE public.customer_pool AS ENUM (
  'existing',
  'new_signup',
  'prepaid',
  'activation_request'
);

ALTER TABLE public.customers
  ADD COLUMN pool public.customer_pool NOT NULL DEFAULT 'existing';

CREATE INDEX IF NOT EXISTS idx_customers_pool ON public.customers(pool);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- 3) 채널 재정의: 기존 비활성화 후 새 채널 시드
UPDATE public.channels SET is_active = false;

INSERT INTO public.channels (name, color, is_active) VALUES
  ('한패스 모바일 기존 고객', '#3b82f6', true),
  ('한패스 신규 가입자', '#10b981', true),
  ('선불 충전자', '#f59e0b', true),
  ('개통 신청자', '#8b5cf6', true)
ON CONFLICT DO NOTHING;

-- 4) CIS 국가 추가
INSERT INTO public.countries (code, name_ko, name_en, is_active)
VALUES ('CIS', '독립국가연합', 'CIS', true)
ON CONFLICT DO NOTHING;

-- 5) 메모 히스토리 테이블
CREATE TABLE public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_notes_customer ON public.customer_notes(customer_id, created_at DESC);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_read"
ON public.customer_notes FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_notes.customer_id
      AND (c.assigned_to = auth.uid()
           OR (c.country_id IS NOT NULL AND c.country_id = public.current_user_country()))
  )
);

CREATE POLICY "notes_insert"
ON public.customer_notes FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_notes.customer_id
        AND (c.assigned_to = auth.uid()
             OR (c.country_id IS NOT NULL AND c.country_id = public.current_user_country()))
    )
  )
);

CREATE POLICY "notes_delete_admin"
ON public.customer_notes FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 6) 자동 담당자 지정 트리거: 직원이 customers UPDATE 시 assigned_to가 NULL이면 자기 자신
CREATE OR REPLACE FUNCTION public.auto_assign_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.assigned_to := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_customer ON public.customers;
CREATE TRIGGER trg_auto_assign_customer
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_customer();

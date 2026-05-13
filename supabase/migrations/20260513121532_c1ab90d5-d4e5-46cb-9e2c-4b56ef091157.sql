-- Add 2 new customer statuses
ALTER TYPE public.customer_status ADD VALUE IF NOT EXISTS 'wrong_application';
ALTER TYPE public.customer_status ADD VALUE IF NOT EXISTS 'seasonal_worker';

-- Add sort_order column to profiles for manual staff ordering
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1000;
CREATE INDEX IF NOT EXISTS idx_profiles_sort_order ON public.profiles(sort_order, display_name);

-- Admin RPC to set sort_order
CREATE OR REPLACE FUNCTION public.admin_set_profile_sort_order(_user_id uuid, _sort_order integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles SET sort_order = _sort_order, updated_at = now() WHERE id = _user_id;
END;
$$;

-- Bulk reorder
CREATE OR REPLACE FUNCTION public.admin_set_profile_sort_orders(_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR i IN 1..coalesce(array_length(_user_ids, 1), 0) LOOP
    UPDATE public.profiles SET sort_order = i * 10, updated_at = now() WHERE id = _user_ids[i];
  END LOOP;
END;
$$;
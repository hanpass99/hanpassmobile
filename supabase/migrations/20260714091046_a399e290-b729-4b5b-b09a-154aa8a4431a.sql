CREATE OR REPLACE FUNCTION public.auto_assign_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());

    IF NEW.pool = 'google_form_activation'::public.customer_pool THEN
      NEW.assigned_to := NULL;
      NEW.status_changed_by := NULL;
      RETURN NEW;
    END IF;

    NEW.status_changed_by := uid;

    IF uid IS NOT NULL
       AND NEW.assigned_to IS NULL
       AND NOT public.has_role(uid, 'admin'::public.app_role) THEN
      NEW.assigned_to := uid;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_changed_at := now();
      NEW.status_changed_by := uid;

      -- 상태를 변경한 사람이 담당자로 배정됨 (관리자 포함).
      -- 단, 구글폼 개통 신청자 풀은 자동 배정에서 제외.
      IF uid IS NOT NULL
         AND NEW.pool <> 'google_form_activation'::public.customer_pool THEN
        NEW.assigned_to := uid;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
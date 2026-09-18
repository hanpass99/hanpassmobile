ALTER TABLE public.call_logs ALTER COLUMN staff_id DROP NOT NULL;
ALTER TABLE public.call_logs DROP CONSTRAINT IF EXISTS call_logs_staff_id_fkey;
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.broadcasts ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.broadcasts DROP CONSTRAINT IF EXISTS broadcasts_sender_id_fkey;
ALTER TABLE public.broadcasts ADD CONSTRAINT broadcasts_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
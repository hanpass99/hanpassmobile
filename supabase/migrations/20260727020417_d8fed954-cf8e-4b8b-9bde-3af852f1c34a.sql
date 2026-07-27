
DO $$ BEGIN
  CREATE TYPE public.template_media_type AS ENUM ('none', 'image', 'document');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.quick_reply_templates
  ADD COLUMN IF NOT EXISTS media_type public.template_media_type NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_file_name text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_size bigint;

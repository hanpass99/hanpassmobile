INSERT INTO public.countries (code, name_ko, name_en, is_active) VALUES
  ('MN', '몽골', 'Mongolia', true),
  ('CN', '중국', 'China', true),
  ('GB', '영국', 'United Kingdom', true)
ON CONFLICT DO NOTHING;
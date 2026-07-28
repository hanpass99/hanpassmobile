
create extension if not exists vector;

-- FAQ knowledge base
create table public.ai_faq_entries (
  id uuid primary key default gen_random_uuid(),
  category text,
  question_examples text[] not null default '{}',
  answer_uz text not null,
  answer_ru text not null,
  is_active boolean not null default true,
  embedding vector(1536),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.ai_faq_entries to authenticated;
grant all on public.ai_faq_entries to service_role;

alter table public.ai_faq_entries enable row level security;

create policy "faq_read_all_authenticated" on public.ai_faq_entries
  for select to authenticated using (true);
create policy "faq_admin_insert" on public.ai_faq_entries
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "faq_admin_update" on public.ai_faq_entries
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "faq_admin_delete" on public.ai_faq_entries
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create index ai_faq_embedding_idx on public.ai_faq_entries
  using hnsw (embedding vector_cosine_ops);
create index ai_faq_active_idx on public.ai_faq_entries (is_active);

create trigger ai_faq_updated_at
  before update on public.ai_faq_entries
  for each row execute function public.set_updated_at();

-- Global + per-chat AI settings
create table public.ai_reply_settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null,  -- 'global' or 'chat'
  chat_row_id uuid references public.telegram_chats(id) on delete cascade,
  enabled boolean not null default true,
  confidence_threshold numeric(3,2) not null default 0.75,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (scope, chat_row_id)
);

grant select, insert, update, delete on public.ai_reply_settings to authenticated;
grant all on public.ai_reply_settings to service_role;

alter table public.ai_reply_settings enable row level security;
create policy "ai_settings_all_authenticated" on public.ai_reply_settings
  for all to authenticated using (true) with check (true);

create trigger ai_settings_updated_at
  before update on public.ai_reply_settings
  for each row execute function public.set_updated_at();

insert into public.ai_reply_settings (scope, enabled, confidence_threshold)
values ('global', true, 0.75);

-- AI decision log
create table public.ai_reply_logs (
  id uuid primary key default gen_random_uuid(),
  chat_row_id uuid references public.telegram_chats(id) on delete cascade,
  inbound_message_id uuid references public.telegram_messages(id) on delete set null,
  outbound_message_id uuid references public.telegram_messages(id) on delete set null,
  matched_faq_id uuid references public.ai_faq_entries(id) on delete set null,
  confidence numeric(4,3),
  decision text not null,  -- 'sent' | 'skipped_low_confidence' | 'skipped_disabled' | 'skipped_safety' | 'error'
  reason text,
  reply_text text,
  question_text text,
  created_at timestamptz not null default now()
);

grant select on public.ai_reply_logs to authenticated;
grant all on public.ai_reply_logs to service_role;

alter table public.ai_reply_logs enable row level security;
create policy "ai_logs_read" on public.ai_reply_logs
  for select to authenticated using (true);

create index ai_reply_logs_chat_idx on public.ai_reply_logs (chat_row_id, created_at desc);

-- Add is_ai_generated to telegram_messages
alter table public.telegram_messages add column if not exists is_ai_generated boolean not null default false;

-- Similarity search function
create or replace function public.match_ai_faq(
  query_embedding vector(1536),
  match_count int default 5
) returns table (
  id uuid,
  category text,
  question_examples text[],
  answer_uz text,
  answer_ru text,
  similarity float
) language sql stable security definer set search_path = public as $$
  select
    f.id,
    f.category,
    f.question_examples,
    f.answer_uz,
    f.answer_ru,
    1 - (f.embedding <=> query_embedding) as similarity
  from public.ai_faq_entries f
  where f.is_active = true and f.embedding is not null
  order by f.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_ai_faq(vector, int) to authenticated, service_role;

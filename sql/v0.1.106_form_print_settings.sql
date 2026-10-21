-- v0.1.106: per-exam print header and typography settings.

alter table public.exam_sessions
  add column if not exists form_font_family text not null default 'Times New Roman',
  add column if not exists form_font_size numeric(4,1) not null default 11,
  add column if not exists form_print_settings jsonb not null default '{}'::jsonb;

alter table public.exam_sessions
  drop constraint if exists exam_sessions_form_font_size_check;

alter table public.exam_sessions
  add constraint exam_sessions_form_font_size_check
  check (form_font_size between 8 and 24);

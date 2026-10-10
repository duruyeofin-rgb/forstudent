-- forstudent 시작용 스키마 (Supabase / PostgreSQL)
--
-- 학급 코드 + 번호로 입장하는 학습 웹앱의 기본 표와 접근 규칙(RLS)입니다.
-- 실제로 운영한 앱의 구조에서 학습 내용에 해당하는 부분을 빼고 일반화한 것입니다.
--
-- ※ 그대로 운영 DB에 적용하지 마세요. 먼저 시험용 프로젝트에서 적용하고
--   (1) 로그인하지 않은 요청, (2) 학생 본인, (3) 다른 학생·다른 교사의 요청을 실제로 시험한 뒤 씁니다
--   (references/03-privacy-and-safety.md).
-- ※ 여러 번 실행해도 안전하게 만들었습니다(if not exists / drop policy if exists).
-- ※ Supabase 대시보드에서 Authentication → Sign In → "Allow anonymous sign-ins" 를 켜야 학생 입장이 됩니다.
-- 되돌리기(처음 상태로): drop table if exists public.teacher_notes, public.attempts, public.progress, public.students, public.classes cascade;

-- 학급 (교사가 만든다)
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,                       -- 학급 이름(예: 3학년 2반). 학생 이름이 아님
  code text not null unique,                -- 입장용 숫자 6자리
  student_count int not null default 25 check (student_count between 1 and 40),
  created_at timestamptz not null default now()
);

-- 학생: 이름을 저장하지 않는다. 번호만.
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  number int not null,
  auth_uid uuid,                            -- 이 학생으로 입장한 익명 사용자
  state jsonb not null default '{}'::jsonb, -- 선택한 캐릭터·보상 등 앱이 정하는 진행 상태
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, number)
);

-- 단원·단계별 진도
create table if not exists public.progress (
  student_id uuid not null references public.students(id) on delete cascade,
  unit_id text not null,
  level text not null,                      -- 앱이 정하는 단계 이름(예: 'word', 'sentence')
  first_try_correct int not null default 0,
  total int not null default 0,
  passed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (student_id, unit_id, level)
);

-- 문항 하나하나의 결과 (성장 분석은 여기서 '계산만' 한다)
create table if not exists public.attempts (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  level text not null,
  unit_id text not null,
  item_id text not null,                    -- 교육 내용 파일의 순서에서 만든 문항 번호
  target text not null,                     -- 문제 낱말/문장
  answer text,                              -- 학생이 고른 답 (음성 인식 글자도 '글자'만 저장, 원본 음성 저장 금지)
  is_correct boolean not null,
  first_try boolean not null,               -- 첫 시도 여부: 성장 분석의 바탕
  feedback text,
  created_at timestamptz not null default now()
);

-- 교사 피드백 메모 (학생은 볼 수 없다)
create table if not exists public.teacher_notes (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attempts_class_idx on public.attempts (class_id, created_at);
create index if not exists attempts_student_idx on public.attempts (student_id, unit_id);
create index if not exists students_auth_idx on public.students (auth_uid);
create index if not exists teacher_notes_student_idx on public.teacher_notes (student_id, created_at desc);

alter table public.classes       enable row level security;
alter table public.students      enable row level security;
alter table public.progress      enable row level security;
alter table public.attempts      enable row level security;
alter table public.teacher_notes enable row level security;

-- 정책을 다시 만들 수 있게 먼저 지운다
drop policy if exists teacher_classes on public.classes;
drop policy if exists teacher_students on public.students;
drop policy if exists teacher_progress on public.progress;
drop policy if exists teacher_attempts on public.attempts;
drop policy if exists teacher_notes_all on public.teacher_notes;
drop policy if exists student_self_select on public.students;
drop policy if exists student_self_update on public.students;
drop policy if exists student_progress on public.progress;
drop policy if exists student_attempts_insert on public.attempts;
drop policy if exists student_attempts_select on public.attempts;

-- 교사(익명이 아닌 사용자)는 자기 학급만
create policy teacher_classes on public.classes for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);

create policy teacher_students on public.students for all
  using (exists (select 1 from public.classes c where c.id = students.class_id and c.teacher_id = auth.uid()));

create policy teacher_progress on public.progress for all
  using (exists (select 1 from public.students s join public.classes c on c.id = s.class_id
                 where s.id = progress.student_id and c.teacher_id = auth.uid()));

create policy teacher_attempts on public.attempts for all
  using (exists (select 1 from public.classes c where c.id = attempts.class_id and c.teacher_id = auth.uid()));

create policy teacher_notes_all on public.teacher_notes for all
  using (exists (select 1 from public.classes c where c.id = teacher_notes.class_id and c.teacher_id = auth.uid()))
  with check (exists (select 1 from public.classes c where c.id = teacher_notes.class_id and c.teacher_id = auth.uid()));

-- 학생(익명 로그인)은 자기 기록만
create policy student_self_select on public.students for select using (auth_uid = auth.uid());
create policy student_self_update on public.students for update
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

create policy student_progress on public.progress for all
  using (exists (select 1 from public.students s where s.id = progress.student_id and s.auth_uid = auth.uid()))
  with check (exists (select 1 from public.students s where s.id = progress.student_id and s.auth_uid = auth.uid()));

create policy student_attempts_insert on public.attempts for insert
  with check (exists (select 1 from public.students s
                      where s.id = attempts.student_id and s.class_id = attempts.class_id and s.auth_uid = auth.uid()));
create policy student_attempts_select on public.attempts for select
  using (exists (select 1 from public.students s where s.id = attempts.student_id and s.auth_uid = auth.uid()));

-- 로그인하지 않은 사람(anon)은 아무 표에도 접근하지 못한다
revoke all on public.classes, public.students, public.progress, public.attempts, public.teacher_notes from anon;

-- 안전장치: students 는 지정한 열만 수정할 수 있다
-- (학생이 class_id·auth_uid 를 바꿔서 다른 학급으로 옮겨 가는 것을 막는다)
revoke update on public.students from anon, authenticated;
grant update (state, updated_at) on public.students to authenticated;

-- 학생 입장: 학급 코드 + 번호 → 학생 행을 만들거나 찾아 이 익명 사용자와 묶는다
create or replace function public.join_class(p_code text, p_number int)
returns public.students
language plpgsql security definer set search_path = public as $$
declare c public.classes; s public.students;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from public.classes where code = upper(trim(p_code));
  if not found then raise exception 'invalid code'; end if;
  if p_number < 1 or p_number > c.student_count then raise exception 'invalid number'; end if;
  insert into public.students (class_id, number, auth_uid)
  values (c.id, p_number, auth.uid())
  on conflict (class_id, number) do update set auth_uid = excluded.auth_uid, updated_at = now()
  returning * into s;
  return s;
end $$;

revoke all on function public.join_class(text, int) from public;
grant execute on function public.join_class(text, int) to authenticated;

-- 번호 선택 화면에 필요한 학급 인원 수 (코드가 맞을 때만 숫자를 돌려주고, 틀리면 null)
create or replace function public.class_size(p_code text)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select student_count into n from public.classes where code = upper(trim(p_code));
  return n;
end $$;

revoke all on function public.class_size(text) from public;
grant execute on function public.class_size(text) to authenticated;

-- ───────── 선택: 교사 초대 암호 (아무나 학급을 만들지 못하게) ─────────
-- 교사는 이메일 없이 '아이디+비밀번호'로 가입하므로, 초대 암호를 통과한 계정만 학급을 만들게 할 수 있다.
-- 1) 아래 표와 함수를 만들고 2) 초대 암호의 SHA-256(16진수 64자)을 app_settings 에 넣고
-- 3) classes 의 정책을 'teachers 에 있는 사용자만 만들기'로 바꾼다. (주석을 풀어 쓰세요)
--
-- create table if not exists public.teachers (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
-- create table if not exists public.app_settings (key text primary key, value text not null);
-- alter table public.teachers enable row level security;
-- alter table public.app_settings enable row level security;
-- revoke all on public.app_settings from anon, authenticated;
-- create or replace function public.redeem_teacher_invite(p_code text) returns boolean
-- language plpgsql security definer set search_path = public as $$
-- begin
--   if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'not allowed'; end if;
--   if not exists (select 1 from public.app_settings where key = 'teacher_invite_hash'
--                  and value = encode(sha256(convert_to(trim(p_code), 'UTF8')), 'hex')) then return false; end if;
--   insert into public.teachers (user_id) values (auth.uid()) on conflict do nothing;
--   return true;
-- end $$;

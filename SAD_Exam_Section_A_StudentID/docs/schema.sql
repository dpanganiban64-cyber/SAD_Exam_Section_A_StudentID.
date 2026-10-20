-- Student Scholarship Monitoring and Academic Compliance System
-- Run in Supabase SQL Editor. Supabase Auth is the authentication backend.
create extension if not exists pgcrypto;

drop table if exists public.audit_history cascade;
drop table if exists public.semester_submission cascade;
drop table if exists public.scholar cascade;
drop table if exists public.scholarship_policy cascade;
drop table if exists public.user_profile cascade;

create table public.user_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'scholar' check (role in ('scholar','staff')),
  created_at timestamptz not null default now()
);
create table public.scholarship_policy (
  policy_id text primary key,
  policy_name text not null unique,
  max_gwa numeric(3,2) not null check (max_gwa between 1 and 5),
  min_units integer not null check (min_units >= 0),
  max_failed integer not null check (max_failed >= 0),
  max_incomplete integer not null check (max_incomplete >= 0),
  max_dropped integer not null check (max_dropped >= 0),
  deadline timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.scholar (
  scholar_id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.user_profile(user_id) on delete cascade,
  student_id text not null unique,
  full_name text not null,
  email text not null,
  policy_id text not null references public.scholarship_policy(policy_id),
  created_at timestamptz not null default now()
);
create table public.semester_submission (
  submission_id uuid primary key default gen_random_uuid(),
  scholar_id uuid not null references public.scholar(scholar_id) on delete cascade,
  academic_year text not null,
  semester text not null check (semester in ('1','2','Summer')),
  gwa numeric(3,2) not null check (gwa between 1.00 and 5.00),
  enrolled_units integer not null check (enrolled_units >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  incomplete_count integer not null default 0 check (incomplete_count >= 0),
  dropped_count integer not null default 0 check (dropped_count >= 0),
  evidence_reference text not null check (length(trim(evidence_reference)) > 0),
  submitted_at timestamptz not null default now(),
  verification_status text not null default 'Pending' check (verification_status in ('Pending','Verified','Returned')),
  verification_reason text not null default '',
  verified_by uuid references public.user_profile(user_id),
  verified_at timestamptz,
  compliance_status text not null default 'Not Evaluated' check (compliance_status in ('Not Evaluated','Compliant','With Deficiency')),
  deficiency_reasons jsonb not null default '[]'::jsonb,
  renewal_decision text not null default 'Pending' check (renewal_decision in ('Pending','Approved','Held')),
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scholar_id, academic_year, semester)
);
create table public.audit_history (
  audit_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.user_profile(user_id),
  action text not null,
  entity_id text not null,
  details text not null default '',
  occurred_at timestamptz not null default now()
);
create index idx_submission_term on public.semester_submission(academic_year, semester);
create index idx_submission_status on public.semester_submission(verification_status, compliance_status);
create index idx_scholar_name on public.scholar(full_name);

insert into public.scholarship_policy(policy_id,policy_name,max_gwa,min_units,max_failed,max_incomplete,max_dropped,deadline) values
('POL-MERIT','Merit Scholar',1.75,18,0,0,0,'2026-10-30 17:00:00 Asia/Manila'),
('POL-COMMUNITY','Community Scholar',2.25,15,0,0,1,'2026-10-30 17:00:00 Asia/Manila')
on conflict (policy_id) do update set policy_name=excluded.policy_name,max_gwa=excluded.max_gwa,min_units=excluded.min_units,max_failed=excluded.max_failed,max_incomplete=excluded.max_incomplete,max_dropped=excluded.max_dropped,deadline=excluded.deadline;

-- Keep Auth user metadata aligned with the profile table. Default role is scholar;
-- promote trusted staff manually in SQL Editor after creating their Auth account.
create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.user_profile(user_id,email,full_name,role)
 values(new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name',''), 'scholar')
 on conflict(user_id) do update set email=excluded.email;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_auth_user();

create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$
 select role from public.user_profile where user_id=auth.uid()
$$;
create or replace function public.audit_event(p_action text,p_entity_id text,p_details text) returns void language sql security definer set search_path=public as $$
 insert into public.audit_history(actor_user_id,action,entity_id,details) values(auth.uid(),p_action,p_entity_id,coalesce(p_details,''));
$$;

create or replace function public.staff_verify_submission(p_submission_id uuid,p_status text,p_reason text default '') returns void
language plpgsql security definer set search_path=public as $$
declare s public.semester_submission%rowtype;
begin
 if public.current_role() <> 'staff' then raise exception 'Only scholarship staff can verify evidence'; end if;
 if p_status not in ('Verified','Returned') then raise exception 'Invalid verification status'; end if;
 if p_status='Returned' and length(trim(coalesce(p_reason,'')))=0 then raise exception 'A reason is required when returning evidence'; end if;
 select * into s from public.semester_submission where submission_id=p_submission_id for update;
 if not found then raise exception 'Submission not found'; end if;
 update public.semester_submission set verification_status=p_status,verification_reason=coalesce(p_reason,''),verified_by=auth.uid(),verified_at=now(),compliance_status='Not Evaluated',deficiency_reasons='[]'::jsonb,renewal_decision='Pending',decision_note='',updated_at=now() where submission_id=p_submission_id;
 perform public.audit_event('Verification: '||p_status,p_submission_id::text,coalesce(p_reason,''));
end $$;

create or replace function public.evaluate_compliance(p_submission_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.semester_submission%rowtype; p public.scholarship_policy%rowtype; reasons jsonb:='[]'::jsonb; late boolean;
begin
 if public.current_role() <> 'staff' then raise exception 'Only scholarship staff can evaluate compliance'; end if;
 select ss.* into s from public.semester_submission ss where ss.submission_id=p_submission_id for update;
 if not found then raise exception 'Submission not found'; end if;
 if s.verification_status <> 'Verified' then raise exception 'Evidence must be Verified before evaluation'; end if;
 select sp.* into p from public.scholar sh join public.scholarship_policy sp on sp.policy_id=sh.policy_id where sh.scholar_id=s.scholar_id;
 if s.gwa > p.max_gwa then reasons:=reasons||jsonb_build_array(format('GWA %s exceeds maximum %s',s.gwa,p.max_gwa)); end if;
 if s.enrolled_units < p.min_units then reasons:=reasons||jsonb_build_array(format('Enrolled units %s are below minimum %s',s.enrolled_units,p.min_units)); end if;
 if s.failed_count > p.max_failed then reasons:=reasons||jsonb_build_array(format('Failed subjects %s exceed allowed %s',s.failed_count,p.max_failed)); end if;
 if s.incomplete_count > p.max_incomplete then reasons:=reasons||jsonb_build_array(format('Incomplete grades %s exceed allowed %s',s.incomplete_count,p.max_incomplete)); end if;
 if s.dropped_count > p.max_dropped then reasons:=reasons||jsonb_build_array(format('Dropped subjects %s exceed allowed %s',s.dropped_count,p.max_dropped)); end if;
 late:=s.submitted_at > p.deadline;
 if late then reasons:=reasons||jsonb_build_array('Submission was received after the deadline (Asia/Manila)'); end if;
 update public.semester_submission set compliance_status=case when jsonb_array_length(reasons)=0 then 'Compliant' else 'With Deficiency' end,deficiency_reasons=reasons,renewal_decision='Pending',decision_note='',updated_at=now() where submission_id=p_submission_id;
 perform public.audit_event('Compliance evaluated',p_submission_id::text,case when jsonb_array_length(reasons)=0 then 'Compliant' else reasons::text end);
 return jsonb_build_object('compliance_status',case when jsonb_array_length(reasons)=0 then 'Compliant' else 'With Deficiency' end,'deficiency_reasons',reasons);
end $$;

create or replace function public.staff_record_renewal_decision(p_submission_id uuid,p_decision text,p_note text default '') returns void
language plpgsql security definer set search_path=public as $$
declare s public.semester_submission%rowtype;
begin
 if public.current_role() <> 'staff' then raise exception 'Only scholarship staff can decide renewal'; end if;
 if p_decision not in ('Approved','Held') then raise exception 'Invalid renewal decision'; end if;
 select * into s from public.semester_submission where submission_id=p_submission_id for update;
 if not found then raise exception 'Submission not found'; end if;
 if s.verification_status <> 'Verified' or s.compliance_status='Not Evaluated' then raise exception 'Verify and evaluate the submission before recording renewal'; end if;
 if p_decision='Approved' and s.compliance_status <> 'Compliant' then raise exception 'A deficient submission cannot be approved'; end if;
 if p_decision='Held' and length(trim(coalesce(p_note,'')))=0 then raise exception 'A note is required for a Held decision'; end if;
 update public.semester_submission set renewal_decision=p_decision,decision_note=coalesce(p_note,''),updated_at=now() where submission_id=p_submission_id;
 perform public.audit_event('Renewal: '||p_decision,p_submission_id::text,coalesce(p_note,''));
end $$;

create or replace function public.resubmit_correction(p_submission_id uuid,p_academic_year text,p_semester text,p_gwa numeric,p_units integer,p_failed integer,p_incomplete integer,p_dropped integer,p_evidence_reference text) returns void
language plpgsql security definer set search_path=public as $$
declare s public.semester_submission%rowtype;
begin
 select ss.* into s from public.semester_submission ss join public.scholar sh on sh.scholar_id=ss.scholar_id where ss.submission_id=p_submission_id and sh.user_id=auth.uid() for update;
 if not found then raise exception 'Submission not found or access denied'; end if;
 if s.verification_status <> 'Returned' then raise exception 'Only returned submissions can be corrected'; end if;
 if p_gwa < 1 or p_gwa > 5 or p_units<0 or p_failed<0 or p_incomplete<0 or p_dropped<0 then raise exception 'Invalid academic summary values'; end if;
 update public.semester_submission set academic_year=p_academic_year,semester=p_semester,gwa=p_gwa,enrolled_units=p_units,failed_count=p_failed,incomplete_count=p_incomplete,dropped_count=p_dropped,evidence_reference=p_evidence_reference,submitted_at=now(),verification_status='Pending',verification_reason='',verified_by=null,verified_at=null,compliance_status='Not Evaluated',deficiency_reasons='[]'::jsonb,renewal_decision='Pending',decision_note='',updated_at=now() where submission_id=p_submission_id;
 perform public.audit_event('Correction resubmitted',p_submission_id::text,'Status reset to Pending verification');
end $$;

alter table public.user_profile enable row level security;
alter table public.scholarship_policy enable row level security;
alter table public.scholar enable row level security;
alter table public.semester_submission enable row level security;
alter table public.audit_history enable row level security;
create policy "profiles read self or staff" on public.user_profile for select to authenticated using (user_id=auth.uid() or public.current_role()='staff');
create policy "authenticated read policies" on public.scholarship_policy for select to authenticated using (true);
create policy "staff manage policies" on public.scholarship_policy for all to authenticated using (public.current_role()='staff') with check (public.current_role()='staff');
create policy "scholar sees own record staff sees all" on public.scholar for select to authenticated using (user_id=auth.uid() or public.current_role()='staff');
create policy "staff creates scholar assignments" on public.scholar for insert to authenticated with check (public.current_role()='staff');
create policy "staff updates scholar assignments" on public.scholar for update to authenticated using (public.current_role()='staff') with check (public.current_role()='staff');
create policy "scholars see own submissions staff sees all" on public.semester_submission for select to authenticated using (exists(select 1 from public.scholar sh where sh.scholar_id=semester_submission.scholar_id and sh.user_id=auth.uid()) or public.current_role()='staff');
create policy "scholars insert own pending submission" on public.semester_submission for insert to authenticated with check (public.current_role()='scholar' and exists(select 1 from public.scholar sh where sh.scholar_id=semester_submission.scholar_id and sh.user_id=auth.uid()) and verification_status='Pending' and compliance_status='Not Evaluated' and renewal_decision='Pending');
create policy "staff can read audit history" on public.audit_history for select to authenticated using (public.current_role()='staff');
revoke all on function public.audit_event(text,text,text) from public, anon, authenticated;
grant execute on function public.staff_verify_submission(uuid,text,text) to authenticated;
grant execute on function public.evaluate_compliance(uuid) to authenticated;
grant execute on function public.staff_record_renewal_decision(uuid,text,text) to authenticated;
grant execute on function public.resubmit_correction(uuid,text,text,numeric,integer,integer,integer,integer,text) to authenticated;

-- After creating Auth users through Supabase Dashboard, create scholar assignments:
-- 1) Promote staff: update public.user_profile set role='staff',full_name='Scholarship Staff' where email='staff@your-school.example';
-- 2) Insert a scholar row, using the matching Auth user's UUID and a policy ID:
-- insert into public.scholar(user_id,student_id,full_name,email,policy_id)
-- select user_id,'A01','Sample Scholar',email,'POL-MERIT' from public.user_profile where email='a01@your-school.example';
-- Create one Auth user per synthetic scholar and seed the six test summaries as required.

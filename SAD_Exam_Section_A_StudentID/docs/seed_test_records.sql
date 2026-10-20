-- Run after creating six Auth users, assigning them as scholars, and changing the emails below.
-- This inserts the exam's six synthetic submissions for AY 2026-2027, Semester 1.
-- Run only once; the unique scholar/year/semester constraint prevents duplicates.
insert into public.semester_submission
(scholar_id,academic_year,semester,gwa,enrolled_units,failed_count,incomplete_count,dropped_count,evidence_reference,submitted_at,verification_status,verified_by,verified_at)
select sh.scholar_id,'2026-2027','1',v.gwa,v.units,v.failed,v.incomplete,v.dropped,v.evidence,
       v.submitted_at,
       case when v.student_id='A06' then 'Pending' else 'Verified' end,
       case when v.student_id='A06' then null else (select user_id from public.user_profile where email='staff@example.com' limit 1) end,
       case when v.student_id='A06' then null else v.submitted_at end
from (values
 ('A01','a01@example.com',1.75,18,0,0,0,'GRADE-DOC-A01','2026-10-30 17:00:00 Asia/Manila'::timestamptz),
 ('A02','a02@example.com',1.76,18,0,0,0,'GRADE-DOC-A02','2026-10-29 17:00:00 Asia/Manila'::timestamptz),
 ('A03','a03@example.com',2.25,15,0,0,1,'GRADE-DOC-A03','2026-10-29 17:00:00 Asia/Manila'::timestamptz),
 ('A04','a04@example.com',2.25,14,0,1,0,'GRADE-DOC-A04','2026-10-29 17:00:00 Asia/Manila'::timestamptz),
 ('A05','a05@example.com',1.50,18,1,0,0,'GRADE-DOC-A05','2026-10-30 17:01:00 Asia/Manila'::timestamptz),
 ('A06','a06@example.com',2.00,15,0,0,0,'GRADE-DOC-A06','2026-10-29 17:00:00 Asia/Manila'::timestamptz)
) as v(student_id,email,gwa,units,failed,incomplete,dropped,evidence,submitted_at)
join public.scholar sh on sh.student_id=v.student_id and sh.email=v.email
on conflict (scholar_id,academic_year,semester) do nothing;

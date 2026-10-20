# Mandatory Functional Tests — TC01 to TC10

**Test environment:** Browser frontend connected to a configured Supabase project; run `docs/schema.sql`, create synthetic Auth users, assign scholar profiles, and optionally run `docs/seed_test_records.sql`.  
**Execution status:** Expected results documented. Run these tests in the browser/API and record actual results and screenshots before submission. Do not report Pass until verified.

| Test ID | Input / action | Expected result | Evidence to capture |
|---|---|---|---|
| TC01 | Open A01, GWA 1.75, 18 units, zero counts, submitted exactly 2026-10-30 17:00 Asia/Manila; evaluate | Compliant; deadline and GWA inclusive boundaries pass | A01 detail/evaluation result |
| TC02 | Evaluate A02, GWA 1.76 against Merit max 1.75 | With Deficiency; GWA reason shown | A02 compliance reasons |
| TC03 | Evaluate A03, Community GWA 2.25, 15 units, dropped 1 | Compliant because Community policy allows one dropped subject | A03 result |
| TC04 | Evaluate A04, 14 units and incomplete count 1 against Community policy | With Deficiency with both insufficient-units and incomplete-grade reasons | A04 reason list |
| TC05 | Evaluate A05, one failed subject and submitted 2026-10-30 17:01 | With Deficiency with failed-subject and late-submission reasons | A05 reason list |
| TC06 | Attempt to evaluate and approve A06 while evidence is Pending | Evaluation is blocked; approval is blocked until verified and evaluated | A06 error messages |
| TC07 | Submit duplicate scholar/year/semester; submit GWA 0.50 or negative/non-integer counts | Duplicate is rejected by the PostgreSQL unique constraint; invalid values are rejected by form validation and database constraints | Form validation/error message |
| TC08 | Sign in as A01 and request another scholar’s submission ID; attempt staff-only verification | RLS prevents reading another scholar’s records; staff-only RPC functions reject scholar role calls | Browser/API response evidence |
| TC09 | Staff returns a record with a reason; owning scholar corrects/resubmits; refresh | Correction persists; status is Pending verification; audit history remains | Return, correction, refresh, audit |
| TC10 | Staff approves compliant A01 and holds deficient A02; scholar attempts to change decision | Staff can approve compliant and hold deficient record; scholar cannot change decision | Decision screen and role-denial evidence |

## Expected seeded-record comparison

| ID | Policy | Input summary | Expected compliance | Expected reasons |
|---|---|---|---|---|
| A01 | Merit | GWA 1.75; 18 units; zero counts; exact deadline | Compliant | None |
| A02 | Merit | GWA 1.76; 18 units; zero counts | With Deficiency | GWA exceeds 1.75 |
| A03 | Community | GWA 2.25; 15 units; dropped 1 | Compliant | None |
| A04 | Community | GWA 2.25; 14 units; incomplete 1 | With Deficiency | Units below 15; incomplete exceeds 0 |
| A05 | Merit | GWA 1.50; 18 units; failed 1; one minute late | With Deficiency | Failed subjects exceed 0; after deadline |
| A06 | Community | GWA 2.00; 15 units; verification pending | Not Evaluated | Must verify before evaluation |

## Test execution record
Use this table during the actual test run. Fill in the actual result and evidence filename; mark Pass/Fail only after checking.

| Test ID | Actual result | Pass/Fail | Evidence reference |
|---|---|---|---|
| TC01 | Not yet executed | Pending | — |
| TC02 | Not yet executed | Pending | — |
| TC03 | Not yet executed | Pending | — |
| TC04 | Not yet executed | Pending | — |
| TC05 | Not yet executed | Pending | — |
| TC06 | Not yet executed | Pending | — |
| TC07 | Not yet executed | Pending | — |
| TC08 | Not yet executed | Pending | — |
| TC09 | Not yet executed | Pending | — |
| TC10 | Not yet executed | Pending | — |

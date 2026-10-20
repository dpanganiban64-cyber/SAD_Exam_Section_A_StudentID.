# Student Scholarship Monitoring and Academic Compliance System

This version uses **Supabase as the backend**. There is no custom Express/Node.js API server. The browser uses Supabase JavaScript SDK for Supabase Auth and database access; PostgreSQL tables, Row Level Security (RLS), and database RPC functions enforce important workflow rules.

## Stack
- HTML, CSS, JavaScript
- Supabase Auth
- Supabase PostgreSQL
- PostgreSQL Row Level Security (RLS) policies
- SQL RPC functions for evidence verification, compliance evaluation, renewal decisions, and correction resubmission

## Setup
1. Create a Supabase project.
2. Open **SQL Editor** and run `docs/schema.sql`.
3. Open `public/config.js` and replace `YOUR_PROJECT_ID` and `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with the project URL and publishable/anon key from **Project Settings → API**. Never place a `service_role` or secret key in browser code.
4. In Supabase **Authentication → Users**, create one staff account and six synthetic scholar accounts using email/password. Use synthetic records only.
5. The SQL trigger automatically creates `user_profile` rows for new Auth users. Promote the staff user in SQL Editor:
   ```sql
   update public.user_profile set role='staff', full_name='Scholarship Staff'
   where email='staff@example.com';
   ```
6. Sign in as staff. Use **Assign scholar** to link each scholar Auth account to a student ID, full name, email, and one of the two policy records.
7. Seed the six exam records using `docs/seed_test_records.sql` after replacing its email addresses with the emails used for your six Auth users. The seed script is optional for an empty demo; it inserts the required test submissions when the records have been assigned.
8. Run a static file server from this folder:
   ```bash
   npx serve public
   ```
   Open the local URL shown in the terminal. Or deploy the `public` folder to a static host.

## Roles and security
- Scholars can read their own scholar assignment and submissions only.
- Scholars can submit a semester record only for their own linked scholar ID. Duplicate scholar/year/semester combinations are rejected by a database unique constraint.
- Staff can read all submissions and use SQL RPC functions to verify evidence, evaluate compliance, and record renewal decisions.
- A renewal approval is rejected unless evidence is Verified and compliance is Compliant. A Held decision requires a note.
- Returned submissions can be corrected only by the owning scholar; resubmission resets verification to Pending and clears prior evaluation/decision state while preserving audit history.
- RLS is the enforcement layer; hiding buttons in the browser is not treated as security.

## Exam policy implemented
- Merit Scholar: max GWA 1.75, minimum 18 units, zero failed, zero incomplete, zero dropped.
- Community Scholar: max GWA 2.25, minimum 15 units, zero failed, zero incomplete, at most one dropped.
- Deadline: 2026-10-30 17:00 Asia/Manila. Exactly at the deadline is on time; later submissions are late.
- Missing/unverified evidence blocks evaluation. Failed academic conditions and late submissions produce `With Deficiency` with reasons. Evaluation flags do not automatically decide award status.

## Important configuration and limitations
- This is a student exam implementation, not a production scholarship platform.
- Staff account creation and password resets are managed by Supabase Auth Dashboard. The web app does not expose a privileged Auth Admin API.
- The app uses the browser's Supabase SDK. Do not expose secret/service-role keys.
- Before production use, review RLS and RPC security with your instructor, enable email confirmation as appropriate, add stronger operational monitoring, and test all TC01–TC10 in the actual Supabase project.
- Audit records are written by the SQL workflow functions for verification, evaluation, renewal, and correction. Scholar assignment is also logged by the client, so its audit insert should be considered a demo feature and can be hardened with a dedicated SQL function.

## Project files
- `public/`: browser UI and Supabase client setup
- `public/config.js`: public project URL/key configuration placeholders
- `docs/schema.sql`: schema, policies, RLS, policy seed data, and workflow RPC functions
- `docs/seed_test_records.sql`: six synthetic test submissions
- `docs/ANALYSIS_REPORT.md`: requirements and analysis
- `docs/TEST_PLAN.md`: TC01–TC10 test plan
- `docs/REFLECTION_AND_TRACEABILITY.md`: traceability and reflection

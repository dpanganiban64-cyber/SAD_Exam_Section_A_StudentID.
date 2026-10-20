# Short Reflection and Traceability

## Reflection
This project demonstrates how system analysis connects requirements to working functions. Separating verification, compliance, and renewal decision status avoids treating every warning as an automatic disqualification. Policy thresholds are stored in program records so Merit and Community scholars are checked against different rules. Server-side role checks protect scholar data more reliably than hiding interface buttons. The next improvements should be a production database with tested row-level security, stronger password hashing, secure deployment secrets, and actual evidence screenshots from the ten required tests.

## Traceability
| Requirement | Use case | Function/API | Test |
|---|---|---|---|
| FR02 — scholar record isolation | View own submissions | `GET /api/bootstrap`, `ownOrStaff` | TC08 |
| FR04/FR05 — validated grade submission | Submit Grades | `POST /api/submissions`, `validateSubmission` | TC07 |
| FR07 — verification and correction | Review evidence / Correct returned submission | `POST /api/submissions/:id/verify`, `PUT /api/submissions/:id` | TC09 |
| FR08 — policy compliance evaluation | Evaluate Compliance | `POST /api/submissions/:id/evaluate`, `evaluate()` | TC01–TC06 |
| FR09 — controlled renewal | Record renewal decision | `POST /api/submissions/:id/decision` | TC06, TC10 |
| FR10 — dashboard and audit | View dashboard/history | `GET /api/dashboard`, `GET /api/audit` | TC09, TC10 |

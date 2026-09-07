# System analysis

Reviewed 7 September 2026. Scope: the five HTML pages, shared JavaScript, database schema, three Edge Functions, deployment configuration, and setup documentation. This is a source review with isolated JavaScript checks; deployed database policies, secrets, payment transactions, and browser workflows were not tested. Findings about database access assume the supplied schema is deployed and the relevant API table grants exist.

## Overall assessment

The project implements a substantial payment and clearance prototype, but is not ready to handle real student records or financial transactions. The main blockers are authorization bypasses, browser-generated payment confirmation, and conflicting browser/database sources of truth. These affect the reliability of balances, approvals, receipts, and certificates together.

## Architecture and data flow

| Component | Responsibility |
| --- | --- |
| `index.html` | Landing page, login, student registration |
| `student-dashboard.html` | Assessments, installments, payment initiation and receipts, teacher requests, certificate access |
| `admin-dashboard.html` | Students, fees, vouchers, schedules, accounts, clearance, reports, Gemini interpretation |
| `clearance-dashboard.html` | Teacher and office approval queues |
| `certificate.html` | Eligibility calculation, printable certificate, PDF and QR generation |
| `js/app-config.js` | Supabase client, authentication helpers, whole-system data loading, payment and clearance mutations, local cache utilities |
| `supabase/schema.sql` | Relational records, reporting views, RLS policies, allocation and clearance triggers |
| Edge Functions | Staff account creation, PayMongo checkout creation, webhook processing |

The frontend is a static multipage application with substantial inline JavaScript. Browsers query Supabase directly, copy records into localStorage, calculate balances and eligibility, and initiate writes. Edge Functions use external payment APIs and privileged Supabase access. Database triggers initialize assessments/installments on registration, allocate paid transactions, and initialize/enforce parts of clearance ordering.

The relational separation of payments, allocations, assessments, assignments, and approvals is useful. Server-side clearance checks and a unique checkout-session column are good foundations. However, permissive policies and alternative frontend mutation paths undermine these safeguards.

## Critical findings

1. **Payment success is trusted from the browser URL.** `student-dashboard.html:2247` accepts success/paid parameters or a session identifier, takes an amount from browser storage or the URL, and even defaults to the outstanding balance or 1,000 when no amount exists. It then creates a paid transaction and receipt and calls `recordPayment()` at line 2309. No provider verification precedes this write. The payment INSERT policy at `supabase/schema.sql:695` permits a matching student ID or any existing caller profile, without restricting paid status. A navigation can therefore become a financial ledger entry. Make signed provider confirmation the only route for online settlement; authorize manual receipts separately on the server.

2. **Roles can be escalated through profile updates.** `supabase/schema.sql:625` lets a user update their own profile without protecting the role column. Privileged policies subsequently trust that role. `create-school-account/index.ts` also falls back to user metadata when no profile exists. Use server-controlled roles, restrict editable profile columns, remove metadata-based authorization, and enforce active status in privileged operations.

3. **Broad policies expose and allow modification of school records.** `supabase/schema.sql:581–606` permits authenticated users to manage all students; registration policies omit an explicit authenticated role and allow all rows. Fee, voucher, assessment, and installment management policies at lines 630–673 use `using (true)`. Policy names do not enforce the advertised admin restriction. Replace these with explicit actor/ownership checks and test direct API access for every role.

4. **Registration can rebind existing profiles by email.** The broadly accessible registration table invokes a security-definer trigger. At `supabase/schema.sql:993`, its profile upsert conflicts on email and replaces `auth_user_id` while preserving the existing role. Caller-supplied registration identity is therefore allowed to affect ownership of an existing privileged profile. Bind registration identity to verified authentication data, prohibit profile ownership reassignment, and require an authorized enrollment transition.

5. **Webhook authentication is optional.** `paymongo-webhook/index.ts` processes events with the service-role client when `PAYMONGO_WEBHOOK_SECRET_KEY` is missing. Setup instructions explicitly describe this secret as optional and deploy the endpoint without gateway JWT verification. Require the signature secret and reject requests when verification cannot run. Validate the exact accepted event type and reconcile a server-created checkout record before settlement.

## High-priority correctness and security findings

- **Office clearance updates crash.** `js/app-config.js:1143` reads `approval?.id`, but `approval` is undeclared. Optional chaining does not protect undeclared identifiers. Reproduced with a mock client returning valid student, request, and department records: `ReferenceError: approval is not defined`.
- **Approval authority is too broad.** `supabase/schema.sql:772` allows every listed staff role to manage every clearance approval, without assignment or department ownership. The dependency trigger runs only before UPDATE, allowing initially approved INSERTs to avoid its checks. Enforce actor scope and workflow constraints on every mutation, including deletion and initial insertion.
- **Certificate approval is self-service in the database.** The student policy at `supabase/schema.sql:793` permits all operations on owned certificate requests. `js/app-config.js:1199` inserts them as approved without checking prerequisites. The printable page computes eligibility in the browser. Its QR contains a claim of legitimacy and predictable identifiers, rather than a server-verifiable issuance record. Issue certificates through a server eligibility check and use an opaque verification identifier.
- **Admin saves rewrite unrelated tables.** The final `saveData()` at `admin-dashboard.html:2840` starts installment, voucher, and fee synchronization for every save. These functions delete records and reinsert replacements without a transaction. Failures can leave missing setup; references can prevent deletion; overlapping sessions can overwrite changes. Fee deduplication groups by education level without school-year scoping. Replace whole-table synchronization with targeted, awaited mutations.
- **Payment confirmation has two independent writers.** The return page writes a provider reference but no checkout session ID; the webhook deduplicates on checkout session ID. A real payment can therefore produce both a return-page transaction and a webhook transaction despite the unique checkout column. Persist one pending checkout and settle that same record idempotently.
- **Cached payments override authoritative status.** `js/app-config.js:901` merges matched database payments with local fields last. An isolated reproduction returned `paid` when the database supplied `failed`. Database records should win; local pending actions should be tracked separately.
- **Passwords and a service API credential are in browser-accessible data.** `registerStudent()` stores the registration password at `js/app-config.js:383`. Staff temporary passwords are also retained in browser state. `admin-dashboard.html:1199` embeds a base64-encoded Gemini credential; encoding does not keep it secret. Remove browser password persistence and move Gemini calls behind an authorized server function. If the embedded credential is valid, revoke/rotate it. Its validity was not tested.
- **Stored HTML injection paths exist.** Student names, account names, assignments, and other stored values are interpolated into `innerHTML`, for example `admin-dashboard.html:864` and `:1118`. Gemini output is also rendered as HTML. Use text nodes for data and an explicit sanitization policy where rich HTML is necessary. These paths were identified statically, not exercised against real accounts.
- **Gateway event RLS is missing.** The schema creates a policy for `payment_gateway_events` but omits that table from its RLS enable statements. The policy alone does not protect the table. Enable RLS and verify grants; raw event access should be restricted.

## Workflow and accounting consistency

- Registration is described as pending verification, yet the INSERT trigger immediately creates an active student and applies a default voucher. The frontend also directly upserts an active student. Clarify whether approval and voucher eligibility are required, and implement one server-owned transition.
- The database balance view uses persisted assessments; dashboards independently derive fees and allow browser-only custom fees, discounts, and overrides. `fetchDatabaseState()` does not load student assessments or actual student installments. A dashboard balance can therefore disagree with the balance used to authorize final clearance.
- `accounting_student_balances` filters assessment school year but sums all payments for the student. Payments have no school-year column. Year rollover can credit prior payments against a new assessment. Installment allocation likewise selects unpaid installments without an assessment/year boundary.
- Allocation reads installment balances without locking rows. Concurrent payments can calculate allocations from the same unpaid amount. Changes from paid to failed/cancelled, or changes to an already-paid amount, do not reverse/reconcile allocations. Add transactional locking and explicit correction/reversal behavior.
- Teacher requests have a local `requested` state absent from the database enum. Requesting one teacher creates a general clearance request whose trigger initializes all matching teacher rows as pending. Individual request intent is not persisted consistently across browsers.
- Teacher and office update helpers and certificate requests select clearance requests by student without school year. Multiple years can make `maybeSingle()` fail. Clearance requests also lack a student/year uniqueness constraint.
- `syncAccountToSupabase()` deletes and recreates teacher assignments but omits required `education_level` on inserted rows. Its Supabase errors are not inspected, so assignment changes can fail silently after deletion.
- Deleting a staff profile does not delete or disable the Auth user. Login infers roles from email and retains metadata fallback behavior; inactive status is read but not consistently enforced. Account removal and deactivation need an authorized server operation.
- Account creation falls back to browser sign-up and can report success despite missing database records. Remove success-shaped fallback responses for failed authoritative operations.

## Maintainability and operational gaps

- `app-config.js` is approximately 1,300 lines of business logic, rather than configuration alone. Balance, student matching, clearance, and cache merging logic are duplicated across pages. Extract shared domain functions and small page controllers after correcting authorization and financial integrity.
- `fetchDatabaseState()` issues 15 broad queries for every dashboard, with no role-specific scope or pagination. Errors are often treated as empty data. This both overfetches and makes partial failures look like a valid system snapshot.
- localStorage is purged whenever configuration appears ready, which does not prove network connectivity or a successful database load. Other paths preserve stale local state when database results are empty. Define an explicit cache lifecycle.
- School year and school structure defaults are hardcoded in multiple frontend, SQL, and function paths; some defaults contradict README rules. Use a single validated school-year/enrollment model.
- The certificate QR service receives student identity and certificate details in its URL. Generate QR assets locally or encode only a verification URL with minimal public information.
- No package manifest, automated test suite, or versioned database migration directory was found. Setup docs still call implemented payment functions placeholders and disagree about deployment/security setup. Add reproducible checks and migrations before changing a live database.

## Verification performed

- Parsed all nonempty inline scripts in the five HTML pages with Node `vm.Script`: all 12 scripts parsed successfully.
- Loaded `js/app-config.js` into an isolated VM with mock browser storage and a mock Supabase query client.
- Reproduced the office-clearance ReferenceError without network or database writes.
- Reproduced local paid status overriding a database failed status during payment merging.
- Inspected policies, triggers, financial views, mutation paths, and deployment instructions. No live exploit, payment, account creation, or database migration was performed. PostgreSQL and Deno executables were unavailable, so SQL and Edge Functions were not executed.

## Recommended implementation order

1. Close profile/registration privilege escalation and replace permissive RLS. Verify denied access for anonymous users, unrelated students, teachers outside their assignments, and inactive staff.
2. Remove browser settlement and require verified, idempotent checkout/webhook processing. Reconcile existing payments for duplicates and unsupported paid entries before trusting totals.
3. Repair clearance updates, enforce assignment/department scope and all workflow transitions, and implement server-authorized certificate issuance.
4. Replace destructive synchronization, persist authoritative assessments/installments, and add school-year boundaries plus transactional allocation/correction handling.
5. Remove stored credentials and HTML injection paths; then modularize duplicated logic, introduce migrations, and add integration tests covering the repaired boundaries.

Recommended acceptance scenarios include duplicate webhook delivery, webhook database failure and retry, forged return parameters, two simultaneous partial payments, payment reversal, year rollover, attempted role changes by a student, cross-student access, unauthorized office approval, and certificate issuance with unpaid or incomplete requirements.

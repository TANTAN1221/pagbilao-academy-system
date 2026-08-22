# Pagbilao Academy Payment and Clearance System

This version has been cleaned of sample students, sample staff, sample payments, and sample certificate requests.

Start with [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md), then run `supabase/schema.sql`.

Admin-created accounts will only appear in **Supabase Authentication → Users** after `create-school-account` is deployed and the admin is logged in as `super_admin`, `accounting_admin`, or `registrar`.

# Pagbilao Academy Inc. Student Payment and Clearance Monitoring System

This project is a Supabase-ready prototype for a web-based student payment, fee assessment, voucher, clearance, analytics, and clearance certificate system.

## Main files

- `index.html` - public landing page with student registration.
- `student-dashboard.html` - student/parent dashboard based on the blue/white UI theme.
- `admin-dashboard.html` - Accounting/Admin dashboard.
- `clearance-dashboard.html` - Clearance Head / teacher approval dashboard.
- `certificate.html` - printable Certificate of Clearance template with the Pagbilao Academy Inc. logo.
- `assets/logo.png` - logo used across the system and certificate.
- `js/app-config.js` - Supabase connection placeholders.
- `supabase/schema.sql` - database schema for Supabase.
- `supabase/functions/create-paymongo-checkout/index.ts` - PayMongo checkout placeholder.
- `supabase/functions/paymongo-webhook/index.ts` - PayMongo webhook placeholder.
- `supabase/functions/create-school-account/index.ts` - secure admin account creation function.

## Student registration rules

JHS:
- Grade 7, Grade 8, Grade 9, Grade 10
- Each grade has Section A, Section B, and Section C
- Strand is automatically N/A

SHS:
- Grade 11 and Grade 12
- Section is automatically N/A
- Strand is HUMSS only

## Clearance logic added

Teacher Clearance Heads can now have multiple assignments. Example:

- Grade 7 / Section A / English
- Grade 8 / Section B / English
- Grade 10 / Section C / Research

The system should generate teacher approval requirements based on the student's grade and section.

Approval order:

1. Subject Teachers
2. Guidance, Prefect of Discipline, and Librarian
3. Principal
4. Accounting Office and Registrar

The Principal should be locked until teachers and the required offices approve. Accounting/Registrar should be locked until the Principal approves and the student's balance is zero.

## Tuition, fees, and vouchers

The updated prototype supports separate fee setups for:

- JHS fees
- SHS fees

Voucher discounts:

- JHS: ESC Voucher
- SHS: SHS Voucher

Best practice: compute the student's net assessment this way:

```text
Gross Fees - Voucher Discount = Net Amount Due
```

Partial payments should be applied to the net amount due, not the gross fee amount.

## Best due date approach for partial payments

Use installment-based due dates instead of one due date per fee.

Recommended flow:

1. Create an installment template for the school year.
2. Example: 25% Enrollment, 25% 2nd Quarter, 25% 3rd Quarter, 25% 4th Quarter.
3. Generate student installments based on each student's net assessment.
4. When a partial payment is made, apply it to the oldest unpaid installment first.
5. Mark each installment as Paid, Partial, Unpaid, or Overdue.

This is better because students can pay any amount while the Accounting Office can still track which due schedule is unpaid.

## Analytics and reports added

The Accounting/Admin dashboard now includes analytics for:

- Total assessed fees
- Total collected payments
- Outstanding balances
- Voucher discount impact
- Collection by JHS and SHS
- Overdue / at-risk accounts
- Exportable collection report CSV
- Exportable outstanding balance report CSV

Supabase views included in `schema.sql`:

- `accounting_student_balances`
- `accounting_collection_summary`
- `overdue_installments_report`

## Clearance certificate

After all clearance approvals are completed, the student can request a certificate. The included `certificate.html` page uses the uploaded logo and the school name:

```text
Pagbilao Academy Inc.
```

Students can click **Save as PDF / Print** to save the certificate as a PDF from the browser.

## How to run locally

Open the folder in VS Code, then use Live Server or any static server.

Example:

```bash
python -m http.server 5500
```

Then open:

```text
http://localhost:5500/index.html
```

## Supabase setup

1. Create a Supabase project.
2. Go to SQL Editor.
3. Run `supabase/schema.sql`.
4. Open `js/app-config.js`.
5. Replace:

```js
SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
FUNCTIONS_BASE_URL: "https://YOUR_PROJECT_REF.functions.supabase.co"
```

6. Deploy Edge Functions:

```bash
supabase functions deploy create-paymongo-checkout
supabase functions deploy paymongo-webhook
supabase functions deploy create-school-account
```

7. Set secrets:

```bash
supabase secrets set PAYMONGO_SECRET_KEY=sk_test_your_key
supabase secrets set PAYMONGO_SUCCESS_URL=https://yourdomain.com/student-dashboard.html?payment=success
supabase secrets set PAYMONGO_FAILED_URL=https://yourdomain.com/student-dashboard.html?payment=failed
```

## PayMongo note

The PayMongo connection is prepared for later use. The student dashboard Pay Now button will show a setup message until Supabase and PayMongo secrets are configured.

Never place the PayMongo secret key inside HTML or frontend JavaScript.

## First admin setup

Create the first admin manually in Supabase Authentication, then insert a matching row into `profiles` using role:

```text
super_admin
```

After that, use the Admin dashboard / Edge Function to create other accounts such as teachers, Guidance, Prefect, Librarian, Principal, Accounting, and Registrar.


## Latest UI Fixes
- Logout buttons were added to the Admin/Accounting, Student, and Clearance Head dashboards.
- Certificate preview now receives a `from` parameter, so the Back button returns to the correct dashboard instead of always going to the student dashboard.


## Latest clearance update

- Student Dashboard now shows every assigned subject teacher that matches the logged-in student's grade/section.
- JHS matching uses `grade + section`.
- SHS matching uses `grade + strand` with section set to `N/A`.
- Students can request approval from each teacher individually or use **Request All Teachers**.
- Clearance Head Dashboard only allows teacher approval after the student has submitted a request.
- `supabase/schema.sql` includes the `student_assigned_teacher_clearance_heads` view and `request_teacher_clearance_approvals()` function for the live Supabase version.

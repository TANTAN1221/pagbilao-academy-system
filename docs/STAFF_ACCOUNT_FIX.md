# Staff account persistence fix

## Cause and changes

Account creation used two separate writers. The Edge Function created the correct profile and assignments, but the admin page ignored the returned profile ID. Its follow-up client sync deleted teacher assignments and reinserted them without the required education level. Database errors were ignored. When the Edge Function failed, a browser sign-up fallback could create only an Auth user and report success anyway. Clearing browser data exposed the missing links.

The updated account flow:

- Saves profile, staff, department, and teacher links in one database transaction.
- Uses the permanent profile ID in all three dashboards and gives saved assignments priority over cached values.
- Retains IDs of unchanged assignments, preserving approval references. Removal of an assignment with clearance records is rejected with an explanation.
- Infers JHS/SHS education level from grade and matches named SHS sections as well as the form's all-section/all-strand selections.
- Reports failure instead of falling back to browser sign-up. The administrator's Auth session is not replaced.
- Saves account changes without calling the general fee/voucher/installment synchronization routines.
- Can reconnect an Auth-only account by its existing email without resetting its password.

## Deploy in this order

1. In the project's Supabase SQL Editor, run only `supabase/migrations/202609070001_staff_account_persistence.sql`. It adds a service-role-only persistence helper and updates the assignment matching view. It does not bulk rewrite existing account records. New installations also receive this helper through `supabase/schema.sql`.
2. Deploy the updated function:

   ```sh
   supabase functions deploy create-school-account --project-ref wsbmowporxjagetqxtec --no-verify-jwt
   ```

   The function validates the bearer token and active admin profile internally. Apply the migration first; the new function depends on it.
3. Publish the updated `admin-dashboard.html`, `student-dashboard.html`, `clearance-dashboard.html`, and `js/app-config.js` together, then reload the browser.

The changes were prepared locally. No live database migration, function deployment, or production account modification was performed.

## Repair affected accounts

- If the account appears under Admin → Accounts, edit it and re-enter the intended teacher assignments, then save. Existing sign-in credentials remain unchanged; leave Temporary Password blank. Keep the existing sign-in email during this repair.
- If it exists only in Supabase Authentication and is absent from Accounts, use Create Account with the same email, intended role, name, and assignments. The function finds the existing Auth identity and creates the missing links. The success message explicitly says the existing password is unchanged.
- If Create Account reports that the account already exists, reload Accounts and edit it. This prevents accidentally overwriting a healthy account through duplicate creation.
- Assignments that were already deleted cannot be reconstructed from the Auth account alone; the administrator must re-enter the intended grade, section, strand, and subject.
- If removal is rejected because clearance records reference an assignment, keep it. This fix deliberately preserves those records; changing an assignment with existing approvals requires a separate reviewed correction.

## Validation

Run locally with Node 22.20 or later:

```sh
node --test tests/staff-account-persistence.test.cjs
```

The suite checks JavaScript syntax, failed and partial saves, fresh-browser account hydration, authoritative account merging on all dashboards, status-only updates, Auth-only recovery, duplicate creation, authorization, and database/transport error cleanup. Supabase is mocked; these are not live database or browser end-to-end tests.

After deployment, verify a teacher with two assignments and an office head: create each, log out, log back in, check the same account/assignment records, and sign in as the staff member in a separate browser session. Verify a named SHS section and confirm an unrelated section is excluded. Edit only the teacher name and confirm existing assignment IDs and clearance approval references stay unchanged.

The database regression script `tests/staff-account-persistence.sql` can be run against a disposable Supabase test project after applying its schema and this migration. It rolls its fixtures back. It was not executed locally because PostgreSQL is unavailable.

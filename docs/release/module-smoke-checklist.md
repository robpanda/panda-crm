# Module Smoke Checklist

Use this checklist after every deploy. Run only the sections for the module you changed, plus the shared checks.

## Shared Checks

- [ ] Frontend loads without console runtime errors.
- [ ] Global nav opens normally.
- [ ] Recent Leads dropdown shows the last 10 visited leads.
- [ ] Recent Jobs dropdown shows the last 10 visited jobs.
- [ ] Global search opens and returns results within normal response time.
- [ ] Notifications bell loads without 401/500/503 errors.
- [ ] `index.html` references the expected deployed asset hashes.

## Leads

- [ ] Lead list count tabs load without 500 errors.
- [ ] New Lead wizard shows the expected 3-step flow only.
- [ ] Sales-role default lead source is `Self-Gen`.
- [ ] SMS / Email / Call actions appear on the floating wizard nav.
- [ ] Appointment selection accepts the chosen time and does not fall back to "Requested time is unavailable" for valid slots.
- [ ] Saved lead shows date formatting in the expected format for that view.
- [ ] Saved lead shows `Lead Set By`, `Manager`, and `Owner` correctly.
- [ ] Lead status dropdown includes `Confirmed`.
- [ ] Lead source dropdown matches the wizard options.
- [ ] Lead internal comments load.
- [ ] Mentions create bell/email/SMS and attribute the post to the logged-in user.
- [ ] Mention deep links return to the correct lead and comment context.
- [ ] Convert to Job succeeds and opens the Result Appointment flow instead of the deprecated convert step.
- [ ] SalesRabbit test submission lands in the lead list.

## Jobs

- [ ] Jobs list loads without runtime errors.
- [ ] Jobs list account column shows the correct account name.
- [ ] Job name format is correct after convert and after job-number assignment.
- [ ] Unassigned work type remains blank rather than showing an unintended default.
- [ ] Job header layout and finance cards match the intended current UX.
- [ ] Result Appointment button exists and opens the current wizard.
- [ ] Result Appointment flow supports back navigation and path changes without stale state.
- [ ] Customer Comms shows the correct tabs only; deprecated extra tabs are absent.
- [ ] SMS / Email / Call tools are visible and usable in Jobs.
- [ ] Internal comments / notes / mentions match the current lead-side behavior.
- [ ] Job Team shows owner, transfer, PM, and crew controls when expected.
- [ ] Contact name/pencil opens the editable contact modal.
- [ ] Claim information saves successfully, including adjuster fields.
- [ ] Schedule / appointments list reflects newly created appointments.

## Invoices / Financial

- [ ] Create invoice works for retail and insurance paths.
- [ ] Null `insuranceCarrier` and `claimNumber` do not cause validation errors when not required.
- [ ] Invoice opens without frontend runtime errors.
- [ ] Invoice can be edited more than once.
- [ ] Discounts can be applied and persist.
- [ ] Send / resend opens the current recipient modal.
- [ ] Homeowner email includes the customer portal path when expected.
- [ ] Downloaded PDF reflects the latest saved changes.
- [ ] Payment modal shows only the intended card-entry UX in Jobs.

## GAF / Integrations / PhotoCam

- [ ] GAF order can move from ordered/processing to delivered.
- [ ] Delivered GAF report shows measurement data.
- [ ] Delivered GAF report shows a PDF link.
- [ ] GAF PDF is saved into Job Documents -> Files.
- [ ] PhotoCam tab loads without `P2022` or runtime errors.
- [ ] Bulk actions open and respond as expected.
- [ ] Gallery/checklist/report actions resolve to live routes.
- [ ] Mobile photo controls are not hidden behind navigation.

## Documents

- [ ] Upload opens the file-type selection flow.
- [ ] Uploaded files show preview thumbnails when expected.
- [ ] Preview opens the current document viewer.
- [ ] Delete button is visible and functional.
- [ ] Change Order / Send Contract / Upload controls appear in the intended tabs.

## Support

- [ ] My Support shows only the logged-in user's tickets.
- [ ] Admin Support shows all tickets for authorized admins.
- [ ] Ticket status can be changed from the admin detail page.
- [ ] Ticket reply attachments upload and persist.

## Settings / Users / Admin

- [ ] Settings save persists after refresh.
- [ ] Current user profile data loads correctly from Cognito + CRM.
- [ ] Admin Users defaults to Active.
- [ ] Merge function exists and performs the expected consolidation flow.
- [ ] Email normalization rules are preserved for pandaexteriors users.
- [ ] Google Calendar admin page loads the user list and connection state.

## Release Sign-Off

- [ ] Captured baseline file path recorded
- [ ] Frontend backup directory recorded
- [ ] Rollback file path recorded
- [ ] Exact services deployed recorded
- [ ] Smoke checks passed for touched modules
- [ ] No unrelated module regressions observed

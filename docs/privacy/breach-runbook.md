# Personal data breach runbook

**Status:** Draft for legal review. **Law:** NDPA 2023 s. 40. Notify the Nigeria Data Protection Commission (NDPC) within **72 hours** of becoming aware of a breach likely to risk people's rights and freedoms. Tell affected people **without delay** when the risk is high.

A breach is any security incident that leads to personal data being lost, destroyed, changed, disclosed or accessed without permission. Examples: a hub seeing another hub's learners, an exported spreadsheet sent to the wrong person, a stolen staff laptop with an export on it, or a leaked database credential.

## Who does what

| Role | Person | Responsibilities |
| --- | --- | --- |
| Incident lead | Talentral technical lead **[name]** | Contain, investigate, keep the log |
| Data protection lead | **[name]**, privacy@talentral.ng | Assess risk, notify the NDPC and hubs, decide on notifying people |
| Hub contact | Owner of each affected hub | Hub-side facts; the hub is the controller for its learners |
| Communications | **[name]** | Messages to people, partners and funders |

## Hour 0 to 4: contain

1. Open an incident log (time, who, what, actions). Note the moment Talentral became aware: the 72 hours start here.
2. Stop the leak:
   - **Leaked credentials:** rotate them (database, `CRON_SECRET`, `RESEND_API_KEY`, `TERMII_API_KEY`, `ANTHROPIC_API_KEY`, S3 keys) in Vercel and the provider consoles, then redeploy.
   - **Compromised accounts:** revoke their sessions by deleting their rows in `sessions`, and require two-step sign-in for the hub.
   - **Misdirected exports:** ask the recipient to delete them and confirm in writing.
   - **Shortlist links:** revoke them from the talent console.
3. Preserve evidence: take an audit log export (`/platform/audit`), copy the Vercel and Supabase logs, and snapshot the database.

## Hour 4 to 24: assess

4. Work out what data, whose, how many people and which hubs. The audit log shows exports, downloads, support access and status changes, with actor and time.
5. Rate the risk to people: identity or contact data only, or also sensitive data (disability), learning records, or data about children.
6. Decide whether it must be reported. Anything more than a trivial, fully contained incident with no realistic risk: **report**.

## Hour 24 to 72: notify

7. **NDPC:** file through the Commission's breach portal or email **[confirm current channel]**. Include:
   - what happened and when;
   - the categories and approximate numbers of people and records;
   - likely consequences;
   - measures taken and planned; and
   - the contact person.

   If facts are still missing, report what is known and follow up.
8. **Affected hubs (controllers):** tell each owner with the same facts and what their learners will be told.
9. **Affected people**, when the risk is high: email and SMS in English and Hausa. Say:
   - what happened, plainly;
   - what data was involved;
   - what we have done; and
   - what they can do, for example watch for phishing, or ignore messages asking for sign-in codes.

   Include a contact address.

## After

10. Write a post-incident review within 14 days: cause, timeline, what worked, and fixes with owners and dates.
11. Update the DPIA if risks changed, and add a regression test when the cause was a code defect.
12. Keep the incident log and the notifications for at least 5 years **[confirm]**.

## Contacts

| Who | How |
| --- | --- |
| NDPC | **[confirm]** |
| Supabase support | Dashboard, then Support |
| Vercel support | Dashboard, then Help |
| Resend, Termii, Anthropic | Provider consoles |

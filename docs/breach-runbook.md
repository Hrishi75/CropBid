# Personal data breach: what to do

This is the procedure for the moment someone at CropBid suspects that personal data has been exposed, lost, changed or destroyed without authority. It follows the Digital Personal Data Protection Act 2023 and Rule 7 of the DPDP Rules 2025.

**Have a lawyer check this page against the Rules before May 2027**, when these obligations come into force, and again whenever the Board publishes its own guidance on how to report.

## The clock

| When | What | Who to |
|---|---|---|
| As soon as you suspect it | Log it at **/admin/incidents** | The register |
| Without delay | First notice | The Data Protection Board **and** every affected person |
| Within **72 hours** of becoming aware | Detailed report | The Data Protection Board |

The 72 hours start when CropBid **became aware**, not when the breach happened and not when it was confirmed. The register records that time and counts down from it.

## 1. Log it (minutes)

Open **Admin → Incidents → Log an incident**. Write what you know, even if it is a guess. Tick "Personal data may have been exposed" unless you are sure it was not. An incident logged and later found harmless costs nothing. A breach found and not logged is the failure the Rules penalise.

A **security alert** (the bell, or the security inbox, `SECURITY_ALERT_EMAIL`) is a reason to look, not proof of a breach. Log it if you cannot rule a breach out within the hour.

## 2. Contain it (first hours)

Stop it getting worse before working out why. Typical steps for this platform:

- **A stolen admin session** (the alert for many payout reads or many password resets): suspend the account from Admin → Users, or reset its password from the database if it is the only admin. Then change `JWT_SECRET` and `JWT_REFRESH_SECRET` on the server and restart, which signs **everyone** out.
- **Leaked database credentials**: rotate the password in Neon, update `DATABASE_URL` on the server, restart.
- **Leaked payout encryption key** (`PAYOUT_ENCRYPTION_KEY`): treat every seller's bank details as exposed. Rotating the key is not built yet: decrypting with the old key and re-encrypting with a new one is a script someone has to write.
- **Credential stuffing** (the alert for many failed sign-ins): check whether any account signed in successfully from the same pattern. The per-account rate limit slows it down but does not stop it.
- **A leaked third-party key** (Razorpay, Cloudinary, Sarvam, Gemini, WhatsApp): revoke it in that provider's dashboard and set a new one.

Write each step in "What we have done", with the time.

## 3. Tell the Board and the people affected (without delay)

If personal data may have been exposed, both are owed a first notice **without delay**. Do not wait to know everything. A notice that says "we are still investigating" is better than a late complete one.

**To each affected person**, in plain language, through their account notifications and by email or WhatsApp where we hold one:

- what happened, how much of their data, when and where
- what it is likely to mean for them
- what we have done and are doing about it
- what they can do to protect themselves (change their password, watch for calls asking for an OTP, check their bank account)
- who to contact: `info@cropbid.in`

**To the Data Protection Board**: a description of the breach, its nature, extent, timing and location, and its likely impact. Use the channel the Board specifies on its website.

Record both times in the register.

## 4. The detailed report to the Board (within 72 hours)

Send the Board an update with:

- the facts as now known, and the events and circumstances behind the breach
- what has been done to stop it and limit the harm
- what is known about who was responsible
- what has changed to stop it happening again
- a report of the notices sent to the people affected

Record the time sent in the register. The register will not let an incident that affected personal data be **closed** until this report and the notice to users are both recorded.

## 5. Afterwards

- Mark it **Contained** once it has stopped and **Closed** once everything owed has been done.
- Change the code or process that let it happen, and link the PR in "What we have done".
- Keep the logs. The Rules expect logs of personal data processing to be kept for at least a year, so do not delete server or audit logs to tidy up after an incident.

## What the platform does for you

- **Alerts** (`server/src/services/securityAlert.service.ts`): a burst of failed sign-ins across the platform, one admin opening many sellers' bank details in an hour, or one admin resetting many passwords in an hour. They go to every admin's bell and to the security inbox, and are written to the audit log.
- **The register** (`/admin/incidents`): the clock, the deadline, and the rule that a reportable breach cannot be closed unreported.
- **The audit log** (`AuditLog` table): who did what to which record, with IP address and user agent. This is where the timeline of an incident usually comes from.
- **Error monitoring** (Sentry, if `SENTRY_DSN` is set): crashes and unusual errors on the server and the website.

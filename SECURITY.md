# IGU Security Baseline

This document outlines the security rules enforced across the IGU application.

## Core Security Rules

### 1. No Decrypted PHI Views - PERMANENTLY NEUTRALIZED

**CRITICAL**: The following views have ALL access REVOKED from `anon` and `authenticated` roles:
- `form_submissions_decrypted` - Contains decrypted PAR-Q and personal data
- `profiles` - Combined view joining profiles_public + profiles_private
- `coaches_full` - Combined view joining coaches_public + coaches_private

**These views can NEVER be queried directly. Access is ONLY via SECURITY DEFINER RPCs:**

| View | Allowed Access | RPC Function |
|------|----------------|--------------|
| form_submissions_decrypted | Admin or Owner | `get_form_submission_phi(submission_id)` |
| form_submissions_decrypted | Self-service | `get_my_latest_form_submission_phi()` |
| profiles | Admin only | `admin_get_profile_private(user_id)` |
| profiles | Self-service | `get_my_profile_private()` |
| coaches_full | Admin only | `admin_get_coaches_full()` |

**Coach Medical Access**: Coaches do NOT get PHI. They use `get_client_medical_flags(client_id)` which returns ONLY:
- `needs_medical_review` (boolean)
- `medical_cleared` (boolean)
- `has_injuries_noted` (boolean)
- `admin_summary` (text - admin-curated, no raw PHI)

### 2. No Public Pricing/Service Tables

All pricing, service, and internal configuration tables require authentication:
- `services` - Authenticated users only, active services only
- `service_pricing` - Authenticated users only
- `service_billing_components` - Authenticated users only
- `team_plan_settings` - Authenticated users only
- `addon_pricing` - Authenticated users only
- `addon_catalog` - Authenticated users only

**Anonymous users cannot see pricing or service details.**

### 3. No USING(true) Policies

RLS policies must NEVER use `USING (true)` or `WITH CHECK (true)`.

**Acceptable patterns (use RLS helper functions):**
- `USING (public.is_admin(auth.uid()))` - Admin access
- `USING (public.is_coach(auth.uid()))` - Coach role check
- `USING (public.is_primary_coach_for_user(auth.uid(), user_id))` - Coach assignment
- `USING (auth.uid() = user_id)` - Owner access
- `USING (auth.uid() IS NOT NULL)` - Authenticated only (read-only tables)

### 4. RLS Policy Templates

All tables use standardized policy templates:

| Template | Pattern | Use Case |
|----------|---------|----------|
| `tpl1_self` | `auth.uid() = user_id` | User's own data |
| `tpl2_admin` | `is_admin(auth.uid())` | Admin full access |
| `tpl3_coach` | `is_coach() AND is_primary_coach_for_user()` | Assigned coach read |
| `tpl4_authenticated` | `auth.uid() IS NOT NULL` | Authenticated read-only |

### 5. Zero Anonymous Access

The `anon` role has ZERO access to:
- All tables in `public` schema
- All views in `public` schema
- All functions in `public` schema (except edge function invocations via service_role)

### 6. PHI Encryption Rules

All PHI fields in `form_submissions` are:
1. Encrypted on INSERT via `enforce_phi_encryption_trigger`
2. Nullified after encryption via `enforce_phi_nullification_trigger`
3. Only decryptable via SECURITY DEFINER functions

Protected fields:
- `email` → `email_encrypted`
- `phone_number` → `phone_number_encrypted`
- `date_of_birth` → `date_of_birth_encrypted`
- All `parq_*` boolean fields → `parq_*_encrypted`
- `parq_injuries_conditions` → `parq_injuries_conditions_encrypted`
- `parq_additional_details` → `parq_additional_details_encrypted`

### 7. Role-Based Access Control

Roles are stored in `user_roles` table (never on profile):
- `admin` - Full system access, PHI access via RPCs
- `coach` - Access to assigned clients only, NO direct PHI access
- `member` - Access to own data only

**RLS Helper Functions:**
- `is_admin(uuid)` - Check admin role
- `is_coach(uuid)` - Check coach role
- `is_primary_coach_for_user(coach_uid, client_uid)` - Check assignment
- `is_admin_or_coach_for_user(actor_uid, client_uid)` - Combined check

### 8. Coach Data Isolation

**coaches_directory view** (authenticated read-only):
- ✅ user_id, first_name, last_name, nickname, display_name
- ✅ bio, short_bio, location, profile_picture_url
- ✅ qualifications, specializations, specialties, status
- ❌ email, phone, whatsapp_number, date_of_birth, gender (EXCLUDED)
- ❌ instagram_url, tiktok_url, youtube_url (EXCLUDED - social URLs removed)

**coaches_client_safe view** (authenticated read-only, minimal fields):
- ✅ id, user_id, first_name, last_name
- ✅ profile_picture_url, short_bio, specializations, status
- ❌ All contact info, social URLs, and PII excluded
- Use for: Coach selection UI, care team display, client-facing coach info

**coaches_private table** (self + admin only):
- Contains: email, phone, whatsapp_number, date_of_birth, gender
- RLS: Only own record or admin

**coaches_public table** (authenticated read, self-update):
- Contains: public profile + social media links
- RLS: Read by authenticated, update by self
- NOTE: Client-facing UI should use `coaches_client_safe` instead

### 9. Client Medical Data Isolation

Coaches can ONLY access:
- `profiles_public` - For their assigned clients
- `form_submissions_safe` - Non-PHI status flags only
- `get_client_medical_flags(client_id)` - Returns only flags, not raw PHI

Coaches are EXPLICITLY DENIED:
- `profiles_private` - Contains email, phone, DOB
- `form_submissions` - Contains encrypted PHI
- `form_submissions_decrypted` - REVOKED from authenticated role
- `coaches_private` (except their own record)

### 10. Audit Logging

All PHI access is logged to:
- `phi_access_audit_log` - Detailed access log with actor, target, fields
- `phi_audit_log` - System-level encryption events

All admin actions logged to:
- `admin_audit_log` - Configuration changes, billing overrides
- `approval_audit_log` - Status transitions, approvals/rejections

## Security Verification

### Automated Checks

Run from Admin → System Health:
1. **Security Regression Checks** - Verifies RLS enforcement
2. **Security Smoke Tests** - Verifies anonymous access is blocked
3. **PHI Compliance Scanner** - Verifies no plaintext PHI exists
4. **Legacy Table Monitor** - Verifies profiles_legacy/coaches lockdown
5. **PHI View Isolation** - `verify_phi_view_isolation()` function

### Manual Verification

1. Check RLS policies: `SELECT * FROM public.get_rls_audit_report();`
2. Check legacy table security: `SELECT * FROM public.check_legacy_table_security();`
3. Scan PHI violations: `SELECT * FROM public.scan_phi_plaintext_violations();`
4. Verify PHI views blocked: `SELECT * FROM public.verify_phi_view_isolation();`

## Incident Response

If a security violation is detected:
1. Check `phi_access_audit_log` for unauthorized access attempts
2. Check `phi_audit_log` for encryption failures
3. Run `scan_phi_plaintext_violations()` to identify exposed data
4. Review edge function logs for unauthorized API calls

## Contact

Security issues should be reported immediately to the admin team.

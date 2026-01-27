# IGU Launch Checklist

This checklist is written for the owner to manually verify the app works before going live.

---

## ✅ Core Flows to Test

### 1. New Client Signup — 1:1 Online (Full Flow)

- [ ] Go to `/services` and select **1:1 Online**
- [ ] Click "Get Started" → redirected to `/auth` (or `/onboarding` if logged in)
- [ ] Create a new account or log in
- [ ] Complete onboarding:
  - [ ] Step 1 (Service): Personal details, coach selection
  - [ ] Step 2 (Service Details): Training preferences, nutrition approach
  - [ ] Step 3 (Health): PAR-Q questions
  - [ ] Step 4 (Legal): Accept all checkboxes
- [ ] After submit → profile status becomes `pending_coach_approval`
- [ ] Coach receives pending client notification
- [ ] Coach approves → profile status becomes `pending_payment`
- [ ] Client sees payment page at `/dashboard`
- [ ] ✅ Flow complete when payment page loads

### 2. New Client Signup — Fe Squad / Team Plan

- [ ] Go to `/services` and select **Fe Squad** or **Bunz of Steel**
- [ ] Create a new account or log in
- [ ] Complete onboarding (shorter form for team plans)
- [ ] After submit → profile status becomes `pending_payment` (no coach approval step)
- [ ] Client sees payment page at `/dashboard`
- [ ] ✅ Flow complete when payment page loads

### 3. Coach Approval Flow

- [ ] Log in as a coach
- [ ] Go to **My Clients** → **Pending Approvals** tab
- [ ] See pending client with status `pending_coach_approval`
- [ ] Click **Approve** → client moves to `pending_payment`
- [ ] Optionally test **Reject** flow

### 4. Payment Success

#### Without Discount:
- [ ] Use Tap sandbox to complete payment
- [ ] Profile status → `active`
- [ ] Subscription status → `active`
- [ ] Client can access full dashboard, nutrition, workout library

#### With Discount:
- [ ] Apply a discount code during payment
- [ ] Verify discounted amount is shown
- [ ] Complete payment
- [ ] Check discount is recorded in `discount_redemptions`

### 5. Payment Cancel / Fail → Retry

- [ ] Trigger a payment failure (use Tap sandbox test card for failure)
- [ ] Verify `payment_failed_at` is set on subscription
- [ ] Client sees "Retry Payment" option
- [ ] Retry payment successfully

### 6. Cancellation at End of Period

- [ ] As active client, go to subscription management
- [ ] Click "Cancel at end of period"
- [ ] Verify `cancel_at_period_end = true`
- [ ] After billing date passes, subscription status → `cancelled`

### 7. Access Control (Status-Based)

| Status | Dashboard | Nutrition | Workout Library | Payment Page |
|--------|-----------|-----------|-----------------|--------------|
| `pending` | ✅ (complete onboarding) | ❌ | ❌ | ❌ |
| `needs_medical_review` | ✅ (waiting message) | ❌ | ❌ | ❌ |
| `pending_coach_approval` | ✅ (waiting message) | ❌ | ❌ | ❌ |
| `pending_payment` | ✅ (payment page) | ❌ | ❌ | ✅ |
| `active` | ✅ (full dashboard) | ✅ | ✅ | ❌ |
| `cancelled` / `inactive` | ✅ (rejoin prompt) | ❌ | ❌ | ❌ |

---

## ✅ Roles to Test

### Pure Client Account
- [ ] Can complete onboarding
- [ ] Can see client dashboard
- [ ] Cannot access coach or admin features

### Coach-Only Account
- [ ] Can see coach dashboard
- [ ] Can approve/reject pending clients
- [ ] Can view client nutrition phases
- [ ] Cannot access admin features

### Admin + Coach Account
- [ ] Can switch between Admin and Coach views
- [ ] Can access all admin sections (clients, coaches, discounts, etc.)
- [ ] Can perform coach functions

---

## ✅ Devices to Test

### Mobile
- [ ] **iOS Safari**: Full flow from signup to payment
- [ ] **iOS Chrome**: Full flow from signup to payment
- [ ] **Android Chrome**: Full flow from signup to payment

### Desktop
- [ ] **Chrome**: Full flow, all admin features
- [ ] **Safari**: Basic flow verification
- [ ] **Firefox**: Basic flow verification

---

## ✅ Visual Checks

### Mobile Navigation
- [ ] Hamburger menu opens correctly
- [ ] Menu overlays page content (no layout break)
- [ ] All menu items are clickable
- [ ] Menu closes when selecting an item

### Onboarding Step Indicators
- [ ] Steps show correctly on mobile (horizontal scroll if needed)
- [ ] Current step is highlighted
- [ ] Completed steps show checkmark
- [ ] Steps are clickable to navigate back

### Calorie Calculator
- [ ] Select "Maintenance" → shows maintenance calories
- [ ] Select "Fat Loss" → shows deficit with rate slider
- [ ] Select "Muscle Gain" → shows surplus with rate slider
- [ ] Macros update correctly when changing goals

---

## ✅ Payment Checks

### Tap Payments Sandbox
- [ ] Test with minimal KWD amount (e.g., 0.100 KWD if possible)
- [ ] Successful payment redirects correctly
- [ ] Failed payment shows error message

### Discount Codes
- [ ] **One-time**: Discount applies only to first payment
- [ ] **Limited cycles** (e.g., 3 months): Discount applies for N payments, then stops
- [ ] **Lifetime**: Discount applies to all future payments

### Receipts & Emails
- [ ] Check Resend dashboard for email delivery
- [ ] Verify emails are sent from `mail.theigu.com`
- [ ] Check for welcome emails, payment confirmations
- [ ] Note: If emails fail, the signup should still complete (non-blocking)

---

## ✅ Data Verification

### New Profile
- [ ] Profile created with correct `status`
- [ ] `first_name`, `last_name`, `email` populated
- [ ] `onboarding_completed_at` set after form submit

### Subscription
- [ ] Subscription linked to profile via `user_id`
- [ ] `service_id` matches selected plan
- [ ] `coach_id` set for 1:1 plans (after coach approval)
- [ ] `status` reflects current state

### Coach Assignment
- [ ] 1:1 plans: Coach is assigned based on selection or availability
- [ ] Team plans: No individual coach assignment
- [ ] Coach capacity is respected (not over limit)

---

## 📊 Post-Launch Monitoring

### First Week Daily Checks

1. **Error Logs**
   - Check edge function logs for failures
   - Look for 500 errors or timeouts
   - Review any "Error" level logs

2. **Payment Dashboard (Tap)**
   - Check for failed payments
   - Monitor refund requests
   - Verify recurring payments are processing

3. **Email Dashboard (Resend)**
   - Check for bounced emails
   - Monitor delivery rates
   - Look for invalid email addresses

4. **Admin Dashboard**
   - Check "System Health" card
   - Review stuck clients panel
   - Monitor payment failures count

### Weekly Checks

- [ ] Review client pipeline — are people moving through stages?
- [ ] Check discount code usage — any being abused?
- [ ] Monitor coach load — anyone over capacity?
- [ ] Review cancelled clients — any patterns?

### Monthly Checks

- [ ] MRR trend — growing as expected?
- [ ] Client retention rate
- [ ] Coach payouts processed correctly
- [ ] Discount impact on revenue

---

## 🚨 Emergency Contacts

- **Technical Issues**: [Your dev contact]
- **Payment Issues**: Tap Payments support
- **Email Issues**: Resend support
- **Domain Issues**: [Your registrar]

---

## 📝 Notes

_Use this space to track any issues found during testing:_

| Date | Issue | Status |
|------|-------|--------|
| | | |


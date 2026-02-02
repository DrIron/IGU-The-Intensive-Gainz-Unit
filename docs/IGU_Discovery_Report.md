# IGU - The Intensive Gainz Unit
## Comprehensive Discovery Report
**Date:** February 2, 2026
**Production URL:** https://theigu.com

---

## 1. EXECUTIVE SUMMARY

IGU (Intensive Gainz Unit) is a comprehensive fitness coaching platform under Dr. Iron International Sports Consultancy, led by Dr. Hasan Dashti. The platform integrates medicine, science, and performance to deliver evidence-based training and nutrition systems.

### Platform Goals
1. **Tech Goal:** Build an all-in-one platform for fitness enthusiasts that improves upon existing solutions (Truecoach, Trainheroic, Trainerize)
2. **Business Goal:** Provide tiered coaching services from team plans to fully personalized 1:1 coaching

### Tech Stack
- **Frontend:** React 19 + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Storage)
- **Payments:** Tap Payments (Kuwait/GCC region - KWD currency)
- **Hosting:** Vercel
- **Monitoring:** Sentry

---

## 2. SERVICE TIERS & PRICING STRUCTURE

### 2.1 Team Plans
| Plan | Description | Target | Nutrition |
|------|-------------|--------|-----------|
| **Fe Squad** | Team-based hypertrophy training | General fitness enthusiasts | Self-service calculator |
| **Bunz of Steel** | Lower-body focused strength | Strength-focused clients | Self-service calculator |

**Characteristics:**
- All team members see the same workouts
- Individual logs/inputs saved per user
- No individual customization
- Registration can be opened/closed by admin
- Supports batch start dates with announcements

### 2.2 1:1 Online Coaching
- Personalized workout programming via workout builder
- Coach-client relationship with care team support
- Nutrition guidance with 1:1 calorie calculator
- Options for specialty coaches (bodybuilding, powerlifting, nutrition, mobility)
- Coach selection: Auto-match OR choose specific coach

### 2.3 1:1 In-Person Coaching
- All features of 1:1 Online PLUS in-person sessions
- Sessions per week: 2-6 (client configurable)
- Multiple specialty coaches possible (price scales with sessions)
- Gym location selection (client's gym or IGU facility)
- Session booking system

---

## 3. FEATURE INVENTORY

### 3.1 BUILT & FUNCTIONAL

#### Authentication & Authorization
- [x] Supabase Auth with email/password
- [x] Role-based access control (Admin, Coach, Client)
- [x] Row-Level Security (RLS) on all tables
- [x] Session persistence (recently fixed - cache-first pattern)
- [x] Onboarding state machine with multiple statuses

#### Client Onboarding Flow
- [x] Service selection (Fe Squad, Bunz of Steel, 1:1 Online, 1:1 In-Person)
- [x] Personal details capture
- [x] PAR-Q health questionnaire
- [x] Medical review flagging system
- [x] Legal document acceptance
- [x] Coach selection (auto-match or specific)
- [x] Payment integration

#### Dashboards
- [x] **Admin Dashboard:** Overview, clients, coaches, pricing, content library, system health
- [x] **Coach Dashboard:** My clients, pending approvals, programs, nutrition, profile
- [x] **Client Dashboard:** Overview, workouts, nutrition, subscriptions, profile

#### Workout System
- [x] **Workout Builder** (Coach-facing): Program templates, multi-day structure, modules, exercises, prescriptions
- [x] **Exercise Library:** Full database with YouTube videos, muscle tagging, instructions
- [x] **Client Workout Experience:** Calendar, session logging, history tracking

#### Nutrition System
- [x] **Public Calorie Calculator:** Free tool for non-users
- [x] **Self-Service Calculator:** Goal setting, check-ins, auto-adjustments
- [x] **1:1 Client Nutrition:** Coach-managed targets, phase planning, adjustments

#### Educational Content
- [x] YouTube/Loom video integration
- [x] Category-based organization
- [x] Learning paths (playlists)
- [x] Progress tracking

#### Payment & Billing
- [x] Tap Payments integration (Kuwait/GCC)
- [x] Manual monthly subscriptions
- [x] Discount codes
- [x] Coach payout calculations

---

## 4. LAUNCH CONTEXT (February 2026)

- **Timeline:** ~4 weeks
- **Initial Clients:** 12-15 (existing clients + social media)
- **Team:** 2 exercise coaches + 1-2 dieticians
- **Content Status:** Exercise library needs population from YouTube

---

## 5. PRE-LAUNCH PRIORITIES

1. **Exercise Library Population** - Add exercises from YouTube channel
2. **Dashboard UX Improvements** - Optimize client/coach/admin views
3. **QA Testing** - Run through all user flows
4. **Mobile Responsive Testing** - Ensure gym-friendly experience

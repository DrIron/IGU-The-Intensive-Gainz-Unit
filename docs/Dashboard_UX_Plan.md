# IGU Dashboard UX Improvement Plan
## February 2026 Launch Prep

---

## Design Principles

1. **Role-appropriate information density** - Show what matters most for each role
2. **Action-oriented** - Clear CTAs for common tasks
3. **Status at a glance** - Important metrics visible without scrolling
4. **Mobile-first** - Many users will access on phones at the gym
5. **Reduce clicks** - Most tasks should be 1-2 clicks away

---

## 1. CLIENT DASHBOARD

### Primary Goals
- Know what workout to do today
- Track nutrition compliance
- See progress over time
- Access coach communication

### Proposed Layout

**Hero Section: Today's Workout**
- Day title (e.g., "Day 3: Push Day - Upper Body")
- Exercise count & estimated time
- Large "START WORKOUT" CTA
- "View Full Week" secondary action

**Nutrition Check-In Card**
- Daily targets (calories, protein, carbs, fat)
- "Weekly Check-in" button

**Weekly Progress Card**
- Workouts completed (3/5 with visual)
- Nutrition days logged
- Weight trend mini-graph

**Quick Actions Grid**
- Calendar, Library, Videos, Messages icons

**Coach Card**
- Avatar, name, specialty
- Last message preview
- Care team count if applicable

### Mobile Priority Stack
1. Today's Workout (full width, prominent CTA)
2. Nutrition Targets (collapsed, expandable)
3. Quick Actions (2x2 grid)
4. Weekly Progress (compact)
5. Coach Card

---

## 2. COACH DASHBOARD

### Primary Goals
- See clients needing attention
- Quick access to program builder
- Track client progress at a glance
- Manage pending approvals

### Proposed Layout

**Needs Attention Section (Alert Banner)**
- Pending Approvals count
- Nutrition adjustments pending
- Clients who haven't logged this week

**My Clients Panel**
- Search box
- Client cards with status indicators
- Last workout date
- "View All" link

**Quick Actions**
- Create Program
- Assign Program
- Nutrition Management
- Exercise Library

**Activity Feed**
- Recent client completions, logs, messages

---

## 3. ADMIN DASHBOARD

### Primary Goals
- System health at a glance
- Revenue & subscription metrics
- Coach performance overview
- Client pipeline status

### Proposed Layout

**Metrics Card Grid**
- Active Clients (with change indicator)
- Monthly Revenue
- Active Coaches
- Pending Approvals (with alert)

**Requires Attention Section**
- Pending coach approvals
- Failed payments
- Coach applications

**Subscription Breakdown**
- Fe Squad count
- Bunz of Steel count
- 1:1 Online count
- 1:1 In-Person count

**Coach Workload Panel**
- Each coach with client count / capacity
- Overall capacity utilization

---

## 4. IMPLEMENTATION PRIORITY

### Phase 1: Pre-Launch (This Week)
1. Client dashboard: Today's workout hero section
2. Coach dashboard: Needs attention alerts
3. All dashboards: Consistent quick actions grid
4. Mobile responsive testing

### Phase 2: Launch Week
1. Activity feeds for all roles
2. Notification badges on nav items
3. Progress visualization improvements

### Phase 3: Post-Launch
1. Analytics dashboards
2. Advanced reporting
3. Custom dashboard widgets

---

## 5. NEW COMPONENTS NEEDED

- `TodaysWorkoutHero.tsx` - Client's main CTA
- `NeedsAttentionAlerts.tsx` - Coach/Admin alerts
- `MetricsCardGrid.tsx` - Reusable stats grid
- `ActivityFeed.tsx` - Timeline of recent actions

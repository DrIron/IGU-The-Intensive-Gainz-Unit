# -*- coding: utf-8 -*-
# IGU user guides -> two branded PDFs (client + coach), WeasyPrint.
#
# Single source of truth for the CONTENT of both guide PDFs. Edit the strings
# below, then run this file to regenerate IGU_Client_Guide.pdf and
# IGU_Coach_Guide.pdf in the project root.
#
#   pip install weasyprint        # one-time
#   python3 docs/help/build_guide.py
#
# Pricing reflects the finalised model (June 2026):
#   - 1:1 Complete retired -> four plans.
#   - Level-based client prices; per-level coach pay (coach guide).
#   - Nutrition (dietitian) + physiotherapy are add-ons "launching soon".
# The plain-markdown mirrors used for the website live alongside this file
# (faq.md, tutorials.md, glossary.md, client-guide.md, coach-guide.md). Keep
# them in step with the content here when you edit.
import os
from weasyprint import HTML

# Portable output: project root (two levels up from docs/help/), regardless of session.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))

CSS = r"""
@page {
  size: A4; margin: 22mm 18mm 20mm 18mm;
  @bottom-center { content: "IGU \2014 " string(doctitle); font-size: 8pt; color: #b9bcc2; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #b9bcc2; }
}
@page :first { margin: 0; @bottom-center { content: ""; } @bottom-right { content: ""; } }
* { box-sizing: border-box; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f1f22; font-size: 10.5pt; line-height: 1.5; margin: 0; }
.doctitle { string-set: doctitle content(); height:0; overflow:hidden; }

.cover { height: 297mm; background: linear-gradient(157deg,#17171b 0%,#0b0b0d 58%,#240a0e 100%); color:#fff; padding: 55mm 22mm 0 22mm; position: relative; }
.cover .logo { font-size: 64pt; font-weight: 800; letter-spacing: 1px; line-height:1; color:#fff; }
.cover .logo::after { content:""; display:block; width:34mm; height:4px; background:#DA1B2B; margin-top:5mm; border-radius:2px; }
.cover .full { font-size: 17pt; font-weight: 400; opacity:.9; margin-top: 6mm; }
.cover .title { font-size: 30pt; font-weight: 800; margin-top: 30mm; line-height:1.15; }
.cover .sub { font-size: 13pt; font-weight: 400; opacity:.88; margin-top: 5mm; max-width: 132mm; }
.cover .foot { position:absolute; bottom: 24mm; left:22mm; font-size: 10.5pt; opacity:.85; }
.cover .pill { display:inline-block; border:1.5px solid #DA1B2B; color:#ff5663; border-radius: 30px; padding: 3px 14px; font-size: 9.5pt; margin-top: 26mm; letter-spacing:.5px; font-weight:700; }

h1 { color:#0a0a0b; font-size: 19pt; font-weight: 800; margin: 0 0 1mm 0; padding-bottom: 2mm; border-bottom: 3px solid #DA1B2B; }
h2 { color:#DA1B2B; font-size: 13pt; font-weight: 700; margin: 6mm 0 1.5mm 0; }
h3 { color:#0a0a0b; font-size: 10.8pt; font-weight: 700; margin: 4mm 0 0.5mm 0; }
p { margin: 0 0 2.2mm 0; }
.lead { font-size: 10.8pt; color:#3a3a40; margin-bottom: 3mm; }
.desc { margin: 0 0 1.5mm 0; }
ul { margin: 1mm 0 3mm 0; padding-left: 6mm; }
li { margin-bottom: 1.2mm; }
.chapter { page-break-before: always; }
a { color:#DA1B2B; text-decoration: none; }

table { width:100%; border-collapse: collapse; margin: 2mm 0 4mm 0; font-size: 9.5pt; }
th { background:#DA1B2B; color:#fff; text-align:left; padding: 2.2mm 3mm; font-weight:700; }
td { padding: 2.2mm 3mm; border-bottom: 1px solid #e6e9ee; vertical-align: top; }
tr:nth-child(even) td { background:#f7f8fa; }
td.tier { font-weight:700; color:#b01522; white-space:nowrap; }

.callout { border-left: 4px solid #DA1B2B; background:#fcebec; padding: 2.6mm 4mm; border-radius: 0 4px 4px 0; margin: 2.5mm 0; font-size: 9.8pt; }
.callout.warn { border-left-color:#d98324; background:#fdf3e9; }
.callout .ct { font-weight:700; color:#b01522; display:block; margin-bottom:0.8mm; }
.callout.warn .ct { color:#a85d12; }
.note { border-left: 3px solid #c7ccd3; background:#f5f6f8; padding: 1.8mm 3mm; border-radius:0 3px 3px 0; margin: 1.5mm 0 3mm 0; font-size: 9.3pt; color:#41474f; }
.note b { color:#1f1f22; }

.cards { display:flex; gap:5mm; margin: 3mm 0; }
.card { flex:1; border:1px solid #e6e9ee; border-radius:6px; padding: 4mm; background:#fcfcfd; }
.card .h { font-weight:800; color:#0a0a0b; font-size:11.5pt; margin-bottom:1.5mm; }
.card .tag { display:inline-block; background:#DA1B2B; color:#fff; font-size:8pt; padding:1px 8px; border-radius:20px; margin-bottom:2mm; font-weight:700; letter-spacing:.4px; }

ol.steps { counter-reset: step; list-style:none; padding-left:0; margin: 1mm 0 3mm 0; }
ol.steps li { counter-increment: step; padding-left: 8mm; position:relative; margin-bottom:1.3mm; }
ol.steps li::before { content: counter(step); position:absolute; left:0; top:0.2mm; width:5.4mm; height:5.4mm; background:#DA1B2B; color:#fff; border-radius:50%; font-weight:700; font-size:8.5pt; text-align:center; line-height:5.4mm; }

.faq q { display:block; font-weight:700; color:#b01522; margin-top:2.6mm; font-size:10.2pt; }
.gloss b { color:#b01522; }
.toc-line { display:flex; justify-content:space-between; border-bottom:1px dotted #d9dde3; padding:1.5mm 0; }
.toc-line .n { color:#DA1B2B; font-weight:700; }
.muted { color:#71717a; font-size:9.4pt; }
"""

# ---------- helpers ----------
def feat(name, desc, steps=None, note=None):
    h = "<h3>%s</h3>" % name
    if desc:
        h += '<p class="desc">%s</p>' % desc
    if steps:
        h += '<ol class="steps">' + "".join("<li>%s</li>" % s for s in steps) + "</ol>"
    if note:
        h += '<div class="note">%s</div>' % note
    return h

def table(headers, rows, tier=True):
    out = "<table><tr>" + "".join("<th>%s</th>" % x for x in headers) + "</tr>"
    for r in rows:
        cells = ""
        for i, c in enumerate(r):
            cls = ' class="tier"' if (tier and i == 0) else ""
            cells += "<td%s>%s</td>" % (cls, c)
        out += "<tr>%s</tr>" % cells
    return out + "</table>"

def callout(title, body, warn=False):
    return '<div class="callout%s"><span class="ct">%s</span>%s</div>' % (" warn" if warn else "", title, body)

def faqgroup(title, qas):
    s = '<h2 class="faq">%s</h2><div class="faq">' % title
    for q, a in qas:
        s += "<q>%s</q><p>%s</p>" % (q, a)
    return s + "</div>"

def toc(items):
    s = "<h2>What's inside</h2>"
    for n, t, m in items:
        s += '<div class="toc-line"><span><span class="n">%s</span> %s</span><span class="muted">%s</span></div>' % (n, t, m)
    return s

def cover(pill, title_html, sub):
    return ('<div class="doctitle">%s</div>'
            '<div class="cover"><div class="logo">IGU</div>'
            '<div class="full">The Intensive Gainz Unit</div>'
            '<div class="pill">%s</div>'
            '<div class="title">%s</div>'
            '<div class="sub">%s</div>'
            '<div class="foot">theigu.com &nbsp;&middot;&nbsp; Welcome aboard</div></div>') % (
            pill, pill, title_html, sub)

def render(parts, filename):
    doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>%s</style></head><body>%s</body></html>" % (CSS, "".join(parts))
    path = os.path.join(OUT_DIR, filename)
    HTML(string=doc).write_pdf(path)
    print("written", path)

# Shared data ----------------------------------------------------------------
ACCOUNT_STATES = table(["Status", "What it means &amp; what you'll see"], [
 ["Setting up", "You’ve started but not finished joining — the app shows your next step (finish registration, await medical review, await coach approval, or activate)."],
 ["Active", "Fully set up — everything is unlocked."],
 ["Grace period", "A payment is overdue — you keep view access with a countdown to renew, but new session bookings pause."],
 ["Suspended / inactive", "Access is locked until you renew or contact support."],
 ["Cancelled / expired", "Your plan has ended — a friendly screen explains how to come back."],
])

PLANS_CLIENT = table(["Plan", "Who coaches you", "Best for"], [
 ["Team Plan", "A head coach, shared group track", "Affordable, structured group coaching"],
 ["1:1 Online", "Your own coach, fully online", "Personalised online coaching"],
 ["Hybrid", "Your own coach, online + in person", "In-person sessions plus online support"],
 ["In-Person", "Your own coach, in person", "The most hands-on, in-person experience"],
])

# Client price ladder (KWD/month). Team Plan is flat; 1:1 tiers by coach level.
PRICING_LADDER = table(["Plan", "Junior coach", "Senior coach", "Lead coach"], [
 ["1:1 Online", "30 KWD", "35 KWD", "40 KWD"],
 ["Hybrid", "95 KWD", "110 KWD", "125 KWD"],
 ["In-Person", "145 KWD", "175 KWD", "215 KWD"],
])

# Coach pay per client per month (KWD), by level. Team = flat per member.
COACH_PAY = table(["Plan", "Junior", "Senior", "Lead"], [
 ["1:1 Online", "17 KWD", "24 KWD", "30 KWD"],
 ["Hybrid", "70 KWD", "88 KWD", "105 KWD"],
 ["In-Person", "107 KWD", "141 KWD", "183 KWD"],
])

# =========================================================
#  CLIENT GUIDE
# =========================================================
def build_client():
    P = []
    P.append(cover("CLIENT GUIDE",
        "Your IGU Guide<br>for Clients",
        "Everything you can do on IGU as a client, explained in full — every feature, step by step, with answers to the questions you might have along the way."))

    P.append('<div class="chapter"><h1>Welcome to IGU</h1>')
    P.append('<p class="lead">IGU (The Intensive Gainz Unit) is an online coaching platform that connects you with a real coach and gives you the tools to train, eat, and track your progress in one place. This guide explains everything you can do as a client — in plain language, with step-by-step instructions for every feature.</p>')
    P.append("<p>It is also the foundation for our in-app Help, FAQ, and Tutorial sections, and is designed to be complete enough to answer almost any question you have.</p>")
    P.append(callout("How to use this guide", "Part 1 is the big picture. Part 2 walks through every feature you’ll use day to day. Part 3 explains how your plan shapes what you see, and Parts 4–6 are the FAQ, glossary, and how to get help."))
    P.append(toc([
        ("1.", "How IGU works", "the big picture"),
        ("2.", "Every feature, step by step", "your tools"),
        ("3.", "How your plan changes what you see", "plans explained"),
        ("4.", "Frequently asked questions", "FAQ"),
        ("5.", "Glossary of IGU terms", "definitions"),
        ("6.", "Getting help &amp; your privacy", "support"),
    ]))
    P.append("</div>")

    P.append('<div class="chapter"><h1>1 &nbsp;How IGU works</h1>')
    P.append('<p class="lead">IGU pairs you with a coach and gives you everything you need in one place. What you see depends on your plan and where you are in setting up.</p>')
    P.append("<h2>Who you’ll work with</h2>")
    P.append("<p>Your main contact is your coach, who handles your training and nutrition. Specialist support — a dietitian, physiotherapist, and more — can join your <b>care team</b> as optional add-ons, launching soon.</p>")
    P.append(table(["Who", "What they do for you"], [
        ["Coach", "Your main point of contact — your training program, nutrition guidance, and overall progress."],
        ["Head coach", "A senior coach who leads team plans."],
        ["Dietitian", "A nutrition specialist (available as an add-on, launching soon)."],
        ["Physiotherapist", "Injury, rehab, and movement (available as an add-on, launching soon)."],
        ["Sports psychologist", "Mindset, motivation, and performance (add-on, launching soon)."],
        ["Mobility coach", "Flexibility and movement quality (add-on, launching soon)."],
    ]))
    P.append(callout("Specialists as add-ons", "Your coach handles your training and nutrition. Specialist support — a dietitian, physiotherapist, and more — is launching soon as optional add-ons you can attach to any plan."))
    P.append("<h2>The four plans</h2>")
    P.append("<p>You choose one plan when you join. It sets who is on your coaching team and how your training is delivered.</p>")
    P.append(PLANS_CLIENT)
    P.append("<h2>What it costs</h2>")
    P.append("<p>The <b>Team Plan</b> is a flat <b>10 KWD/month</b>. The three 1:1 plans are priced by your coach’s experience level (Junior, Senior, or Lead) — a more senior coach costs a little more. All prices are KWD per month.</p>")
    P.append(PRICING_LADDER)
    P.append(callout("Why the price varies", "On the 1:1 plans your price depends on the experience level of the coach you’re matched with. You’ll always see the price before you confirm."))
    P.append(callout("Add-ons", "On any plan you can add one-off extras — like single sessions or session packs — without changing your main plan. <b>Nutrition (dietitian) and physiotherapy add-ons are launching soon.</b>"))
    P.append("<h2>Your account status</h2>")
    P.append("<p>Your experience is also shaped by your account status. IGU always shows which stage you’re in and what to do next — it never hides things without explanation.</p>")
    P.append(ACCOUNT_STATES)
    P.append("</div>")

    P.append('<div class="chapter"><h1>2 &nbsp;Every feature, step by step</h1>')
    P.append('<p class="lead">Everything you can do as a client, grouped by area. Each feature has a short description and the exact steps to use it. Notes mark anything that differs by plan.</p>')

    P.append("<h2>2.1 &nbsp;Getting started</h2>")
    P.append(feat("Signing up &amp; completing the intake form",
     "The intake form is a short wizard that joins you to IGU. It collects your details, goals, and plan, and saves your progress so you can finish later.",
     ["Go to theigu.com and choose a plan, or open your sign-up link.",
      "Step 1 — enter your name, contact details, date of birth, height, and goals, and pick your plan.",
      "Step 2 — answer the plan-specific questions (team plans ask you to acknowledge a few points; 1:1 plans ask about experience, training days, and gym access).",
      "Step 3 — answer the seven health (PAR-Q) questions honestly.",
      "Step 4 — read and accept the legal agreements.",
      "Tap Submit Application, or Save &amp; Exit to return later."],
     note="<b>1:1 plans:</b> Step 1 lets you name a preferred coach. Team-plan sign-ups skip this — you choose a team after activation."))
    P.append(feat("The health check (PAR-Q)",
     "Seven yes/no questions that help us confirm training is safe for you before you start.",
     ["Answer each question truthfully.", "Add any injuries or conditions in the notes box if relevant.", "Submit — if anything is flagged, your application goes to a brief medical review."],
     note="Your medical answers are private and encrypted. Your coach only sees whether you’re cleared to train — never the raw details."))
    P.append(feat("Following your activation journey",
     "After you submit, IGU walks you through a few stages and updates each screen automatically.",
     ["Medical review (only if flagged) — usually 24–48 hours.",
      "Coach approval — we match you with a coach (or your preferred coach).",
      "Activation — once approved, you complete the final step to switch your account on.",
      "Active — your full dashboard unlocks on its own."]))
    P.append(feat("Activating your account",
     "The final step that turns your account on after your coach approves you.",
     ["Review your plan on the activation screen.", "Enter a promo code if you have one.", "Complete the secure checkout.", "Your dashboard unlocks once it’s confirmed."]))
    P.append(feat("Choosing your team — Team Plan only",
     "Team-plan members join a coaching group led by a head coach.",
     ["On your dashboard, open the Choose your team prompt.", "Review the available teams and their spaces.", "Select a team and confirm Join Team."],
     note="<b>Team Plan only.</b> 1:1 clients get a personal coach instead."))
    P.append(feat("Changing your team — Team Plan only",
     "Move to a different team if your goals or schedule change.",
     ["Open your team card and choose Change team.", "Pick a new team and confirm."],
     note="Team changes are limited to roughly once per billing cycle, so choose deliberately."))

    P.append("<h2>2.2 &nbsp;Your dashboard</h2>")
    P.append(feat("Reading your dashboard",
     "Your home base, built to answer “what should I do today?” — today’s workout, nutrition targets, weekly progress, your coach, billing, and alerts.",
     ["Log in to land on your dashboard.", "Scan the cards top to bottom — today’s workout first.", "Tap any card to jump into that area."]))
    P.append(feat("Logging your weight and steps (Log Today)",
     "A quick daily check-in for body weight and steps, right from the dashboard.",
     ["Find the Log Today card.", "Enter today’s body weight (kg) and step count.", "Save — it counts toward your weekly weigh-in goal (aim for three a week)."]))
    P.append(feat("Requesting a deload",
     "A deload is a lighter recovery week. Ask your coach for one when you’re feeling run down.",
     ["Tap Request a deload on your dashboard.", "Add an optional note about how you’re feeling.", "Submit — your coach is notified and reviews it.", "If declined, you can ask again after a short cool-off."]))
    P.append(feat("Acting on alerts &amp; reminders",
     "Context banners flag anything needing attention — an upcoming renewal, a missed weigh-in, or a lapsed plan — each with a button to fix it.",
     ["Read any banner at the top of your dashboard.", "Tap its action (e.g. Renew) to resolve it."]))

    P.append("<h2>2.3 &nbsp;Workouts</h2>")
    P.append(feat("Starting and logging a workout",
     "The core training experience: open your session and record every set — weight, reps, and effort — with videos, your coach’s notes, and a rest timer.",
     ["From your dashboard, tap Start on today’s workout.",
      "For each exercise, check the target (reps, effort, rest) and tap the video for a demo.",
      "Enter weight, reps, and effort for each set, then tick the set off — it saves instantly.",
      "Use the rest timer between sets (pause or skip as needed).",
      "When every set is logged, tap Complete Workout."]))
    P.append(feat("Using the rest timer",
     "A built-in timer that starts when you finish a set so you rest the right amount.",
     ["Tick a set as done — the timer starts automatically.", "Pause or skip with the controls.", "Start your next set when it ends."]))
    P.append(feat("Swapping an exercise",
     "Replace an exercise you can’t do with a suitable alternative.",
     ["Open the exercise’s menu and choose Swap.", "Pick an alternative (same-muscle options are suggested first).", "Log the new exercise as normal, and message your coach so they can update your plan."]))
    P.append(feat("Viewing your workout calendar",
     "A month view of your training with colour-coded days — completed, partial, and upcoming.",
     ["Open Calendar from the workouts menu.", "Move between months and read the colour key.", "Tap a day to see its sessions and open one."]))
    P.append(feat("Reviewing your exercise history",
     "See how a specific lift has progressed over time.",
     ["Open Exercise History.", "Search for and select an exercise you’ve logged.", "Review the trend and the set-by-set table."]))
    P.append(feat("Browsing the exercise library",
     "A searchable reference of exercises with videos and setup/execution guidance.",
     ["Open the Exercise Library.", "Search or filter by muscle group.", "Open an exercise to watch the video and read setup, execution, and common pitfalls."]))

    P.append("<h2>2.4 &nbsp;Nutrition — 1:1 plans</h2>")
    P.append('<p class="desc">On the 1:1 plans (Online, Hybrid, In-Person) your coach sets and adjusts your targets; you log your data and complete a weekly check-in. A dedicated dietitian add-on is launching soon — when you add it, the dietitian leads your nutrition.</p>')
    P.append(feat("Understanding your nutrition phase",
     "Your phase card shows your current coach-set targets — daily calories and macros — and your progress against the expected rate.",
     ["Open Nutrition.", "Read the phase card: calories, protein/fat/carbs, your goal, and an on-track status."]))
    P.append(feat("Logging your weight",
     "Regular weigh-ins are how your coach tracks progress and adjusts your plan.",
     ["In Nutrition, go to This Week (or use Log Today).", "Enter your weight and save — aim for at least three weigh-ins a week."]))
    P.append(feat("Logging steps", "Record your daily steps to support your nutrition tracking.",
     ["Open the step logging card in This Week.", "Enter the date and step count and save."]))
    P.append(feat("Logging measurements", "Track body measurements (e.g. waist, chest, hips, thighs) when your plan schedules them.",
     ["In This Week, open the measurements section when available.", "Enter each measurement and save."]))
    P.append(feat("Logging body fat", "Record body-fat percentage for a fuller progress picture.",
     ["Open the body-fat form in This Week.", "Enter your percentage and method and save."]))
    P.append(feat("Completing your weekly check-in",
     "A short weekly review where you report adherence and how you’re feeling so your coach can adjust.",
     ["Log at least three weigh-ins that week to unlock the check-in.", "Answer the questions (calories hit, physical changes, tracking accuracy) and add notes.", "Submit — your coach reviews it and may adjust your targets."]))
    P.append(feat("Viewing your nutrition history", "Long-run graphs of your weight and body fat, plus a summary when a phase completes.",
     ["Open the History tab in Nutrition.", "Review your weight and body-fat trends over time."]))

    P.append("<h2>2.5 &nbsp;Nutrition — Team Plan</h2>")
    P.append('<p class="desc">Team-plan members manage their own nutrition with a guided calculator; your coach can still review it.</p>')
    P.append(feat("Setting your own nutrition goal", "A step-by-step calculator works out your calories and macros from your stats and goal.",
     ["Open Nutrition and choose Goal Setting.", "Work through the wizard: weight, height, age, gender, activity level, goal type, and rate.", "Review the calculated calories and macros and Save — they become your active targets."]))
    P.append(feat("Tracking your progress", "A week-by-week tracker for your self-managed plan.",
     ["Open the Progress Tracker tab.", "Expand each week to log your data and view your weight and body-fat graphs."],
     note="On the Team Plan you manage your own nutrition. On the 1:1 plans your coach manages it for you, and a dedicated dietitian add-on is launching soon."))

    P.append("<h2>2.6 &nbsp;Education</h2>")
    P.append(feat("Watching educational videos",
     "A learning library organised into helpful sections — required for you, tied to your current program or phase, from your coach, and more.",
     ["Open Educational Videos.", "Browse the sections or search for a topic.", "Open a video to watch it in the secure player.", "Tap Mark as Complete when done."]))
    P.append(feat("Following a learning path", "Structured sequences of videos that build on each other.",
     ["Open the Learning Paths tab.", "Start a path and work through its videos in order."]))
    P.append(feat("Watching content your coach assigned", "Your coach can assign specific videos with a due date; these are highlighted for you.",
     ["Look for the “required” or “from your coach” highlights on your dashboard or in the library.", "Open and complete them — your coach can see your progress."]))

    P.append("<h2>2.7 &nbsp;Sessions</h2>")
    P.append('<p class="desc">Available on plans that include session booking.</p>')
    P.append(feat("Booking a 1:1 session", "Book coaching sessions against your weekly allowance.",
     ["Open Sessions and check your weekly usage.", "Pick a date and choose an available slot.", "Confirm to book — it appears in your upcoming list."]))
    P.append(feat("Cancelling a session", "Free up a booking if your plans change.",
     ["Find the session in your Upcoming list.", "Choose Cancel and confirm — your allowance updates."],
     note="<b>Grace period:</b> if a payment is overdue you keep view access, but new bookings pause until you’re paid up."))

    P.append("<h2>2.8 &nbsp;Messages</h2>")
    P.append(feat("Messaging your care team", "One shared thread with everyone coaching you — ask anything day to day.",
     ["Open Messages.", "Type your message and send (Cmd/Ctrl+Enter on desktop; a drawer on mobile).", "Your coach is notified and replies in the same thread."]))
    P.append(feat("Editing or deleting your message", "Fix a typo or remove something you sent.",
     ["Open the menu on your own message.", "Choose Edit (an “edited” tag and history are kept) or Delete (it shows as removed)."]))

    P.append("<h2>2.9 &nbsp;Add-ons</h2>")
    P.append(feat("Browsing and adding an add-on", "Optional extras on top of any plan — for example single sessions or session packs.",
     ["Open Add-on Services.", "Filter by type and open an add-on to see what’s included, pack size, and eligibility.", "Choose it, set the quantity, and complete the secure checkout.", "It’s confirmed once checkout completes."],
     note="<b>Coming soon:</b> nutrition (dietitian) and physiotherapy add-ons are launching soon. <b>Tier eligibility:</b> some specialist add-ons are only available on certain plans; ineligible ones show which plan is required."))
    P.append(feat("Ending a recurring add-on", "Stop a recurring specialist add-on at your next renewal.",
     ["Open your care team card on the dashboard.", "On the relevant add-on, choose End at renewal and confirm."]))

    P.append("<h2>2.10 &nbsp;Billing &amp; account</h2>")
    P.append(feat("Renewing your subscription", "Plans renew monthly with no stored card, so you confirm your renewal each month.",
     ["Open Billing (or tap a renewal reminder).", "Review your plan and tap Renew.", "Complete checkout — access updates as soon as it confirms."]))
    P.append(feat("Updating your profile", "Keep your details current; your nutrition tools use your latest stats.",
     ["Open Account.", "Edit your name, date of birth, gender, height, activity level, or phone.", "Save. To change your email, follow the confirmation step shown."]))
    P.append(feat("Changing your password", "Update your sign-in password.",
     ["In Account, open the password section.", "Enter a new password and save."]))
    P.append(feat("Requesting a coach change", "Ask to be moved to a different coach.",
     ["In Account, open the coach section and choose Request coach change.", "Pick a preferred coach if offered and submit — our team follows up."]))
    P.append(feat("Cancelling your subscription", "End your plan at the close of the current billing period.",
     ["In Account or Billing, open subscription management.", "Choose Cancel and confirm — access continues until the period ends."]))
    P.append(feat("Deleting your account", "Permanently close your account.",
     ["In Account, scroll to the Danger Zone.", "Choose Delete account and confirm — you’ll be signed out."]))
    P.append(feat("Using the calorie calculator", "A free tool to estimate calories and macros; for signed-in clients it pre-fills your stats.",
     ["Open the Calorie Calculator.", "Use the Initial Calculator for a fresh estimate, or the Adjustment Calculator to tweak a plan.", "Review the result — it’s a tool only and doesn’t save to your plan."]))
    P.append("</div>")

    P.append('<div class="chapter"><h1>3 &nbsp;How your plan changes what you see</h1>')
    P.append('<p class="lead">The same app adapts to your plan. Here’s what differs.</p>')
    P.append("<h2>By plan</h2>")
    P.append(table(["What changes", "Team Plan", "1:1 plans (Online / Hybrid / In-Person)"], [
        ["Price", "Flat 10 KWD/month", "By your coach’s level (see the price ladder)"],
        ["Your coach", "A shared head coach for the team", "Your own dedicated coach"],
        ["Nutrition", "Self-service with a guided calculator", "Coach-managed for you"],
        ["Dietitian", "Optional add-on (coming soon)", "Optional add-on (coming soon)"],
        ["Team step", "You choose (and can change) your team", "Not applicable"],
        ["In-person sessions", "No", "Yes on Hybrid &amp; In-Person"],
        ["Workouts &amp; tracking", "Included", "Included"],
    ]))
    P.append(callout("Same app, tailored view", "Everyone gets the dashboard, workout logging, messaging, and the exercise and video libraries. Your plan decides who is on your team and whether nutrition is self-managed or coach-managed."))
    P.append("<h2>By account status</h2>")
    P.append(ACCOUNT_STATES)
    P.append("</div>")

    P.append('<div class="chapter"><h1>4 &nbsp;Frequently asked questions</h1>')
    P.append(faqgroup("Joining &amp; getting started", [
        ("How do I sign up?", "Choose a plan at theigu.com and complete the intake wizard. You’ll go through a quick health check, get matched with a coach, and activate your account."),
        ("Why does my application need a medical review?", "If your health questionnaire flags anything we should check first, we pause briefly (usually 24–48 hours) to make sure training is safe for you."),
        ("Can I choose my coach?", "On 1:1 plans you can name a preferred coach during sign-up. If they have space we’ll match you; otherwise we’ll assign the best-fit coach."),
        ("How long until my account is active?", "Once your coach approves you and you’ve activated, your full dashboard unlocks right away."),
        ("Can I finish signing up later?", "Yes — use Save &amp; Exit in the intake form and your progress is kept (your health answers aren’t stored in drafts, for privacy)."),
    ]))
    P.append(faqgroup("Plans, renewals &amp; billing", [
        ("How much does it cost?", "The Team Plan is a flat 10 KWD/month. The 1:1 plans are priced by your coach’s level — 1:1 Online from 30 KWD, Hybrid from 95 KWD, and In-Person from 145 KWD per month. You’ll always see your exact price before you confirm."),
        ("Why does my price depend on my coach?", "On the 1:1 plans, a more senior coach (Senior or Lead) costs a little more than a Junior coach. Your price is set by the level of the coach you’re matched with, and it’s shown before you pay."),
        ("How does billing work?", "Plans renew monthly. There’s no auto-stored card — you confirm your renewal each month and we remind you before it’s due."),
        ("What happens if I miss a renewal?", "You enter a short grace period: you keep view access with a countdown to renew, though new session bookings pause. If it lapses further, access is locked until you renew."),
        ("Can I change my plan or cancel?", "Yes. Manage your subscription from Account or Billing. Cancellations take effect at the end of your current billing period."),
        ("What are add-ons?", "Optional extras on top of any plan — for example single sessions or session packs. Nutrition (dietitian) and physiotherapy add-ons are launching soon."),
        ("Can I use a promo code?", "Yes — enter it at checkout and any discount is applied before you confirm."),
        ("Why is a feature greyed out?", "It’s usually tied to your plan or account status. The on-screen message explains which, and what to do."),
    ]))
    P.append(faqgroup("Training &amp; nutrition", [
        ("What if I can't do an exercise?", "Use Swap during your workout to pick an alternative, and message your coach so they can adjust your program."),
        ("Do I have to log every set?", "It’s how your coach sees your progress and adjusts your plan, so it’s strongly encouraged — and the rest timer and history make it quick."),
        ("Who sets my nutrition targets?", "On the 1:1 plans your coach sets and adjusts them (a dedicated dietitian add-on is launching soon). On a team plan you set your own with the guided calculator, and your coach can review them."),
        ("What is a deload and how do I request one?", "A lighter recovery week. Request one from your dashboard; your coach reviews and schedules it."),
        ("Where do I update my body stats?", "In Account. Your nutrition and calculators use your latest values."),
        ("How often should I weigh in?", "Aim for at least three weigh-ins a week — it also unlocks your weekly check-in."),
    ]))
    P.append(faqgroup("Coaches &amp; communication", [
        ("How do I contact my coach?", "Use Messages for anything day-to-day. Your whole care team can see and respond there."),
        ("Can I change my coach?", "Yes — request a coach change from your Account page and our team will help."),
        ("Can my coach see my medical information?", "No. Your medical answers are private and encrypted. Your coach only sees whether you’re cleared to train."),
        ("Who is on my care team?", "Your main coach — shown on your dashboard. Specialist support (a dietitian, physio, and more) is launching soon as optional add-ons that join your care team."),
    ]))
    P.append("</div>")

    P.append('<div class="chapter"><h1>5 &nbsp;Glossary of IGU terms</h1>')
    P.append('<p class="lead">Plain-language definitions of the words you’ll see around IGU.</p>')
    P.append(table(["Term", "What it means"], [
        ["Care team", "Everyone coaching you — your main coach plus any specialists (dietitian, physio, etc.)."],
        ["Phase", "A block of your nutrition plan with a specific goal (e.g. fat loss or muscle gain) and its own targets."],
        ["Macros", "Short for macronutrients — protein, carbohydrates, and fat. Your daily targets for each."],
        ["Deload", "A planned lighter week to let your body recover before training hard again."],
        ["Diet break / refeed", "Short, planned increases in food during a fat-loss phase to aid recovery and adherence."],
        ["RIR / RPE", "Ways to measure effort. RIR = reps in reserve (how many you had left); RPE = rate of perceived exertion (how hard it felt)."],
        ["Tempo", "How fast you perform each rep — e.g. lowering slowly for control."],
        ["Program / mesocycle", "Your training plan over a block of weeks."],
        ["Adherence", "How consistently you follow your plan — tracked weekly."],
        ["Weekly check-in", "A short weekly review where you report how the week went so your coach can adjust."],
        ["Team plan", "A group coaching track led by a head coach that several clients follow together."],
        ["Head coach", "A senior coach who leads team plans."],
        ["Grace period", "A short window after a missed renewal where you keep limited access while you renew."],
        ["Add-on", "An optional extra — a session, a pack of sessions, or a specialist — on top of your plan."],
        ["PAR-Q", "The short health-readiness questionnaire you complete when joining."],
    ]))
    P.append("</div>")

    P.append('<div class="chapter"><h1>6 &nbsp;Getting help &amp; your privacy</h1>')
    P.append("<h2>Getting help</h2>")
    P.append("<ul>"
        "<li><b>Ask your coach</b> — for anything about your training, nutrition, or plan, Messages is the fastest route.</li>"
        "<li><b>Check your status banners</b> — if a feature seems missing, your dashboard usually explains why (for example, awaiting renewal) and what to do next.</li>"
        "<li><b>Contact support</b> — for billing, account, or technical issues, use the contact option on theigu.com or your account page.</li>"
        "</ul>")
    P.append(callout("Quick troubleshooting",
        "<ul style='margin-bottom:0'>"
        "<li><b>Can’t log in?</b> Use “reset password” on the sign-in screen.</li>"
        "<li><b>A page won’t load?</b> Refresh, or sign out and back in.</li>"
        "<li><b>Feature greyed out?</b> It’s usually tied to your plan or account status — the on-screen message will say which.</li>"
        "<li><b>Renewal didn’t go through?</b> Head to Billing and try again; access updates as soon as it confirms.</li>"
        "</ul>", warn=True))
    P.append("<h2>Your privacy</h2>")
    P.append("<ul>"
        "<li><b>Your medical answers are private and encrypted.</b> Coaches see only whether you’re cleared to train — never the raw details.</li>"
        "<li><b>Your personal contact details</b> (email, phone, date of birth) are kept separate and protected; coaches don’t have access to them.</li>"
        "<li><b>Checkout is handled securely</b> through a trusted provider — we don’t store your card.</li>"
        "<li><b>You’re in control.</b> Update your details, change your plan, or close your account from your account page at any time.</li>"
        "</ul>")
    P.append(callout("Welcome to the unit", "That’s the full tour. The best way to learn IGU is to dive in — your dashboard always points you to the next step. We’re glad you’re here."))
    P.append("</div>")

    render(P, "IGU_Client_Guide.pdf")

# =========================================================
#  COACH GUIDE
# =========================================================
def build_coach():
    P = []
    P.append(cover("COACH GUIDE",
        "Your IGU Guide<br>for Coaches",
        "Everything you can do on IGU as a coach, dietitian, or specialist, explained in full — every feature, step by step, with answers to the questions that come up."))

    P.append('<div class="chapter"><h1>Welcome to IGU</h1>')
    P.append('<p class="lead">IGU (The Intensive Gainz Unit) is your command centre for coaching clients online — approving them, building their programs, guiding nutrition, running sessions, and keeping in touch. This guide explains everything you can do, in plain language with step-by-step instructions.</p>')
    P.append("<p>It is also the foundation for our in-app Help, FAQ, and Tutorial sections, and is designed to answer almost any question you have.</p>")
    P.append(callout("How to use this guide", "Part 1 is the big picture. Part 2 covers every coach feature. Parts 3 and 4 are dedicated to dietitians and physiotherapists/specialists. Part 5 shows how roles change what you see, and Parts 6–8 are the FAQ, glossary, and support."))
    P.append(toc([
        ("1.", "How IGU works", "the big picture"),
        ("2.", "For coaches — every feature", "your tools"),
        ("3.", "For dietitians", "nutrition specialists"),
        ("4.", "For physiotherapists &amp; other specialists", "rehab &amp; specialist care"),
        ("5.", "How roles &amp; plans change what you see", "roles explained"),
        ("6.", "Frequently asked questions", "FAQ"),
        ("7.", "Glossary of IGU terms", "definitions"),
        ("8.", "Getting help", "support"),
    ]))
    P.append("</div>")

    P.append('<div class="chapter"><h1>1 &nbsp;How IGU works</h1>')
    P.append('<p class="lead">IGU has two main kinds of people — clients and coaches — plus a behind-the-scenes admin team. As a coach, your tools and view depend on your role, your credentials, and (for clients) their plan.</p>')
    P.append("<h2>The coaching roles</h2>")
    P.append("<p>Every coach has a core coaching role and may hold approved specialist credentials. When a specialist joins a client’s care team, they lead their area and the rest of the team works around them.</p>")
    P.append(table(["Role", "What they do", "Can build programs?", "Leads nutrition?"], [
        ["Coach", "Main point of contact — training and overall progress.", "Yes", "Yes, unless a dietitian is assigned"],
        ["Dietitian", "Nutrition specialist.", "No", "Yes (overrides the coach)"],
        ["Physiotherapist", "Injury, rehab, and movement.", "Yes", "No"],
        ["Sports psychologist", "Mindset, motivation, performance.", "No", "No"],
        ["Mobility coach", "Flexibility and movement quality.", "Yes", "If no dietitian"],
        ["Head coach", "A senior coach who also leads team plans.", "Yes", "As above"],
    ]))
    P.append(callout("Specialists are add-on services (launching soon)", "Nutrition (dietitian) and physiotherapy are launching soon as optional add-ons a client attaches to any plan — these credentials staff those add-ons. Until they launch, the core plans are coaching-only, and the coach handles training and nutrition. Parts 3 and 4 cover the dietitian and physiotherapist roles in full."))
    P.append("<h2>Experience levels</h2>")
    P.append("<p>Coaches and dietitians also carry a professional level set by admin: Junior, Senior, or Lead. Your level reflects experience and seniority, unlocks a few permissions (Senior and Lead coaches can invite their own clients), and — importantly — sets both the client price and your pay on the 1:1 plans. See your compensation in section 2.13.</p>")
    P.append(table(["Level", "What it means"], [
        ["Junior", "Newer coaches building their roster."],
        ["Senior", "Experienced coaches; can invite their own clients; command a higher client price."],
        ["Lead", "Most senior; can invite clients, take on the most complex cases, and command the top client price."],
    ]))
    P.append("<h2>The four client plans</h2>")
    P.append("<p>Clients choose one plan when they join. It sets who coaches them and how training is delivered. The Team Plan is a flat 10 KWD/month; the three 1:1 plans are priced by the assigned coach’s level.</p>")
    P.append(PLANS_CLIENT)
    P.append("<p>Client price by plan and coach level (KWD/month):</p>")
    P.append(PRICING_LADDER)
    P.append(callout("Add-ons", "On any plan a client can add one-off extras — single sessions or session packs. Nutrition (dietitian) and physiotherapy add-ons are launching soon (pending licensing)."))
    P.append("<h2>Client account states</h2>")
    P.append("<p>Knowing a client’s status tells you what they can see and what they’re waiting on.</p>")
    P.append(ACCOUNT_STATES)
    P.append("</div>")

    P.append('<div class="chapter"><h1>2 &nbsp;For coaches — every feature</h1>')
    P.append('<p class="lead">Everything you can do as a coach, grouped by area, each with a description and steps. Notes mark anything that depends on your level (Junior / Senior / Lead) or on being a head coach.</p>')

    P.append("<h2>2.1 &nbsp;Getting set up</h2>")
    P.append(feat("Completing your coach profile", "Your public profile is what clients see when choosing a coach — bio, qualifications, and specialisms.",
     ["Open My Profile.", "Write your bio, add qualifications (one per line), and pick your specialization tags.", "Add your photo and contact details and save — your profile then awaits admin approval."]))
    P.append(feat("Completing training mode", "New coaches finish a short in-app video course before going live; completing it activates your account.",
     ["From your dashboard (which shows only Training + My Profile until activated), open Training.", "Watch each required video, tick “I watched and understand”, and Mark as Complete.", "When every required video is done, your account activates automatically."]))

    P.append("<h2>2.2 &nbsp;Your dashboard</h2>")
    P.append(feat("Reading your coach dashboard", "A “what needs you today” home: a needs-attention banner, KPI tiles, today’s tasks, an activity feed, and your capacity.",
     ["Log in to land on your dashboard.", "Start with the needs-attention banner and today’s tasks, then scan the activity feed."]))
    P.append(feat("Working needs-attention &amp; today's tasks", "Surfaces the most time-sensitive work — pending approvals, pending nutrition changes, missed check-ins, and quiet clients.",
     ["Read each item in the banner and task list.", "Tap an item to jump straight to that client and the right tab."]))
    P.append(feat("Checking your capacity", "Shows how full you are across each plan type so you know when you can take more clients.",
     ["Open the capacity card.", "Read spots-left / at-capacity per service; a warning appears as you near full."]))
    P.append(feat("Checking your earnings", "A current-month summary of what you’ve earned across your clients (see section 2.13 for how pay is calculated).",
     ["Read the compensation summary on your dashboard for the month-to-date total.", "Open the Payouts tab in My Clients for the full per-client breakdown."]))

    P.append("<h2>2.3 &nbsp;Client directory &amp; approvals</h2>")
    P.append(feat("Approving or declining a new client", "New clients wait in your queue until you approve them to proceed.",
     ["Open My Clients and the Pending Approvals section.", "Open the client to review their onboarding details.", "Choose Approve (moves them to the next step and emails them) or Decline."]))
    P.append(feat("Searching and filtering your roster", "Find clients fast across Pending, Awaiting Payment, Active, and At-Risk groups.",
     ["Use the search box and plan filter at the top of My Clients.", "Expand or collapse sections; watch for unread-message and deload badges on each row."]))
    P.append(feat("Inviting a client — Senior / Lead only", "Send an onboarding link that pre-assigns a new client to you.",
     ["In My Clients, choose Invite Client.", "Enter their details and the plan, and send the invite."],
     note="<b>Senior and Lead coaches only.</b> Team-plan invites are offered to head coaches."))
    P.append(feat("Adding an exempt client — Head Coach only", "Create a client account that skips the standard activation step.",
     ["In My Clients, choose Add Exempt Client.", "Complete the details and confirm."]))
    P.append(feat("Opening a client's overview", "Each client has one consolidated workspace with tabbed tools.",
     ["Click any client row to open their Client Overview.", "Use the secondary nav to move between tabs (see 2.4)."]))

    P.append("<h2>2.4 &nbsp;The client overview workspace</h2>")
    P.append('<p class="desc">One page per client with eight tabs (six for dietitians — see Part 3).</p>')
    P.append(feat("Overview tab", "An at-a-glance snapshot: nutrition phase, last workout, last weigh-in, a pending-adjustments nudge, and the client’s deload requests.",
     ["Open the client and stay on Overview.", "Read the stat tiles and act on any nudge or deload request."]))
    P.append(feat("Progress tab", "Phase-scoped nutrition graphs plus a training volume chart.",
     ["Open Progress to review weight, body-fat, circumference, and training volume trends."]))
    P.append(feat("Workouts tab", "The client’s assigned programs, a drill-down into days/modules, a log viewer of what they actually did, and an adherence summary.",
     ["Open Workouts.", "Expand a program to inspect days and modules, or open a session log to see set-by-set entries."]))
    P.append(feat("Sessions tab", "A digest of the client’s direct sessions and add-on session packs, with logging for eligible staff.",
     ["Open Sessions to see upcoming and recent sessions.", "As primary coach/admin, toggle the calendar to schedule or edit; on an add-on pack, eligible staff can Log session."]))
    P.append(feat("Messages tab", "The coach-to-client thread for that client.",
     ["Open Messages, type, and send. Edit or delete your own messages from their menu."]))
    P.append(feat("Care Team tab", "The roster of the primary coach plus specialists, with a staff-only chat.",
     ["Open Care Team to view the team and (as primary coach/admin) add or discharge specialists.", "Use the staff chat to coordinate about the client — the client can’t see it."]))
    P.append(feat("Profile tab", "Read-only demographics, subscription summary, and onboarding metadata.",
     ["Open Profile to review the client’s stats and submission summary, with a link to the full medical submission."]))

    P.append("<h2>2.5 &nbsp;Building programs</h2>")
    P.append('<p class="desc">Available to coaches who can build programs (general coach, physiotherapist, mobility coach). The hub is Program Library with Macrocycles, Mesocycles, and Drafts.</p>')
    P.append(feat("Creating/editing a program in the calendar builder", "Edit a program template in a week-by-day grid.",
     ["Open Program Library and create a new program or open an existing one.", "Navigate the weeks; on a day, choose + Add session and set its title, type, and timing.", "Add exercises and prescriptions (sets, reps, tempo, effort, rest) within each session.", "Use the session menu to edit, copy, publish/unpublish, or delete."]))
    P.append(feat("Copying a week", "Reuse a week’s structure to build the next.",
     ["In the calendar builder, choose Copy Week.", "Pick the source and target weeks and confirm."]))
    P.append(feat("Publishing sessions", "Only published sessions deliver to clients.",
     ["Publish each session from its menu, or use Publish All to release every draft."]))
    P.append(feat("Building a plan on the Planning Board (muscle builder)", "A drag-and-drop, multi-week planner built around muscles and sessions, with live volume and frequency analytics.",
     ["Open the Planning Board (Drafts tab) and create a plan.", "On a day, add a session, then use the inline + picker to place muscles or activities.", "Tune each slot’s sets, reps, tempo, and effort; edit individual sets as needed.", "Switch week tabs to plan multiple weeks; watch the volume, frequency, and progression panels.", "Optionally add a deload week, save as a draft or preset, and attach recommended videos."]))
    P.append(feat("Converting a plan into a program", "Turn a finished Planning Board plan into a deliverable program.",
     ["In the Planning Board, choose Create Program.", "Confirm the details — IGU builds the program, auto-filling exercises where a slot has none."]))
    P.append(feat("Assigning a program", "Deliver a published program to a client or a whole team.",
     ["From the program, choose Assign.", "Pick a client (or team) and a start date and confirm."],
     note="<b>Head Coach:</b> team assignment fans the program out to every active member at once."))
    P.append(feat("Chaining macrocycles", "Connect several programs into a longer (months-long) training arc.",
     ["Open the Macrocycles tab.", "Create a macrocycle and add programs in sequence; open any member to edit it."],
     note="Dietitians cannot build or assign programs — the Programs area shows a subrole notice for them."))

    P.append("<h2>2.6 &nbsp;Nutrition coaching</h2>")
    P.append('<p class="desc">On the client’s Nutrition tab. Editable when you have permission; read-only if a dietitian leads that client (see Part 3).</p>')
    P.append(feat("Setting a nutrition phase", "Set the client’s calorie target and macros, with the math handled for you and demographics pre-filled.",
     ["Open the client’s Nutrition tab → Overview.", "Adjust the pre-filled age/gender/height/weight if needed, set the goal type and rate, and save the phase."]))
    P.append(feat("Making weekly adjustments", "Raise or lower calories week to week based on progress.",
     ["Open the Adjustments inner tab.", "On a week card, choose Increase or Decrease, set the amount and notes, and apply."]))
    P.append(feat("Scheduling a diet break or refeed", "Plan short, structured food increases.",
     ["In Adjustments, use the Diet break or Refeed controls.", "Set the dates and confirm."]))
    P.append(feat("Approving or rejecting a client's adjustment request", "Review changes the client requested before they take effect.",
     ["In Adjustments, find the pending request with its macro-delta preview.", "Choose Approve or Reject."]))
    P.append(feat("Reviewing graphs and leaving notes", "Track long-run progress and keep private coaching notes.",
     ["Open the History inner tab.", "Review the weight/body-fat/circumference graphs and add notes in the notes panel."]))

    P.append("<h2>2.7 &nbsp;Sessions &amp; availability</h2>")
    P.append(feat("Publishing your availability", "Create the slots clients can book.",
     ["Open Sessions → Manage Time Slots.", "Add a slot: date, start time, duration, count, type, and location.", "Toggle slots available or blocked as needed."]))
    P.append(feat("Managing client bookings", "Handle the sessions clients have booked with you.",
     ["In Sessions, open Upcoming Sessions.", "Mark a session Complete, or Cancel it if needed."]))

    P.append("<h2>2.8 &nbsp;Teams — Head Coach only</h2>")
    P.append('<p class="desc">Head coaches run up to three group coaching tracks. Non-head-coaches see a “Head Coach role required” message here.</p>')
    P.append(feat("Creating a team", "Start a new group coaching track.",
     ["Open My Teams and choose Create Team.", "Set the name, tags, max members, and description, and save."]))
    P.append(feat("Assigning or changing a team's program", "Deliver one program to the whole team.",
     ["Open the team’s detail view.", "Choose Assign Program (or Change Program), preview the calendar, and confirm — it fans out to active members."]))
    P.append(feat("Managing team members", "See and manage who is on the team.",
     ["In the team detail view, review the member list.", "Members join or move via the client-side team picker; manage the roster here."]))
    P.append(feat("Deleting a team", "Remove a team you no longer need.",
     ["In the team detail view, choose Delete and confirm — members are safely detached for reassignment."]))

    P.append("<h2>2.9 &nbsp;Content assignment</h2>")
    P.append(feat("Assigning content to a client", "Push specific educational videos or learning paths to clients.",
     ["From Educational Videos, open a video and choose Assign to client (or use the linked-content list on the Nutrition tab).", "Pick the client and set a due date if needed."]))
    P.append(feat("Tracking assigned content", "See who has watched what.",
     ["Open Assigned Content.", "Review each assignment’s status, due date, and completion; remove one if it’s no longer needed."]))

    P.append("<h2>2.10 &nbsp;Care team &amp; specialists</h2>")
    P.append(feat("Adding a specialist to a client — Primary coach / admin", "Bring a dietitian, physio, or other specialist onto a client’s care team.",
     ["Open the client’s Care Team tab and choose Add specialist.", "Search active coaches by specialty and set their scope (full or view-only).", "Confirm."]))
    P.append(feat("Discharging a specialist", "Remove a specialist at the next renewal.",
     ["In the Care Team tab, choose Discharge on the specialist and confirm."]))
    P.append(feat("Managing your own specialist assignments", "See the clients where you’re a specialist (not the primary coach).",
     ["Open My Assignments.", "Review your specialty and scope per client; use End at renewal to step off a client."]))

    P.append("<h2>2.11 &nbsp;Deload requests</h2>")
    P.append(feat("Responding to a client's deload request", "Approve and schedule a recovery week, or decline with a reason.",
     ["Open the client’s Overview tab (or use the dashboard badge).", "In the deload panel, choose Approve (pick a preset, optional week, and message) or Decline (add a reason — the client gets a short cool-off)."]))

    P.append("<h2>2.12 &nbsp;Exercise library &amp; profile</h2>")
    P.append(feat("Browsing exercises", "A searchable library of exercises with video previews, used as a reference and inside the builders.",
     ["Open Exercise Library.", "Search or filter by muscle, equipment, or category, and open an exercise to preview its video."]))
    P.append(feat("Editing your profile", "Keep your public profile and private contact details current.",
     ["Open My Profile.", "Update your photo, bio, qualifications, specializations, contact details, and social links, and save."]))

    P.append("<h2>2.13 &nbsp;Your compensation</h2>")
    P.append('<p class="desc">You’re paid a share of each client’s monthly price. Because the 1:1 prices rise with your level, levelling up raises both the price you command and your pay — your earnings and IGU’s margin grow together.</p>')
    P.append("<p>Per client, per month, on the 1:1 plans:</p>")
    P.append(COACH_PAY)
    P.append("<p><b>Team Plan</b> pays the head coach a flat <b>6 KWD</b> per member per month. Your dashboard shows a live month-to-date total, and the Payouts tab breaks it down per client.</p>")
    P.append(callout("How your level moves your pay", "Each 1:1 tier has a Junior, Senior, and Lead price, and you’re paid a fixed share of it. Moving up a level raises the client price and your pay together. Promotions are based on certifications, tenure, retention, and client results."))
    P.append(callout("Guardrails", "Every subscription keeps a minimum IGU margin, and discounts are capped (up to 30%, shared proportionally) — so pay and margin stay balanced. Your admin can explain any blocked or discounted case."))
    P.append(callout("Coming soon", "Retention and adherence bonuses, a referral bonus, and head-coach profit-share are being finalised. Compensation for the upcoming nutrition and physiotherapy add-ons (planned around 21 KWD per nutrition client and 33 KWD per physio client, per month) will be confirmed when those add-ons launch."))
    P.append("</div>")

    P.append('<div class="chapter"><h1>3 &nbsp;For dietitians</h1>')
    P.append('<p class="lead">A dietitian is a nutrition specialist. You hold a coach account with an approved Dietitian credential, so your app is focused on nutrition. This part explains everything specific to your role; for shared tools (messaging, the client overview, your profile) the coach steps in Part 2 also apply.</p>')
    P.append(callout("Nutrition is an add-on launching soon", "Dietitian-led nutrition is rolling out as an optional add-on a client attaches to their plan (pending licensing). This part describes how your role works so you’re ready at launch; the add-on’s pricing and pay will be confirmed then."))
    P.append("<h2>3.1 &nbsp;How you join a client's care team</h2>")
    P.append("<p>You don’t pick up clients from a general queue. A client’s primary coach (or an admin) adds you to that client’s care team when the client has the nutrition add-on. Once added, that client appears in your lists.</p>")
    P.append(callout("You lead nutrition", "When you’re assigned to a client, you are the source of truth for their nutrition. The client’s general coach is automatically switched to read-only on nutrition, so guidance never conflicts."))
    P.append("<h2>3.2 &nbsp;Your dashboard</h2>")
    P.append(feat("Reading the dietitian dashboard", "A nutrition-focused home rather than the full coaching overview.",
     ["Log in to see your tiles: Active Phases, Pending Adjustments, and Drifting Clients (those who haven’t weighed in lately).", "Work the Today’s Tasks list and review Recent Weigh-ins.", "Tap any client to open straight into their Nutrition tab."]))
    P.append("<h2>3.3 &nbsp;Your nutrition clients roster</h2>")
    P.append(feat("Using the Nutrition clients list", "A dedicated roster of every client you’re assigned to, bucketed by what needs action.",
     ["Open Nutrition clients from the sidebar.", "Scan the buckets: Action needed, Active phases, Drifting, and Ended/paused.", "Each row shows the phase, goal, last weigh-in, and pending-adjustment count; open one to act."]))
    P.append("<h2>3.4 &nbsp;The client overview (your view)</h2>")
    P.append("<p>Your client overview has six tabs and defaults to Nutrition. The Workouts and Sessions tabs are hidden because training isn’t your area. You keep Overview, Progress, Nutrition, Messages, Care Team, and Profile.</p>")
    P.append("<h2>3.5 &nbsp;The full nutrition workflow</h2>")
    P.append(feat("Setting a client's nutrition phase", "Define the calorie target and macros for a goal block, with the math handled and demographics pre-filled.",
     ["Open the client’s Nutrition tab → Overview.", "Confirm or adjust the pre-filled age, gender, height, and starting weight.", "Choose the goal type (fat loss / maintenance / muscle gain) and the target rate.", "Save — the phase becomes the client’s active targets."]))
    P.append(feat("Making weekly adjustments", "Tune calories up or down each week based on the client’s actual progress versus the plan.",
     ["Open the Adjustments inner tab.", "On the relevant week card, choose Increase or Decrease, enter the amount and a note, and apply.", "The client sees their new targets immediately."]))
    P.append(feat("Scheduling diet breaks &amp; refeeds", "Plan structured higher-calorie periods to support adherence and recovery.",
     ["In Adjustments, use the Diet break or Refeed scheduler.", "Set the dates and confirm."]))
    P.append(feat("Handling client adjustment requests", "Approve or reject changes a client requested before they take effect.",
     ["In Adjustments, open a pending request and review its macro-delta preview.", "Choose Approve or Reject."]))
    P.append(feat("Reviewing progress &amp; recommending steps", "Use graphs and step recommendations to guide the plan.",
     ["Open History for weight, body-fat, and circumference graphs.", "Set or review step recommendations where shown.", "Add private notes for the care team in the notes panel."]))
    P.append(feat("Reviewing the weekly check-in", "Read the client’s weekly self-report to inform your next adjustment.",
     ["Open the client’s nutrition data and read their latest weekly check-in (adherence, changes, notes).", "Adjust targets if needed."]))
    P.append("<h2>3.6 &nbsp;Communicating</h2>")
    P.append("<p>You message the client directly in the shared <b>Messages</b> thread (alongside the rest of their care team), and you coordinate privately with the other staff in the <b>Care Team</b> tab’s staff-only chat, which the client can’t see.</p>")
    P.append("<h2>3.7 &nbsp;What's different for you</h2>")
    P.append("<ul>"
     "<li>You can’t build or assign training programs — the Programs area shows a notice.</li>"
     "<li>Workouts and Sessions tabs are hidden on the client overview.</li>"
     "<li>On mobile your dock swaps Programs for Nutrition clients.</li>"
     "<li>Your professional level (Junior / Senior / Lead) is set by admin.</li>"
     "</ul>")
    P.append("</div>")

    P.append('<div class="chapter"><h1>4 &nbsp;For physiotherapists &amp; other specialists</h1>')
    P.append('<p class="lead">Physiotherapists, sports psychologists, and mobility coaches are specialist credentials added to a client’s care team. This part focuses on the physiotherapist role in detail, then summarises the others. Shared tools (messaging, client overview, profile) follow the coach steps in Part 2.</p>')
    P.append(callout("Specialist add-ons launching soon", "Physiotherapy and the other specialist add-ons are rolling out soon (pending licensing). This part describes how the role works so you’re ready at launch; the add-on’s pricing and pay will be confirmed then."))
    P.append("<h2>4.1 &nbsp;The physiotherapist role</h2>")
    P.append("<p>As a physiotherapist you focus on injury, rehabilitation, and movement quality. You can do everything a training coach can in terms of programming, plus record injury-assessment notes. You join a client’s care team rather than taking clients from a general queue.</p>")
    P.append(table(["You can", "You cannot"], [
        ["Build and assign training/rehab programs", "Lead nutrition (that’s the dietitian/coach)"],
        ["Record injury-assessment notes", "Run team plans (unless you’re also a head coach)"],
        ["Use the full program builder &amp; Planning Board", "See clients you haven’t been assigned to"],
        ["Message the client and the care team", "Access the admin area"],
    ]))
    P.append("<h2>4.2 &nbsp;How you join a client</h2>")
    P.append(feat("Being added to a care team", "A client’s primary coach or an admin adds you as a specialist, with a scope of full (can edit) or view-only.",
     ["The primary coach opens the client’s Care Team tab and adds you, choosing your scope.", "The client now appears in your My Assignments list.", "Open the client to begin working."]))
    P.append(feat("Using My Assignments", "Your list of clients where you’re a specialist.",
     ["Open My Assignments.", "Each row shows your specialty and scope (Full or View only).", "Open a client, or use End at renewal to step off."]))
    P.append("<h2>4.3 &nbsp;Building rehab programs</h2>")
    P.append(feat("Programming for a client", "You use the same program tools as a coach to build and assign rehab or training plans.",
     ["Open Program Library or the Planning Board.", "Build the plan day by day (sessions, exercises, sets, reps, tempo, effort).", "Publish and assign it to your client with a start date."],
     note="This requires full scope. If you were added view-only, you can review but not edit — ask the primary coach to widen your scope."))
    P.append("<h2>4.4 &nbsp;Injury assessment notes</h2>")
    P.append("<p>Physiotherapists hold permission to record injury-assessment notes on a client, which the care team can see. Use these to document findings, restrictions, and rehab guidance so the coach programs around them. Notes are part of the client’s care record — keep them factual and relevant.</p>")
    P.append("<h2>4.5 &nbsp;Communicating</h2>")
    P.append("<p>Message the client in the shared <b>Messages</b> thread and coordinate privately with the other staff in the <b>Care Team</b> staff chat. Flag any movement restrictions to the primary coach so the training plan respects them.</p>")
    P.append("<h2>4.6 &nbsp;Other specialists</h2>")
    P.append('<div class="cards">'
     '<div class="card"><div class="h">Sports psychologist</div><p>Focuses on mindset, motivation, and performance. Joins the care team like any specialist, communicates through the same threads, and can record sports-psychology notes. Does not build training programs.</p></div>'
     '<div class="card"><div class="h">Mobility coach</div><p>Focuses on flexibility and movement quality. Can build and assign programs just like a training coach, and joins clients through the care team.</p></div>'
     '</div>')
    P.append(callout("Holding more than one credential", "A coach can hold several approved credentials at once (for example coach + physiotherapist). Your app then combines all the capabilities those credentials grant."))
    P.append("</div>")

    P.append('<div class="chapter"><h1>5 &nbsp;How roles &amp; plans change what you see</h1>')
    P.append('<p class="lead">The same app adapts to your role. Here’s a side-by-side of the differences.</p>')
    P.append("<h2>By role</h2>")
    P.append(table(["What changes", "General coach", "Dietitian", "Physiotherapist", "Head coach"], [
        ["Dashboard", "Full coaching overview", "Nutrition-focused", "Coaching overview", "Coaching + teams"],
        ["Build programs", "Yes", "No", "Yes", "Yes"],
        ["Lead nutrition", "If no dietitian", "Yes", "No", "If no dietitian"],
        ["Team plans", "No", "No", "No", "Yes (up to 3)"],
        ["Client overview tabs", "All 8", "6 (nutrition-first)", "All 8", "All 8"],
        ["Invite clients", "Senior/Lead only", "Senior/Lead only", "Senior/Lead only", "Yes"],
    ]))
    P.append("<h2>Client plans, for context</h2>")
    P.append("<p>A client’s plan decides who is on their care team and how their nutrition is handled.</p>")
    P.append(PLANS_CLIENT)
    P.append("</div>")

    P.append('<div class="chapter"><h1>6 &nbsp;Frequently asked questions</h1>')
    P.append(faqgroup("Getting started as a coach", [
        ("Why can't I access the platform yet?", "New coaches complete a short in-app training course first. Finishing all required videos activates your account automatically."),
        ("How do I get more clients?", "Senior and Lead coaches can invite clients directly; otherwise clients are assigned to you and appear in My Clients."),
        ("How do I complete my profile?", "Open My Profile, add your bio, qualifications, and specialisms, and save — it then awaits admin approval."),
    ]))
    P.append(faqgroup("Coaching &amp; communication", [
        ("How do I message a client?", "Open the client’s Messages tab (or the client appears in your threads). Your whole care team shares one thread per client."),
        ("A client has a dietitian — why can't I edit their nutrition?", "When a dietitian is on the care team they lead nutrition, so your nutrition controls become read-only for that client. You still manage everything else."),
        ("How do I add a specialist to a client?", "From the client’s Care Team tab, choose Add specialist, pick the person and scope, and confirm."),
        ("How do I respond to a deload request?", "Open the client’s Overview tab and use the deload panel to approve (with a preset and message) or decline (with a reason)."),
    ]))
    P.append(faqgroup("Programs &amp; nutrition", [
        ("What’s the difference between the calendar builder and the Planning Board?", "The calendar builder edits a program week-by-day; the Planning Board is a drag-and-drop muscle-and-session planner with live analytics that you convert into a program."),
        ("Why isn’t my program showing for the client?", "Only published sessions deliver. Publish each session, or use Publish All, then assign the program with a start date."),
        ("How do I assign a program to a whole team?", "Head coaches choose Assign Program on the team; it fans out to every active member at once."),
    ]))
    P.append(faqgroup("Pay &amp; levels", [
        ("How am I paid?", "You earn a share of each client’s monthly price. On the 1:1 plans the price — and your pay — rises with your level (Junior, Senior, Lead). The Team Plan pays the head coach a flat fee per member. See section 2.13 for the per-level table."),
        ("Does a client pay more if I’m a senior coach?", "Yes — on the 1:1 plans the client price is set by your level, so a Senior or Lead coach commands a higher price (and higher pay) than a Junior. The client sees the price before they confirm."),
        ("How do I level up?", "Promotions are based on certifications, tenure, client retention, and results, and are set by admin. Moving up raises both your share and the price you command."),
        ("When do specialist add-ons (nutrition/physio) pay out?", "Those add-ons are launching soon; their pricing and pay are being finalised and will be confirmed at launch."),
    ]))
    P.append(faqgroup("For dietitians &amp; physiotherapists", [
        ("How do I get clients as a dietitian or physio?", "You’re added to a client’s care team by their primary coach or an admin — you don’t pick from a general queue. Assigned clients appear in your lists."),
        ("As a dietitian, why can't I see Workouts or Sessions?", "Those tabs are hidden for dietitians because training isn’t your area; your overview focuses on nutrition."),
        ("As a physio, why can't I edit a program?", "You were likely added with view-only scope. Ask the primary coach to widen your scope to full."),
        ("Can I hold more than one credential?", "Yes — for example coach + physiotherapist. Your app combines all the capabilities those credentials grant."),
    ]))
    P.append("</div>")

    P.append('<div class="chapter"><h1>7 &nbsp;Glossary of IGU terms</h1>')
    P.append('<p class="lead">Plain-language definitions of the words you’ll see around IGU.</p>')
    P.append(table(["Term", "What it means"], [
        ["Care team", "Everyone coaching a client — the primary coach plus any specialists (dietitian, physio, etc.)."],
        ["Subrole / specialist", "An approved credential (dietitian, physio, sports psychologist, mobility coach) that grants extra capabilities."],
        ["Level", "A coach’s seniority — Junior / Senior / Lead — set by admin; on 1:1 plans it sets the client price and the coach’s pay."],
        ["Head coach", "A senior coach who leads team plans."],
        ["Care team scope", "Whether a specialist can edit (full) or only view (view-only) a client."],
        ["Phase", "A block of a client’s nutrition plan with a goal and its own targets."],
        ["Macros", "Macronutrients — protein, carbohydrates, and fat — and the daily targets for each."],
        ["Adjustment", "A weekly change to a client’s calories/macros based on progress."],
        ["Diet break / refeed", "Short, planned higher-calorie periods during a fat-loss phase."],
        ["Deload", "A planned lighter recovery week in a training plan."],
        ["RIR / RPE", "Effort measures. RIR = reps in reserve; RPE = rate of perceived exertion."],
        ["Tempo", "How fast each rep is performed."],
        ["Program / mesocycle", "A training plan over a block of weeks."],
        ["Macrocycle", "A longer arc (months) made of several connected programs."],
        ["Planning Board", "The drag-and-drop muscle-and-session planner used to design programs."],
        ["Preset", "A saved set of prescription columns a coach reuses across programs."],
        ["Team plan", "A group coaching track led by a head coach."],
        ["Add-on", "An optional extra (session, pack, or specialist) a client adds to their plan."],
        ["PAR-Q", "The client’s health-readiness questionnaire completed at sign-up."],
    ]))
    P.append("</div>")

    P.append('<div class="chapter"><h1>8 &nbsp;Getting help</h1>')
    P.append("<h2>Getting help</h2>")
    P.append("<ul>"
        "<li><b>Check the client’s status</b> — much of what you can do for a client depends on their account status and plan; their overview shows both.</li>"
        "<li><b>Use the care-team chat</b> — coordinate with other staff on a client privately from the Care Team tab.</li>"
        "<li><b>Contact admin/support</b> — for approvals, credentials, level changes, or anything platform-related, use your usual admin contact.</li>"
        "</ul>")
    P.append(callout("Quick troubleshooting",
        "<ul style='margin-bottom:0'>"
        "<li><b>Can’t see a client?</b> You only see clients assigned to you (or where you’re on the care team).</li>"
        "<li><b>Can’t build programs?</b> Program building needs the right credential (coach, physio, or mobility coach).</li>"
        "<li><b>Nutrition is read-only?</b> A dietitian is assigned to that client and leads nutrition.</li>"
        "<li><b>Teams area locked?</b> Team plans are for head coaches.</li>"
        "</ul>", warn=True))
    P.append(callout("Welcome to the unit", "That’s the full tour of your coaching tools. Your dashboard always surfaces what needs you next — start there each day."))
    P.append("</div>")

    render(P, "IGU_Coach_Guide.pdf")

if __name__ == "__main__":
    build_client()
    build_coach()
    print("done ->", OUT_DIR)

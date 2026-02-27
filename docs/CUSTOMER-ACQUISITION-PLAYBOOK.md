# EdgeAI — Customer Acquisition Playbook

> **Revenue, outreach, pricing, and validation.** The operational playbook for getting from zero to 1,000 paying users. Update as you execute — track what worked, what didn't, and conversion rates.
>
> For product vision and principles, see [vision.md](../vision.md).
> For business strategy and competitive analysis, see [strategy.md](strategy.md).
> For milestone tracking, see [ROADMAP.md](ROADMAP.md).
> For technical documentation, see [TECHNICAL.md](TECHNICAL.md).

---

## Revenue Model

### Pricing Tiers

| Tier | Who | What They Get | Price |
|------|-----|---------------|-------|
| **Free** | Everyone | One small model, local-only, basic indexing | $0 |
| **Pro** | Individuals | Encrypted sync, larger models, unlimited indexing, cloud escalation credits | $9/mo or $99/yr |
| **Enterprise** | Companies | MDM deployment, admin dashboard (usage analytics, no content visibility), team knowledge bases, compliance dashboard | $15–30/seat/mo |
| **Platform** (Phase 3) | Developers | Runtime + context API access, marketplace listing | Rev share + API fees (20–30% cut) |

### The Obsidian Pricing Model (Proven)

[Obsidian grew to $2M revenue with 18 people](https://getlatka.com/companies/obsidian.md). Study and replicate:

- **Free for personal use, paid for sync and commercial use.** The core product is free. Revenue comes from features that require infrastructure ($8/mo for sync) and enterprise licenses.
- **No telemetry by default.** Community feedback and their own judgment drive decisions. Massive trust signal.
- **Plugin ecosystem.** Community plugins create lock-in because users' workflows depend on plugins only available on your platform.
- **Local-first as identity, not just feature.** Users don't say "I use a note-taking app that stores locally." They say "I use Obsidian."

Your equivalent:
- Free for personal use (local-only, no sync)
- Pro: $9/mo — encrypted cross-device sync, larger model support, cloud escalation credits
- Enterprise: per-seat license with compliance dashboard
- Plugin/MCP ecosystem: developers extend the context engine for their use case

### Pricing Validation (Van Westendorp)

Run this survey via Tally.so on your waitlist thank-you page or to your first 50 subscribers:

```
Four questions:
1. "At what monthly price would [Product] be so expensive
    you wouldn't consider it?" → TOO EXPENSIVE

2. "At what price would it start to seem expensive, but you'd
    still consider it?" → EXPENSIVE BUT ACCEPTABLE

3. "At what price would it be good value?" → ACCEPTABLE

4. "At what price would it be so cheap you'd question its quality?"
    → TOO CHEAP
```

Plot the four curves. The intersection of "too expensive" and "too cheap" gives you the acceptable price range. The intersection of "expensive but acceptable" and "acceptable" gives you the optimal price point.

**Expected outcome** based on comparable tools (Obsidian Sync = $8/mo, 1Password = $3/mo, Setapp = $10/mo): acceptable range of $7–14/month with an optimal price around $9–11/month.

### Dummy Checkout Validation

On the landing page, add a "Start Pro Free Trial" button that leads to a checkout-looking page:

```
Pro Plan — $9/month after 14-day free trial
 ✓ Encrypted sync across all devices
 ✓ Larger models (7B parameter)
 ✓ Cloud escalation credits

 [Enter email to start trial →]
```

When they submit: "You're on the waitlist! We'll notify you when Pro launches."

Count how many people reach this page and submit their email. This measures intent to pay. A >30% form completion rate on this page = strong signal.

---

---

# The Sequence

Ship nothing. Charge something. Learn everything.

```
Week 1     Seed communities (no product, just the problem)
Week 2     Launch landing page + waitlist
Week 3     First enterprise cold outreach (5 companies)
Week 4     "Show HN" post or equivalent
Week 5+    Concierge MVP for first 10 users
Month 2    Pricing survey to waitlist
Month 3    First paying customer (before any code)
```

---

---

# Landing Page

**Tool:** Carrd ($19/year) for speed, or Framer (free tier) for design quality. For developers: a GitHub repository with a well-designed README is also a landing page.

**The page has one job:** Capture an email address. Everything else is secondary.

## Consumer / Developer Version

```
Headline:   "AI that works offline. Knows your docs. Tells no one."
Subhead:    "A personal AI assistant that runs entirely on your device.
             Index your notes, code, and files. Ask anything.
             Zero API keys. Zero subscriptions. Zero data sent anywhere."
CTA:        [Join the waitlist →]
Trust:      "We'll never send your data anywhere. Because we can't —
             it never leaves your machine."
```

## Enterprise Version (separate page or toggle)

```
Headline:   "Your employees are pasting company secrets into ChatGPT.
             Here's the fix."
Subhead:    "77% of employees share sensitive data with AI tools
             on personal, unmanaged accounts. [LayerX 2025]
             [Product] runs entirely on the employee's device.
             Nothing ever hits a server. Zero compliance risk."
CTA:        [Request a pilot →]
Social proof: Samsung case study. The 77% statistic.
              A network monitor screenshot.
```

## Conversion Elements That Work for Privacy Products

- A screen recording (not a polished demo) of a network monitor showing zero outbound requests while using the product
- The specific number: "0 bytes sent to any server"
- Open source badge: "Core engine is open source — verify it yourself [GitHub →]"
- No tracking pixel on the page itself (practice what you preach — use privacy-respecting analytics like Plausible or Fathom, or none at all)

**Metrics that matter:**
- >20% email capture rate from landing page visitors = strong signal
- >5% "Request a pilot" for enterprise = strong signal
- <5% overall conversion = the headline or offer needs work

---

---

# Community Seeding

Do this the week before you launch the landing page. The goal is to have 50 people asking "where do I sign up?" before you post the link.

## Hacker News — "Ask HN" Format

Post this before you have a product. No product mention.

```
Title: "Ask HN: How is your company handling AI tools and sensitive data?"

Body:
We've been looking at how enterprises are dealing with the
ChatGPT/Copilot data leak problem. A recent study found 77% of
employees paste sensitive company data into AI tools from personal
accounts. Samsung banned all GenAI after engineers submitted
semiconductor source code to ChatGPT.

Curious: what policies or tools have you seen actually work?
Are people banning AI entirely (which seems to fail),
or finding technical solutions?
```

This post generates discussion AND surfaces your potential customer. Reply to every comment. Do NOT mention you're building something yet. Learn.

Two weeks later, post "Show HN:" with the working MVP.

## "Show HN" Post (Week 3–4)

```
Title: "Show HN: [Product Name] — local AI with personal context,
        runs fully offline, no account needed"
```

The HN post succeeds if:
- You can demo it with a GIF showing: drag-and-drop a folder → ask a question → it answers from your docs, no network calls
- The GitHub repo is live, MIT licensed, with a clear README
- The Chrome Web Store listing is live with screenshots

First 100 users come from this post. They will file issues, suggest use cases, and tell you what the wedge actually is.

## r/LocalLLaMA

The audience here already runs local LLMs. They are pre-sold on the concept. They want quality of life improvements, not education.

```
Title: "I built a Chrome extension that runs Phi-3 locally
        with personal document RAG — here's what I learned about
        making it actually fast"

Body: Technical post about the architecture decisions.
      web-llm vs transformers.js comparison.
      How you handled MV3 offscreen document limitations.
      Performance numbers.
      "Here's the prototype if anyone wants to test it: [link]"
```

This gets upvoted by technical users because it's genuinely useful. The link is your waitlist or GitHub.

## r/privacy

Problem-first post, no product mention at first:

```
Title: "77% of employees paste company secrets into ChatGPT daily
        — what does a fix actually look like?"

Body: Share the LayerX data. Samsung story.
      "I've been thinking about this problem.
       The only real solution is AI that runs on-device so there's
       nothing to leak. Has anyone built or used something like this?"
```

Reply to responses. Gauge interest. Drop the waitlist link in a follow-up comment, not the post.

## Twitter/X — Thread Format

```
Thread hook: "77% of your employees are pasting company secrets
              into ChatGPT right now.
              Not maliciously. They just want to do their job faster.
              Here's the real problem — and what I think the fix
              looks like. (thread)"

Tweet 2: Samsung story
Tweet 3: The 82% personal accounts stat (invisible to IT)
Tweet 4: "Banning AI doesn't work — they use their phone"
Tweet 5: "The only real fix: AI that runs on their device.
          Nothing to leak if nothing goes to a server."
Tweet 6: "I'm building this. If this resonates, join the waitlist:
          [link]"
```

Tag @localllm, @privacyguides, relevant security researchers.

---

---

# Enterprise Pre-Sales

## Finding Contacts

**LinkedIn Sales Navigator (free trial):** Search "CISO" or "VP Engineering" + company size 100–2000 employees + industry (tech, finance, healthcare, legal). Export 50 names.

**Hunter.io (free tier):** Find email format for a target company. Verify emails before sending.

**Twitter/X:** Follow CISOs who tweet about AI risk. Many are vocal. Direct engagement on their existing threads > cold email.

## The Sales Motion: One Email, One Demo, One Pilot

1. **One email** — "77% of your employees are pasting company data into ChatGPT right now. Here is a study. We built the fix." Send to CISO, VP Engineering, or Head of IT at 50 target companies. No sales deck. Just the statistic and a Calendly link.

2. **One demo** — 20 minutes. Open a browser, open a network monitor, show zero outbound requests, ask a sensitive question, show the answer. Done. Let compliance teams verify it themselves.

3. **One pilot** — 10 developers, 3 months, free. Measure: daily active usage, queries per user, documents indexed. At the end of 3 months, convert to a per-seat license. Every enterprise pilot that converts becomes a case study.

**The Samsung story is your opener for every enterprise call.** Know it cold. Use it without attribution if needed — just "a major semiconductor company" until Samsung is comfortable being named.

## Cold Email Template — CISO / VP Engineering

```
Subject: Your engineers are pasting code into ChatGPT right now

Hi [Name],

Quick data point: 77% of enterprise employees share company data
with AI tools from personal accounts. 82% of those are completely
invisible to IT. [LayerX 2025 report]

Samsung banned all GenAI tools after engineers submitted semiconductor
source code to ChatGPT. The problem isn't intent — it's that
ChatGPT is just there and banning it doesn't work.

I'm building an AI assistant that runs entirely on the employee's
device. Nothing ever hits a server — architecturally guaranteed,
not policy-enforced. I can demonstrate it with a live network monitor.

Looking for 3 companies to pilot this for free for 90 days.
10 developers, zero cost, your feedback shapes the product.

20 minutes to show you? [Calendly link]

[Name]
```

**Send to:** CISO > VP Engineering > Head of IT Security. In that order.

**Volume:** Send to 50 companies. Expect 3–5 replies. 2–3 calls. 1 pilot agreement. This is a good outcome.

## Cold Email Template — Follow-Up (Day 5)

```
Subject: Re: Your engineers are pasting code into ChatGPT right now

Hi [Name],

Following up — the problem is getting worse, not better.
The LayerX data shows 3.8 sensitive pastes per employee per day,
and 82% come from personal accounts your IT team can't see.

Happy to do a 20-minute no-slide demo: just a browser,
a network monitor, and a real question.

Worth a look? [Calendly link]

[Name]
```

## Cold Email Template — Developer Advocate / Engineering Manager

```
Subject: Cursor-like AI assistant, but nothing leaves your machine

Hi [Name],

Quick question: do your engineers paste proprietary code into
ChatGPT or Copilot? Most do — and most NDAs say they shouldn't.

I built a Chrome extension that runs a 3.8B language model
entirely in the browser. No server, no API key, no data exfil.
It indexes your local codebase and answers from it.

Think Cursor, but fully local. 20-minute demo? [Calendly link]

[Name]
```

## Design Partner Agreement (1 page)

```
DESIGN PARTNER AGREEMENT

[Company] agrees to:
- Deploy [Product] to 5–10 employees for 90 days
- Provide weekly feedback via 30-minute calls or written summary
- Introduce us to 2 other potential customers if the pilot is successful

[Your company] agrees to:
- Provide the product at no cost for the pilot period
- Give [Company] a 50% perpetual discount on any future paid plan
- Treat [Company]'s feedback as confidential
- Not use [Company]'s name publicly without written permission

This is not a binding commercial agreement.
It is a mutual commitment to explore a working relationship.

Signed: _________________ Date: _________
```

**3 signed design partner agreements from companies with >50 employees = validated enterprise demand.**

---

---

# Waitlist Mechanics

**Tool:** Tally.so (free, privacy-respecting, no tracking) or a simple Airtable form. Not Mailchimp — too corporate for this audience.

## Referral Loop

Add a post-signup page:
```
"You're #[N] on the list.

 Move up the list by sharing with people who care about privacy:

 [Share link] → Each person who joins via your link
                 moves you up 10 spots.

 At position #1–100 you get: free Pro for 1 year."
```

Viral Loops ($49/mo) or Waitlist.gg (free) handle the referral mechanics. Alternatively, build it in 30 minutes with Tally + Airtable + a simple position calculation.

## Milestone Emails (keep the list warm)

- **Day 1:** "You're on the list. Here's what we're building and why."
- **Week 2:** "Here's the problem we keep hearing from enterprise teams..."
- **Week 4:** "Early technical preview — here's how we're solving the offline inference problem."
- **Week 6:** "We have 500 people on the list. Here's our roadmap."
- **Month 2:** "Pricing survey — 2 minutes, helps us build the right product."

## Signal Thresholds

- 500 consumer waitlist signups = build the MVP
- 5 enterprise design partner conversations = build enterprise features
- 50 people who complete the dummy checkout = launch the Pro tier

---

---

# Chrome Web Store

## Early Listing (Before Product Is Fully Built)

Minimum requirements:
- `manifest.json` (MV3, minimal)
- One icon: 128x128px PNG
- A popup HTML file (can just be a landing page with an email signup)
- A description (can describe the planned product)
- Screenshots (can be mockups)
- Privacy policy (required — can be a simple one-pager)
- $5 one-time developer registration fee

## SEO — Search Terms to Optimize For

- "local AI assistant" (high intent)
- "private AI chrome extension" (niche, low competition)
- "private AI" (growing search volume)
- "offline AI" (underserved)
- "AI without ChatGPT" (frustration search)
- "AI no API key" (developer intent)

These are the search terms people use when they are frustrated with cloud AI pricing or privacy concerns. The Web Store has 3.3 billion Chrome users as the top of funnel.

**Expected organic discovery:** AI assistant extensions in the Chrome Web Store get 10–50 installs/day from organic search once listed, growing as the store index catches up (2–4 weeks after publish). At launch, having even 100 installs from the "beta" listing creates social proof for the real launch post.

---

---

# The Concierge MVP

Validate the experience, not the technology.

The goal: deliver the product experience manually to 10 users before the product is polished. Understand what they actually need, not what you assumed.

**Recruit:** 5 developers and 5 enterprise users. For each:
1. Set up Ollama locally on their machine (30-minute call). Install a RAG model (LlamaIndex + Phi-3).
2. Help them index their most important documents manually.
3. Do a 1-hour "interview session" where they ask questions and you watch what they reach for.
4. Ask: "What would have to be true for you to use this every day?" and "What broke your trust in that session?"

**What you learn:**
- What data sources they actually want indexed (often surprising)
- Where the quality bar needs to be for their specific queries
- What the first 10 minutes of setup needs to look like
- What would make them pay vs. churn

**10 concierge users = enough to know what to build first.** You are not building for 10 people. You are learning from 10 people so you build for 10,000.

---

---

# Reference Cases

Companies that sold before they built:

**Superhuman (email client):** Built a $30/month email product with a 6-month waitlist. Manual onboarding call for every new user. Rejected users who didn't fit the ICP. Generated exclusivity and word-of-mouth before the product was polished. Reached $30M ARR.

**Linear (project management):** Built a waitlist with a beautiful landing page and a detailed changelog before most features existed. Developers shared the landing page because the design and copywriting were so good they aspired to use it. 10K waitlist before launch.

**Loom (async video):** Validated with a "coming soon" page and reached out personally to every early signup. The first 100 users got personal attention. Those users became advocates and wrote the first reviews.

**Raycast (developer tools):** Personal outreach to 100 developers. Manual onboarding. Built every early feature based on direct feedback from those 100. Now millions of users.

**Common pattern:** Personal outreach + manual onboarding + direct feedback loop. Not ads, not viral loops, not Product Hunt launches (those come after). The first 100 users are a research project, not a growth metric.

---

---

# Validation Checklist

```
PRE-LAUNCH (before writing code)
[ ] Landing page live (Carrd/Framer) with email capture
[ ] 1 "Ask HN" or community post published (no product mention)
[ ] 50 waitlist signups from organic interest
[ ] 5 enterprise cold emails sent to CISO/VP Eng targets
[ ] 1 enterprise design partner conversation completed
[ ] Pricing survey sent to first 50 signups
[ ] 10 concierge users identified and interviewed
[ ] Chrome Web Store beta listing published
[ ] 1 technical blog post or thread published
[ ] Dummy checkout conversion rate measured

SIGNAL TO START BUILDING:
[ ] 200+ waitlist signups
[ ] 1 signed design partner agreement
[ ] Pricing survey shows $8-12/month acceptable range
[ ] 3+ concierge users say "I'd use this every day if..."
    and their answer is achievable with the current architecture

POST-LAUNCH:
[ ] "Show HN" post with working demo GIF
[ ] GitHub repo live (MIT license, clear README)
[ ] Chrome Web Store listing live with screenshots
[ ] First 100 installs
[ ] First paying customer (Pro tier)
[ ] First enterprise pilot signed (design partner agreement)
```

---

---

# Tracking (Fill In As You Execute)

| Action | Date | Result | Notes |
|--------|------|--------|-------|
| Landing page live | | | URL: |
| "Ask HN" post | | | Link: |
| r/LocalLLaMA post | | | Link: |
| r/privacy post | | | Link: |
| Twitter/X thread | | | Link: |
| Enterprise email batch 1 (N companies) | | | Response rate: |
| Enterprise email batch 2 (N companies) | | | Response rate: |
| First demo call | | | Company: |
| Design partner agreement signed | | | Company: |
| Chrome Web Store listing live | | | URL: |
| Waitlist count at week 2 | | | Count: |
| Waitlist count at month 1 | | | Count: |
| Pricing survey sent | | | Optimal price: |
| Dummy checkout conversion rate | | | Rate: |
| "Show HN" post | | | Link: |
| First 100 installs | | | Date: |
| First paying customer | | | Date: |
| First enterprise pilot started | | | Company: |

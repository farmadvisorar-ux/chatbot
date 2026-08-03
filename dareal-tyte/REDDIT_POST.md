# Reddit post — r/SaaS

**Title options (pick one):**

1. `Shipped a $18 one-time SaaS instead of a subscription. Here's the reasoning, and the Stripe trap that nearly broke launch day.`
2. `Stripe test mode lied to me: live checkout failed on the first real request`
3. `I charged one-time instead of MRR for my new SaaS. Talk me out of it.`

---

## Body

Just shipped **DAREALTYTE** — you point it at an expired domain, it pulls the old site out of the Internet Archive, cleans it up, and redeploys it live in one click. Built for people who buy expired domains and want the original site back without rebuilding it by hand.

Two decisions/lessons worth more than the launch itself:

---

### 1. I priced it $18 one-time for 6 months. No subscription. No auto-renew.

Everyone says recurring or die. I went the other way, and I want to be honest about why rather than pretend it's genius:

**The usage pattern isn't recurring.** Someone buys an expired domain, restores it, done. They might not touch the tool again for months. Charging $9/mo for something used in three bursts a year means most months I'm billing someone for nothing — which is exactly how you earn chargebacks and "how do I cancel" emails.

**No auto-renew was deliberate.** Access just expires. No card on file quietly charging someone who forgot. That kills MRR predictability, and I know it. But surprise renewal charges are the #1 thing that turns a happy customer into a hostile review, and at $18 the trust is worth more than the retention math.

**The obvious counterargument:** I've capped my own LTV and made revenue lumpy and unforecastable. If someone's got a strong case for why this is dumb at this price point, I genuinely want to hear it before I have enough customers that changing is painful.

---

### 2. Stripe test mode passes ≠ live mode works

This one cost me launch day and I've seen almost nobody mention it.

I tested the entire payment flow in test mode. Checkout sessions created, webhooks fired, access granted, idempotency verified on redelivery, forged signatures rejected. Green across the board.

Flipped to live keys. **First real request failed:**

```
Invalid line_items[0]: the product tax code is missing.
Product tax code is required for Managed Payments,
which is enabled by default on your account.
```

Stripe's Managed Payments (automatic tax) is on by default on live accounts and **isn't enforced in test mode.** So there's an entire class of failure that is structurally invisible until real money is on the line.

Fix was one param — but the lesson is the part that matters: **your test-mode green checkmark is not evidence your live payments work.** After flipping to live keys, re-verify with a real request before you tell anyone the door is open. I caught it because I re-ran the whole flow against live instead of assuming the switch was clerical.

(Separate rabbit hole: whether to actually collect sales tax is a real business decision, not a code one. I opted out for now rather than inventing a tax classification, but that's unfinished business, not solved.)

---

### 3. Bonus infra bug that would've silently killed every conversion

Every site the tool deployed was landing behind a **Vercel login wall.** The deploy succeeded, the URL returned, everything looked fine from my side — but clicking it sent users to a Vercel sign-in page instead of their restored site.

Cause: my Vercel team had deployment protection on by default for new projects. Every single customer would have paid $18 and gotten a link that appeared broken.

Nothing errored. No exception, no failed request, no alert. It returned HTTP 200 the entire time. **The only way to find it was to click the link like a customer would.**

That's now the thing I keep relearning: the bugs that kill SaaS conversions mostly don't throw. They return 200 with the wrong thing inside.

---

### Where it actually stands

Zero customers so far — it went live basically today, so I'm not going to pretend there's traction to report. Stripe is live and verified end-to-end. Auth still runs on dev keys, which is fine at zero volume and the first thing I fix if anything picks up.

Happy to answer anything about the archive/recovery side, the Stripe stuff, or the pricing call. Especially the pricing call.

---

## Posting notes (not part of the post)

- **Check r/SaaS's current self-promo rules before posting.** They shift, and some periods require specific flair or restrict links in the body. If links are restricted, drop the URL and let people ask — that usually performs better there anyway.
- **I did not include the product URL in the body above.** On r/SaaS a post that leads with a link reads as an ad and gets buried. Put it in a comment, or add it only if the sub's rules allow it. Your call.
- **I made no traction claims** — no revenue, user counts, or waitlist numbers, since you have none yet and fabricated numbers are both dishonest and trivially caught. If you *do* have real numbers I don't know about, tell me and I'll work them in.
- **The pricing section invites disagreement on purpose.** That's the engagement engine on r/SaaS — people reply to argue. Be ready to actually defend the one-time model in comments.

# post-x-promote-bounty-01

[![make.fun · post-x-promote-make-your-own-bounty-01](https://make.fun/badge/post-x-promote-make-your-own-bounty-01.svg)](https://make.fun/bounty/post-x-promote-make-your-own-bounty-01?utm_source=github&utm_medium=readme&utm_campaign=post-x-promote-make-your-own-bounty-01)
[![rank](https://make.fun/badge/post-x-promote-make-your-own-bounty-01/zeinrefo-code/post-x-promote-bounty-01/rank.svg)](https://make.fun/bounty/post-x-promote-make-your-own-bounty-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=post-x-promote-make-your-own-bounty-01)
[![reward](https://make.fun/badge/post-x-promote-make-your-own-bounty-01/zeinrefo-code/post-x-promote-bounty-01/reward.svg)](https://make.fun/bounty/post-x-promote-make-your-own-bounty-01?utm_source=github&utm_medium=readme&utm_campaign=post-x-promote-make-your-own-bounty-01)

# Promote make.fun's make-your-own-bounty post on X (post-x-promote-make-your-own-bounty-01)

## The concept

Anyone can now post a bounty of their own on make.fun: describe a task, set
the reward, and agents compete for it. The promo image says it in one
picture — the make.fun ghost, white with a thick black outline and sparkle
eyes, holding its magenta coin with a white star, floating next to a
**NEW BOUNTY** card under the headline **MAKE YOUR OWN BOUNTY**:

> AGENTS COMPETE. WINNERS GET PAID.
> make.fun/sponsor/new

Everything is drawn in code by `main.ts` (Node 22 stdlib only, no network,
no downloaded images): purple gradient sky, stars, the ghost, the bounty
card, and all the text — drawn extra large so it stays legible when the
post is seen at timeline size.

## Files

- `promo.png` — the promo image, 1024x1024 PNG. Attach this to the X post.
- `main.ts` — the entry program: draws `promo.png` (byte-identical to the
  committed file) into the output directory and copies `POST.json` from the
  repo root to `/output`. (POST.json is NOT in this repo yet — it is created
  after the post exists, holding the real X post URL.)
- `POST-DRAFT.txt` — the exact text to post with `promo.png` (217 chars).

## Exact post text (217 characters)

Post this text with `promo.png` attached, as a **quote** of make.fun's post
https://x.com/makefunai/status/2124915864336236646, from the public X
account @Scfff77:

> Punya kerjaan buat AI agent? Bikin bounty sendiri aja — tentuin hadiahnya, biar agent-agent bersaing, yang terbaik dibayar.
> Make your own bounty on @makefunai: https://make.fun/sponsor/new
> makefun-plum-aquarium-salmon

It carries the required line (make.fun link + @makefunai tag), the play code
`makefun-plum-aquarium-salmon` (code 0 of 4 for this competition, verified
via `GET /api/competitions/post-x-promote-make-your-own-bounty-01/play-code`),
and quotes make.fun's make-your-own-bounty post.

## Next steps (for the submit run, not this build)

1. Muhammad posts the image on X from @Scfff77 as a quote of
   https://x.com/makefunai/status/2124915864336236646 with the text above.
2. Create `POST.json` with
   `{"url": "https://x.com/Scfff77/status/<id>"}`.
3. Run the kit's pre-submit check, bundle the transcripts of this session,
   and submit before the deadline: 26 Nov 2026 18:35 UTC (27 Nov 01:35 WIB).
   Places go by the post's replies + reposts + quotes; views and likes move
   nothing. Top 50 share $250 (1st $50).

---

<sub>Entered on [make.fun](https://make.fun/?ref=bxjfe4p7&utm_source=github&utm_medium=readme&utm_campaign=post-x-promote-make-your-own-bounty-01) · AI agents build software for cash rewards</sub>

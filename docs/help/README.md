# IGU Help, FAQ & Tutorial content

Source content for the in-app **Help**, **FAQ**, and **Tutorial** sections, and for the two branded user-guide PDFs. Plain Markdown so the team can maintain it in one place and feed it into the relevant pages.

> **IMPORTANT — commit this folder.** These files are not auto-saved anywhere else. If they stay untracked in git, a `git clean`/reset will delete them (this already happened once — the compiled PDFs survived only because they’re git-ignored). After any change, commit `docs/help/`. See `HANDOFF.md`.

## Files

| File | Use it for |
|------|------------|
| [`build_guide.py`](./build_guide.py) | **Single source for the two PDFs.** Contains all guide content and generates `IGU_Client_Guide.pdf` + `IGU_Coach_Guide.pdf` into the project root. Run: `pip install weasyprint` then `python3 docs/help/build_guide.py`. |
| [`faq.md`](./faq.md) | Frequently asked questions (client + coach), grouped by topic. Source for the FAQ accordion. |
| [`tutorials.md`](./tutorials.md) | Step-by-step how-to walkthroughs (client + coach). Source for the Tutorials section. |
| [`glossary.md`](./glossary.md) | Plain-language definitions of IGU terms. Source for a glossary / tooltips. |
| [`HANDOFF.md`](./HANDOFF.md) | How another Cowork session connects to this work and updates it. |

## Deliverables (project root, git-ignored)

- `IGU_Client_Guide.pdf` — complete branded guide for clients.
- `IGU_Coach_Guide.pdf` — complete branded guide for coaches, dietitians, and specialists.
- `IGU_Feature_Reference.docx` — internal/technical feature reference.

## Conventions & current model (June 2026)

- Branding is always **IGU**, never "Dr Iron". Brand red `#DA1B2B` on near-black.
- Audience is end users — plain language, no code-level detail.
- **Pricing is finalised and included:** four plans (1:1 Complete retired). Team Plan flat **10 KWD/mo**; 1:1 Online **30/35/40**, Hybrid **95/110/125**, In-Person **145/175/215** by coach level (Junior/Senior/Lead). Coach pay per client/mo: Online **17/24/30**, Hybrid **70/88/105**, In-Person **107/141/183**; Team head-coach flat **6**.
- **Nutrition (dietitian) and physiotherapy are add-ons "launching soon"** (pending Kuwait MOH licensing) — described but not sold yet.
- Keep `build_guide.py` and the `.md` files in step when editing. `build_guide.py` is the source for the PDFs; the `.md` files mirror that content for the website.

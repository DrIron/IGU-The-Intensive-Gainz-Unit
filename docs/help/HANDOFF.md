# Handoff — updating the IGU guides in another Cowork session

This folder (`docs/help/`) holds the Help / FAQ / Tutorial content and the generator for the two branded PDF guides (client + coach). Here is how a different Cowork session connects to it and updates it.

## 1. Connect to this work

In the new Cowork session, **open the same project folder**:

```
~/Projects/intensive-gainz-unit-main
```

(In Cowork: start a session and grant access to that folder, or use the folder picker.) Once connected, the session can read and edit everything here — there’s no other "linking" step. All the work lives in this repo.

## 2. What’s where

- **Content source for the PDFs:** `docs/help/build_guide.py` — all guide text lives in this one file as Python strings, and it generates both PDFs.
- **Website source:** `docs/help/faq.md`, `tutorials.md`, `glossary.md` — plain Markdown for the in-app FAQ/Help/Tutorial sections.
- **Compiled outputs (project root, git-ignored):** `IGU_Client_Guide.pdf`, `IGU_Coach_Guide.pdf`, `IGU_Feature_Reference.docx`.

## 3. Update the guides

1. Edit the content in `build_guide.py` (for the PDFs) and the matching `.md` files (for the website). Keep them in step.
2. Regenerate the PDFs:
   ```bash
   pip install weasyprint        # one-time, if needed
   python3 docs/help/build_guide.py
   ```
   This writes `IGU_Client_Guide.pdf` and `IGU_Coach_Guide.pdf` into the project root.
3. Spot-check the PDFs (page counts were 17 client / 22 coach at last build).

## 4. Commit so it persists (do this every time)

These files are **not** auto-saved. Untracked files get wiped by `git clean`/reset — that’s already happened once (the PDFs only survived because they’re git-ignored). After any change, commit `docs/help/`:

```bash
cd ~/Projects/intensive-gainz-unit-main
git add docs/help/
git commit -m "docs(help): update client/coach guides + FAQ/tutorials"
```

(The PDFs/.docx in the root are git-ignored by design — they’re build outputs. Regenerate them from `build_guide.py` rather than committing them. If you want them versioned, force-add: `git add -f IGU_Client_Guide.pdf IGU_Coach_Guide.pdf`.)

## 5. Current state (June 2026)

- **Pricing is finalised and in the guides:** four plans (1:1 Complete retired); level-based 1:1 prices and per-level coach pay (see `README.md` for the numbers).
- **Add-ons (nutrition/physio) are "launching soon"** pending MOH licensing — described but not sold.
- **Next planned step: screenshots.** The cleanest approach is to add a labelled placeholder under each tutorial’s steps naming the screen to capture, then drop images in one-to-one. Ask and that scaffolding can be added to `build_guide.py`.

## 6. If you "made a lot of new app changes"

Tell the session what changed (new features, renamed screens, flow changes). It should:
1. Update the affected feature steps/descriptions in `build_guide.py` and the `.md` files.
2. Re-check the role/plan tables and FAQ for anything now stale.
3. Regenerate the PDFs and commit.

A fast way to catch drift is to re-audit the app surface (routes in `src/lib/routeConfig.ts`, pages in `src/pages/`, components in `src/components/`) against the guide sections — the original build was produced that way.

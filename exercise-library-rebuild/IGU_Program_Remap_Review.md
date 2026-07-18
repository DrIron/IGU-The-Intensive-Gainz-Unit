# IGU — Program Remap Review (legacy → canonical)

43 legacy exercises referenced by 456 `module_exercises` rows, remapped to the canonical library.

**Update (migration 4):** the 7 formerly-approximate (⚠) remaps are now **all exact**. Migration 4 adds
11 new exercises and reactivates 3 previously-deactivated rows, so:
- **3** of the ⚠ rows are the *same* legacy row, now reactivated in mig 4 — their program refs auto-resolve, no remap line (dropped from migration 3): Adductors BW Copenhagen Plank, Glute Med DB Side-Lying Abduction, Triceps Long M Overhead Extension.
- **4** of the ⚠ rows repoint to newly-added exercises, resolved **by name** in migration 3 (their uuids are runtime-random): Quads C-FT Step-Up, Glute Max DB Contralateral-Elevated Reverse Lunge, Glute Max SM Reverse Lunge, Mid Traps C-FT Standing Retraction Row.

Also in migration 4: reverse lunge moved **Quads → Glutes** (normal lunge stays under Quads); the two
`Quads {BB,DB} Reverse Lunge` rows are deactivated. Apply order: **migration 4, then migration 3.**

Legend below: ~~struck~~ target = original approximation; **bold** = the now-exact target.

| ⚠ | refs | Old (deactivated) | → | Canonical |
|---|---|---|---|---|
|  | 8 | Adductors BW Copenhagen Plank (M) | → | **Adductors BW Copenhagen Plank (M)** — reactivated (exact); no remap line |
|  | 8 | Adductors M Seated Adduction (S) | → | Adductors M Seated Adduction (M) |
|  | 8 | Gastrocnemius M Leg Press Calf Raise (S) | → | Gastrocnemius M Leg Press Calf Raise (M) |
|  | 8 | Tibialis C-FT Dorsiflexion (S) | → | Tibialis C-FT Dorsiflexion (M) |
|  | 8 | Abs BB Landmine Rotation (M) | → | Obliques BB Landmine Rotation (M) |
|  | 8 | Abs C-FT Kneeling Cable Crunch (S) | → | Core C-FT Kneeling Cable Crunch (S) |
|  | 8 | Abs C-FT Pallof Press (S) | → | Core C-FT Pallof Press (S) |
|  | 8 | Abs M Crunch (S) | → | Core M Machine Crunch (S) |
|  | 8 | Core DB Overhead Carry (M) | → | Systemic DB Single-Arm Overhead Carry (M) |
|  | 8 | Core DB Suitcase Carry (M) | → | Systemic DB Single-Arm Suitcase Carry (M) |
|  | 8 | Spinal Extensors BW 45 Degree Back Extension (L) | → | Spinal Erectors BW 45-Degree Back Extension (M) |
|  | 16 | Biceps Long C-AA Behind-Body Curl (L) | → | Biceps Long C-AA Arm's-Length Curl (L) |
|  | 16 | Brachialis C-FT Rope Hammer Curl (L) | → | Brachialis C-FT Arm's-Length Neutral Curl (L) |
|  | 8 | Glute Max TB Deadlift (M) | → | Glute Max TB Deadlift (L) |
|  | 8 | Glute Med DB Side-Lying Abduction (S) | → | **Glute Med DB Side-Lying Abduction (S)** — reactivated (exact); no remap line |
|  | 16 | Glute Med M Seated Hip Abduction (S) | → | Glute Med M 45-Degree Seated Abduction (S) |
|  | 8 | Hamstrings BB Romanian Deadlift (L) | → | Hamstrings BB Stiff-Legged Deadlift (L) |
|  | 32 | Iliac Lat M Close Neutral/Semi Supinated Pulldown (L) | → | Iliac Lat M Close Pulldown (S) |
|  | 8 | Lumbar Lat C-FT Narrow Grip Seated Row (M) | → | Lumbar Lat C-FT Seated Row (M/S) |
|  | 8 | Thoracic Lat BB Wide Overhand Row (M) | → | Thoracic Lat BB Bent-Over Row (M) |
|  | 8 | Thoracic Lat C-AA Single Arm Pull Around (M) | → | Thoracic Lat C-AA Single-Arm Pull-Around (L) |
|  | 8 | Thoracic Lat C-SG Single-Arm Pulldown (L) | → | Thoracic Lat C-SG Wide Single-Arm Pulldown (S) |
|  | 16 | Clavicular Pec M Incline Press (M) | → | Clavicular Pec M Incline Press (L/M/S) |
|  | 8 | Sternal Pec C-FS Seated Fly (S) | → | Sternal Pec C-SB Seated Fly (M) |
|  | 16 | Sternal Pec M Smith Flat Press (M) | → | Sternal Pec SM Flat Press (L) |
|  | 16 | Quads BB High Bar Back Squat (M) | → | Quads BB High-Bar Back Squat (L) |
|  | 16 | Quads C-FT Step-Up (M) | → | ~~Quads DB Step-Up (L)~~ **Quads C-FT Step-Up (L)** — new (by name) |
|  | 8 | Quads DB Contralateral Deficit Reverse Lunge (L) | → | ~~Quads DB Reverse Lunge (L)~~ **Glute Max DB Contralateral-Elevated Reverse Lunge (L)** — new (by name) |
|  | 8 | Quads M Hack Squat (M) | → | Quads M Hack Squat (L) |
|  | 8 | Quads M Seated Leg Extension (S) | → | Quads M Knee Extension (S) |
|  | 8 | Quads SM Reverse Lunge (M) | → | ~~Quads SM Smith Lunge (L)~~ **Glute Max SM Reverse Lunge (L)** — new (by name) |
|  | 8 | Anterior Delt BB Seated Overhead Press (M) | → | Anterior Delt BB Overhead Press (L) |
|  | 8 | Anterior Delt BB Standing Overhead Press (M) | → | Anterior Delt BB Overhead Press (L) |
|  | 16 | Anterior Delt DB Seated Overhead Press (M) | → | Anterior Delt DB Overhead Press (L) |
|  | 8 | Lateral Delt C-FT Lateral Raise (L) | → | Lateral Delt C-FT Raise (L/M/S) |
|  | 8 | Lateral Delt DB Standing Lateral Raise (S) | → | Lateral Delt DB Raise (S) |
|  | 16 | Lateral Delt M Lateral Raise (S) | → | Lateral Delt M Raise (M/S) |
|  | 16 | Posterior Delt C-FT Reverse Fly (L) | → | Posterior Delt C-FT Reverse Fly (M/S) |
|  | 8 | Triceps Lat+Med M Pressdown (S) | → | Triceps Lat+Med M Pressdown (M) |
|  | 16 | Triceps Long M Overhead Extension (L) | → | **Triceps Long M Overhead Extension (L)** — reactivated (exact); no remap line |
|  | 8 | Mid Traps C-FT Rope Face Pull (S) | → | ~~...Chest-Supported Retraction Row~~ **Mid Traps C-FT Standing Retraction Row (S)** — new (by name) |
|  | 2 | Mid Traps DB Chest-Supported Wide Row (S) | → | Mid Traps DB Chest-Supported Retraction Row (S) |
|  | 14 | Rhomboids M Close Grip Chest-Supported Row (S) | → | Rhomboids M Chest-Supported Row (S/M) |
-- ============================================================================
-- Food Logging — P0-lite seed: taxonomy, nutrient reference, and a starter set of
-- generic foods so P1's search / browse / log actually has something to work with.
--
-- This is a MODEST hand-curated set, NOT the USDA corpus. The full Foundation +
-- SR Legacy bulk ingest is the deferred "P0-ingest" slice; these rows are shaped
-- exactly as ingest will shape its own (source='usda_sr', per-100g normalized
-- nutrients, portions with densities), so ingest ADDS to this rather than
-- replacing it.
--
-- Nutrition figures are per 100 g, rounded from USDA SR Legacy. They are
-- representative, not lab-exact — the point is a working, honest starter catalog.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Nutrients. coach_visible = TRUE only for energy + the three macros (+ fibre,
-- which coaches already set a target for in nutrition_goals). Every micro is
-- FALSE, which is what lets P4 shape a macro-only coach payload by construction.
-- ---------------------------------------------------------------------------
INSERT INTO public.nutrients (key, name, unit, category, fdc_nutrient_number, display_order, coach_visible) VALUES
  ('energy',     'Energy',        'kcal', 'macro', '208', 1,  true),
  ('protein',    'Protein',       'g',    'macro', '203', 2,  true),
  ('fat',        'Fat',           'g',    'macro', '204', 3,  true),
  ('carb',       'Carbohydrate',  'g',    'macro', '205', 4,  true),
  ('fiber',      'Fibre',         'g',    'macro', '291', 5,  true),
  ('sugar',      'Sugars',        'g',    'micro', '269', 6,  false),
  ('sat_fat',    'Saturated fat', 'g',    'micro', '606', 7,  false),
  ('sodium',     'Sodium',        'mg',   'micro', '307', 8,  false),
  ('potassium',  'Potassium',     'mg',   'micro', '306', 9,  false),
  ('calcium',    'Calcium',       'mg',   'micro', '301', 10, false),
  ('iron',       'Iron',          'mg',   'micro', '303', 11, false),
  ('vitamin_c',  'Vitamin C',     'mg',   'micro', '401', 12, false),
  ('vitamin_d',  'Vitamin D',     'mcg',  'micro', '328', 13, false)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- §4.1b taxonomy — 2 levels, exactly the starter set in the plan's table.
-- ---------------------------------------------------------------------------
INSERT INTO public.food_categories (name, parent_id, sort_order, icon) VALUES
  ('Protein',              NULL, 1,  'Beef'),
  ('Carbs',                NULL, 2,  'Wheat'),
  ('Vegetables',           NULL, 3,  'Carrot'),
  ('Fruits',               NULL, 4,  'Apple'),
  ('Fats',                 NULL, 5,  'Droplet'),
  ('Dairy',                NULL, 6,  'Milk'),
  ('Snacks & sweets',      NULL, 7,  'Cookie'),
  ('Beverages',            NULL, 8,  'CupSoda'),
  ('Condiments & sauces',  NULL, 9,  'Soup'),
  ('Prepared & restaurant',NULL, 10, 'ChefHat'),
  ('Supplements',          NULL, 11, 'Pill')
ON CONFLICT (parent_id, name) DO NOTHING;

WITH parents AS (SELECT id, name FROM public.food_categories WHERE parent_id IS NULL)
INSERT INTO public.food_categories (name, parent_id, sort_order)
SELECT sub.name, p.id, sub.ord
FROM parents p
JOIN (VALUES
  ('Protein', 'Poultry', 1), ('Protein', 'Red meat', 2), ('Protein', 'Fish & seafood', 3),
  ('Protein', 'Eggs', 4), ('Protein', 'Dairy protein', 5), ('Protein', 'Plant protein', 6),
  ('Protein', 'Protein supplements', 7),
  ('Carbs', 'Grains & cereals', 1), ('Carbs', 'Bread & bakery', 2), ('Carbs', 'Rice & pasta', 3),
  ('Carbs', 'Starchy veg', 4), ('Carbs', 'Legumes', 5),
  ('Vegetables', 'Leafy greens', 1), ('Vegetables', 'Cruciferous', 2), ('Vegetables', 'Other vegetables', 3),
  ('Fruits', 'Fresh', 1), ('Fruits', 'Dried', 2),
  ('Fats', 'Oils & butters', 1), ('Fats', 'Nuts & seeds', 2), ('Fats', 'Avocado & olives', 3),
  ('Dairy', 'Milk & yogurt', 1), ('Dairy', 'Cheese', 2),
  ('Snacks & sweets', 'Bars', 1), ('Snacks & sweets', 'Chocolate & confectionery', 2),
  ('Snacks & sweets', 'Chips & crackers', 3),
  ('Beverages', 'Water & soft drinks', 1), ('Beverages', 'Juices', 2), ('Beverages', 'Coffee & tea', 3),
  ('Condiments & sauces', 'Dressings', 1), ('Condiments & sauces', 'Spreads', 2),
  ('Condiments & sauces', 'Cooking sauces', 3),
  ('Supplements', 'Performance', 1)
) AS sub(parent, name, ord) ON sub.parent = p.name
ON CONFLICT (parent_id, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Foods. Shaped as the USDA ingest will shape its own rows.
--   serving_default_g -> the picker's default amount when no last-used unit exists.
-- ---------------------------------------------------------------------------
WITH cat AS (
  SELECT c.id, c.name AS sub, p.name AS parent
  FROM public.food_categories c JOIN public.food_categories p ON c.parent_id = p.id
),
seed(name, sub, kcal, protein, fat, carb, fiber, sugar, sat_fat, sodium, serving_g) AS (VALUES
  -- Poultry / meat / fish / eggs
  ('Chicken breast, skinless, raw',   'Poultry',            120, 22.5, 2.6,  0,    0,   0,   0.7,  45,  120),
  ('Chicken thigh, skinless, raw',    'Poultry',            143, 19.7, 6.5,  0,    0,   0,   1.8,  86,  100),
  ('Turkey breast, raw',              'Poultry',            111, 24.6, 0.7,  0,    0,   0,   0.2,  57,  100),
  ('Beef mince, 5% fat, raw',         'Red meat',           137, 21.4, 5.0,  0,    0,   0,   2.2,  66,  125),
  ('Beef steak, sirloin, raw',        'Red meat',           158, 22.6, 6.8,  0,    0,   0,   2.6,  55,  200),
  ('Lamb leg, raw',                   'Red meat',           201, 20.2, 12.7, 0,    0,   0,   5.4,  63,  150),
  ('Salmon, Atlantic, raw',           'Fish & seafood',     208, 20.4, 13.4, 0,    0,   0,   3.1,  59,  150),
  ('Tuna, canned in water, drained',  'Fish & seafood',     116, 25.5, 0.8,  0,    0,   0,   0.2,  247, 100),
  ('Shrimp, raw',                     'Fish & seafood',      85, 20.1, 0.5,  0,    0,   0,   0.1,  119, 100),
  ('Egg, whole, raw',                 'Eggs',               143, 12.6, 9.5,  0.7,  0,   0.4, 3.1,  142, 50),
  ('Egg white, raw',                  'Eggs',                52, 10.9, 0.2,  0.7,  0,   0.7, 0,    166, 33),
  -- Dairy protein / supplements
  ('Greek yogurt, 0% fat',            'Dairy protein',       59, 10.2, 0.4,  3.6,  0,   3.2, 0.1,  36,  170),
  ('Cottage cheese, low fat',         'Dairy protein',       72, 12.4, 1.0,  2.7,  0,   2.7, 0.6,  330, 100),
  ('Whey protein isolate powder',     'Protein supplements',373, 82.0, 1.5,  6.0,  0,   3.0, 0.8,  330, 30),
  ('Casein protein powder',           'Protein supplements',360, 78.0, 2.0,  6.5,  0,   4.0, 1.0,  400, 30),
  ('Creatine monohydrate',            'Performance',          0,  0,   0,    0,    0,   0,   0,    0,   5),
  -- Plant protein / legumes
  ('Tofu, firm',                      'Plant protein',      144, 15.8, 8.7,  2.8,  2.3, 0.6, 1.3,  14,  100),
  ('Lentils, dry',                    'Legumes',            352, 24.6, 1.1,  63.4, 10.7,2.0, 0.2,  6,   80),
  ('Chickpeas, canned, drained',      'Legumes',            139, 7.1,  2.6,  22.5, 6.4, 3.9, 0.3,  241, 120),
  ('Black beans, canned, drained',    'Legumes',             91, 6.0,  0.3,  16.6, 6.9, 0.3, 0.1,  238, 120),
  -- Grains / rice / pasta / bread
  ('Oats, rolled, dry',               'Grains & cereals',   389, 16.9, 6.9,  66.3, 10.6,0.9, 1.2,  2,   40),
  ('Rice, white, long-grain, dry',    'Rice & pasta',       365, 7.1,  0.7,  80.0, 1.3, 0.1, 0.2,  5,   75),
  ('Rice, brown, dry',                'Rice & pasta',       370, 7.9,  2.9,  77.2, 3.5, 0.9, 0.6,  7,   75),
  ('Pasta, dry',                      'Rice & pasta',       371, 13.0, 1.5,  74.7, 3.2, 2.7, 0.3,  6,   75),
  ('Quinoa, dry',                     'Grains & cereals',   368, 14.1, 6.1,  64.2, 7.0, 0,   0.7,  5,   60),
  ('Bread, wholemeal',                'Bread & bakery',     247, 13.0, 3.4,  41.3, 7.0, 5.6, 0.7,  455, 40),
  ('Potato, raw',                     'Starchy veg',         77, 2.0,  0.1,  17.5, 2.1, 0.8, 0,    6,   150),
  ('Sweet potato, raw',               'Starchy veg',         86, 1.6,  0.1,  20.1, 3.0, 4.2, 0,    55,  150),
  -- Vegetables
  ('Broccoli, raw',                   'Cruciferous',         34, 2.8,  0.4,  6.6,  2.6, 1.7, 0,    33,  100),
  ('Spinach, raw',                    'Leafy greens',        23, 2.9,  0.4,  3.6,  2.2, 0.4, 0.1,  79,  100),
  ('Cucumber, raw',                   'Other vegetables',    15, 0.7,  0.1,  3.6,  0.5, 1.7, 0,    2,   100),
  ('Tomato, raw',                     'Other vegetables',    18, 0.9,  0.2,  3.9,  1.2, 2.6, 0,    5,   100),
  -- Fruit
  ('Banana, raw',                     'Fresh',               89, 1.1,  0.3,  22.8, 2.6, 12.2,0.1,  1,   118),
  ('Apple, raw',                      'Fresh',               52, 0.3,  0.2,  13.8, 2.4, 10.4,0,    1,   182),
  ('Blueberries, raw',                'Fresh',               57, 0.7,  0.3,  14.5, 2.4, 10.0,0,    1,   100),
  ('Dates, dried',                    'Dried',              282, 2.5,  0.4,  75.0, 8.0, 63.4,0,    2,   24),
  -- Fats
  ('Olive oil',                       'Oils & butters',     884, 0,    100,  0,    0,   0,   13.8, 2,   14),
  ('Butter',                          'Oils & butters',     717, 0.9,  81.1, 0.1,  0,   0.1, 51.4, 643, 10),
  ('Almonds, raw',                    'Nuts & seeds',       579, 21.2, 49.9, 21.6, 12.5,4.4, 3.8,  1,   30),
  ('Peanut butter, smooth',           'Spreads',            588, 25.1, 50.4, 19.6, 6.0, 9.2, 10.3, 429, 32),
  ('Avocado, raw',                    'Avocado & olives',   160, 2.0,  14.7, 8.5,  6.7, 0.7, 2.1,  7,   150),
  -- Dairy & beverages (the ml/L cases — these carry a density)
  ('Milk, whole',                     'Milk & yogurt',       61, 3.2,  3.3,  4.8,  0,   5.1, 1.9,  43,  250),
  ('Milk, skimmed',                   'Milk & yogurt',       34, 3.4,  0.1,  5.0,  0,   5.1, 0.1,  42,  250),
  ('Cheddar cheese',                  'Cheese',             403, 24.9, 33.1, 1.3,  0,   0.5, 21.1, 653, 30),
  ('Orange juice',                    'Juices',              45, 0.7,  0.2,  10.4, 0.2, 8.4, 0,    1,   250),
  ('Coca-Cola',                       'Water & soft drinks', 42, 0,    0,    10.6, 0,   10.6,0,    4,   330),
  ('Coffee, black, brewed',           'Coffee & tea',         1, 0.1,  0,    0,    0,   0,   0,    2,   240)
)
INSERT INTO public.foods (source, name, category_id, serving_default_g, is_verified, approval_status, owner_user_id)
SELECT 'usda_sr'::public.food_source, s.name, c.id, s.serving_g, true, 'approved'::public.food_approval_status, NULL
FROM seed s
JOIN cat c ON c.sub = s.sub
WHERE NOT EXISTS (
  SELECT 1 FROM public.foods f WHERE f.name = s.name AND f.owner_user_id IS NULL
);

-- Nutrients per 100 g for the seeded foods.
WITH seed(name, kcal, protein, fat, carb, fiber, sugar, sat_fat, sodium) AS (VALUES
  ('Chicken breast, skinless, raw',   120, 22.5, 2.6,  0,    0,   0,   0.7,  45),
  ('Chicken thigh, skinless, raw',    143, 19.7, 6.5,  0,    0,   0,   1.8,  86),
  ('Turkey breast, raw',              111, 24.6, 0.7,  0,    0,   0,   0.2,  57),
  ('Beef mince, 5% fat, raw',         137, 21.4, 5.0,  0,    0,   0,   2.2,  66),
  ('Beef steak, sirloin, raw',        158, 22.6, 6.8,  0,    0,   0,   2.6,  55),
  ('Lamb leg, raw',                   201, 20.2, 12.7, 0,    0,   0,   5.4,  63),
  ('Salmon, Atlantic, raw',           208, 20.4, 13.4, 0,    0,   0,   3.1,  59),
  ('Tuna, canned in water, drained',  116, 25.5, 0.8,  0,    0,   0,   0.2,  247),
  ('Shrimp, raw',                      85, 20.1, 0.5,  0,    0,   0,   0.1,  119),
  ('Egg, whole, raw',                 143, 12.6, 9.5,  0.7,  0,   0.4, 3.1,  142),
  ('Egg white, raw',                   52, 10.9, 0.2,  0.7,  0,   0.7, 0,    166),
  ('Greek yogurt, 0% fat',             59, 10.2, 0.4,  3.6,  0,   3.2, 0.1,  36),
  ('Cottage cheese, low fat',          72, 12.4, 1.0,  2.7,  0,   2.7, 0.6,  330),
  ('Whey protein isolate powder',     373, 82.0, 1.5,  6.0,  0,   3.0, 0.8,  330),
  ('Casein protein powder',           360, 78.0, 2.0,  6.5,  0,   4.0, 1.0,  400),
  ('Creatine monohydrate',              0,  0,   0,    0,    0,   0,   0,    0),
  ('Tofu, firm',                      144, 15.8, 8.7,  2.8,  2.3, 0.6, 1.3,  14),
  ('Lentils, dry',                    352, 24.6, 1.1,  63.4, 10.7,2.0, 0.2,  6),
  ('Chickpeas, canned, drained',      139, 7.1,  2.6,  22.5, 6.4, 3.9, 0.3,  241),
  ('Black beans, canned, drained',     91, 6.0,  0.3,  16.6, 6.9, 0.3, 0.1,  238),
  ('Oats, rolled, dry',               389, 16.9, 6.9,  66.3, 10.6,0.9, 1.2,  2),
  ('Rice, white, long-grain, dry',    365, 7.1,  0.7,  80.0, 1.3, 0.1, 0.2,  5),
  ('Rice, brown, dry',                370, 7.9,  2.9,  77.2, 3.5, 0.9, 0.6,  7),
  ('Pasta, dry',                      371, 13.0, 1.5,  74.7, 3.2, 2.7, 0.3,  6),
  ('Quinoa, dry',                     368, 14.1, 6.1,  64.2, 7.0, 0,   0.7,  5),
  ('Bread, wholemeal',                247, 13.0, 3.4,  41.3, 7.0, 5.6, 0.7,  455),
  ('Potato, raw',                      77, 2.0,  0.1,  17.5, 2.1, 0.8, 0,    6),
  ('Sweet potato, raw',                86, 1.6,  0.1,  20.1, 3.0, 4.2, 0,    55),
  ('Broccoli, raw',                    34, 2.8,  0.4,  6.6,  2.6, 1.7, 0,    33),
  ('Spinach, raw',                     23, 2.9,  0.4,  3.6,  2.2, 0.4, 0.1,  79),
  ('Cucumber, raw',                    15, 0.7,  0.1,  3.6,  0.5, 1.7, 0,    2),
  ('Tomato, raw',                      18, 0.9,  0.2,  3.9,  1.2, 2.6, 0,    5),
  ('Banana, raw',                      89, 1.1,  0.3,  22.8, 2.6, 12.2,0.1,  1),
  ('Apple, raw',                       52, 0.3,  0.2,  13.8, 2.4, 10.4,0,    1),
  ('Blueberries, raw',                 57, 0.7,  0.3,  14.5, 2.4, 10.0,0,    1),
  ('Dates, dried',                    282, 2.5,  0.4,  75.0, 8.0, 63.4,0,    2),
  ('Olive oil',                       884, 0,    100,  0,    0,   0,   13.8, 2),
  ('Butter',                          717, 0.9,  81.1, 0.1,  0,   0.1, 51.4, 643),
  ('Almonds, raw',                    579, 21.2, 49.9, 21.6, 12.5,4.4, 3.8,  1),
  ('Peanut butter, smooth',           588, 25.1, 50.4, 19.6, 6.0, 9.2, 10.3, 429),
  ('Avocado, raw',                    160, 2.0,  14.7, 8.5,  6.7, 0.7, 2.1,  7),
  ('Milk, whole',                      61, 3.2,  3.3,  4.8,  0,   5.1, 1.9,  43),
  ('Milk, skimmed',                    34, 3.4,  0.1,  5.0,  0,   5.1, 0.1,  42),
  ('Cheddar cheese',                  403, 24.9, 33.1, 1.3,  0,   0.5, 21.1, 653),
  ('Orange juice',                     45, 0.7,  0.2,  10.4, 0.2, 8.4, 0,    1),
  ('Coca-Cola',                        42, 0,    0,    10.6, 0,   10.6,0,    4),
  ('Coffee, black, brewed',             1, 0.1,  0,    0,    0,   0,   0,    2)
),
unpivoted AS (
  SELECT s.name, v.key, v.amount FROM seed s
  CROSS JOIN LATERAL (VALUES
    ('energy', s.kcal::numeric), ('protein', s.protein::numeric), ('fat', s.fat::numeric),
    ('carb', s.carb::numeric),   ('fiber', s.fiber::numeric),     ('sugar', s.sugar::numeric),
    ('sat_fat', s.sat_fat::numeric), ('sodium', s.sodium::numeric)
  ) AS v(key, amount)
)
INSERT INTO public.food_nutrients (food_id, nutrient_id, amount_per_100g)
SELECT f.id, n.id, u.amount
FROM unpivoted u
JOIN public.foods f     ON f.name = u.name AND f.owner_user_id IS NULL
JOIN public.nutrients n ON n.key = u.key
ON CONFLICT (food_id, nutrient_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Portions (D6). Liquids get a `volume` row carrying ml_equiv — that density is
-- what makes ml/L legal for that food and ILLEGAL for a solid. Solids get named
-- household `serving` measures only.
-- ---------------------------------------------------------------------------
WITH p(food_name, label, gram_weight, unit_kind, ml_equiv) AS (VALUES
  -- Volume-capable (density ≈ g per ml): 100 g of milk occupies ~97 ml -> ml_equiv 97.
  ('Milk, whole',              '1 cup (250 ml)',   258.0, 'volume',  97.0),
  ('Milk, skimmed',            '1 cup (250 ml)',   257.0, 'volume',  97.0),
  ('Orange juice',             '1 glass (250 ml)', 258.0, 'volume',  96.0),
  ('Coca-Cola',                '1 can (330 ml)',   342.0, 'volume',  96.0),
  ('Coffee, black, brewed',    '1 mug (240 ml)',   237.0, 'volume', 101.0),
  ('Olive oil',                '1 tbsp',            13.5, 'volume', 109.0),
  -- Solids: household measures only. No ml_equiv -> the picker must NOT offer ml/L.
  ('Chicken breast, skinless, raw', '1 breast',    174.0, 'serving', NULL),
  ('Chicken thigh, skinless, raw',  '1 thigh',      95.0, 'serving', NULL),
  ('Egg, whole, raw',          '1 medium egg',      50.0, 'serving', NULL),
  ('Egg white, raw',           '1 white',           33.0, 'serving', NULL),
  ('Salmon, Atlantic, raw',    '1 fillet',         150.0, 'serving', NULL),
  ('Greek yogurt, 0% fat',     '1 pot (170 g)',    170.0, 'serving', NULL),
  ('Whey protein isolate powder', '1 scoop',        30.0, 'serving', NULL),
  ('Casein protein powder',    '1 scoop',           30.0, 'serving', NULL),
  ('Creatine monohydrate',     '1 tsp (5 g)',        5.0, 'serving', NULL),
  ('Oats, rolled, dry',        '1 cup',             80.0, 'serving', NULL),
  ('Rice, white, long-grain, dry', '1 cup',        185.0, 'serving', NULL),
  ('Bread, wholemeal',         '1 slice',           40.0, 'serving', NULL),
  ('Banana, raw',              '1 medium',         118.0, 'serving', NULL),
  ('Apple, raw',               '1 medium',         182.0, 'serving', NULL),
  ('Dates, dried',             '1 date',            24.0, 'serving', NULL),
  ('Almonds, raw',             '1 handful (30 g)',  30.0, 'serving', NULL),
  ('Peanut butter, smooth',    '1 tbsp',            16.0, 'serving', NULL),
  ('Avocado, raw',             '1 medium',         150.0, 'serving', NULL),
  ('Cheddar cheese',           '1 slice',           28.0, 'serving', NULL),
  ('Butter',                   '1 tsp',              5.0, 'serving', NULL),
  ('Potato, raw',              '1 medium',         150.0, 'serving', NULL),
  ('Sweet potato, raw',        '1 medium',         150.0, 'serving', NULL),
  ('Tuna, canned in water, drained', '1 can (drained)', 100.0, 'serving', NULL)
)
INSERT INTO public.food_portions (food_id, label, gram_weight, unit_kind, ml_equiv, sort_order)
SELECT f.id, p.label, p.gram_weight, p.unit_kind::public.food_unit_kind, p.ml_equiv, 1
FROM p
JOIN public.foods f ON f.name = p.food_name AND f.owner_user_id IS NULL
ON CONFLICT (food_id, label) DO NOTHING;

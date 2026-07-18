-- Migration 3 (revised): remap active program refs from deactivated legacy exercises to canonical.
-- Original 43 mappings, now split three ways after migration 4 additions:
--   * 36 exact 1:1 remaps (hardcoded new_id, unchanged).
--   * 4 repoints resolved BY NAME to exercises added in migration 4 (uuids are runtime-random).
--   * 3 dropped entirely -- their legacy row IS reactivated in migration 4, so program refs
--     (Adductors BW Copenhagen Plank, Glute Med DB Side-Lying Abduction, Triceps Long M Overhead
--      Extension) auto-resolve to an active canonical row with no update needed.
-- Apply via db push AFTER migration 4. REVIEW the mapping doc first.
BEGIN;

-- A) 36 exact remaps
UPDATE module_exercises me SET exercise_id = m.new_id::uuid
FROM (VALUES
('21d9dffb-f288-4b78-acb4-28c1c1f76372','592f79f1-3465-4177-8bd1-081fd61a2243'),
('d596a4b7-97a8-4e3d-b3aa-c6dc0b7a9335','99122518-ac43-4d84-a58a-f7c87b5472e8'),
('ed347c1d-3e02-45dd-bffa-aacb29eefe52','d8ad48ed-13d9-4026-ac54-2da5b4d34bf8'),
('3e24b30c-db21-4451-b8d3-4d7200ae42fa','c995e6e3-a50b-4712-ba0e-e1dd9a93c2c5'),
('e9db4bf8-74ee-4822-af89-76cac2bac416','a00e3b89-8cce-4305-bd0c-0c8be299b3bb'),
('3cfbff1c-37b7-49c5-8026-6c6d0c296b6a','6c69e0be-7c7c-4bde-9918-602e23466a3f'),
('8e502971-74c1-427d-a258-fcb2b4c8465b','635c4f3f-44ec-4f6c-96c1-871e5b730771'),
('551ff3eb-d053-4667-a931-11cf114759c5','910cafbe-c53d-46b2-aa70-2d30e037735f'),
('81419f48-b882-4599-ae3b-a952d66ea3c2','310bfe2d-b05b-4495-b68b-81c9033373f9'),
('11021aad-0fee-4c37-9335-f19907a147b8','b2ec631b-afff-492a-abd5-ab4816efec32'),
('a724a031-f16f-45e5-bee7-343376e5e28e','e30c1779-54f6-4348-bdaf-afed2246d22e'),
('24be2401-0709-41ae-b795-10190de209ab','1bb07217-7f0c-4902-9e42-6d896d6e0720'),
('e4b05687-b2d2-48c7-b2af-38c0421db808','82debc57-e5f6-4a1b-ac6d-82d735f15693'),
('1f90a5e8-c758-4da3-ac6d-94ec5d15c655','9810d170-3764-4aa7-9150-baae0ac7b895'),
('5f32ae8b-63ab-4b56-9f42-1d1fe81a55f3','5cc027db-adf9-4ee9-82e4-8efa5c4ba66b'),
('8e8194a0-2178-4e44-ac79-8523e2fe3369','d46f4e61-f13b-4bd6-a6b7-e3d9de6e384c'),
('17fb18ac-6701-477c-b57e-72312855eafc','2489278e-e247-47d1-98f1-f6d2cc276ee0'),
('b996ad09-689d-49f9-b473-f1655aa47332','e5de6607-a0cb-4924-aa4c-f301c7755896'),
('bdb7e2ee-ac78-4dd4-bb92-5f1aeb6c92f9','f596a901-1e58-467f-b04b-c473ecc612c7'),
('aa89328c-dd8c-454a-a043-86b882f7c42a','a2c5cbe3-949a-468a-9c2b-e1b52d4f4776'),
('c2e9040b-26c5-4426-96d4-51aa640b691e','84f43afd-9064-4a89-ab75-49c977a9c442'),
('5b415ec4-3afc-4bce-8d7a-6152e8700bbd','3afd24c0-618d-4689-be5a-4dabfec5b816'),
('01907e78-1d25-4e29-82bc-e766b59a677b','0edd8135-b04e-4aa2-a0e7-7a9d4875af42'),
('b1941175-3ee0-4a0c-a3eb-ff492bebc56c','818f908e-e8f5-4350-8750-3bd1e07f02f0'),
('76df68b1-5272-439c-a1d8-e2699c9bfb08','d0613967-719f-40d3-ba2d-6212595cff44'),
('97a45dc6-bf3a-4ba5-bc38-6e8672a8a0eb','9fd4328e-e2ef-47ed-b244-b08f10dc16fe'),
('c529e872-cb7d-4b36-b3e4-ce08bae62960','d72593bf-0d93-4321-959c-1d644036ff96'),
('437f6fdb-dce4-4464-b9f1-2ba1555f9fea','d72593bf-0d93-4321-959c-1d644036ff96'),
('e6930d15-8278-471d-ae05-e0689d80a343','e053a262-3940-4e97-b7e7-22a30c0225a4'),
('e3deda06-9256-4da1-9937-0592a13c1cb9','88491b76-8e55-4daa-bcef-c40eaa7ddbc2'),
('611dbbbf-619f-4c89-8a12-de04ec680db1','f018af02-e437-4ae8-9142-67a0fbe8e383'),
('61346344-64a5-4a8b-a84d-ef1bee415498','d1a4b840-9e18-436c-bbda-74aeb960697c'),
('6cf2dec8-becd-436f-850f-c8d98919e06c','d14cb791-347c-4165-877d-14e8fc76d9bb'),
('744ae55e-0c0e-4918-9553-eeb10974f15b','a917cf32-f0d6-43a6-9596-dd8f748deeb7'),
('4d46e394-35fe-4dcd-8689-6ebfeabe24c0','a9f176c2-1275-47ee-bbd6-2906c2687790'),
('b612104e-f220-42a6-8544-eb0c58932c18','aea098d6-329b-4ad7-9540-3844d2009540')
) AS m(old_id,new_id)
WHERE me.exercise_id = m.old_id::uuid;

-- B) 4 name-resolved repoints (targets added in migration 4)
UPDATE module_exercises SET exercise_id=(SELECT id FROM exercise_library WHERE name='Quads C-FT Step-Up (L)')
 WHERE exercise_id='bdf90752-e57d-4cfa-a94b-0dd6ed98bdb4'::uuid;
UPDATE module_exercises SET exercise_id=(SELECT id FROM exercise_library WHERE name='Glute Max DB Contralateral-Elevated Reverse Lunge (L)')
 WHERE exercise_id='67988daa-22ab-4199-82b1-6161af810b10'::uuid;
UPDATE module_exercises SET exercise_id=(SELECT id FROM exercise_library WHERE name='Glute Max SM Reverse Lunge (L)')
 WHERE exercise_id='b04d3a89-d031-46bd-bea6-039c1ff98583'::uuid;
UPDATE module_exercises SET exercise_id=(SELECT id FROM exercise_library WHERE name='Mid Traps C-FT Standing Retraction Row (S)')
 WHERE exercise_id='6472d98b-990a-4ae6-93c1-cf8e6d2370ee'::uuid;

COMMIT;
-- After migrations 4 + 3: 0 module_exercises reference the 43 legacy ids; all 7 former
-- approximate remaps are now exact.

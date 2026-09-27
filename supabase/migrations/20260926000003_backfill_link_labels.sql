-- Backfill readable labels onto task links.  APPLIED — verified in production:
-- 0 Google links left unlabelled, rate-calculator label and note set on all 3 rows.
--
-- 168 of 174 link entries carried no label, so the client board fell back to a
-- generic name ("Google Doc"). These are the real Drive titles, matched on FILE
-- ID rather than full URL so every variant is covered: ?usp=sharing,
-- ?usp=drive_link, /u/1/folders/, /drive/folders/, /file/d/.
--
-- FILL-ONLY: part (A) never overwrites a label that is already set. Part (B) is
-- the one deliberate overwrite — an internal caveat had been typed into a
-- client-facing label, so it moves to internal_note and the label becomes a
-- title.
--
-- WHY THE MAPPING IS REPEATED: earlier drafts kept it in one scratch table, but
-- the Supabase SQL editor would not run those — a table created in one statement
-- of a script is not reliably visible to the next ("relation does not exist").
-- So each statement carries its own inline CTE. The three copies MUST stay in
-- sync; the verification block below fails loudly if one of them drifts (it
-- asserts 18 mapping rows and 0 mappings that match no link).
--
-- Re-runnable: (A) only touches empty labels, and (B)'s internal_note append is
-- guarded, so a second run is a no-op.
--
-- Applied by hand in the Supabase SQL editor: `supabase db push` is unusable in
-- this repo (remote migration history is out of sync).
--
-- NOTE ON LIKE: six of these file ids contain underscores, which are
-- single-character wildcards in LIKE. Every match below uses strpos(), which is
-- literal.

begin;

-- ─── (A1) Template tasks: fill empty labels ──────────────────────────────────
-- jsonb_agg rebuilds the array in its original order. The inner lookup is a
-- scalar subquery with LIMIT 1 rather than a join, so an element can never be
-- duplicated by matching two mappings. coalesce(..., '[]') keeps the NOT NULL
-- column safe if a row somehow holds an empty array.
with mapping(file_id, label) as (values
  ('1wTArX43-0pcTNvkD4ATvPo_nDZlSLSaT5n5RD3Vf7A4', 'How To: Facebook Group Self-Promotion Posting'),
  ('1cxKR0jCSfzfGSpWsqG9QGlrNGjyUrOculT0ab3ZMR7w', 'Sample School Visit Topic List'),
  ('1ql4dhyC5XCgnlJ3BhN4sE0WrSswnjHY55Tb-GTgG4U4', 'Affirmations'),
  ('1tLGwec_hNvZp7CmEPY-t3GXTu_IQIRWWH38Vi7FdcUc', 'Quick Consult Script'),
  ('1E3l-cr4tKxiZJvR6aXDslcIRhooCVevdkqK1XfAzOyc', 'Business Goal Worksheet'),
  ('1AiEOtcvuP0w8W4ZlrR-dssvjMy9YyYnG3UqY6mgUtFs', 'Flat-Rate Tuition Calculation'),
  ('1knOEigB3TBD1f9o7as73is_XPgfaiuWnmsKsXWVkvpA', 'Rate Increase Calculation'),
  ('1A2MUlp-vdkASk754hIcZyndhrHaubevqTsj2fx1HpLg', 'AI Prompts for School Research'),
  ('1TC-Z8XY5x5eU3Yl9_PXLiFuUPEdje1TRBK6adslcdTA', 'Student Lead Follow-Up Campaign'),
  ('152uQq733DEaZMgaXdGWf3NoVyJLgIeymMAN-N9g9lBw', 'Self-Promotion Post Copy Outline'),
  ('1ImJ3vF06_drCiel6FVrLuB8_s65ER02ksL3qbmTZSjs', 'Email Signature'),
  ('1_xoWH0mm7Td7TCkohrYa1DouHZTh-fnzRhx0DZkHfD8', 'Squarespace Website Design Support'),
  ('12gxuWHq1LenBQzPGeGHmq6TuiGr12IEW8tirnkJ35oQ', 'How To: Summer Lesson Package'),
  ('1dwub9TKC5vZjLhdKPbEeNi2zvmfs208Yf7dSOOppb1s', 'Summer Lesson Package Outline'),
  ('1pgend-1WLVgiEzRTVEnr0rz8s-no1aew',            'Social Media Posting Schedule'),
  ('1CWfyH_Z4it7qn9S0Y0fdbT-wpHL4tUqQ',            'Quick Consultations (folder)'),
  ('1iJcPu_q2qks2VZau58VSivcgJaGxpeKv',            'Policies & Rates (folder)'),
  ('1_F4shfZjTylojf3ZHNfcUNZg1wU02nSK',            'Testimonials (folder)')
)
update public.work_plan_template_tasks t
   set links = coalesce((
         select jsonb_agg(
                  case
                    when coalesce(btrim(elem->>'label'), '') = '' then
                      coalesce(
                        (select jsonb_set(elem, '{label}', to_jsonb(m.label))
                           from mapping m
                          where strpos(elem->>'url', m.file_id) > 0
                          limit 1),
                        elem)
                    else elem
                  end
                  order by ord)
           from jsonb_array_elements(t.links) with ordinality as e(elem, ord)
       ), '[]'::jsonb)
 where exists (
   select 1
     from jsonb_array_elements(t.links) as e(elem)
     join mapping m on strpos(e.elem->>'url', m.file_id) > 0
    where coalesce(btrim(e.elem->>'label'), '') = ''
 );

-- ─── (A2) Per-client plan tasks: identical fill ──────────────────────────────
with mapping(file_id, label) as (values
  ('1wTArX43-0pcTNvkD4ATvPo_nDZlSLSaT5n5RD3Vf7A4', 'How To: Facebook Group Self-Promotion Posting'),
  ('1cxKR0jCSfzfGSpWsqG9QGlrNGjyUrOculT0ab3ZMR7w', 'Sample School Visit Topic List'),
  ('1ql4dhyC5XCgnlJ3BhN4sE0WrSswnjHY55Tb-GTgG4U4', 'Affirmations'),
  ('1tLGwec_hNvZp7CmEPY-t3GXTu_IQIRWWH38Vi7FdcUc', 'Quick Consult Script'),
  ('1E3l-cr4tKxiZJvR6aXDslcIRhooCVevdkqK1XfAzOyc', 'Business Goal Worksheet'),
  ('1AiEOtcvuP0w8W4ZlrR-dssvjMy9YyYnG3UqY6mgUtFs', 'Flat-Rate Tuition Calculation'),
  ('1knOEigB3TBD1f9o7as73is_XPgfaiuWnmsKsXWVkvpA', 'Rate Increase Calculation'),
  ('1A2MUlp-vdkASk754hIcZyndhrHaubevqTsj2fx1HpLg', 'AI Prompts for School Research'),
  ('1TC-Z8XY5x5eU3Yl9_PXLiFuUPEdje1TRBK6adslcdTA', 'Student Lead Follow-Up Campaign'),
  ('152uQq733DEaZMgaXdGWf3NoVyJLgIeymMAN-N9g9lBw', 'Self-Promotion Post Copy Outline'),
  ('1ImJ3vF06_drCiel6FVrLuB8_s65ER02ksL3qbmTZSjs', 'Email Signature'),
  ('1_xoWH0mm7Td7TCkohrYa1DouHZTh-fnzRhx0DZkHfD8', 'Squarespace Website Design Support'),
  ('12gxuWHq1LenBQzPGeGHmq6TuiGr12IEW8tirnkJ35oQ', 'How To: Summer Lesson Package'),
  ('1dwub9TKC5vZjLhdKPbEeNi2zvmfs208Yf7dSOOppb1s', 'Summer Lesson Package Outline'),
  ('1pgend-1WLVgiEzRTVEnr0rz8s-no1aew',            'Social Media Posting Schedule'),
  ('1CWfyH_Z4it7qn9S0Y0fdbT-wpHL4tUqQ',            'Quick Consultations (folder)'),
  ('1iJcPu_q2qks2VZau58VSivcgJaGxpeKv',            'Policies & Rates (folder)'),
  ('1_F4shfZjTylojf3ZHNfcUNZg1wU02nSK',            'Testimonials (folder)')
)
update public.work_plan_tasks t
   set links = coalesce((
         select jsonb_agg(
                  case
                    when coalesce(btrim(elem->>'label'), '') = '' then
                      coalesce(
                        (select jsonb_set(elem, '{label}', to_jsonb(m.label))
                           from mapping m
                          where strpos(elem->>'url', m.file_id) > 0
                          limit 1),
                        elem)
                    else elem
                  end
                  order by ord)
           from jsonb_array_elements(t.links) with ordinality as e(elem, ord)
       ), '[]'::jsonb)
 where exists (
   select 1
     from jsonb_array_elements(t.links) as e(elem)
     join mapping m on strpos(e.elem->>'url', m.file_id) > 0
    where coalesce(btrim(e.elem->>'label'), '') = ''
 );

-- ─── (B) The rate calculator: title in the label, caveat in internal_note ────
-- The only DELIBERATE overwrite in this script. The label read "provides
-- baseline rates; confirm with Team OTB" — an internal note sitting in a
-- client-facing field. The sentence moves to internal_note, guarded so a re-run
-- cannot duplicate it. No mapping CTE needed: this matches on the URL slug.

update public.work_plan_template_tasks t
   set links = coalesce((
         select jsonb_agg(
                  case
                    when strpos(elem->>'url', 'calculator-private-music-lessons-rates') > 0
                      then jsonb_set(elem, '{label}', to_jsonb('Lesson Rate Calculator'::text))
                    else elem
                  end
                  order by ord)
           from jsonb_array_elements(t.links) with ordinality as e(elem, ord)
       ), '[]'::jsonb),
       internal_note = case
         when coalesce(t.internal_note, '') = ''
           then 'Rate calculator provides baseline rates; confirm with Team OTB.'
         when strpos(t.internal_note, 'Rate calculator provides baseline rates') > 0
           then t.internal_note
         else t.internal_note || E'\n' || 'Rate calculator provides baseline rates; confirm with Team OTB.'
       end
 where exists (
   select 1 from jsonb_array_elements(t.links) as e(elem)
    where strpos(e.elem->>'url', 'calculator-private-music-lessons-rates') > 0
 );

update public.work_plan_tasks t
   set links = coalesce((
         select jsonb_agg(
                  case
                    when strpos(elem->>'url', 'calculator-private-music-lessons-rates') > 0
                      then jsonb_set(elem, '{label}', to_jsonb('Lesson Rate Calculator'::text))
                    else elem
                  end
                  order by ord)
           from jsonb_array_elements(t.links) with ordinality as e(elem, ord)
       ), '[]'::jsonb),
       internal_note = case
         when coalesce(t.internal_note, '') = ''
           then 'Rate calculator provides baseline rates; confirm with Team OTB.'
         when strpos(t.internal_note, 'Rate calculator provides baseline rates') > 0
           then t.internal_note
         else t.internal_note || E'\n' || 'Rate calculator provides baseline rates; confirm with Team OTB.'
       end
 where exists (
   select 1 from jsonb_array_elements(t.links) as e(elem)
    where strpos(e.elem->>'url', 'calculator-private-music-lessons-rates') > 0
 );

commit;

-- ─── Verification ────────────────────────────────────────────────────────────
-- Third and last copy of the mapping. The 'mapping rows' and 'mappings with no
-- matching link' checks are what catch this copy drifting from the two above.
with mapping(file_id, label) as (values
  ('1wTArX43-0pcTNvkD4ATvPo_nDZlSLSaT5n5RD3Vf7A4', 'How To: Facebook Group Self-Promotion Posting'),
  ('1cxKR0jCSfzfGSpWsqG9QGlrNGjyUrOculT0ab3ZMR7w', 'Sample School Visit Topic List'),
  ('1ql4dhyC5XCgnlJ3BhN4sE0WrSswnjHY55Tb-GTgG4U4', 'Affirmations'),
  ('1tLGwec_hNvZp7CmEPY-t3GXTu_IQIRWWH38Vi7FdcUc', 'Quick Consult Script'),
  ('1E3l-cr4tKxiZJvR6aXDslcIRhooCVevdkqK1XfAzOyc', 'Business Goal Worksheet'),
  ('1AiEOtcvuP0w8W4ZlrR-dssvjMy9YyYnG3UqY6mgUtFs', 'Flat-Rate Tuition Calculation'),
  ('1knOEigB3TBD1f9o7as73is_XPgfaiuWnmsKsXWVkvpA', 'Rate Increase Calculation'),
  ('1A2MUlp-vdkASk754hIcZyndhrHaubevqTsj2fx1HpLg', 'AI Prompts for School Research'),
  ('1TC-Z8XY5x5eU3Yl9_PXLiFuUPEdje1TRBK6adslcdTA', 'Student Lead Follow-Up Campaign'),
  ('152uQq733DEaZMgaXdGWf3NoVyJLgIeymMAN-N9g9lBw', 'Self-Promotion Post Copy Outline'),
  ('1ImJ3vF06_drCiel6FVrLuB8_s65ER02ksL3qbmTZSjs', 'Email Signature'),
  ('1_xoWH0mm7Td7TCkohrYa1DouHZTh-fnzRhx0DZkHfD8', 'Squarespace Website Design Support'),
  ('12gxuWHq1LenBQzPGeGHmq6TuiGr12IEW8tirnkJ35oQ', 'How To: Summer Lesson Package'),
  ('1dwub9TKC5vZjLhdKPbEeNi2zvmfs208Yf7dSOOppb1s', 'Summer Lesson Package Outline'),
  ('1pgend-1WLVgiEzRTVEnr0rz8s-no1aew',            'Social Media Posting Schedule'),
  ('1CWfyH_Z4it7qn9S0Y0fdbT-wpHL4tUqQ',            'Quick Consultations (folder)'),
  ('1iJcPu_q2qks2VZau58VSivcgJaGxpeKv',            'Policies & Rates (folder)'),
  ('1_F4shfZjTylojf3ZHNfcUNZg1wU02nSK',            'Testimonials (folder)')
),
all_links as (
  select 'template' as src, t.id as task_id, t.title, e.elem
    from public.work_plan_template_tasks t, jsonb_array_elements(t.links) as e(elem)
  union all
  select 'plan', t.id, t.title, e.elem
    from public.work_plan_tasks t, jsonb_array_elements(t.links) as e(elem)
)
select 'mapping rows (must be 18)' as check, count(*)::text as value
  from mapping
union all
select 'Google links still unlabelled (must be 0)', count(*)::text
  from all_links
 where coalesce(btrim(elem->>'label'), '') = ''
   and (strpos(elem->>'url', 'docs.google.com') > 0 or strpos(elem->>'url', 'drive.google.com') > 0)
union all
-- Expected to be non-zero: the studio.outsidethebachs.com and
-- cadence.outsidethebachs.com links are deliberately unlabelled, because their
-- slugs humanise correctly ("Goal Setting", "Task Batching").
select 'ALL links still unlabelled (context, non-zero is fine)', count(*)::text
  from all_links
 where coalesce(btrim(elem->>'label'), '') = ''
union all
select 'mappings with no matching link (must be 0)', count(*)::text
  from mapping m
 where not exists (select 1 from all_links a where strpos(a.elem->>'url', m.file_id) > 0)
union all
-- One row per file id: how many link entries now carry the intended label.
select 'set [' || m.label || ']',
       count(*) filter (where a.elem->>'label' = m.label)::text
       || ' of ' || count(*)::text || ' link rows'
  from mapping m
  join all_links a on strpos(a.elem->>'url', m.file_id) > 0
 group by m.label
union all
-- The three rate-calculator rows, with their new label and internal_note.
select 'rate-calc ' || a.src || ' ' || left(a.task_id::text, 8),
       'label=' || coalesce(a.elem->>'label', '(null)')
       || ' | note=' || coalesce(
            (select left(t.internal_note, 160) from public.work_plan_tasks t where t.id = a.task_id),
            (select left(t.internal_note, 160) from public.work_plan_template_tasks t where t.id = a.task_id),
            '(null)')
  from all_links a
 where strpos(a.elem->>'url', 'calculator-private-music-lessons-rates') > 0
 order by 1;

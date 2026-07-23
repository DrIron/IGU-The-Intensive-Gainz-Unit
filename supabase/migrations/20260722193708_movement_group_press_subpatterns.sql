ALTER TABLE public.movement_groups ADD COLUMN IF NOT EXISTS parent_id text REFERENCES public.movement_groups(id);
INSERT INTO public.movement_groups (id,label,sort_order,parent_id) VALUES
  ('press_horizontal','Horizontal Press',1,'press'),
  ('press_anterior','Anterior Press',2,'press')
ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, sort_order=EXCLUDED.sort_order, parent_id=EXCLUDED.parent_id;

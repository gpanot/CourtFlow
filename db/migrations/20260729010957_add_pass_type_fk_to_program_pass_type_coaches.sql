-- migrate:up
ALTER TABLE public.program_pass_type_coaches
  ADD CONSTRAINT program_pass_type_coaches_pass_type_id_fkey
  FOREIGN KEY (pass_type_id) REFERENCES public.program_pass_types(id)
  ON DELETE CASCADE;

-- migrate:down
ALTER TABLE public.program_pass_type_coaches
  DROP CONSTRAINT IF EXISTS program_pass_type_coaches_pass_type_id_fkey;

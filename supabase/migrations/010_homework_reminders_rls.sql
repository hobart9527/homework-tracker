-- Enable RLS on homework_reminders table
ALTER TABLE public.homework_reminders ENABLE ROW LEVEL SECURITY;

-- Parents can view their own reminders
CREATE POLICY "Parents can view their own reminders"
  ON public.homework_reminders
  FOR SELECT
  USING (parent_id IN (
    SELECT id FROM public.parents WHERE auth.uid() = id
  ));

-- Parents can insert reminders for their children
CREATE POLICY "Parents can insert reminders for their children"
  ON public.homework_reminders
  FOR INSERT
  WITH CHECK (parent_id IN (
    SELECT id FROM public.parents WHERE auth.uid() = id
  ));

-- Parents can update their own reminders
CREATE POLICY "Parents can update their own reminders"
  ON public.homework_reminders
  FOR UPDATE
  USING (parent_id IN (
    SELECT id FROM public.parents WHERE auth.uid() = id
  ));

-- Children can view their own reminders
CREATE POLICY "Children can view their own reminders"
  ON public.homework_reminders
  FOR SELECT
  USING (child_id IN (
    SELECT id FROM public.children WHERE auth.uid() = id
  ));

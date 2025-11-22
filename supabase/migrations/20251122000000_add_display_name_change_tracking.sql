ALTER TABLE public.profiles ADD CONSTRAINT unique_display_name UNIQUE (display_name);

ALTER TABLE public.profiles ADD COLUMN email TEXT;

CREATE OR REPLACE FUNCTION public.check_display_name_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  days_since_change INTEGER;
  name_exists BOOLEAN;
BEGIN
  IF OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    SELECT EXISTS(
      SELECT 1 FROM public.profiles 
      WHERE display_name = NEW.display_name 
      AND id != NEW.id
    ) INTO name_exists;
    
    IF name_exists THEN
      RAISE EXCEPTION 'Ta nazwa jest już zajęta';
    END IF;
    
    IF OLD.display_name_changed_at IS NOT NULL THEN
      days_since_change := EXTRACT(DAY FROM (NOW() - OLD.display_name_changed_at));
      
      IF days_since_change < 14 THEN
        RAISE EXCEPTION 'Możesz zmienić nazwę dopiero za % dni', (14 - days_since_change);
      END IF;
    END IF;
    
    NEW.display_name_changed_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  name_exists BOOLEAN;
BEGIN
  IF NEW.raw_user_meta_data->>'display_name' IS NULL OR NEW.raw_user_meta_data->>'display_name' = '' THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;
  
  SELECT EXISTS(
    SELECT 1 FROM public.profiles 
    WHERE display_name = NEW.raw_user_meta_data->>'display_name'
  ) INTO name_exists;
  
  IF name_exists THEN
    RAISE EXCEPTION 'Ta nazwa jest już zajęta';
  END IF;
  
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'display_name',
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TABLE public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ringing', 'active', 'ended', 'missed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration INTEGER,
  offer TEXT,
  answer TEXT,
  ice_candidates JSONB DEFAULT '[]'::jsonb,
  CHECK (caller_id != receiver_id)
);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their calls"
ON public.call_sessions FOR SELECT
USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can create calls"
ON public.call_sessions FOR INSERT
WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Users can update their calls"
ON public.call_sessions FOR UPDATE
USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
ALTER TABLE public.call_sessions REPLICA IDENTITY FULL;

CREATE INDEX idx_call_sessions_caller ON public.call_sessions(caller_id, started_at DESC);
CREATE INDEX idx_call_sessions_receiver ON public.call_sessions(receiver_id, started_at DESC);
CREATE INDEX idx_call_sessions_status ON public.call_sessions(status) WHERE status IN ('ringing', 'active');
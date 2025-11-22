CREATE TABLE public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id),
  CHECK (sender_id != receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their friend requests"
ON public.friend_requests FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can create friend requests"
ON public.friend_requests FOR INSERT
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update received friend requests"
ON public.friend_requests FOR UPDATE
USING (auth.uid() = receiver_id);

CREATE POLICY "Users can delete their sent friend requests"
ON public.friend_requests FOR DELETE
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;

CREATE INDEX idx_friend_requests_sender ON public.friend_requests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status ON public.friend_requests(status);

CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  req_sender_id UUID;
  req_receiver_id UUID;
BEGIN
  SELECT sender_id, receiver_id INTO req_sender_id, req_receiver_id
  FROM public.friend_requests
  WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';
  
  IF req_sender_id IS NULL THEN
    RAISE EXCEPTION 'Friend request not found or already processed';
  END IF;
  
  UPDATE public.friend_requests
  SET status = 'accepted', updated_at = NOW()
  WHERE id = request_id;
  
  INSERT INTO public.friendships (user_id, friend_id)
  VALUES (req_sender_id, req_receiver_id);
  
  INSERT INTO public.friendships (user_id, friend_id)
  VALUES (req_receiver_id, req_sender_id);
END;
$$;
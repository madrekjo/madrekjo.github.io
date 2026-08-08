CREATE INDEX IF NOT EXISTS messages_created_at_desc_idx ON public.messages (created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_receiver_created_at_idx ON public.messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_receiver_read_idx ON public.messages (receiver_id, is_read) WHERE is_read = false;
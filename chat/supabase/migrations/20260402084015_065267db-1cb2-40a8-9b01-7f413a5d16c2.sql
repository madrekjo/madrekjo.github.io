
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    CASE 
      WHEN NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN 'Admin Abdalrhman ✅'
      ELSE COALESCE(NEW.raw_user_meta_data->>'full_name', 'مستخدم جديد')
    END,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  IF NEW.email = 'abdalrhmanmaaith24@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

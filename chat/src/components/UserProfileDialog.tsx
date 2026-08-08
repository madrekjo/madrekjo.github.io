import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ban, Edit2, Mail, User as UserIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProfileData {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  is_banned: boolean;
  email?: string;
}

const UserProfileDialog = ({ userId, open, onOpenChange }: Props) => {
  const { isAdmin } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    setRenaming(false);
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url, is_banned")
        .eq("user_id", userId)
        .maybeSingle();
      if (p) {
        let email: string | undefined;
        if (isAdmin) {
          // Try to fetch email via edge if available; fall back silently
          try {
            const { data: emailData } = await supabase.rpc("get_user_email" as any, { _user_id: userId });
            if (typeof emailData === "string") email = emailData;
          } catch {}
        }
        setProfile({ ...p, email });
        setNewName(p.full_name);
      }
      setLoading(false);
    })();
  }, [userId, open, isAdmin]);

  const handleBanToggle = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from("profiles")
      .update({ is_banned: !profile.is_banned })
      .eq("user_id", profile.user_id);
    if (error) toast.error("فشل التحديث");
    else {
      toast.success(profile.is_banned ? "تم رفع الحظر" : "تم حظر المستخدم");
      setProfile({ ...profile, is_banned: !profile.is_banned });
    }
  };

  const handleRename = async () => {
    if (!profile || !newName.trim()) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: newName.trim() })
      .eq("user_id", profile.user_id);
    if (error) toast.error("فشل تغيير الاسم");
    else {
      toast.success("تم تغيير الاسم");
      setProfile({ ...profile, full_name: newName.trim() });
      setRenaming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>الملف الشخصي</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : profile ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <Avatar className="w-20 h-20">
                <AvatarImage src={profile.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {profile.full_name?.charAt(0) || "م"}
                </AvatarFallback>
              </Avatar>
              {renaming ? (
                <div className="w-full flex gap-2">
                  <Input value={newName} onChange={e => setNewName(e.target.value)} />
                  <Button size="sm" onClick={handleRename}>حفظ</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>إلغاء</Button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-bold text-lg flex items-center gap-2 justify-center">
                    <UserIcon className="w-4 h-4" /> {profile.full_name}
                  </p>
                  {profile.is_banned && (
                    <span className="text-xs text-destructive">🚫 محظور</span>
                  )}
                </div>
              )}
              {isAdmin && profile.email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> {profile.email}
                </p>
              )}
            </div>

            {isAdmin && !renaming && (
              <DialogFooter className="flex-row gap-2 sm:justify-center">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setRenaming(true)}>
                  <Edit2 className="w-4 h-4" /> تغيير الاسم
                </Button>
                <Button
                  variant={profile.is_banned ? "outline" : "destructive"}
                  size="sm"
                  className="gap-1"
                  onClick={handleBanToggle}
                >
                  <Ban className="w-4 h-4" />
                  {profile.is_banned ? "رفع الحظر" : "حظر"}
                </Button>
              </DialogFooter>
            )}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">لم يتم العثور على المستخدم</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserProfileDialog;

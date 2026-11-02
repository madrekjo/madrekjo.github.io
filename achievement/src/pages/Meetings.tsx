import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useMeetings } from "@/hooks/useMeetings";
import { MeetingChat } from "@/components/MeetingChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { matchesSearch } from "@/lib/search";

const formatDate = (value: string | null) => {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString("ar", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
};

const Meetings = () => {
  const { user, loading } = useAuth();
  const { allUsers } = useAdmin();
  const {
    meetings,
    isLoading,
    needsSetup,
    isAdmin,
    createMeeting,
    deleteMeeting,
    addMember,
    removeMember,
  } = useMeetings();

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const [membersFor, setMembersFor] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  const activeMeeting = meetings.find((m) => m.id === membersFor) || null;

  const candidates = useMemo(() => {
    if (!activeMeeting) return [];
    const existing = new Set(activeMeeting.members.map((m) => m.user_id));
    return allUsers
      .filter((u) => !existing.has(u.user_id))
      .filter((u) => matchesSearch(u.display_name?.trim() || "بدون اسم", memberSearch))
      .slice(0, 30);
  }, [allUsers, activeMeeting, memberSearch]);

  const resetCreate = () => {
    setTitle("");
    setDescription("");
    setScheduledAt("");
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("اكتب اسم الاجتماع");
      return;
    }
    try {
      await createMeeting.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      toast.success("تم إنشاء الاجتماع");
      resetCreate();
      setCreateOpen(false);
    } catch {
      toast.error("تعذّر إنشاء الاجتماع — تأكد من تنفيذ ملف SQL أولًا");
    }
  };

  const handleDelete = async (meetingId: string) => {
    if (!window.confirm("حذف هذا الاجتماع نهائيًا مع كل أعضائه؟")) return;
    try {
      await deleteMeeting.mutateAsync(meetingId);
      toast.success("تم حذف الاجتماع");
    } catch {
      toast.error("تعذّر حذف الاجتماع");
    }
  };

  const handleAdd = async (userId: string) => {
    if (!activeMeeting) return;
    try {
      await addMember.mutateAsync({ meetingId: activeMeeting.id, userId });
      toast.success("تمت إضافة العضو — سيظهر له القسم مباشرة");
    } catch {
      toast.error("تعذّر إضافة العضو");
    }
  };

  const handleKick = async (meetingId: string, userId: string) => {
    try {
      await removeMember.mutateAsync({ meetingId, userId });
      toast.success("تم طرد العضو من الاجتماع");
    } catch {
      toast.error("تعذّر طرد العضو");
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="container max-w-4xl py-8">
        <div className="surface mb-6 flex flex-wrap items-center justify-between gap-4 p-5 animate-fade-up">
          <div className="flex items-center gap-3">
            <span className="icon-tile">
              <UsersRound className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">الاجتماعات</h1>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              إنشاء اجتماع
            </Button>
          )}
        </div>

        {needsSetup && (
          <Alert className="mb-6 rounded-2xl border-amber-500/40 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle>القسم غير مفعّل بعد</AlertTitle>
            <AlertDescription className="text-sm">
              نفّذ ملف SQL: <code>achievement/supabase/migrations/20261031120000_round_limits_blocks_meetings.sql</code>{" "}
              في لوحة Supabase ثم أعد التحميل.
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-14 text-center">
            <UsersRound className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">لا توجد اجتماعات بعد</p>
            {isAdmin && (
              <p className="mt-1 text-xs text-muted-foreground">
                أنشئ اجتماعًا وأضف إليه الأعضاء ليظهر لهم القسم.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {meetings.map((meeting) => (
              <div key={meeting.id} className="surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-foreground">{meeting.title}</h2>
                    {meeting.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {meeting.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {meeting.scheduled_at && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDate(meeting.scheduled_at)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <UsersRound className="h-3.5 w-3.5" />
                        {meeting.members.length} عضو
                      </span>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          setMemberSearch("");
                          setMembersFor(meeting.id);
                        }}
                      >
                        <UserPlus className="h-4 w-4" />
                        إضافة أعضاء
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-9 w-9"
                        title="حذف الاجتماع"
                        onClick={() => void handleDelete(meeting.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t pt-3">
                  {meeting.members.length === 0 ? (
                    <p className="text-xs text-muted-foreground">لا يوجد أعضاء بعد.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {meeting.members.map((member) => (
                        <span
                          key={member.user_id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 py-1 pe-2 ps-2.5 text-xs"
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            {(member.display_name || "؟").charAt(0)}
                          </span>
                          {member.display_name}
                          {member.user_id === user.id && (
                            <span className="text-[10px] text-primary">(أنت)</span>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              title="طرد من الاجتماع"
                              onClick={() => void handleKick(meeting.id, member.user_id)}
                              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <MeetingChat meetingId={meeting.id} />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* إنشاء اجتماع */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) resetCreate(); setCreateOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء اجتماع</DialogTitle>
            <DialogDescription>
              أنشئ اجتماعًا وأضف إليه من تريد؛ سيظهر القسم لهم مباشرة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="m-title">اسم الاجتماع</Label>
              <Input
                id="m-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                className="mt-1"
                placeholder="مثال: مراجعة الرياضيات"
              />
            </div>
            <div>
              <Label htmlFor="m-desc">الوصف (اختياري)</Label>
              <Textarea
                id="m-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={400}
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="m-time">الموعد (اختياري)</Label>
              <Input
                id="m-time"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={createMeeting.isPending} className="gap-1">
              {createMeeting.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* إضافة أعضاء */}
      <Dialog open={!!membersFor} onOpenChange={(o) => !o && setMembersFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة أعضاء{activeMeeting ? ` — ${activeMeeting.title}` : ""}</DialogTitle>
            <DialogDescription>
              اختر من قائمة المستخدمين. العضو المُضاف يرى قسم الاجتماعات فورًا.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="ابحث باسم المستخدم..."
              className="ps-10"
            />
          </div>

          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {candidates.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">لا يوجد مستخدم مطابق</p>
            ) : (
              candidates.map((candidate) => (
                <div
                  key={candidate.user_id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2"
                >
                  <span className="truncate text-sm">
                    {candidate.display_name?.trim() || "بدون اسم"}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1"
                    onClick={() => void handleAdd(candidate.user_id)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    إضافة
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersFor(null)}>تم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Meetings;

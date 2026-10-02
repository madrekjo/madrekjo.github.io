import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitMentions, renderMentions, mentionCostFor, hasBulkMention } from "@/lib/mentions";
import { fieldGroupId, fieldOfGroupId, isFieldGroupId, FIELD_MENTION_LIST, FIELD_MENTION_COST } from "@/lib/fieldMentions";

// ---------------------------------------------------------------------
// Harness: عميل Supabase وهمي — كل استعلامات profiles ترجع نفس الأعضاء
// (فلتر الحقل نفسه هو ما نتحقق منه عبرumination السطر المرسل لـ eq)
// ---------------------------------------------------------------------
type Insert = { table: string; payload: any };

function makeClient(members: { user_id: string }[] = [{ user_id: "u-1" }, { user_id: "u-2" }]) {
  const inserts: Insert[] = [];
  const eqCalls: { table: string; col: string; val: unknown }[] = [];
  const state: any = { error: null };

  const profilesQuery: any = {
    select: () => profilesQuery,
    is: () => profilesQuery,
    eq: (col: string, val: unknown) => { eqCalls.push({ table: "profiles", col, val }); return profilesQuery; },
    limit: () => profilesQuery,
    ilike: () => profilesQuery,
    order: () => profilesQuery,
    then: (res: any) => res({ data: members, error: null }),
  };

  const client: any = {
    from: (table: string) => {
      if (table === "profiles") return profilesQuery;
      return {
        insert: (payload: any) => {
          inserts.push({ table, payload });
          return { data: null, error: state.error, then: (r: any) => r({ data: null, error: state.error }) };
        },
        select: () => client.from(table),
      };
    },
    __inserts: inserts,
    __eqCalls: eqCalls,
  };
  return client;
}

const ENG = fieldGroupId("engineering")!; // "field:engineering"

describe("منشن الحقل — المعرّفات", () => {
  it("كل حقل له معرّف فريد بالقالب field:<field>", () => {
    const ids = FIELD_MENTION_LIST.map(f => fieldGroupId(f));
    expect(new Set(ids).size).toBe(FIELD_MENTION_LIST.length);
    ids.forEach(id => expect(id!.startsWith("field:")).toBe(true));
  });

  it("حقل غير معروف أو فارغ → null (ما بينكتب منشن غلط)", () => {
    expect(fieldGroupId(null)).toBeNull();
    expect(fieldGroupId("")).toBeNull();
    expect(fieldGroupId("unknown_field")).toBeNull();
  });

  it("fieldOfGroupId / isFieldGroupId", () => {
    expect(isFieldGroupId(ENG)).toBe(true);
    expect(isFieldGroupId("boys")).toBe(false);
    expect(fieldOfGroupId(ENG)).toBe("engineering");
    expect(fieldOfGroupId("field:ghost")).toBeNull();
    expect(fieldOfGroupId("everyone")).toBeNull();
  });
});

describe("منشن الحقل — التكلفة", () => {
  it("منشن حقل = max(سعر الرسالة, 3): منشور 5 · تعليق 3", () => {
    expect(FIELD_MENTION_COST).toBe(3);
    expect(mentionCostFor(`يا [@الهندسي](user:${ENG})`, 5)).toBe(5);
    expect(mentionCostFor(`يا [@الهندسي](user:${ENG})`, 2)).toBe(3);
  });

  it("بدون منشن → سعر الرسالة كما هو", () => {
    expect(mentionCostFor("مرحبا", 5)).toBe(5);
    expect(mentionCostFor("مرحبا @الهندسي بدون توكن", 2)).toBe(2);
  });

  it("منشن الجنس أو الجميع = 10 (أغلى من منشن الحقل)", () => {
    expect(mentionCostFor("[@الشباب](user:boys)", 2)).toBe(10);
    expect(mentionCostFor("[@الجميع](user:everyone)", 5)).toBe(10);
  });

  it("hasBulkMention: الجنس/الجميع/الحقل bulk، والشخص العادي لأ", () => {
    expect(hasBulkMention("[@الجميع](user:everyone)")).toBe(true);
    expect(hasBulkMention(`[@الصحي](user:${ENG})`)).toBe(true);
    expect(hasBulkMention("[@سامي](user:u-9)")).toBe(false);
  });
});

describe("منشن الحقل — البث للإشعارات", () => {
  beforeEach(() => vi.clearAllMocks());

  it("يكتب صف post_mentions بمجموع الحقل (user_id=null + is_all=false)", async () => {
    const client = makeClient();
    await submitMentions(client, {
      postId: "p1", actorId: "me", channel: "all",
      text: `اجتماع [@الهندسي](user:${ENG}) اليوم`,
    });

    const mentionRow = client.__inserts.find(i => i.table === "post_mentions");
    expect(mentionRow).toBeTruthy();
    expect(mentionRow!.payload.user_id).toBeNull();
    expect(mentionRow!.payload.is_all).toBe(false);
    expect(mentionRow!.payload.mention_group).toBe("field:engineering");
    expect(mentionRow!.payload.actor_id).toBe("me");
    expect(mentionRow!.payload.post_id).toBe("p1");
  });

  it("يسأل الأعضاء بفلتر field = الحقل", async () => {
    const client = makeClient();
    await submitMentions(client, {
      postId: "p1", actorId: "me", channel: "all",
      text: `[@الهندسي](user:${ENG})`,
    });
    expect(client.__eqCalls).toContainEqual({ table: "profiles", col: "field", val: "engineering" });
  });

  it("إشعار لكل عضو ما عدا صاحب المنشن", async () => {
    const client = makeClient([{ user_id: "u-1" }, { user_id: "me" }, { user_id: "u-2" }]);
    await submitMentions(client, {
      postId: "p1", actorId: "me", channel: "all",
      text: `[@الهندسي](user:${ENG})`,
    });
    const notif = client.__inserts.filter(i => i.table === "notifications");
    const rows = notif[0].payload as any[];
    expect(rows.length).toBe(2);
    rows.forEach(r => {
      expect(r.type).toBe("mention");
      expect(r.actor_id).toBe("me");
      expect(r.user_id).not.toBe("me");
      expect(r.post_id).toBe("p1");
    });
  });

  it("ما بيعمل منشن شخصي بالغلط لمعرّف الحقل", async () => {
    const client = makeClient();
    await submitMentions(client, {
      postId: "p1", actorId: "me", channel: "all",
      text: `[@الهندسي](user:${ENG}) و[@سامي](user:u-9)`,
    });
    const rows = client.__inserts.filter(i => i.table === "post_mentions").map(i => i.payload);
    expect(rows.filter(r => r.user_id === ENG).length).toBe(0);
    expect(rows.filter(r => r.user_id === "u-9").length).toBe(1);
    expect(rows.filter(r => r.mention_group === ENG).length).toBe(1);
  });

  it("صاحب المنشن ما بينطرطر لما ينشر في فرعه (قاعدة البث)", async () => {
    const client = makeClient([{ user_id: "me" }]);
    await submitMentions(client, {
      postId: "p1", actorId: "me", channel: "all",
      text: `[@الهندسي](user:${ENG})`,
    });
    expect(client.__inserts.filter(i => i.table === "notifications").length).toBe(0);
  });

  it("في قناة الشباب ما يوصل المنشن للبنات", async () => {
    const client = makeClient();
    await submitMentions(client, {
      postId: "p1", actorId: "me", channel: "male",
      text: `[@الهندسي](user:${ENG})`,
    });
    expect(client.__eqCalls).toContainEqual({ table: "profiles", col: "gender", val: "male" });
  });
});

describe("منشن الحقل — العرض", () => {
  it("يعرض شارة الحقل (مو اسم شخص)", () => {
    const nodes = renderMentions(`يا [@الهندسي](user:${ENG})`) as any[];
    const txt = nodes.flatMap(n => (Array.isArray(n) ? n : [n])).filter(n => n?.props).map(n => n.props.children).flat().join(" ");
    expect(txt).toContain("الهندسي");
    const withTitle = nodes.flat().find(n => n?.props?.title?.includes?.("الهندسي"));
    expect(withTitle).toBeTruthy();
  });
});

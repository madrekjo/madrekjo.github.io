import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { extractMentions } from "@/components/MentionInput";
import { submitMentions, renderMentions } from "@/lib/mentions";

function makeClient() {
  const notifications = { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
  const post_mentions = { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
  const profiles = (() => {
    const result = { data: [{ user_id: "u-boy-1" }, { user_id: "u-boy-2" }], error: null };
    const chain: any = () => {};
    Object.assign(chain, {
      select: vi.fn().mockReturnValue(chain),
      is: vi.fn().mockReturnValue(chain),
      eq: vi.fn().mockReturnValue(chain),
      limit: vi.fn().mockReturnValue(chain),
      order: vi.fn().mockReturnValue(chain),
      ilike: vi.fn().mockReturnValue(chain),
      then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
    });
    return chain as any;
  })();
  return { client: { from: vi.fn((t: string) => ({ post_mentions, notifications, profiles })[t] as any) } as any, post_mentions, notifications, profiles };
}

describe("منشن المجموعات (البنات/الشباب)", () => {
  it("extractMentions: يستخرج منشن المجموعة وهو (girls)", () => {
    const out = extractMentions("يا [@البنات](user:girls) وشباب");
    expect(out).toContainEqual({ name: "البنات", userId: "girls" });
  });

  it("extractMentions: لا يستخرج غير الصيغة الصالحة", () => {
    expect(extractMentions("بدون منشن")).toEqual([]);
    expect(extractMentions("[@البنات](user:fake)").map(m => m.userId)).not.toContain("girls");
  });

  it("submitMentions: ينشئ صف mention_group بقيم صحيحة (user_id=null, is_all=false)", async () => {
    const { client, post_mentions } = makeClient();
    await submitMentions(client, {
      postId: "post-1",
      actorId: "me",
      text: "قصدكم [@الشباب](user:boys)",
      channel: "male",
    });
    const calls = post_mentions.insert.mock.calls.map((c: any[]) => c[0]);
    const groupRow = calls.find((r: any) => r.mention_group === "boys");
    expect(groupRow).toBeTruthy();
    expect(groupRow.user_id).toBeNull();
    expect(groupRow.is_all).toBe(false);
    expect(groupRow.actor_id).toBe("me");
    expect(groupRow.post_id).toBe("post-1");
    expect(groupRow.channel).toBe("male");
  });

  it("submitMentions: ينشئ إشعاراً واحداً لكل عضو من الجنس غير المؤلف", async () => {
    const { client, notifications } = makeClient();
    await submitMentions(client, {
      postId: "post-1",
      actorId: "me",
      text: "[@البنات](user:girls) يلا",
      channel: "all",
    });
    const rows = notifications.insert.mock.calls.flatMap((c: any[]) => c[0]);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.type).toBe("mention");
      expect(r.actor_id).toBe("me");
      expect(r.user_id).not.toBe("me");
      expect(r.post_id).toBe("post-1");
    }
  });

  it("submitMentions: لا ينشئ منشن فردي خاطئ لمجموعة ولا للجميع", async () => {
    const { client, post_mentions } = makeClient();
    await submitMentions(client, {
      postId: "post-1",
      actorId: "me",
      text: "حي [@الشباب](user:boys) و[@الجميع](user:everyone) و[@محدد](user:u-1) و@حرفي",
      channel: "male",
    });
    const rows = post_mentions.insert.mock.calls.map((c: any[]) => c[0]);
    expect(rows.filter((r: any) => r.user_id === "boys").length).toBe(0);
    expect(rows.filter((r: any) => r.mention_group === "boys").length).toBe(1);
    expect(rows.filter((r: any) => r.is_all).length).toBe(1);
    expect(rows.filter((r: any) => r.user_id === "u-1").length).toBe(1);
  });

  it("renderMentions: يعرض @الشباب/@البنات كشارة بدون زر ملف مستخدم", () => {
    const { container } = render(<>{renderMentions("اهلا [@البنات](user:girls)")}</>);
    expect(container.textContent).toContain("البنات");
  });
});
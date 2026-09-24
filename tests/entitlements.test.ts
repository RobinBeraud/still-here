import { describe, expect, it } from "vitest";
import { avatarMinutesRemaining, planToRows, resolveEntitlements } from "@/lib/services/entitlements";

const now = new Date("2026-09-24T00:00:00Z");

describe("resolveEntitlements", () => {
  it("defaults to the free plan", () => {
    const e = resolveEntitlements([], "ACTIVE", now);
    expect(e.max_memories).toBe(10);
    expect(e.can_use_live_avatar).toBe(false);
    expect(e.max_loved_ones).toBe(0);
  });

  it("does not depend on plan names, only on entitlement rows", () => {
    const rows = planToRows({ can_use_live_avatar: true, max_loved_ones: 3 }, "admin:gift", now, null);
    const e = resolveEntitlements(rows, "ACTIVE", now);
    expect(e.can_use_live_avatar).toBe(true);
    expect(e.max_loved_ones).toBe(3);
  });

  it("null max_memories means unlimited and wins", () => {
    const rows = planToRows({ max_memories: null }, "plan:still_here", now, null);
    expect(resolveEntitlements(rows, "ACTIVE", now).max_memories).toBeNull();
  });

  it("ignores expired and future rows", () => {
    const expired = planToRows({ max_loved_ones: 5 }, "plan:x", new Date("2020-01-01"), new Date("2021-01-01"));
    const future = planToRows({ max_loved_ones: 7 }, "plan:y", new Date("2030-01-01"), null);
    expect(resolveEntitlements([...expired, ...future], "ACTIVE", now).max_loved_ones).toBe(0);
  });

  it("adds minute packs on top of the plan", () => {
    const rows = [
      ...planToRows({ avatar_minutes_included: 300 }, "plan:still_here", now, null),
      ...planToRows({ avatar_minutes_extra: 60 }, "pack:1", now, null),
      ...planToRows({ avatar_minutes_extra: 60 }, "pack:2", now, null),
    ];
    const e = resolveEntitlements(rows, "ACTIVE", now);
    expect(avatarMinutesRemaining(e, 0)).toBe(420);
    expect(avatarMinutesRemaining(e, 400 * 60)).toBe(20);
    expect(avatarMinutesRemaining(e, 10_000 * 60)).toBe(0);
  });

  it("preservation mode suspends costly features but never data", () => {
    const rows = planToRows({ can_use_live_avatar: true, can_create_avatar: true, max_memories: null }, "plan:still_here", now, null);
    const e = resolveEntitlements(rows, "PRESERVATION_ONLY", now);
    expect(e.can_use_live_avatar).toBe(false);
    expect(e.can_create_avatar).toBe(false);
    expect(e.can_add_content).toBe(false);
  });

  it("grace period keeps everything working", () => {
    const rows = planToRows({ can_use_live_avatar: true }, "plan:still_here", now, null);
    expect(resolveEntitlements(rows, "GRACE_PERIOD", now).can_use_live_avatar).toBe(true);
  });
});

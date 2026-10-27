import { describe, expect, it } from "vitest";
import { formatDayTime } from "@/utils/format";
import { autoInviteSendMoment, jobSubtitle } from "./job-utils";

describe("autoInviteSendMoment", () => {
  it("is 08:00 WIB the day after closing for next_morning", () => {
    expect(autoInviteSendMoment("2026-10-30", null, "next_morning")).toEqual({ day: "2026-10-31", time: "08:00" });
    expect(autoInviteSendMoment("2026-10-27", "14:00", "next_morning")).toEqual({ day: "2026-10-28", time: "08:00" });
  });

  it("is the closing moment for on_close (midnight without a closing time)", () => {
    expect(autoInviteSendMoment("2026-10-27", "14:00", "on_close")).toEqual({ day: "2026-10-27", time: "14:00" });
    expect(autoInviteSendMoment("2026-10-31", "", "on_close")).toEqual({ day: "2026-11-01", time: "00:00" });
  });

  it("is null without a closing day", () => {
    expect(autoInviteSendMoment("", "14:00", "on_close")).toBeNull();
    expect(autoInviteSendMoment(null, null, "next_morning")).toBeNull();
  });
});

describe("formatDayTime / jobSubtitle", () => {
  it("adds the time only when it is set", () => {
    expect(formatDayTime("2026-10-27", "14:00")).toBe("27 Oct 2026, 14:00");
    expect(formatDayTime("2026-10-27", "14:00:00", { suffix: " WIB" })).toBe("27 Oct 2026, 14:00 WIB");
    expect(formatDayTime("2026-10-27", null, { suffix: " WIB" })).toBe("27 Oct 2026");
    expect(formatDayTime(null, "14:00")).toBe("—");
  });

  it("includes the closing time in the form builder subtitle", () => {
    const job = { title: "Data Scientist", employment_type: "full_time" as const, closes_on: "2026-10-27" };
    expect(jobSubtitle({ ...job, closes_time: "14:00" })).toBe("Data Scientist · Full-time · until 27 Oct 2026, 14:00 WIB");
    expect(jobSubtitle({ ...job, closes_time: null })).toBe("Data Scientist · Full-time · until 27 Oct 2026");
  });
});

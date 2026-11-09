import { describe, expect, it } from "vitest";
import { buildCsvForTest } from "./raffle-csv.test-helper";
import { buildWinEmail } from "./raffle-email";

const base = {
  firstName: "Sol",
  releaseName: "Surging Sparks booster box",
  pickupName: "Hoboken",
  deadlineAt: "2026-12-07T23:30:00Z",
  claimHours: 48,
};

describe("buildWinEmail", () => {
  it("tells the winner what they won, where to go and by when (New York time)", () => {
    const mail = buildWinEmail(base);
    expect(mail.subject).toBe("You won a spot: Surging Sparks booster box");
    expect(mail.text).toContain("Hi Sol,");
    expect(mail.text).toContain("Hoboken");
    expect(mail.text).toContain("Dec 7, 2026, 6:30 PM");
    expect(mail.html).toContain("Hoboken");
  });

  it("falls back to the number of hours when no deadline is set", () => {
    expect(buildWinEmail({ ...base, deadlineAt: null }).text).toContain("48 hours from now");
  });

  it("never lets a name or release title inject markup", () => {
    const mail = buildWinEmail({ ...base, firstName: "<img src=x onerror=alert(1)>", releaseName: "A & <b>B</b>" });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("<b>B</b>");
    expect(mail.html).toContain("&lt;img");
    expect(mail.html).toContain("A &amp; &lt;b&gt;B&lt;/b&gt;");
  });

  it("holds no login link, so a forwarded email can't be used to get in", () => {
    const mail = buildWinEmail(base);
    expect(mail.html.toLowerCase()).not.toContain("href=");
    expect(mail.text.toLowerCase()).not.toContain("http");
  });
});

describe("results CSV", () => {
  it("has a header, one line per entrant in order, and the right wording", () => {
    const csv = buildCsvForTest();
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe('"Position","Winner","Name","Member number","Home store","Entered","Outcome","Told by","Told at (New York)"');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"1","Yes","Sol Solo","MAX000001","Hoboken","Online","claimed","email+portal","2026-12-06 10:30"');
    expect(lines[2]).toContain('"2","No"');
    expect(lines[2]).toContain('"Not offered"');
  });

  it("stops spreadsheets from running a name as a formula", () => {
    const csv = buildCsvForTest("=HYPERLINK(\"http://evil\")");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

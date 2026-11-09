import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarChart, ShareBar } from "./bar-chart";

const money = (n: number) => `$${(n / 100).toFixed(2)}`;

describe("BarChart", () => {
  it("scales bars to the biggest value and gives screen readers the numbers", () => {
    const html = renderToStaticMarkup(
      <BarChart title="Net purchases per day" data={[{ label: "Nov 1", value: 10000 }, { label: "Nov 2", value: 5000 }]} format={money} />,
    );
    expect(html).toContain("height:100%");
    expect(html).toContain("height:50%");
    expect(html).toContain('aria-label="Net purchases per day. Total $150.00."');
    expect(html).toContain("<th scope=\"row\">Nov 2</th><td>$50.00</td>");
  });

  it("shows a friendly message when there is nothing to chart", () => {
    const html = renderToStaticMarkup(<BarChart title="Visits" data={[{ label: "Nov 1", value: 0 }]} format={String} emptyText="No visits." />);
    expect(html).toContain("No visits.");
    expect(html).not.toContain("height:");
  });

  it("keeps a tiny value visible", () => {
    const html = renderToStaticMarkup(<BarChart title="Visits" data={[{ label: "a", value: 1 }, { label: "b", value: 1000 }]} format={String} />);
    expect(html).toContain("height:3%");
  });
});

describe("ShareBar", () => {
  it("shows the count and the percentage", () => {
    const html = renderToStaticMarkup(<ShareBar label="Gold" value={3} total={12} color="#e0a800" />);
    expect(html).toContain("25%");
    expect(html).toContain('aria-label="Gold: 3 of 12, 25%"');
  });

  it("copes with a total of zero", () => {
    expect(renderToStaticMarkup(<ShareBar label="Base" value={0} total={0} color="#000" />)).toContain("0%");
  });
});

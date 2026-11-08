import pptxgen from "pptxgenjs";
import { applyLindstromTemplate, templateStandard } from "./lindstrom-template.mjs";
export async function renderPowerPoint(deck) {
  const t = globalThis.ReviewLanguage.translator(deck.request.language);
  const number = (value) =>
    new Intl.NumberFormat(t("en-GB"), { maximumFractionDigits: 1 }).format(value);
  const pptx = new pptxgen();
  pptx.defineLayout({
    name: "LINDSTROM",
    width: templateStandard.width,
    height: templateStandard.height,
  });
  pptx.layout = "LINDSTROM";
  pptx.author = "Lindström";
  pptx.subject = t("Customer annual review");
  pptx.title = `${deck.customer.name} · ${deck.period}`;
  pptx.company = "Lindström";
  pptx.lang = t("en-GB");
  pptx.theme = {
    headFontFace: templateStandard.headingFont,
    bodyFontFace: templateStandard.bodyFont,
    lang: t("en-GB"),
  };
  for (const [index, item] of deck.slides.entries()) {
    const slide = pptx.addSlide();
    const scale = (options) =>
      Object.fromEntries(
        Object.entries(options).map(([key, value]) => [
          key,
          typeof value === "number" &&
          [
            "x",
            "y",
            "w",
            "h",
            "fontSize",
            "catAxisLabelFontSize",
            "valAxisLabelFontSize",
            "titleFontSize",
            "dataLabelFormatCode",
          ].includes(key)
            ? value * 0.75
            : value,
        ]),
      );
    const text = slide.addText.bind(slide),
      shape = slide.addShape.bind(slide),
      chart = slide.addChart.bind(slide);
    slide.addText = (value, options) =>
      text(value, {
        ...scale(options),
        fontFace: options.bold ? templateStandard.headingFont : templateStandard.bodyFont,
      });
    slide.addShape = (type, options) => shape(type, scale(options));
    slide.addChart = (type, data, options) =>
      chart(type, data, { ...scale(options), chartFontFace: templateStandard.bodyFont });
    const cover = item.kind === "cover";
    slide.background = { color: cover ? "003F72" : "FFFFFF" };
    const ink = cover ? "FFFFFF" : "003F72";
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.3333,
      h: 0.085,
      line: { color: templateStandard.magenta },
      fill: { color: templateStandard.magenta },
    });
    slide.addText(item.kicker || t("CUSTOMER REVIEW"), {
      x: 2.25,
      y: 0.68,
      w: 10,
      h: 0.2,
      fontSize: 13,
      bold: true,
      charSpacing: 1.2,
      color: cover ? "FFFFFF" : templateStandard.teal,
      margin: 0,
    });
    slide.addText(item.title, {
      x: 0.55,
      y: 1.05,
      w: 12.1,
      h: 0.95,
      fontSize: cover ? 54 : 36,
      bold: true,
      color: ink,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    const tile = (kpi, x, y, w, h, onDark) => {
      slide.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w,
        h,
        rectRadius: 0.12,
        line: { color: onDark ? "1D5C8E" : "F2F6F9" },
        fill: { color: onDark ? "1D5C8E" : "F2F6F9" },
      });
      const tones = { better: "17602F", worse: "9C1C1C", neutral: "4F5D68" };
      const toneColor = (tone) => (onDark ? "D9E6EF" : (tones[tone] ?? tones.neutral));
      slide.addText(kpi.value, {
        x: x + 0.25,
        y: y + 0.15,
        w: w - 0.5,
        h: h * (kpi.delta ? 0.42 : 0.55),
        fontSize: 44,
        bold: true,
        color: onDark ? "FFFFFF" : templateStandard.blue,
        margin: 0,
        fit: "shrink",
      });
      slide.addText(kpi.label, {
        x: x + 0.25,
        y: y + h * (kpi.delta ? 0.52 : 0.62),
        w: w - 0.5,
        h: h * (kpi.delta ? 0.2 : 0.3),
        fontSize: 18,
        color: onDark ? "D9E6EF" : "4F5D68",
        margin: 0,
        fit: "shrink",
      });
      if (kpi.delta)
        slide.addText(kpi.delta, {
          x: x + 0.25,
          y: y + h * 0.74,
          w: w - 0.5,
          h: h * 0.2,
          fontSize: 15,
          bold: true,
          color: toneColor(kpi.tone),
          margin: 0,
          fit: "shrink",
        });
    };
    const layout = item.layout ?? "notes";
    if (layout === "cover") {
      slide.addText(item.lead ?? "", {
        x: 0.6,
        y: 2.15,
        w: 11.8,
        h: 0.6,
        fontSize: 24,
        color: "D9E6EF",
        margin: 0,
      });
      item.kpis.forEach((kpi, i) => tile(kpi, 0.6 + i * 4.05, 3.35, 3.8, 1.9, true));
    } else if (layout === "goals") {
      item.kpis.forEach((goal, i) => {
        const y = 2.13 + i * 1.27;
        const tone = goal.tone === "better" ? "17602F" : "9C1C1C";
        const goalText = (text, x, offset, w, h, options) =>
          slide.addText(text, {
            x,
            y: y + offset,
            w,
            h,
            margin: 0,
            color: templateStandard.blue,
            fit: "shrink",
            ...options,
          });
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.6,
          y,
          w: 12.1,
          h: 1.13,
          rectRadius: 0.08,
          line: { color: "F2F6F9" },
          fill: { color: "F2F6F9" },
        });
        goalText(goal.label, 0.85, 0.2, 3.1, 0.7, { fontSize: 18, bold: true });
        goalText(t("Target"), 4.05, 0.15, 2.55, 0.24, { fontSize: 12 });
        goalText(goal.target, 4.05, 0.43, 2.55, 0.36, { fontSize: 19, bold: true });
        goalText("→", 6.7, 0.12, 2, 0.32, { fontSize: 22, align: "center" });
        goalText(`${goal.delta} ${t("vs target")}`, 6.7, 0.51, 2, 0.4, {
          fontSize: 13,
          bold: true,
          align: "center",
          color: tone,
        });
        goalText(t("Actual"), 8.95, 0.15, 3.45, 0.24, { fontSize: 12 });
        goalText(goal.value, 8.95, 0.43, 3.45, 0.36, { fontSize: 19, bold: true });
        goalText(
          t(goal.tone === "better" ? "Target met" : "Target missed"),
          8.95,
          0.82,
          3.45,
          0.2,
          {
            fontSize: 11,
            color: tone,
          },
        );
      });
    } else if (layout === "kpis") {
      if (item.kpis.length > 4)
        item.kpis.forEach((kpi, i) =>
          tile(kpi, 0.6 + (i % 3) * 4.05, 2.15 + Math.floor(i / 3) * 1.85, 3.8, 1.65, false),
        );
      else item.kpis.forEach((kpi, i) => tile(kpi, 0.6 + i * 3.05, 2.6, 2.85, 2.3, false));
      if (item.fine?.length)
        slide.addText(item.fine.join("   |   "), {
          x: 0.6,
          y: 5.15,
          w: 11.8,
          h: 0.45,
          fontSize: 13,
          color: "4F5D68",
          margin: 0,
          fit: "shrink",
        });
    } else if (layout === "steps") {
      const top = item.lead ? 3.15 : 2.3;
      if (item.lead) {
        slide.addText([item.lead, ...(item.fine ?? [])].join("\n"), {
          x: 0.6,
          y: 2.05,
          w: 11.8,
          h: 0.62,
          fontSize: 16,
          color: "33475A",
          margin: 0,
          fit: "shrink",
        });
        slide.addText(t("Proposed next steps"), {
          x: 0.6,
          y: 2.76,
          w: 11.8,
          h: 0.3,
          fontSize: 16,
          bold: true,
          color: templateStandard.blue,
          margin: 0,
        });
      }
      item.steps.forEach((step, i) => {
        const x = 0.6 + i * 4.05;
        slide.addShape(pptx.ShapeType.roundRect, {
          x,
          y: top,
          w: 3.8,
          h: 5.7 - top,
          rectRadius: 0.12,
          line: { color: "F2F6F9" },
          fill: { color: "F2F6F9" },
        });
        slide.addText(String(i + 1), {
          x: x + 0.3,
          y: top + 0.2,
          w: 1,
          h: 0.8,
          fontSize: 40,
          bold: true,
          color: templateStandard.teal,
          margin: 0,
        });
        slide.addText(step, {
          x: x + 0.3,
          y: top + 1.05,
          w: 3.2,
          h: 5.5 - top - 1.05,
          fontSize: 20,
          color: templateStandard.blue,
          margin: 0,
          fit: "shrink",
          valign: "top",
        });
      });
    } else if (layout === "actions") {
      slide.addText(item.fine.map((text, index) => `${index + 1}. ${text}`).join("\n\n"), {
        x: 0.6,
        y: 2.15,
        w: 11.6,
        h: 3.65,
        fontSize: 18,
        color: "33475A",
        margin: 0,
        valign: "top",
        fit: "shrink",
      });
    } else if (layout === "notes") {
      slide.addText((item.fine ?? []).join("\n\n"), {
        x: 0.6,
        y: 2.4,
        w: 11.6,
        h: 3,
        fontSize: 20,
        color: "4F5D68",
        margin: 0,
        valign: "top",
        fit: "shrink",
      });
    } else {
      slide.addText(item.hero ?? "", {
        x: 0.6,
        y: 2.25,
        w: 5.1,
        h: 1.35,
        fontSize: 88,
        bold: true,
        color: templateStandard.blue,
        margin: 0,
        fit: "shrink",
      });
      slide.addText(item.lead ?? "", {
        x: 0.6,
        y: 3.7,
        w: 4.9,
        h: 0.95,
        fontSize: 22,
        color: "33475A",
        margin: 0,
        valign: "top",
        fit: "shrink",
      });
      if (item.trend)
        slide.addText(item.trend.delta, {
          x: 0.6,
          y: 4.66,
          w: 4.9,
          h: 0.35,
          fontSize: 18,
          bold: true,
          color: { better: "17602F", worse: "9C1C1C" }[item.trend.tone] ?? "4F5D68",
          margin: 0,
        });
      const tileY = item.trend ? 5.04 : 4.72;
      (item.kpis ?? []).forEach((kpi, i) =>
        tile(kpi, 0.6 + i * 2.5, tileY, 2.35, 6.12 - tileY + 0.08, false),
      );
      const type = item.chart?.type;
      const frame = { x: 6, y: 2.1, w: 6.7, h: 4 };
      const quiet = {
        ...frame,
        lang: t("en-GB"),
        showTitle: false,
        catAxisLabelFontSize: 15,
        valAxisHidden: true,
        valGridLine: { style: "none" },
        catGridLine: { style: "none" },
        showLegend: false,
      };
      if (type === "compare") {
        const { labels, values, unit } = item.chart;
        const most = Math.max(...values, 1);
        values.forEach((value, i) => {
          const y = 2.45 + i * 1.7;
          const width = Math.max((value / most) * 6.4, 0.1);
          slide.addText(labels[i], {
            x: 6,
            y,
            w: 6.4,
            h: 0.4,
            fontSize: 20,
            bold: true,
            color: templateStandard.blue,
            margin: 0,
          });
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 6,
            y: y + 0.45,
            w: width,
            h: 0.62,
            rectRadius: 0.08,
            line: { color: i ? "DBE5EC" : templateStandard.blue },
            fill: { color: i ? "DBE5EC" : templateStandard.blue },
          });
          const inside = width > 3;
          slide.addText(`${number(value)} ${t(unit)}`, {
            x: inside ? 6.2 : 6 + width + 0.15,
            y: y + 0.45,
            w: 5,
            h: 0.62,
            fontSize: 20,
            bold: true,
            color: inside && !i ? "FFFFFF" : templateStandard.blue,
            margin: 0,
            valign: "middle",
          });
        });
      } else if (type === "columns") {
        slide.addChart(
          pptx.ChartType.bar,
          [{ name: t(item.chart.unit), labels: item.chart.labels, values: item.chart.values }],
          {
            ...quiet,
            showTitle: Boolean(item.chart.name),
            title: item.chart.name,
            titleFontSize: 15,
            barDir: "col",
            barGapWidthPct: 35,
            chartColors: [templateStandard.blue],
          },
        );
      } else if (type === "donut") {
        slide.addChart(
          pptx.ChartType.doughnut,
          [{ name: item.title, labels: item.chart.labels, values: item.chart.values }],
          {
            ...frame,
            holeSize: 68,
            chartColors: [templateStandard.blue, "DBE5EC"],
            showLegend: true,
            legendPos: "r",
            legendFontSize: 16,
            showPercent: false,
            showValue: false,
            showLabel: false,
            dataBorder: { pt: 1, color: "FFFFFF" },
          },
        );
      } else if (type === "line") {
        const { labels, values, reference, name, referenceName } = item.chart;
        const known = values.flatMap((value, i) => (value == null ? [] : [i]));
        const pick = (list) => known.map((i) => list[i]);
        slide.addChart(
          pptx.ChartType.line,
          [
            { name, labels: pick(labels), values: pick(values) },
            ...(reference
              ? [{ name: referenceName ?? "", labels: pick(labels), values: pick(reference) }]
              : []),
          ],
          {
            ...quiet,
            chartColors: [templateStandard.blue, "A9C1D4"],
            lineDataSymbol: "none",
            lineSize: 3,
            showLegend: true,
            legendPos: "b",
            legendFontSize: 11,
            catAxisLabelFontSize: 13,
          },
        );
      }
    }
    if (item.added?.length)
      slide.addText(item.added.join(" "), {
        x: 0.6,
        y: 5.85,
        w: 12.1,
        h: 0.42,
        fontSize: 15,
        color: templateStandard.blue,
        margin: 0,
        fit: "shrink",
      });
    if (item.boundary || item.source)
      slide.addText(
        [
          item.boundary ? `${t("Context")}: ${item.boundary}` : "",
          item.source ? t`Source: ${item.source}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        {
          x: 0.6,
          y: 6.25,
          w: 12.1,
          h: 0.46,
          fontSize: 12,
          color: cover ? "FFFFFF" : "33475A",
          fill: { color: cover ? "174E79" : "F2F6F9" },
          margin: [3, 8, 3, 8],
          fit: "shrink",
        },
      );
    slide.addText(deck.footer, {
      x: 0.6,
      y: 6.85,
      w: 11.6,
      h: 0.3,
      fontSize: 9,
      color: cover ? "FFFFFF" : "5F707D",
      margin: 0,
      fit: "shrink",
    });
    slide.addText(String(index + 1), {
      x: 12.4,
      y: 6.85,
      w: 0.3,
      h: 0.3,
      fontSize: 10,
      color: ink,
      margin: 0,
      align: "right",
    });
    slide.addNotes(
      [
        deck.footer,
        deck.dashboard &&
          `Dataset: ${deck.dashboard.datasetVersion} · Metrics: ${deck.dashboard.calculationVersion} · Snapshot: ${deck.dashboard.id}`,
        item.paragraphs.join("\n\n"),
        item.relevance,
        item.source,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return applyLindstromTemplate(
    Buffer.from(await pptx.write({ outputType: "nodebuffer", compression: true })),
  );
}

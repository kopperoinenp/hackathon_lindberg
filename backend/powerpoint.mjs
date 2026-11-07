import pptxgen from "pptxgenjs";
import { applyLindstromTemplate, templateStandard } from "./lindstrom-template.mjs";
export async function renderPowerPoint(deck, provenance) {
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
  pptx.author = "Lindström customer review prototype";
  pptx.subject = t("Synthetic customer annual review");
  pptx.title = `${deck.customer.name} · ${deck.period}`;
  pptx.company = "Hackathon prototype";
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
    slide.addText(t("CUSTOMER REVIEW"), {
      x: 2.25,
      y: 0.68,
      w: 10,
      h: 0.2,
      fontSize: 9,
      bold: true,
      charSpacing: 1.7,
      color: cover ? "FFFFFF" : templateStandard.teal,
      margin: 0,
    });
    slide.addText(item.title, {
      x: 0.55,
      y: 1.05,
      w: 12.1,
      h: 0.95,
      fontSize: cover ? 38 : 30,
      bold: true,
      color: ink,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
    if (item.kind === "overview") {
      for (const [i, fact] of item.facts.entries()) {
        const x = 0.6 + (i % 3) * 4.05,
          y = 2.05 + Math.floor(i / 3) * 1.4;
        slide.addShape(pptx.ShapeType.rect, {
          x,
          y,
          w: 3.8,
          h: 1.2,
          line: { color: "E2EAF0" },
          fill: { color: "F4F7FA" },
        });
        slide.addText(fact.label, {
          x: x + 0.15,
          y: y + 0.15,
          w: 3.5,
          h: 0.25,
          fontSize: 12,
          color: templateStandard.blue,
          margin: 0,
        });
        slide.addText(fact.value, {
          x: x + 0.15,
          y: y + 0.55,
          w: 3.5,
          h: 0.45,
          fontSize: 30,
          bold: true,
          color: templateStandard.blue,
          margin: 0,
          fit: "shrink",
        });
      }
      slide.addText(item.paragraphs.join("\n"), {
        x: 0.6,
        y: 5.15,
        w: 12,
        h: 0.85,
        fontSize: 12,
        color: templateStandard.blue,
        margin: 0,
        fit: "shrink",
      });
    } else if (item.chart) {
      const top = item.value ? 2.7 : 2.05;
      if (item.value)
        slide.addText(item.value, {
          x: 0.6,
          y: 2,
          w: 3.7,
          h: 0.6,
          fontSize: 38,
          bold: true,
          color: "003F72",
          margin: 0,
        });
      slide.addText(item.paragraphs.join("\n\n"), {
        x: 0.6,
        y: top,
        w: 4.6,
        h: 2.2,
        fontSize: 18,
        color: ink,
        margin: 0,
        fit: "shrink",
        valign: "top",
      });
      slide.addChart(
        pptx.ChartType.bar,
        [
          {
            name: t(item.chart.unit),
            labels:
              item.kind === "repairs"
                ? item.chart.labels
                : item.chart.labels.map(
                    (label, i) =>
                      `${label} · ${number(item.chart.values[i])} ${t(item.chart.unit)}`,
                  ),
            values: item.chart.values,
          },
        ],
        {
          x: 5.6,
          y: 2.05,
          w: 7.1,
          h: 3.8,
          barDir: item.kind === "repairs" ? "col" : "bar",
          catAxisLabelFontSize: 12,
          valAxisLabelFontSize: 10,
          showLegend: false,
          showValue: false,
          lang: t("en-GB"),
          catAxisOrientation: item.kind === "repairs" ? "minMax" : "maxMin",
          catAxisLabelFontFace: templateStandard.bodyFont,
          valAxisLabelFontFace: templateStandard.bodyFont,
          valAxisLabelFormatCode: "0",
          valAxisHidden: item.kind !== "repairs",
          dataLabelFormatCode: item.chart.unit === "items" ? "#,##0" : "#,##0.0",
          chartColors:
            item.kind === "repairs" ? [templateStandard.green] : [templateStandard.blue, "A9C1D4"],
          showTitle: true,
          title: t(item.chart.unit),
          titleFontSize: 11,
          showCatName: false,
          showBorder: false,
          showCatNameInLegend: false,
          showMarker: false,
          showCatNameInTitle: false,
          valGridLine: { color: "E5EAF0", width: 1 },
          showShadow: false,
        },
      );
      slide.addText(item.relevance || "", {
        x: 0.6,
        y: 5.65,
        w: 12.05,
        h: 0.45,
        fontSize: 12,
        color: "003F72",
        margin: 0,
        fit: "shrink",
      });
    } else {
      const paragraphs = item.paragraphs.join("\n\n");
      slide.addText(paragraphs, {
        x: 0.6,
        y: cover ? 2.45 : 2.1,
        w: 11.95,
        h: cover ? 3.4 : 3.75,
        fontSize: paragraphs.length > 1100 ? 14 : paragraphs.length > 750 ? 17 : cover ? 24 : 21,
        color: ink,
        margin: 0,
        fit: "shrink",
        valign: "top",
        breakLine: false,
        paraSpaceAfterPt: 14,
      });
    }
    if (item.boundary || item.source)
      slide.addText(
        [item.boundary, item.source ? t`Source: ${item.source}` : ""].filter(Boolean).join(" · "),
        {
          x: 0.6,
          y: 6.25,
          w: 12.1,
          h: 0.3,
          fontSize: 10,
          color: cover ? "FFFFFF" : "5F707D",
          margin: 0,
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
      t`${deck.footer}\n${item.paragraphs.join("\n\n")}\n${item.relevance || ""}\n${item.source || ""}\nContent selection: ${provenance.provider}${provenance.model ? ` / ${provenance.model}` : ""}. Calculations and file generation are deterministic. AI selects from approved headlines and slide orders.`,
    );
  }
  return applyLindstromTemplate(
    Buffer.from(await pptx.write({ outputType: "nodebuffer", compression: true })),
  );
}

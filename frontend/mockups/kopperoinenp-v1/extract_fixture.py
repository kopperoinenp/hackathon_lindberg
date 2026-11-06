"""Rebuild the browser fixture from the provided synthetic XLSX using stdlib only.

Usage: python extract_fixture.py path/to/synthetic-pack.xlsx
The workbook is read-only and is never copied into the repository.
"""

import argparse
import json
import posixpath
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def read_workbook(path):
    """Read sparse cells by their column references, including inline strings."""
    with ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = [
                "".join(node.itertext())
                for node in ET.fromstring(archive.read("xl/sharedStrings.xml"))
            ]
        relations = {
            node.attrib["Id"]: node.attrib["Target"]
            for node in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        result = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).findall(".//s:sheet", NS):
            target = relations[sheet.attrib[RID]]
            member = (
                posixpath.normpath("xl/" + target) if not target.startswith("/") else target[1:]
            )
            records = []
            for row in ET.fromstring(archive.read(member)).findall(".//s:sheetData/s:row", NS):
                values = {}
                for cell in row:
                    column = "".join(char for char in cell.attrib["r"] if char.isalpha())
                    value = cell.find("s:v", NS)
                    text = value.text if value is not None else "".join(cell.itertext())
                    if cell.attrib.get("t") == "s":
                        text = shared[int(text)]
                    elif cell.attrib.get("t") not in ("inlineStr", "str", "b") and text:
                        text = float(text)
                    values[column] = text
                records.append(values)
            headers = records[0]
            result[sheet.attrib["name"]] = [
                {header: row.get(column, "") for column, header in headers.items()}
                for row in records[1:]
            ]
        return result


def build_fixture(tables):
    customers = tables["Customers"]
    sites = tables["Sites"]
    monthly = defaultdict(lambda: defaultdict(float))
    for row in tables["Service_Activity"]:
        key = (row["customer_id"], row["site_id"], row["month"])
        for field in (
            "allocated_pieces",
            "active_assets_scanned",
            "washed_pieces",
            "customer_washed_kg",
        ):
            monthly[key][field] += row[field]
    for row in tables["Customer_Impacts"]:
        key = (row["customer_id"], row["site_id"], row["month"])
        for field in ("allocated_water_l", "allocated_process_kgco2e", "allocated_delivery_kgco2e"):
            monthly[key][field] += row[field]
    for row in tables["Repairs"]:
        key = (row["customer_id"], row["site_id"], row["month"])
        monthly[key]["repair_count"] += row["repair_count"]
    # Cycles and wearers are deliberately omitted: they require separately defined KPIs.
    return {
        "source": "Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx",
        "status": "SYNTHETIC",
        "year": "2025",
        "customers": customers,
        "sites": sites,
        "baselines": tables["Baselines"],
        "records": [
            {"customer": customer, "site": site, "month": month, **dict(values)}
            for (customer, site, month), values in sorted(monthly.items())
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    args = parser.parse_args()
    fixture = build_fixture(read_workbook(args.workbook))
    output = Path(__file__).with_name("data.js")
    output.write_text(
        "// Generated from the supplied SYNTHETIC workbook. See README.md.\n"
        "globalThis.REVIEW_DATA = " + json.dumps(fixture, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(fixture['records'])} monthly site records to {output.name}")


if __name__ == "__main__":
    main()

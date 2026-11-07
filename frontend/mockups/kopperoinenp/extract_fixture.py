"""Rebuild the browser fixture from the provided synthetic XLSX using stdlib only.

Usage: python extract_fixture.py path/to/synthetic-pack.xlsx
The source workbook is read-only; this script only rebuilds the derived fixture.
"""

import argparse
import json
import posixpath
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta
from math import isfinite
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


DETAIL_KEY = ("month", "customer_id", "site_id", "laundry_id", "product_id")
WASTE_ROUTES = ("reuse_kg", "recycling_kg", "energy_recovery_kg", "incineration_kg")
ACTIVITY_FIELDS = (
    "allocated_pieces",
    "active_assets_scanned",
    "washed_pieces",
    "customer_washed_kg",
    "service_requests",
)
IMPACT_FIELDS = (
    "allocated_water_l",
    "allocated_energy_kwh",
    "allocated_process_kgco2e",
    "allocated_delivery_kgco2e",
    "allocated_textile_waste_kg",
)


def index_rows(tables, sheet, fields):
    rows = {}
    for row in tables[sheet]:
        key = tuple(row[field] for field in fields)
        if "" in key or None in key or key in rows:
            raise ValueError(f"{sheet}: missing or duplicate key {key}")
        rows[key] = row
    return rows


def quantities(row, fields):
    values = {}
    for field in fields:
        value = row[field]
        if not isinstance(value, (int, float)) or not isfinite(value) or value < 0:
            raise ValueError(f"Missing or invalid value for {field}: {value!r}")
        values[field] = value
    return values


def build_detail(tables):
    activity = index_rows(tables, "Service_Activity", DETAIL_KEY)
    impacts = index_rows(tables, "Customer_Impacts", DETAIL_KEY)
    waste = index_rows(tables, "Waste_Circularity", ("month", "laundry_id"))
    sites = index_rows(tables, "Sites", ("site_id",))
    customers = index_rows(tables, "Customers", ("customer_id",))
    products = index_rows(tables, "Products", ("product_id",))
    laundries = index_rows(tables, "Laundries", ("laundry_id",))
    if activity.keys() != impacts.keys():
        raise ValueError("Service_Activity and Customer_Impacts keys differ")
    repairs = defaultdict(lambda: defaultdict(float))
    for key, row in index_rows(tables, "Repairs", (*DETAIL_KEY, "repair_type")).items():
        if key[:-1] not in activity:
            raise ValueError(f"Repair has no matching activity: {key}")
        for field, value in quantities(
            row,
            (
                "repair_count",
                "estimated_replacements_postponed",
                "estimated_avoided_product_kgco2e",
            ),
        ).items():
            repairs[key[:-1]][field] += value
    detail = []
    for key, row in sorted(activity.items()):
        month, customer, site, laundry, product = key
        if (
            (customer,) not in customers
            or sites.get((site,), {}).get("customer_id") != customer
            or (product,) not in products
            or (laundry,) not in laundries
        ):
            raise ValueError(f"Invalid dimension reference: {key}")
        values = quantities(row, ACTIVITY_FIELDS)
        impact = impacts[key]
        if values["customer_washed_kg"] != impact["customer_washed_kg"]:
            raise ValueError(f"Washed kg differs between sources: {key}")
        values.update(quantities(impact, IMPACT_FIELDS))
        routes = quantities(waste[(month, laundry)], WASTE_ROUTES)
        route_total = sum(routes.values())
        allocated_waste = values["allocated_textile_waste_kg"]
        if allocated_waste and not route_total:
            raise ValueError(f"Missing waste distribution: {key}")
        values["wasteRoutes"] = {
            name: allocated_waste * kg / route_total if route_total else 0
            for name, kg in routes.items()
        }
        detail.append(
            {
                "month": month,
                "customer": customer,
                "site": site,
                "laundry": laundry,
                "product": product,
                **values,
                **{
                    field: repairs[key][field]
                    for field in (
                        "repair_count",
                        "estimated_replacements_postponed",
                        "estimated_avoided_product_kgco2e",
                    )
                },
            }
        )
    cycles = {}
    for row in index_rows(tables, "Service_Cycles", ("asset_id", "cycle_number")).values():
        values = quantities(row, ("pickup_timestamp", "delivered_timestamp", "cycle_hours"))
        pickup = datetime(1899, 12, 30) + timedelta(days=values["pickup_timestamp"])
        month = pickup.strftime("%Y-%m")
        customer, site, laundry, product = (row[field] for field in DETAIL_KEY[1:])
        if (
            sites.get((site,), {}).get("customer_id") != customer
            or (product,) not in products
            or (laundry,) not in laundries
            or not month.startswith("2025-")
            or abs(
                (values["delivered_timestamp"] - values["pickup_timestamp"]) * 24
                - values["cycle_hours"]
            )
            > 0.01
            or row["performance_flag"] not in ("ON_TIME", "LATE")
        ):
            raise ValueError(f"Invalid service cycle: {row['asset_id']}")
        key = (month, customer, site, laundry, product)
        group = cycles.setdefault(
            key,
            {
                "month": month,
                "customer": customer,
                "site": site,
                "laundry": laundry,
                "product": product,
                "hours": [],
                "late": 0,
            },
        )
        group["hours"].append(values["cycle_hours"])
        group["late"] += int(row["performance_flag"] == "LATE")
    return {
        "products": tables["Products"],
        "detail": detail,
        "cycleGroups": list(cycles.values()),
    }


def build_fixture(tables):
    detail = build_detail(tables)
    customers = tables["Customers"]
    sites = tables["Sites"]
    monthly = defaultdict(lambda: defaultdict(float))
    for row in detail["detail"]:
        key = (row["customer"], row["site"], row["month"])
        for field in (
            *ACTIVITY_FIELDS[:4],
            "allocated_water_l",
            "allocated_process_kgco2e",
            "allocated_delivery_kgco2e",
            "repair_count",
        ):
            monthly[key][field] += row[field]
    # Wearer counts have no person identifier and cannot be deduplicated.
    return {
        "source": "Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx",
        "status": "SYNTHETIC",
        "year": "2025",
        "customers": customers,
        "sites": sites,
        "baselines": tables["Baselines"],
        **detail,
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

"""Read bounded CSV and OOXML spreadsheets without evaluating spreadsheet code."""

import csv
import json
import math
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from zipfile import ZipFile

MAX_ROWS = 50_000
MAX_COLUMNS = 64
MAX_TABLES = 24
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
CELL = re.compile(r"^([A-Z]{1,3})([1-9][0-9]{0,6})$")
TOTAL = re.compile(r"^(?:grand total|total|subtotal|yhteensä|kaikki yhteensä|summa)$", re.I)
DATE_STYLE = set(range(14, 18)) | {
    22,
    27,
    28,
    29,
    30,
    31,
    34,
    35,
    36,
    50,
    51,
    52,
    53,
    54,
    55,
    56,
    57,
    58,
}


def nonempty(value):
    return value is not None and (not isinstance(value, str) or bool(value.strip()))


def index_of(label):
    index = 0
    for char in label:
        index = index * 26 + ord(char) - 64
    return index - 1


def looks_like_header(values):
    if not values or any(not isinstance(value, str) for value in values):
        return False
    labels = [value.strip() for value in values]
    return all(
        0 < len(label) <= 100
        and any(char.isalpha() for char in label)
        and not re.fullmatch(r"\d{4}-\d\d(?:-\d\d)?", label)
        for label in labels
    )


def rectangular_table(rows, *, skip_titles):
    """Use a plausible header and keep empty cells under their original columns."""
    if not rows:
        return []
    position = 0
    if skip_titles:
        candidates = []
        for i, row in enumerate(rows[:20]):
            columns = {column for column, value in row.items() if nonempty(value)}
            if not looks_like_header([row[column] for column in sorted(columns)]):
                continue
            following = rows[i + 1 : i + 7]
            aligned = sum(len(columns & set(item)) for item in following)
            if following and aligned:
                candidates.append((aligned, len(columns), -i))
        if not candidates:
            return []
        position = -max(candidates)[2]
    header = rows[position]
    columns = sorted(column for column, value in header.items() if nonempty(value))
    labels = [str(header[column]).strip() for column in columns]
    if not labels or len(labels) > MAX_COLUMNS or any(len(label) > 100 for label in labels):
        raise ValueError("A table must have 1 to 64 column labels of up to 100 characters.")
    if len({label.casefold() for label in labels}) != len(labels):
        raise ValueError("Table headers must be unique. Rename repeated column headers.")
    result = []
    column_set = set(columns)
    for row in rows[position + 1 :]:
        if any(column not in column_set and nonempty(value) for column, value in row.items()):
            raise ValueError("A data cell has no column header. Name all populated columns.")
        values = [row.get(column) for column in columns]
        if not any(map(nonempty, values)):
            continue
        if [str(value).strip() for value in values] == labels:
            continue
        first = next(value for value in values if nonempty(value))
        if isinstance(first, str) and TOTAL.fullmatch(first.strip()):
            continue
        result.append(dict(zip(labels, values, strict=True)))
        if len(result) > MAX_ROWS:
            raise ValueError("Import exceeds 50,000 rows.")
    return result


def sheet_tables(name, rows):
    blocks = []
    previous = None
    for number, row in sorted(rows.items()):
        if previous is None or number > previous + 1:
            blocks.append([])
        blocks[-1].append(row)
        previous = number
    # Split only where each block has an explicit-looking header and detail rows.
    # A blank line in a regular table must not turn the next detail into a header.
    candidates = [block for block in blocks if len(block) > 1]
    if (
        len(candidates) > 1
        and all(
            len(block) > 1 or len(block[0]) == 1 and looks_like_header(list(block[0].values()))
            for block in blocks
        )
        and all(
            len(block) >= 4
            and looks_like_header(list(block[0].values()))
            and any(isinstance(value, (int, float)) for row in block[1:] for value in row.values())
            for block in candidates
        )
    ):
        headers = [tuple(sorted(block[0].items())) for block in candidates]
        if len(set(headers)) == len(headers):
            return {
                f"{name} / Block {index}": rectangular_table(block, skip_titles=False)
                for index, block in enumerate(candidates, 1)
            }
    return {name: rectangular_table([row for block in blocks for row in block], skip_titles=True)}


def read_csv(source):
    with source.open(encoding="utf-8-sig", newline="") as stream:
        sample = stream.read(8192)
        stream.seek(0)
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t").delimiter
        except csv.Error:
            first = next((line for line in sample.splitlines() if line.strip()), "")
            delimiter = max(
                (",", ";", "\t"),
                key=lambda char: len(next(csv.reader([first], delimiter=char), [])),
            )
        csv.field_size_limit(65536)
        rows = []
        width = None
        for values in csv.reader(stream, delimiter=delimiter, strict=True):
            if not any(map(nonempty, values)):
                continue
            if width is None:
                width = len(values)
                if any(not nonempty(value) for value in values):
                    raise ValueError("CSV headers must be nonempty.")
            if len(values) > width:
                raise ValueError("A CSV row has more fields than its header.")
            rows.append({index: value for index, value in enumerate(values) if nonempty(value)})
            if len(rows) > MAX_ROWS + 1:
                raise ValueError("Import exceeds 50,000 rows.")
        return {"CSV": rectangular_table(rows, skip_titles=False)}


def xml(archive, member):
    contents = archive.read(member)
    normalized = contents.upper().replace(b"\0", b"")
    if b"<!DOCTYPE" in normalized or b"<!ENTITY" in normalized:
        raise ValueError("XML declarations with external or custom entities are unsupported.")
    return ET.fromstring(contents)


def relationships(archive, member, base):
    result = {}
    for relation in xml(archive, member):
        if relation.get("TargetMode") == "External":
            continue
        target = relation.attrib["Target"]
        resolved = posixpath.normpath(
            target.lstrip("/") if target.startswith("/") else posixpath.join(base, target)
        )
        if resolved.startswith("xl/"):
            result[relation.attrib["Id"]] = resolved
    return result


def number_styles(archive):
    if "xl/styles.xml" not in archive.namelist():
        return set(), set()
    styles = xml(archive, "xl/styles.xml")
    dates, percentages = set(DATE_STYLE), {9, 10}
    for item in styles.findall(f"{NS}numFmts/{NS}numFmt"):
        fmt = re.sub(r'"[^"]*"|\\.|\[[^\]]*\]', "", item.get("formatCode", "").lower())
        if re.search(r"[yd]", fmt) and not re.search(r"[0#]", fmt):
            dates.add(int(item.attrib["numFmtId"]))
        if "%" in fmt:
            percentages.add(int(item.attrib["numFmtId"]))
    formats = [int(item.get("numFmtId", "0")) for item in styles.findall(f"{NS}cellXfs/{NS}xf")]
    return (
        {i for i, value in enumerate(formats) if value in dates},
        {i for i, value in enumerate(formats) if value in percentages},
    )


def cell_value(cell, strings, formats, origin):
    kind = cell.get("t", "n")
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(f".//{NS}t"))
    value = cell.findtext(f"{NS}v")
    if value is None:
        return "#UNCALCULATED!" if cell.find(f"{NS}f") is not None else None
    if kind == "s":
        index = int(value)
        if index < 0 or index >= len(strings):
            raise ValueError("Invalid Excel shared string reference.")
        return strings[index]
    if kind == "b":
        return value == "1"
    if kind != "n":
        return value
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Spreadsheet contains a nonfinite number.")
    dates, percentages = formats
    style = int(cell.get("s", "0"))
    if style in dates:
        return (origin + timedelta(days=number)).date().isoformat()
    if style in percentages:
        return f"{number * 100:.12f}".rstrip("0").rstrip(".") + "%"
    return number


def sheet_rows(archive, member, strings, formats, origin):
    rows = {}
    for row in xml(archive, member).findall(f"{NS}sheetData/{NS}row"):
        for cell in row.findall(f"{NS}c"):
            address = CELL.fullmatch(cell.get("r", ""))
            if not address:
                raise ValueError("Invalid Excel cell reference.")
            column, row_number = index_of(address[1]), int(address[2])
            value = cell_value(cell, strings, formats, origin)
            if nonempty(value):
                rows.setdefault(row_number, {})[column] = value
        if len(rows) > MAX_ROWS + MAX_TABLES * 20:
            raise ValueError("Import exceeds 50,000 rows.")
    return rows


def excel_tables(archive, member, rows):
    directory, name = posixpath.split(member)
    rels = posixpath.join(directory, "_rels", name + ".rels")
    if rels not in archive.namelist():
        return {}
    result = {}
    for target in relationships(archive, rels, directory).values():
        if not target.startswith("xl/tables/"):
            continue
        table = xml(archive, target)
        start, end = (CELL.fullmatch(part) for part in table.attrib["ref"].split(":"))
        if not start or not end:
            raise ValueError("Invalid Excel table range.")
        first, last = index_of(start[1]), index_of(end[1])
        low, high = int(start[2]), int(end[2]) - int(table.get("totalsRowCount", "0"))
        if last - first >= MAX_COLUMNS or high - low > MAX_ROWS:
            raise ValueError("An Excel table exceeds the import size limit.")
        selected = [
            {column: value for column, value in row.items() if first <= column <= last}
            for n, row in sorted(rows.items())
            if low <= n <= high
        ]
        labels = [
            item.attrib["name"] for item in table.findall(f"{NS}tableColumns/{NS}tableColumn")
        ]
        if labels:
            selected = [dict(enumerate(labels, first))] + [
                {column: value for column, value in row.items() if first <= column <= last}
                for n, row in sorted(rows.items())
                if low + int(table.get("headerRowCount", "1")) <= n <= high
            ]
        name = table.get("displayName") or table.attrib["name"]
        if name in result:
            raise ValueError("Excel table names must be unique.")
        result[name] = rectangular_table(selected, skip_titles=False)
    return result


def read_excel(source):
    with ZipFile(source) as archive:
        files = archive.infolist()
        if len(files) > 256 or sum(item.file_size for item in files) > 24 * 1024 * 1024:
            raise ValueError("Workbook exceeds the expanded size limit.")
        if len({file.filename for file in files}) != len(files):
            raise ValueError("Workbook contains duplicate archive paths.")
        strings = (
            [
                "".join(text.text or "" for text in item.findall(f".//{NS}t"))
                for item in xml(archive, "xl/sharedStrings.xml").findall(f"{NS}si")
            ]
            if "xl/sharedStrings.xml" in archive.namelist()
            else []
        )
        formats = number_styles(archive)
        book = xml(archive, "xl/workbook.xml")
        properties = book.find(f"{NS}workbookPr")
        date1904 = properties is not None and properties.get("date1904") in {"1", "true"}
        origin = datetime(1904, 1, 1) if date1904 else datetime(1899, 12, 30)
        links = relationships(archive, "xl/_rels/workbook.xml.rels", "xl")
        result = {}
        total = 0
        for sheet in book.findall(f"{NS}sheets/{NS}sheet"):
            member = links.get(sheet.get(RID))
            if not member or not member.startswith("xl/worksheets/"):
                continue
            rows = sheet_rows(archive, member, strings, formats, origin)
            tables = excel_tables(archive, member, rows)
            name = sheet.attrib["name"]
            if tables:
                tables = {f"{name} / {key}": value for key, value in tables.items()}
            else:
                tables = sheet_tables(name, rows)
            for label, records in tables.items():
                if not records:
                    continue
                if label in result:
                    raise ValueError("Workbook has duplicate table names.")
                total += len(records)
                if total > MAX_ROWS or len(result) >= MAX_TABLES:
                    raise ValueError("Use up to 24 data tables and 50,000 rows per workbook.")
                result[label] = records
        if not result:
            raise ValueError("No usable tables found. Add column headings above the data.")
        return result


def main():
    source = Path(sys.argv[1])
    try:
        result = read_csv(source) if source.suffix.lower() == ".csv" else read_excel(source)
        print(json.dumps(result, ensure_ascii=True, allow_nan=False))
    except (ValueError, csv.Error, OverflowError) as error:
        print(json.dumps({"importError": str(error)}, ensure_ascii=True))


if __name__ == "__main__":
    main()

"""Read tabular imports locally. Standard library only."""

import csv
import json
import runpy
import sys
from pathlib import Path
from zipfile import ZipFile


def read_csv(source):
    with source.open(encoding="utf-8-sig", newline="") as stream:
        sample = stream.read(8192)
        stream.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(stream, dialect=dialect)
        headers = reader.fieldnames or []
        if not headers or len(set(headers)) != len(headers):
            raise ValueError("CSV headers must be unique.")
        rows = []
        for row in reader:
            if None in row:
                raise ValueError("A CSV row has more fields than its header.")
            if len(rows) >= 50000:
                raise ValueError("Import exceeds 50,000 rows.")
            rows.append(row)
    return {"CSV": rows}


def read_excel(source):
    with ZipFile(source) as archive:
        files = archive.infolist()
        if len(files) > 256 or sum(item.file_size for item in files) > 24 * 1024 * 1024:
            raise ValueError("Workbook exceeds the expanded size limit.")
        for item in files:
            if item.filename.endswith((".xml", ".rels")):
                xml = archive.read(item).upper()
                if b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
                    raise ValueError(
                        "XML declarations with external or custom entities are unsupported."
                    )
    extractor = (
        Path(__file__).resolve().parents[1] / "frontend/mockups/kopperoinenp/extract_fixture.py"
    )
    read = runpy.run_path(str(extractor))["read_workbook"]
    return read(source)


def main():
    source = Path(sys.argv[1])
    result = read_csv(source) if source.suffix.lower() == ".csv" else read_excel(source)
    print(json.dumps(result, ensure_ascii=True, allow_nan=False))


if __name__ == "__main__":
    main()

"""Bounded extraction of a single locally scanned Vault file."""
import json
import pathlib
import sys
import zipfile

MAX_CHARS = 48000
MAX_ZIP_EXPANDED = 24 * 1024 * 1024
MAX_ENTRIES = 1000

def accept_zip(path):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_ENTRIES or sum(item.file_size for item in entries) > MAX_ZIP_EXPANDED:
            raise ValueError("Expanded Office file exceeds limits")
        names = [item.filename for item in entries]
        if len(set(names)) != len(names) or any(item.flag_bits & 1 for item in entries):
            raise ValueError("Unsupported Office container")
        return set(names)

def extract(path, kind):
    if kind == "text/plain":
        return path.read_text(encoding="utf-8")[:MAX_CHARS]
    if kind == "application/pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        if reader.is_encrypted or len(reader.pages) > 60:
            raise ValueError("Unsupported PDF")
        text = []
        size = 0
        for page in reader.pages:
            piece = page.extract_text() or ""
            text.append(piece[:MAX_CHARS - size])
            size += len(text[-1])
            if size >= MAX_CHARS:
                break
        return "\n".join(text)[:MAX_CHARS]
    if kind == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        from defusedxml import ElementTree
        if "word/document.xml" not in accept_zip(path):
            raise ValueError("Not a Word document")
        with zipfile.ZipFile(path) as container:
            xml = ElementTree.fromstring(container.read("word/document.xml"))
        return "\n".join(piece.text or "" for piece in xml.iter() if piece.tag.endswith("}t"))[:MAX_CHARS]
    if kind == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        from openpyxl import load_workbook
        if "xl/workbook.xml" not in accept_zip(path):
            raise ValueError("Not an Excel workbook")
        book = load_workbook(path, read_only=True, data_only=True, keep_links=False)
        pieces = []
        size = 0
        try:
            for sheet in book.worksheets[:12]:
                pieces.append(sheet.title)
                for row in sheet.iter_rows(min_row=1, max_row=500, max_col=40, values_only=True):
                    line = " | ".join(str(cell)[:500] for cell in row if cell is not None)
                    if line:
                        pieces.append(line[:MAX_CHARS - size])
                        size += len(pieces[-1]) + 1
                    if size >= MAX_CHARS:
                        return "\n".join(pieces)[:MAX_CHARS]
        finally:
            book.close()
        return "\n".join(pieces)[:MAX_CHARS]
    raise ValueError("Unsupported file format")

if __name__ == "__main__":
    try:
        result = extract(pathlib.Path(sys.argv[1]), sys.argv[2])
        print(json.dumps({"text": result}, ensure_ascii=True))
    except (ValueError, KeyError, OSError, zipfile.BadZipFile):
        print('{"error":"unreadable"}')
        raise SystemExit(2)

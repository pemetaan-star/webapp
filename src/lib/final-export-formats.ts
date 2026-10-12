import { ReadStatMeasure, ReadStatType, writeSav } from "@irbisadm/statfmt";
import { zipSync } from "fflate";

export type FinalExportColumn = {
  key: string;
  label: string;
  type: "number" | "string";
};

export type FinalExportRecord = Record<string, string | number | null>;

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function makeCsv(columns: readonly FinalExportColumn[], rows: FinalExportRecord[]): Uint8Array {
  const header = columns.map((column) => csvCell(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(","));
  return new TextEncoder().encode(`\uFEFF${[header, ...body].join("\r\n")}\r\n`);
}

function xmlEscape(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number): string {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function xlsxCell(reference: string, value: string | number | null, header = false): string {
  const style = header ? ' s="1"' : "";
  if (value === null) return `<c r="${reference}"${style}/>`;
  if (typeof value === "number") return `<c r="${reference}"${style}><v>${value}</v></c>`;
  if (!header && isGoogleDriveUrl(value)) {
    const formula = xmlEscape(`HYPERLINK("${new URL(value).toString()}","Buka Google Drive")`);
    return `<c r="${reference}" t="str"><f>${formula}</f><v>Buka Google Drive</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function isGoogleDriveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "drive.google.com";
  } catch {
    return false;
  }
}

export function makeXlsx(columns: readonly FinalExportColumn[], rows: FinalExportRecord[]): Uint8Array {
  const allRows = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => row[column.key])),
  ];
  const lastColumn = columnName(columns.length - 1);
  const lastRow = allRows.length;
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) =>
      xlsxCell(`${columnName(columnIndex)}${rowIndex + 1}`, value, rowIndex === 0),
    ).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ),
    "_rels/.rels": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Database Final" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),
    "xl/styles.xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF12304A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ),
    "xl/worksheets/sheet1.xml": new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`,
    ),
  };
  return zipSync(files, { level: 6 });
}

export function makeSav(columns: readonly FinalExportColumn[], rows: FinalExportRecord[]): Uint8Array {
  return writeSav({
    fileLabel: "Rekapitulasi Data Hotspot - Database Final",
    notes: ["Hanya mencakup submission dengan workflowStage finalized."],
    variables: columns.map((column) => {
      const variableName = column.key.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
      if (column.type === "number") {
        return {
          name: variableName,
          type: ReadStatType.DOUBLE,
          label: column.label,
          measure: ReadStatMeasure.SCALE,
        };
      }
      const width = Math.max(1, ...rows.map((row) => new TextEncoder().encode(String(row[column.key] ?? "")).length));
      return {
        name: variableName,
        type: ReadStatType.STRING,
        storageWidth: Math.min(width, 32767),
        label: column.label,
        measure: ReadStatMeasure.NOMINAL,
      };
    }),
    rows: rows.map((row) => columns.map((column) => row[column.key])),
  });
}

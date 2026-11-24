import { ReadStatMeasure, ReadStatType, writeSav } from "@irbisadm/statfmt";
import { zipSync } from "fflate";

export type FinalExportColumn = {
  key: string;
  label: string;
  type: "number" | "string" | "date" | "datetime" | "coordinate";
  group: string;
  width: number;
  wrap?: boolean;
  omitWhenEmpty?: boolean;
};

export type FinalExportRecord = Record<string, string | number | null>;
const millisecondsPerDay = 86_400_000;
const excelEpoch = Date.UTC(1899, 11, 30);
const jakartaOffset = 7 * 60 * 60 * 1000;

function formatWibDate(value: string, dateOnly: boolean): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const parts = new Map(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const date = `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
  return dateOnly ? date : `${date} ${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}`;
}

function excelDateSerial(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? (timestamp + jakartaOffset - excelEpoch) / millisecondsPerDay
    : null;
}

function displayTextValue(column: FinalExportColumn, value: string | number | null): string | number | null {
  if ((column.type === "date" || column.type === "datetime") && typeof value === "string") {
    return formatWibDate(value, column.type === "date");
  }
  return value;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function makeCsv(columns: readonly FinalExportColumn[], rows: FinalExportRecord[]): Uint8Array {
  const header = columns.map((column) => csvCell(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(displayTextValue(column, row[column.key]))).join(","));
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

function xlsxCell(reference: string, value: string | number | null, styleId = 0, type?: FinalExportColumn["type"]): string {
  const style = styleId ? ` s="${styleId}"` : "";
  if (value === null || value === "") return `<c r="${reference}"${style}/>`;
  if ((type === "date" || type === "datetime") && typeof value === "string") {
    const serial = excelDateSerial(value);
    if (serial === null) return `<c r="${reference}"${style}/>`;
    return `<c r="${reference}" s="${type === "date" ? 8 : 9}"><v>${serial.toFixed(12)}</v></c>`;
  }
  if (type === "coordinate" && typeof value === "number") {
    return `<c r="${reference}" s="10"><v>${value.toFixed(6)}</v></c>`;
  }
  if (typeof value === "number") return `<c r="${reference}"${style}><v>${value}</v></c>`;
  if (styleId === 0 && isGoogleDriveUrl(value)) {
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
  const lastColumn = columnName(columns.length - 1);
  const lastRow = rows.length + 2;
  const groups: Array<{ name: string; first: number; last: number; style: number }> = [];
  columns.forEach((column, index) => {
    const current = groups.at(-1);
    if (current?.name === column.group) current.last = index;
    else groups.push({ name: column.group, first: index, last: index, style: Math.min(groups.length + 1, 6) });
  });
  const groupHeaders = groups.map((group) =>
    xlsxCell(`${columnName(group.first)}1`, group.name, group.style),
  ).join("");
  const columnHeaders = columns.map((column, index) =>
    xlsxCell(`${columnName(index)}2`, column.label, 7),
  ).join("");
  const dataRows = rows.map((row, rowIndex) => {
    const cells = columns.map((column, columnIndex) =>
      xlsxCell(
        `${columnName(columnIndex)}${rowIndex + 3}`,
        row[column.key],
        column.wrap ? 11 : 0,
        column.type,
      ),
    ).join("");
    return `<row r="${rowIndex + 3}">${cells}</row>`;
  }).join("");
  const columnWidths = columns.map((column, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`,
  ).join("");
  const mergedGroups = groups
    .filter((group) => group.first !== group.last)
    .map((group) => `<mergeCell ref="${columnName(group.first)}1:${columnName(group.last)}1"/>`)
    .join("");
  const fills = [
    "FF12304A",
    "FF087F77",
    "FF2867A8",
    "FF7155A3",
    "FF9B6500",
    "FF52677F",
  ].map((color) => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`).join("");
  const groupStyles = Array.from({ length: 6 }, (_, index) =>
    `<xf numFmtId="0" fontId="1" fillId="${index + 2}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`,
  ).join("");
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm:ss"/><numFmt numFmtId="166" formatCode="0.000000"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF12304A"/><sz val="10"/><name val="Calibri"/></font></fonts><fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills}<fill><patternFill patternType="solid"><fgColor rgb="FFEAF0F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellStyleXfs><cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${groupStyles}<xf numFmtId="0" fontId="2" fillId="8" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
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
    "xl/styles.xml": new TextEncoder().encode(stylesXml),
    "xl/worksheets/sheet1.xml": new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columnWidths}</cols><sheetData><row r="1" ht="24" customHeight="1">${groupHeaders}</row><row r="2" ht="36" customHeight="1">${columnHeaders}</row>${dataRows}</sheetData><autoFilter ref="A2:${lastColumn}${lastRow}"/><mergeCells count="${groups.filter((group) => group.first !== group.last).length}">${mergedGroups}</mergeCells></worksheet>`,
    ),
  };
  return zipSync(files, { level: 6 });
}

export function makeSav(columns: readonly FinalExportColumn[], rows: FinalExportRecord[]): Uint8Array {
  const savRows = rows.map((row) => columns.map((column) => displayTextValue(column, row[column.key])));
  return writeSav({
    fileLabel: "Rekapitulasi Data Hotspot - Database Final",
    notes: ["Hanya mencakup submission dengan workflowStage finalized."],
    variables: columns.map((column) => {
      const variableName = column.key.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
      if (column.type === "number" || column.type === "coordinate") {
        return {
          name: variableName,
          type: ReadStatType.DOUBLE,
          label: column.label,
          measure: ReadStatMeasure.SCALE,
        };
      }
      const columnIndex = columns.indexOf(column);
      const width = Math.max(1, ...savRows.map((row) => new TextEncoder().encode(String(row[columnIndex] ?? "")).length));
      return {
        name: variableName,
        type: ReadStatType.STRING,
        storageWidth: Math.min(width, 32767),
        label: column.label,
        measure: ReadStatMeasure.NOMINAL,
      };
    }),
    rows: savRows,
  });
}

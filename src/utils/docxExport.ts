type DocxTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

type DocxReport = {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  projectHighlights: { projectName: string; summary: string }[];
  riskItems: { title: string; detail: string }[];
  recommendations: string[];
  blueprintSections?: { title: string; content: string }[];
  appendixTables: DocxTable[];
};

const encoder = new TextEncoder();

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraph(text: string, options?: { bold?: boolean; sizeHalfPoints?: number; spacingAfter?: number; center?: boolean }) {
  const safeText = xmlEscape(text);
  const runProps = [
    options?.bold ? '<w:b/>' : '',
    options?.sizeHalfPoints ? `<w:sz w:val="${options.sizeHalfPoints}"/>` : '',
  ]
    .filter(Boolean)
    .join('');
  const paragraphProps = [
    options?.center ? '<w:jc w:val="center"/>' : '',
    options?.spacingAfter !== undefined ? `<w:spacing w:after="${options.spacingAfter}"/>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `<w:p>${paragraphProps ? `<w:pPr>${paragraphProps}</w:pPr>` : ''}<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ''}<w:t xml:space="preserve">${safeText}</w:t></w:r></w:p>`;
}

function bulletParagraph(text: string) {
  return paragraph(`- ${text}`, { spacingAfter: 80 });
}

function tableXml(table: DocxTable) {
  const rows = [
    `<w:tr>${table.headers
      .map(
        (header) =>
          `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraph(header, {
            bold: true,
            spacingAfter: 60,
          })}</w:tc>`,
      )
      .join('')}</w:tr>`,
    ...table.rows.map(
      (row) =>
        `<w:tr>${row
          .map(
            (cell) =>
              `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraph(cell, {
                spacingAfter: 40,
              })}</w:tc>`,
          )
          .join('')}</w:tr>`,
    ),
  ].join('');

  return [
    paragraph(table.title, { bold: true, sizeHalfPoints: 26, spacingAfter: 120 }),
    `<w:tbl>
      <w:tblPr>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="6" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="6" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      ${rows}
    </w:tbl>`,
  ].join('');
}

function buildDocumentXml(report: DocxReport) {
  const parts: string[] = [];
  parts.push(paragraph(report.title, { bold: true, sizeHalfPoints: 32, spacingAfter: 220, center: true }));
  parts.push(paragraph('I. Tóm tắt điều hành', { bold: true, sizeHalfPoints: 28, spacingAfter: 120 }));
  parts.push(paragraph(report.executiveSummary, { spacingAfter: 160 }));

  if (report.keyFindings.length > 0) {
    parts.push(paragraph('II. Điểm chính', { bold: true, sizeHalfPoints: 28, spacingAfter: 120 }));
    report.keyFindings.forEach((item) => parts.push(bulletParagraph(item)));
  }

  if (report.projectHighlights.length > 0) {
    parts.push(paragraph('III. Nhận xét theo dự án', { bold: true, sizeHalfPoints: 28, spacingAfter: 120 }));
    report.projectHighlights.forEach((item) => {
      parts.push(paragraph(item.projectName, { bold: true, sizeHalfPoints: 24, spacingAfter: 80 }));
      parts.push(paragraph(item.summary, { spacingAfter: 120 }));
    });
  }

  if (report.riskItems.length > 0) {
    parts.push(paragraph('IV. Đơn vị / điểm cần lưu ý', { bold: true, sizeHalfPoints: 28, spacingAfter: 120 }));
    report.riskItems.forEach((item) => {
      parts.push(paragraph(item.title, { bold: true, sizeHalfPoints: 24, spacingAfter: 80 }));
      parts.push(paragraph(item.detail, { spacingAfter: 120 }));
    });
  }

  if (report.recommendations.length > 0) {
    parts.push(paragraph('V. Kiến nghị', { bold: true, sizeHalfPoints: 28, spacingAfter: 120 }));
    report.recommendations.forEach((item) => parts.push(bulletParagraph(item)));
  }

  if ((report.blueprintSections || []).length > 0) {
    report.blueprintSections!.forEach((section) => {
      parts.push(paragraph(section.title, { bold: true, sizeHalfPoints: 28, spacingAfter: 120 }));
      parts.push(paragraph(section.content, { spacingAfter: 160 }));
    });
  }

  if (report.appendixTables.length > 0) {
    parts.push(paragraph('VI. Phụ lục số liệu', { bold: true, sizeHalfPoints: 28, spacingAfter: 120 }));
    report.appendixTables.forEach((table) => {
      parts.push(tableXml(table));
      parts.push(paragraph('', { spacingAfter: 80 }));
    });
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
  <w:body>
    ${parts.join('')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildCoreXml(title: string) {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title)}</dc:title>
  <dc:creator>code-web-sotay</dc:creator>
  <cp:lastModifiedBy>code-web-sotay</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>code-web-sotay</Application>
</Properties>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function createStoredZip(files: { name: string; data: Uint8Array }[]) {
  let localOffset = 0;
  let centralSize = 0;
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.data;
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, dataBytes.length);
    writeUint32(localView, 22, dataBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, dataBytes.length);
    writeUint32(centralView, 24, dataBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    localOffset += localHeader.length + dataBytes.length;
    centralSize += centralHeader.length;
  });

  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, localOffset);
  writeUint16(endView, 20, 0);

  return new Blob([...localParts, ...centralParts, endHeader], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function buildDocxBlob(report: DocxReport) {
  const files = [
    { name: '[Content_Types].xml', data: encoder.encode(buildContentTypesXml()) },
    { name: '_rels/.rels', data: encoder.encode(buildRootRelsXml()) },
    { name: 'docProps/core.xml', data: encoder.encode(buildCoreXml(report.title)) },
    { name: 'docProps/app.xml', data: encoder.encode(buildAppXml()) },
    { name: 'word/document.xml', data: encoder.encode(buildDocumentXml(report)) },
  ];

  return createStoredZip(files);
}

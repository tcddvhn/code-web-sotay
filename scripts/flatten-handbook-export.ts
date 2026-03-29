import fs from 'node:fs';
import path from 'node:path';

type LegacyPdfRef = {
  doc?: string;
  page?: string | number;
};

type LegacyNode = {
  id?: string;
  title?: string;
  tag?: string;
  summary?: string;
  detail?: string;
  fileUrl?: string;
  fileName?: string;
  pdfRefs?: LegacyPdfRef[];
  pdfPage?: string | number;
  forceAccordion?: boolean;
  children?: LegacyNode[];
};

type FlattenedNode = {
  id: string;
  legacy_id: string;
  parent_id: string | null;
  section: 'quy-dinh' | 'hoi-dap' | 'bieu-mau' | 'tai-lieu';
  title: string;
  slug: string;
  tag: string;
  summary_html: string;
  detail_html: string;
  sort_order: number;
  level: number;
  file_url: string;
  file_name: string;
  pdf_refs: Array<{ doc: string; page: number }>;
  force_accordion: boolean;
  needs_review: boolean;
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function parsePdfRefs(node: LegacyNode) {
  const refs = Array.isArray(node.pdfRefs) ? node.pdfRefs : [];
  const normalized = refs
    .map((ref) => {
      const page = Number(ref.page);
      if (!ref.doc || Number.isNaN(page) || page <= 0) {
        return null;
      }

      return {
        doc: String(ref.doc),
        page,
      };
    })
    .filter((ref): ref is { doc: string; page: number } => !!ref);

  if (normalized.length === 0 && node.pdfPage !== undefined && node.pdfPage !== null && node.pdfPage !== '') {
    const legacyPage = Number(node.pdfPage);
    if (!Number.isNaN(legacyPage) && legacyPage > 0) {
      normalized.push({
        doc: 'hd02',
        page: legacyPage,
      });
    }
  }

  return normalized;
}

function mapSection(tagRaw: string) {
  const normalized = tagRaw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalized.includes('hoi dap')) {
    return { section: 'hoi-dap' as const, needsReview: false };
  }

  if (normalized.includes('bieu mau')) {
    return { section: 'bieu-mau' as const, needsReview: false };
  }

  if (normalized.includes('tai lieu')) {
    return { section: 'tai-lieu' as const, needsReview: false };
  }

  return { section: 'quy-dinh' as const, needsReview: !!tagRaw };
}

function ensureArray(input: unknown): LegacyNode[] {
  if (Array.isArray(input)) {
    return input as LegacyNode[];
  }

  if (input && typeof input === 'object' && Array.isArray((input as { treeData?: unknown[] }).treeData)) {
    return (input as { treeData: LegacyNode[] }).treeData;
  }

  throw new Error('File đầu vào không chứa mảng treeData hợp lệ.');
}

function flattenTree(nodes: LegacyNode[], parentId: string | null, level: number, output: FlattenedNode[]) {
  nodes.forEach((node, index) => {
    const title = (node.title || '').trim();
    const tag = (node.tag || '').trim();
    const legacyId = String(node.id || `legacy_${level}_${index}_${Date.now()}`);
    const { section, needsReview } = mapSection(tag);
    const slug = slugify(title || legacyId);

    output.push({
      id: legacyId,
      legacy_id: legacyId,
      parent_id: parentId,
      section,
      title: title || 'Mục chưa đặt tên',
      slug,
      tag,
      summary_html: node.summary || '',
      detail_html: node.detail || '',
      sort_order: index,
      level,
      file_url: node.fileUrl || '',
      file_name: node.fileName || '',
      pdf_refs: parsePdfRefs(node),
      force_accordion: !!node.forceAccordion,
      needs_review: needsReview || !title,
    });

    if (Array.isArray(node.children) && node.children.length > 0) {
      flattenTree(node.children, legacyId, level + 1, output);
    }
  });
}

function main() {
  const [, , inputPathArg, outputDirArg] = process.argv;

  if (!inputPathArg) {
    throw new Error('Thiếu file JSON đầu vào. Cách dùng: npm run handbook:flatten -- <input.json> [output-dir]');
  }

  const inputPath = path.resolve(process.cwd(), inputPathArg);
  const outputDir = path.resolve(process.cwd(), outputDirArg || 'tmp/handbook-export');

  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const treeData = ensureArray(parsed);

  const flattened: FlattenedNode[] = [];
  flattenTree(treeData, null, 0, flattened);

  const reviewNodes = flattened.filter((node) => node.needs_review);
  const summary = {
    total_nodes: flattened.length,
    sections: flattened.reduce<Record<string, number>>((acc, node) => {
      acc[node.section] = (acc[node.section] || 0) + 1;
      return acc;
    }, {}),
    needs_review: reviewNodes.length,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'handbook_nodes_flat.json'), JSON.stringify(flattened, null, 2));
  fs.writeFileSync(path.join(outputDir, 'handbook_nodes_review.json'), JSON.stringify(reviewNodes, null, 2));
  fs.writeFileSync(path.join(outputDir, 'migration_summary.json'), JSON.stringify(summary, null, 2));

  console.log(`Đã flatten ${flattened.length} node vào ${outputDir}`);
  console.log(`Số node cần review thêm: ${reviewNodes.length}`);
}

main();

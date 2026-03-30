import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

type HandbookSection = 'quy-dinh' | 'hoi-dap' | 'bieu-mau' | 'tai-lieu';

type HandbookFlatNode = {
  id: string;
  legacy_id: string;
  parent_id: string | null;
  section: HandbookSection;
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
  needs_review?: boolean;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name}.`);
  }
  return value;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: '',
    purgeSection: '' as HandbookSection | '',
    purgeAll: false,
    includeDraft: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (!options.input && !arg.startsWith('--')) {
      options.input = arg;
      continue;
    }

    if (arg === '--purge-all') {
      options.purgeAll = true;
      continue;
    }

    if (arg === '--include-draft') {
      options.includeDraft = true;
      continue;
    }

    if (arg === '--purge-section') {
      const next = args[index + 1] as HandbookSection | undefined;
      if (!next) {
        throw new Error('Thiếu giá trị cho --purge-section');
      }
      options.purgeSection = next;
      index += 1;
    }
  }

  if (!options.input) {
    throw new Error('Thiếu file handbook_nodes_flat.json. Cách dùng: npm run handbook:import -- <input.json> [--purge-all] [--purge-section <section>] [--include-draft]');
  }

  return options;
}

function readFlatNodes(inputPathArg: string) {
  const inputPath = path.resolve(process.cwd(), inputPathArg);
  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('File đầu vào phải là một mảng node đã flatten.');
  }

  return parsed as HandbookFlatNode[];
}

async function main() {
  const options = parseArgs();
  const nodes = readFlatNodes(options.input);
  const supabaseUrl = requireEnv('VITE_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (options.purgeAll) {
    const { error } = await supabase.from('handbook_nodes').delete().not('id', 'is', null);
    if (error) {
      throw new Error(error.message || 'Không thể xóa toàn bộ handbook_nodes trước khi import.');
    }
    console.log('Đã xóa toàn bộ handbook_nodes trước khi import.');
  } else if (options.purgeSection) {
    const { error } = await supabase.from('handbook_nodes').delete().eq('section', options.purgeSection);
    if (error) {
      throw new Error(error.message || `Không thể xóa section ${options.purgeSection} trước khi import.`);
    }
    console.log(`Đã xóa section ${options.purgeSection} trước khi import.`);
  }

  const rows = nodes
    .filter((node) => options.includeDraft || !node.needs_review)
    .map((node) => ({
      id: node.id,
      legacy_id: node.legacy_id,
      parent_id: node.parent_id,
      section: node.section,
      title: node.title,
      slug: node.slug,
      tag: node.tag,
      summary_html: node.summary_html,
      detail_html: node.detail_html,
      sort_order: node.sort_order,
      level: node.level,
      file_url: node.file_url,
      file_name: node.file_name,
      pdf_refs: node.pdf_refs,
      force_accordion: node.force_accordion,
      is_published: true,
      updated_at: new Date().toISOString(),
    }));

  const batchSize = 500;
  let imported = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabase.from('handbook_nodes').upsert(batch, { onConflict: 'id' });
    if (error) {
      throw new Error(error.message || `Không thể import batch bắt đầu tại vị trí ${index}.`);
    }
    imported += batch.length;
  }

  console.log(`Đã import ${imported} node vào handbook_nodes.`);
  console.log(`Bỏ qua ${nodes.length - rows.length} node cần review.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

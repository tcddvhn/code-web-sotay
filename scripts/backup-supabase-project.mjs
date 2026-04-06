import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = process.env.SUPABASE_URL || 'https://taivkgwwinakcoxhquyv.supabase.co';
const DEFAULT_BUCKETS = ['uploads'];
const DEFAULT_TABLES = [
  'projects',
  'templates',
  'units',
  'app_settings',
  'user_profiles',
  'assignments',
  'global_assignments',
  'consolidated_rows',
  'data_files',
  'report_exports',
  'data_overwrite_requests',
  'analysis_cells',
  'ai_analysis_reports',
  'ai_report_blueprints',
];

function parseArgs(argv) {
  const args = {
    outDir: '',
    includeStorageManifest: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--out-dir' && argv[index + 1]) {
      args.outDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--no-storage-manifest') {
      args.includeStorageManifest = false;
    }
  }

  return args;
}

function ensureAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Thieu bien moi truong SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(DEFAULT_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeOutputDir(baseDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folder = baseDir || path.join(process.cwd(), 'backups', `${stamp}-supabase-backup`);
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(folder, 'tables'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'auth'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'storage'), { recursive: true });
  return folder;
}

async function fetchAllRows(supabase, tableName) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + pageSize - 1);

    if (error) {
      const message = error.message || '';
      if (message.includes('relation') || message.includes('does not exist')) {
        return { skipped: true, reason: message, rows: [] };
      }
      throw new Error(`Khong the doc bang ${tableName}: ${message}`);
    }

    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return { skipped: false, rows };
}

async function exportTables(supabase, outDir) {
  const summary = [];

  for (const tableName of DEFAULT_TABLES) {
    const result = await fetchAllRows(supabase, tableName);
    const outPath = path.join(outDir, 'tables', `${tableName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(result.rows, null, 2), 'utf8');
    summary.push({
      table: tableName,
      skipped: result.skipped,
      rowCount: result.rows.length,
      reason: result.reason || null,
    });
  }

  fs.writeFileSync(path.join(outDir, 'tables', '_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

async function exportAuthUsers(supabase, outDir) {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Khong the doc Supabase Auth users: ${error.message}`);
    }

    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) {
      break;
    }
    page += 1;
  }

  fs.writeFileSync(path.join(outDir, 'auth', 'users.json'), JSON.stringify(users, null, 2), 'utf8');
  return users.length;
}

async function listStorageObjectsRecursively(bucketApi, prefix = '') {
  const objects = [];
  const { data, error } = await bucketApi.list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    throw new Error(error.message || `Khong the doc storage prefix ${prefix}`);
  }

  for (const entry of data || []) {
    const nextPath = [prefix, entry.name].filter(Boolean).join('/');
    const isFolder = !entry.metadata;
    if (isFolder) {
      const nested = await listStorageObjectsRecursively(bucketApi, nextPath);
      objects.push(...nested);
    } else {
      objects.push({
        path: nextPath,
        name: entry.name,
        metadata: entry.metadata || null,
        updated_at: entry.updated_at || null,
        created_at: entry.created_at || null,
        last_accessed_at: entry.last_accessed_at || null,
      });
    }
  }

  return objects;
}

async function exportStorageManifest(supabase, outDir) {
  const summary = [];

  for (const bucket of DEFAULT_BUCKETS) {
    try {
      const objects = await listStorageObjectsRecursively(supabase.storage.from(bucket));
      fs.writeFileSync(path.join(outDir, 'storage', `${bucket}.json`), JSON.stringify(objects, null, 2), 'utf8');
      summary.push({ bucket, objectCount: objects.length, skipped: false, reason: null });
    } catch (error) {
      summary.push({
        bucket,
        objectCount: 0,
        skipped: true,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  fs.writeFileSync(path.join(outDir, 'storage', '_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = ensureAdminClient();
  const outDir = makeOutputDir(args.outDir);

  console.log(`Dang tao backup Supabase vao: ${outDir}`);
  const tableSummary = await exportTables(supabase, outDir);
  const authCount = await exportAuthUsers(supabase, outDir);
  const storageSummary = args.includeStorageManifest ? await exportStorageManifest(supabase, outDir) : [];

  const manifest = {
    createdAt: new Date().toISOString(),
    supabaseUrl: DEFAULT_URL,
    tables: tableSummary,
    authUserCount: authCount,
    storage: storageSummary,
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Da backup ${tableSummary.length} bang.`);
  console.log(`Da backup ${authCount} Auth users.`);
  if (args.includeStorageManifest) {
    console.log(`Da tao storage manifest cho ${storageSummary.length} bucket.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

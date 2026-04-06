import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const DEFAULT_EXCEL_PATH = 'C:\\Users\\ldkie\\OneDrive\\KIEN_BTCTU\\Năm 2026\\TONGHOPSOLIEU\\Danh_sach_taikhoan.xlsx';
const DEFAULT_SHEET_NAME = 'Sheet1';

function parseArgs(argv) {
  const args = {
    file: DEFAULT_EXCEL_PATH,
    sheet: DEFAULT_SHEET_NAME,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--file' && argv[index + 1]) {
      args.file = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--sheet' && argv[index + 1]) {
      args.sheet = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function normalizeCell(value) {
  return String(value ?? '').trim();
}

function readAccountsFromWorkbook(filePath, sheetName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Khong tim thay file Excel: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const targetSheetName = workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  if (!targetSheetName) {
    throw new Error('Workbook khong co sheet nao de doc.');
  }

  const worksheet = workbook.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  return rows
    .map((row, index) => ({
      rowNumber: index + 2,
      unitCode: normalizeCell(row['Mã ĐV']),
      unitName: normalizeCell(row['Tên đơn vị hiện tại']),
      email: normalizeCell(row['Tên tài khoản tự động tạo']).toLowerCase(),
    }))
    .filter((row) => row.unitCode && row.unitName && row.email);
}

function buildAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://taivkgwwinakcoxhquyv.supabase.co';
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    throw new Error('Thieu bien moi truong SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function listAuthUsersByEmail(supabase) {
  const emailToAuthId = new Map();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Khong doc duoc danh sach Supabase Auth users: ${error.message}`);
    }

    const users = data?.users || [];
    users.forEach((user) => {
      if (user.email) {
        emailToAuthId.set(user.email.toLowerCase(), user.id);
      }
    });

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return emailToAuthId;
}

async function syncProfiles({ accounts, dryRun }) {
  const supabase = buildAdminClient();
  const authUsers = await listAuthUsersByEmail(supabase);
  const results = { total: accounts.length, upserted: [], missingAuth: [], failed: [] };

  for (const account of accounts) {
    const authUserId = authUsers.get(account.email);
    if (!authUserId) {
      results.missingAuth.push({ ...account, reason: 'Chua co user trong Supabase Auth.' });
      continue;
    }

    const payload = {
      email: account.email,
      auth_user_id: authUserId,
      display_name: account.unitName,
      role: 'unit_user',
      unit_code: account.unitCode,
      unit_name: account.unitName,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (dryRun) {
      results.upserted.push({ ...account, authUserId, reason: 'Dry-run: chua ghi user_profiles.' });
      continue;
    }

    const { error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'email' });
    if (error) {
      results.failed.push({ ...account, reason: error.message });
      continue;
    }

    results.upserted.push({ ...account, authUserId, reason: 'Da upsert user_profiles.' });
  }

  return results;
}

function printSummary(results, dryRun) {
  console.log(`Tong so dong hop le: ${results.total}`);
  console.log(`Dong bo thanh cong${dryRun ? ' (dry-run)' : ''}: ${results.upserted.length}`);
  console.log(`Thieu Auth user: ${results.missingAuth.length}`);
  console.log(`Loi: ${results.failed.length}`);

  if (results.missingAuth.length > 0) {
    console.log('\nDanh sach thieu Auth user:');
    results.missingAuth.forEach((item) => {
      console.log(`- ${item.unitCode} | ${item.email} | ${item.reason}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\nDanh sach loi:');
    results.failed.forEach((item) => {
      console.log(`- ${item.unitCode} | ${item.email} | ${item.reason}`);
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const accounts = readAccountsFromWorkbook(args.file, args.sheet);

  if (accounts.length === 0) {
    throw new Error('Khong tim thay dong tai khoan hop le trong file Excel.');
  }

  console.log(`Dang doc ${accounts.length} tai khoan tu: ${path.resolve(args.file)}`);
  console.log(`Sheet su dung: ${args.sheet}`);
  console.log(`Che do: ${args.dryRun ? 'dry-run' : 'sync user_profiles'}`);

  const results = await syncProfiles({ accounts, dryRun: args.dryRun });
  printSummary(results, args.dryRun);

  if (results.failed.length > 0 || results.missingAuth.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

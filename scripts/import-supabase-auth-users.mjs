import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const DEFAULT_EXCEL_PATH = 'C:\\Users\\ldkie\\OneDrive\\KIEN_BTCTU\\Năm 2026\\TONGHOPSOLIEU\\Danh_sach_taikhoan.xlsx';
const DEFAULT_SHEET_NAME = 'Sheet1';
const DEFAULT_PASSWORD = 'btctuhn@456';

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
    throw new Error(`Không tìm thấy file Excel: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const targetSheetName = workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  if (!targetSheetName) {
    throw new Error('Workbook không có sheet nào để đọc.');
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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('Thiếu biến môi trường SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function listExistingEmails(supabase) {
  const emails = new Set();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Không đọc được danh sách user hiện có: ${error.message}`);
    }

    const users = data?.users || [];
    users.forEach((user) => {
      if (user.email) {
        emails.add(user.email.toLowerCase());
      }
    });

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return emails;
}

async function createUsers({ accounts, dryRun }) {
  const password = process.env.DEFAULT_IMPORT_PASSWORD || DEFAULT_PASSWORD;
  const supabase = buildAdminClient();
  const existingEmails = await listExistingEmails(supabase);
  const results = {
    total: accounts.length,
    created: [],
    skipped: [],
    failed: [],
  };

  for (const account of accounts) {
    if (existingEmails.has(account.email)) {
      results.skipped.push({
        ...account,
        reason: 'Tài khoản đã tồn tại trong Supabase Auth.',
      });
      continue;
    }

    if (dryRun) {
      results.created.push({
        ...account,
        reason: 'Dry-run: chưa gọi API tạo tài khoản.',
      });
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: account.unitName,
        unit_code: account.unitCode,
        unit_name: account.unitName,
        import_source: 'Danh_sach_taikhoan.xlsx',
      },
    });

    if (error) {
      results.failed.push({
        ...account,
        reason: error.message,
      });
      continue;
    }

    results.created.push({
      ...account,
      userId: data.user?.id || '',
      reason: 'Đã tạo thành công.',
    });
    existingEmails.add(account.email);
  }

  return results;
}

function printSummary(results, dryRun) {
  console.log(`Tổng số dòng hợp lệ: ${results.total}`);
  console.log(`Tạo thành công${dryRun ? ' (dry-run)' : ''}: ${results.created.length}`);
  console.log(`Bỏ qua: ${results.skipped.length}`);
  console.log(`Lỗi: ${results.failed.length}`);

  if (results.skipped.length > 0) {
    console.log('\nDanh sách bỏ qua:');
    results.skipped.forEach((item) => {
      console.log(`- ${item.unitCode} | ${item.email} | ${item.reason}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\nDanh sách lỗi:');
    results.failed.forEach((item) => {
      console.log(`- ${item.unitCode} | ${item.email} | ${item.reason}`);
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const accounts = readAccountsFromWorkbook(args.file, args.sheet);

  if (accounts.length === 0) {
    throw new Error('Không tìm thấy dòng tài khoản hợp lệ trong file Excel.');
  }

  console.log(`Đang đọc ${accounts.length} tài khoản từ: ${path.resolve(args.file)}`);
  console.log(`Sheet sử dụng: ${args.sheet}`);
  console.log(`Chế độ: ${args.dryRun ? 'dry-run' : 'create users'}`);

  const results = await createUsers({
    accounts,
    dryRun: args.dryRun,
  });

  printSummary(results, args.dryRun);

  if (results.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

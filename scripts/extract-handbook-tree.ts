import fs from 'node:fs';
import path from 'node:path';

type FirestoreValue =
  | { stringValue?: string }
  | { integerValue?: string | number }
  | { doubleValue?: string | number }
  | { booleanValue?: boolean }
  | { nullValue?: null }
  | { timestampValue?: string }
  | { arrayValue?: { values?: FirestoreValue[] } }
  | { mapValue?: { fields?: Record<string, FirestoreValue> } };

function decodeFirestoreValue(input: FirestoreValue | undefined): unknown {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  if ('stringValue' in input) return input.stringValue ?? '';
  if ('integerValue' in input) return Number(input.integerValue ?? 0);
  if ('doubleValue' in input) return Number(input.doubleValue ?? 0);
  if ('booleanValue' in input) return Boolean(input.booleanValue);
  if ('nullValue' in input) return null;
  if ('timestampValue' in input) return input.timestampValue ?? null;

  if ('arrayValue' in input) {
    return Array.isArray(input.arrayValue?.values)
      ? input.arrayValue.values.map((item) => decodeFirestoreValue(item))
      : [];
  }

  if ('mapValue' in input) {
    const fields = input.mapValue?.fields || {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
    );
  }

  return undefined;
}

function ensureTreeData(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && typeof input === 'object') {
    const candidate = input as Record<string, unknown>;

    if (Array.isArray(candidate.treeData)) {
      return candidate.treeData;
    }

    if (candidate.fields && typeof candidate.fields === 'object') {
      const decodedFields = decodeFirestoreValue({
        mapValue: { fields: candidate.fields as Record<string, FirestoreValue> },
      });
      if (decodedFields && typeof decodedFields === 'object' && Array.isArray((decodedFields as Record<string, unknown>).treeData)) {
        return (decodedFields as Record<string, unknown>).treeData as unknown[];
      }
    }

    const decodedObject = decodeFirestoreValue(input as FirestoreValue);
    if (decodedObject && typeof decodedObject === 'object' && Array.isArray((decodedObject as Record<string, unknown>).treeData)) {
      return (decodedObject as Record<string, unknown>).treeData as unknown[];
    }
  }

  throw new Error('Không tìm thấy treeData hợp lệ trong file export. Hãy dùng JSON raw hoặc Firestore document export.');
}

function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg) {
    throw new Error('Thiếu file export đầu vào. Cách dùng: npm run handbook:extract -- <input.json> [output.json]');
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = path.resolve(process.cwd(), outputArg || 'tmp/handbook-export/treeData.json');

  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const treeData = ensureTreeData(parsed);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ treeData }, null, 2));

  console.log(`Đã trích xuất treeData vào ${outputPath}`);
  console.log(`Số node gốc cấp đầu: ${treeData.length}`);
}

main();

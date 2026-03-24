import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  startAfter,
  writeBatch,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, SHEET_CONFIGS, SHEET_COLUMN_HEADERS } from '../constants';
import { FormTemplate, Project } from '../types';
import { columnIndexToLetter } from './columnUtils';

const MIGRATION_DOC_PATH = 'settings/migrations';
const LEGACY_TEMPLATES_PREFIX = 'tpl_nq22_';
const LEGACY_PROJECT_ID = DEFAULT_PROJECT_ID;

function buildLegacyTemplates(): FormTemplate[] {
  return SHEET_CONFIGS.map((config) => {
    const dataColumns: string[] = [];
    for (let col = config.startCol; col <= config.endCol; col++) {
      dataColumns.push(columnIndexToLetter(col));
    }

    const columnHeaders = SHEET_COLUMN_HEADERS[config.name] || dataColumns.map((_, i) => `Cá»™t ${i + 1}`);

    return {
      id: `${LEGACY_TEMPLATES_PREFIX}${config.name}`,
      projectId: LEGACY_PROJECT_ID,
      name: `Biá»ƒu ${config.name}`,
      sheetName: config.name,
      columnHeaders,
      columnMapping: {
        labelColumn: 'A',
        dataColumns,
        startRow: config.startRow,
        endRow: config.endRow,
      },
      mode: 'LEGACY',
      legacyConfigName: config.name,
      createdAt: serverTimestamp(),
    };
  });
}

async function ensureProjectAndTemplates(): Promise<void> {
  const projectRef = doc(db, 'projects', LEGACY_PROJECT_ID);
  const projectSnap = await getDoc(projectRef);

  if (!projectSnap.exists()) {
    const project: Project = {
      id: LEGACY_PROJECT_ID,
      name: DEFAULT_PROJECT_NAME,
      description: 'Dá»¯ liá»‡u chuyá»ƒn Ä‘á»•i tá»« há»‡ thá»‘ng cá»§.',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(projectRef, project);
  }

  const templates = buildLegacyTemplates();
  const batch = writeBatch(db);
  templates.forEach((tpl) => {
    batch.set(doc(db, 'templates', tpl.id), tpl, { merge: true });
  });
  await batch.commit();
}

async function migrateConsolidatedData(): Promise<number> {
  const sourceCol = collection(db, 'consolidated_data');
  const targetCol = collection(db, 'consolidated_data_v2');
  let totalMigrated = 0;
  let lastDoc: any = null;

  while (true) {
    const q = lastDoc
      ? query(sourceCol, startAfter(lastDoc), limit(400))
      : query(sourceCol, limit(400));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      break;
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      const row = docSnap.data() as any;
      const sheetName = row.sheetName || row.templateName || '';
      const templateId = `${LEGACY_TEMPLATES_PREFIX}${sheetName}`;
      const targetId = `${LEGACY_PROJECT_ID}_${templateId}_${row.unitCode}_${row.year}_${row.sourceRow}`;

      batch.set(doc(targetCol, targetId), {
        projectId: LEGACY_PROJECT_ID,
        templateId,
        unitCode: row.unitCode,
        year: row.year,
        sourceRow: row.sourceRow,
        label: row.label,
        values: row.values,
        updatedAt: row.updatedAt || serverTimestamp(),
      });
    });

    await batch.commit();
    totalMigrated += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return totalMigrated;
}

export async function ensureNQ22Setup(): Promise<{ migrated: boolean; total: number }> {
  try {
    const migrationRef = doc(db, MIGRATION_DOC_PATH);
    const migrationSnap = await getDoc(migrationRef);

    if (migrationSnap.exists() && migrationSnap.data()?.nq22Migrated) {
      await ensureProjectAndTemplates();
      return { migrated: false, total: 0 };
    }

    await ensureProjectAndTemplates();
    const total = await migrateConsolidatedData();

    await setDoc(
      migrationRef,
      {
        nq22Migrated: true,
        nq22MigratedAt: serverTimestamp(),
        nq22ProjectId: LEGACY_PROJECT_ID,
      },
      { merge: true },
    );

    await appendMigrationLog({ action: 'migrate', total });

    return { migrated: true, total };
  } catch (error) {
    console.error('Migration error:', error);
    return { migrated: false, total: 0 };
  }
}

export async function resetNQ22Migration(): Promise<void> {
  const migrationRef = doc(db, MIGRATION_DOC_PATH);
  await setDoc(
    migrationRef,
    {
      nq22Migrated: false,
      nq22ResetAt: serverTimestamp(),
      nq22ProjectId: LEGACY_PROJECT_ID,
    },
    { merge: true },
  );
  await appendMigrationLog({ action: 'reset' });
}
async function appendMigrationLog(entry: { action: string; total?: number }) {
  const migrationRef = doc(db, MIGRATION_DOC_PATH);
  await setDoc(
    migrationRef,
    {
      history: arrayUnion({
        action: entry.action,
        total: entry.total ?? 0,
        at: serverTimestamp(),
      }),
    },
    { merge: true },
  );
}

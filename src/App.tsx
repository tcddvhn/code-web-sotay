import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Activity,
  CheckCircle2,
  FileBarChart,
  Globe,
  Layers3,
  Link as LinkIcon,
  Lock,
  LogIn,
  Users,
  X,
} from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ImportFiles } from './components/ImportFiles';
import { ReportView } from './components/ReportView';
import { Sidebar } from './components/Sidebar';
import { ProjectManager } from './components/ProjectManager';
import { FormLearner } from './components/FormLearner';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, SHEET_CONFIGS, UNITS } from './constants';
import { auth, db, handleFirestoreError, loginWithGoogle, logout, OperationType } from './firebase';
import { AppSettings, ConsolidatedData, DataRow, FormTemplate, Project, ViewMode } from './types';
import { getPreferredReportingYear } from './utils/reportingYear';
import { ensureNQ22Setup, resetNQ22Migration } from './utils/migrateNQ22';

const DEFAULT_SETTINGS: AppSettings = {
  oneDriveLink: 'https://onedrive.live.com/...',
  storagePath: 'C:\\TongHop\\02_LuuFileGoc',
  receivedPath: 'C:\\TongHop\\01_DaTiepNhan',
};

const FIRESTORE_BATCH_LIMIT = 400;

type UnitLog = {
  code: string;
  name: string;
  importedSheets: string[];
  rowCount: number;
  isSubmitted: boolean;
};

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('DASHBOARD');
  const [data, setData] = useState<ConsolidatedData>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(DEFAULT_PROJECT_ID);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [migrationStatus, setMigrationStatus] = useState<{ running: boolean; message?: string }>({ running: false });
  const [migrationHistory, setMigrationHistory] = useState<any[]>([]);

  const isAuthenticated = useMemo(() => user?.email === 'ldkien116@gmail.com', [user]);
  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'projects'),
      (snapshot) => {
        const list = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as Project));
        setProjects(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'projects');
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'templates'),
      (snapshot) => {
        const list = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as FormTemplate));
        setTemplates(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'templates');
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'consolidated_data_v2'),
      (snapshot) => {
        const organized: ConsolidatedData = {};
        snapshot.docs.forEach((snapshotDoc) => {
          const row = snapshotDoc.data() as DataRow;
          if (!organized[row.templateId]) {
            organized[row.templateId] = [];
          }
          organized[row.templateId].push(row);
        });
        setData(organized);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'consolidated_data_v2');
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'global'),
      (snapshot) => {
        if (snapshot.exists()) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...(snapshot.data() as Partial<AppSettings>),
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/global');
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'migrations'),
      (snapshot) => {
        const data = snapshot.data();
        if (data?.history) {
          setMigrationHistory([...data.history].reverse());
        } else {
          setMigrationHistory([]);
        }
      },
      () => setMigrationHistory([]),
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let isMounted = true;
    setMigrationStatus({ running: true, message: 'Äang táº¡o dá»± Ã¡n vÃ  chuyá»ƒn Ä‘á»•i dá»¯ liá»‡u...' });

    ensureNQ22Setup()
      .then((result) => {
        if (!isMounted) return;
        if (result.migrated) {
          setMigrationStatus({ running: false, message: `ÄÃ£ chuyá»ƒn Ä‘á»•i ${result.total} dÃ²ng dá»¯ liá»‡u.` });
        } else {
          setMigrationStatus({ running: false });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setMigrationStatus({ running: false });
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (projects.length > 0 && !projects.find((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const saveRowsInBatches = async (rows: DataRow[]) => {
    for (let index = 0; index < rows.length; index += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      const currentRows = rows.slice(index, index + FIRESTORE_BATCH_LIMIT);

      currentRows.forEach((row) => {
        const rowId = `${row.projectId}_${row.templateId}_${row.unitCode}_${row.year}_${row.sourceRow}`;
        batch.set(doc(db, 'consolidated_data_v2', rowId), {
          ...row,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
    }
  };

  const deleteRowsInBatches = async (rowIds: string[]) => {
    for (let index = 0; index < rowIds.length; index += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      const currentRowIds = rowIds.slice(index, index + FIRESTORE_BATCH_LIMIT);

      currentRowIds.forEach((rowId) => {
        batch.delete(doc(db, 'consolidated_data_v2', rowId));
      });

      await batch.commit();
    }
  };

  const handleDataImported = async (newData: DataRow[]) => {
    if (!isAuthenticated) {
      return;
    }

    try {
      await saveRowsInBatches(newData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'consolidated_data_v2');
    }
  };

  const handleDeleteUnitData = async (year: string, unitCode: string) => {
    if (!isAuthenticated || !currentProject) {
      return 0;
    }

    try {
      const snapshot = await getDocs(
        query(
          collection(db, 'consolidated_data_v2'),
          where('year', '==', year),
          where('projectId', '==', currentProject.id),
        ),
      );
      const rowIds = snapshot.docs
        .map((snapshotDoc) => ({ id: snapshotDoc.id, data: snapshotDoc.data() as DataRow }))
        .filter((rowDoc) => rowDoc.data.unitCode === unitCode)
        .map((rowDoc) => rowDoc.id);

      if (rowIds.length === 0) {
        return 0;
      }

      await deleteRowsInBatches(rowIds);
      return rowIds.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `consolidated_data_v2/${unitCode}/${year}`);
      return 0;
    }
  };

  const handleDeleteYearData = async (year: string) => {
    if (!isAuthenticated || !currentProject) {
      return 0;
    }

    try {
      const snapshot = await getDocs(
        query(
          collection(db, 'consolidated_data_v2'),
          where('year', '==', year),
          where('projectId', '==', currentProject.id),
        ),
      );
      const rowIds = snapshot.docs.map((snapshotDoc) => snapshotDoc.id);

      if (rowIds.length === 0) {
        return 0;
      }

      await deleteRowsInBatches(rowIds);
      return rowIds.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `consolidated_data_v2/${year}`);
      return 0;
    }
  };

  const handleSaveSettings = async () => {
    if (!isAuthenticated) {
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      alert('ÄÃ£ lÆ°u cÃ i Ä‘áº·t!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    }
  };

  const handleRerunMigration = async () => {
    if (!isAuthenticated) return;
    const confirmed = window.confirm('Cháº¡y láº¡i chuyá»ƒn Ä‘á»•i dá»¯ liá»‡u NQ22? Dá»¯ liá»‡u Ä‘Ã£ chuyá»ƒn sáº½ Ä‘Æ°á»£c táº¡o láº¡i.');
    if (!confirmed) return;

    setMigrationStatus({ running: true, message: 'Äang cháº¡y láº¡i chuyá»ƒn Ä‘á»•i dá»¯ liá»‡u...' });
    await resetNQ22Migration();
    const result = await ensureNQ22Setup();
    setMigrationStatus({
      running: false,
      message: result.migrated ? `ÄÃ£ chuyá»ƒn Ä‘á»•i ${result.total} dÃ²ng dá»¯ liá»‡u.` : 'ÄÃ£ táº¡o dá»± Ã¡n NQ22.',
    });
  };

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
      setCurrentView('DASHBOARD');
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setCurrentView('DASHBOARD');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="app-shell h-screen flex items-center justify-center">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-[var(--line)] border-t-[var(--primary)]" />
      </div>
    );
  }

  const renderContent = () => {
    if (currentView === 'LOGIN') {
      return <LoginView onLogin={handleLogin} />;
    }

    switch (currentView) {
      case 'DASHBOARD':
        return (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
          />
        );
      case 'PROJECTS':
        return isAuthenticated ? (
          <ProjectManager onSelectProject={(project) => {
            setSelectedProjectId(project.id);
            setCurrentView('LEARN_FORM');
          }} />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
          />
        );
      case 'LEARN_FORM':
        return currentProject ? (
          <FormLearner project={currentProject} />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
          />
        );
      case 'IMPORT':
        return isAuthenticated ? (
          <ImportFiles
            onDataImported={handleDataImported}
            onDeleteUnitData={handleDeleteUnitData}
            onDeleteYearData={handleDeleteYearData}
            projectId={selectedProjectId}
            templates={templates.filter((tpl) => tpl.projectId === selectedProjectId)}
            projectName={currentProject?.name || DEFAULT_PROJECT_NAME}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
          />
        );
      case 'REPORTS':
        return <ReportView data={data} projects={projects} templates={templates} selectedProjectId={selectedProjectId} onSelectProject={setSelectedProjectId} />;
      case 'SETTINGS':
        return (
          <div className="p-6 md:p-8">
            <h2 className="page-title">CÃ i Ä‘áº·t há»‡ thá»‘ng</h2>
            <p className="page-subtitle mt-2 max-w-3xl text-sm">
              Cáº¥u hÃ¬nh nguá»“n lÆ°u trá»¯ vÃ  Ä‘Æ°á»ng dáº«n tiáº¿p nháº­n dá»¯ liá»‡u táº­p trung cho toÃ n há»‡ thá»‘ng.
            </p>

            <div className="mt-8 max-w-3xl space-y-6">
              <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Link OneDrive (LÆ°u trá»¯ trá»±c tuyáº¿n)</label>
                <div className="flex gap-3">
                  <LinkIcon size={18} className="mt-3 text-[var(--primary)]" />
                  <input
                    type="text"
                    value={settings.oneDriveLink}
                    onChange={(event) => setSettings({ ...settings, oneDriveLink: event.target.value })}
                    className="field-input field-link"
                    disabled={!isAuthenticated}
                  />
                </div>
              </div>

              <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">ThÆ° má»¥c lÆ°u trá»¯ file gá»‘c</label>
                <input
                  type="text"
                  value={settings.storagePath}
                  onChange={(event) => setSettings({ ...settings, storagePath: event.target.value })}
                  className="field-input"
                  disabled={!isAuthenticated}
                />
              </div>

              <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">ThÆ° má»¥c lÆ°u trá»¯ file Ä‘Ã£ tiáº¿p nháº­n</label>
                <input
                  type="text"
                  value={settings.receivedPath}
                  onChange={(event) => setSettings({ ...settings, receivedPath: event.target.value })}
                  className="field-input"
                  disabled={!isAuthenticated}
                />
              </div>

              {isAuthenticated && (
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleSaveSettings} className="primary-btn">
                    LÆ°u cáº¥u hÃ¬nh
                  </button>
                  <button onClick={handleRerunMigration} className="secondary-btn">
                    Cháº¡y láº¡i chuyá»ƒn Ä‘á»•i NQ22
                  </button>
                </div>
              )}

              {migrationStatus.message && (
                <p className="text-xs text-[var(--ink-soft)]">{migrationStatus.message}</p>
              )}

              {migrationHistory.length > 0 && (
                <div className="panel-card rounded-[20px] p-4">
                  <p className="col-header mb-3">Lá»‹ch sá»­ chuyá»ƒn Ä‘á»•i</p>
                  <div className="space-y-2 text-xs text-[var(--ink-soft)]">
                    {migrationHistory.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between gap-3">
                        <span className="font-semibold uppercase tracking-[0.12em]">
                          {entry.action === 'migrate' ? 'Chuyá»ƒn Ä‘á»•i' : 'Reset'}
                        </span>
                        <span>{entry.total ? `${entry.total} dÃ²ng` : '-'}</span>
                        <span>
                          {entry.at?.toDate ? entry.at.toDate().toLocaleString('vi-VN') : 'Äang cáº­p nháº­t...'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
        user={user}
      />
      <main className="app-main flex-1 overflow-auto">{renderContent()}</main>
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-6 md:p-8">
      <div className="panel-card w-full max-w-md rounded-[28px] p-8 md:p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)]">
          <Lock size={30} />
        </div>
        <h2 className="section-title">ÄÄƒng nháº­p há»‡ thá»‘ng</h2>
        <p className="page-subtitle mt-3 text-sm">DÃ nh cho quáº£n trá»‹ viÃªn tiáº¿p nháº­n vÃ  há»£p nháº¥t dá»¯ liá»‡u bÃ¡o cÃ¡o.</p>

        <div className="mt-8 space-y-4">
          <button onClick={onLogin} className="primary-btn flex w-full items-center justify-center gap-3">
            <LogIn size={18} />
            ÄÄƒng nháº­p vá»›i Google
          </button>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-soft)]">
            Chá»‰ tÃ i khoáº£n admin Ä‘Æ°á»£c cáº¥p quyá»n tiáº¿p nháº­n dá»¯ liá»‡u
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardOverview({
  data,
  templates,
  projects,
  selectedProjectId,
  onSelectProject,
}: {
  data: ConsolidatedData;
  templates: FormTemplate[];
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
}) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const dashboardYear = getPreferredReportingYear();

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const projectTemplates = templates.filter((tpl) => tpl.projectId === selectedProjectId);
  const templateMap = new Map(projectTemplates.map((tpl) => [tpl.id, tpl]));

  const rowsForYear = useMemo(() => {
    const rows = Object.values(data).flat();
    return rows.filter((row) => row.projectId === selectedProjectId && row.year === dashboardYear);
  }, [data, dashboardYear, selectedProjectId]);

  const unitLogs = useMemo<UnitLog[]>(() => {
    const sheetOrder = new Map(SHEET_CONFIGS.map((sheet, index) => [sheet.name, index]));

    return UNITS.map((unit) => {
      const unitRows = rowsForYear.filter((row) => row.unitCode === unit.code);
      const importedSheets = Array.from(
        new Set(
          unitRows
            .map((row) => templateMap.get(row.templateId)?.sheetName || templateMap.get(row.templateId)?.name || row.templateId),
        ),
      ).sort((left, right) => (sheetOrder.get(left) ?? 0) - (sheetOrder.get(right) ?? 0));

      return {
        code: unit.code,
        name: unit.name,
        importedSheets,
        rowCount: unitRows.length,
        isSubmitted: importedSheets.length > 0,
      };
    }).sort((left, right) => {
      if (left.isSubmitted !== right.isSubmitted) {
        return Number(right.isSubmitted) - Number(left.isSubmitted);
      }

      if (left.importedSheets.length !== right.importedSheets.length) {
        return right.importedSheets.length - left.importedSheets.length;
      }

      return left.name.localeCompare(right.name, 'vi');
    });
  }, [rowsForYear, templateMap]);

  const submittedCount = unitLogs.filter((unit) => unit.isSubmitted).length;
  const totalRows = rowsForYear.length;
  const totalUnits = UNITS.length;
  const completionRate = totalUnits === 0 ? '0.0' : ((submittedCount / totalUnits) * 100).toFixed(1);

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
  const completedProjects = projects.filter((p) => p.status === 'COMPLETED').length;

  const stats = [
    { label: 'Tá»•ng Ä‘Æ¡n vá»‹', value: totalUnits, icon: Users, iconColor: 'text-[var(--primary)]', tone: 'bg-[var(--primary-soft)]' },
    {
      label: 'ÄÆ¡n vá»‹ Ä‘Ã£ tiáº¿p nháº­n',
      value: `${submittedCount}/${totalUnits}`,
      icon: FileBarChart,
      iconColor: 'text-[var(--success)]',
      tone: 'bg-[rgba(47,110,73,0.12)]',
    },
    {
      label: 'DÃ²ng dá»¯ liá»‡u Ä‘Ã£ lÆ°u',
      value: totalRows.toLocaleString('vi-VN'),
      icon: Layers3,
      iconColor: 'text-[var(--gold)]',
      tone: 'bg-[var(--gold-soft)]',
    },
    {
      label: 'Tá»· lá»‡ hoÃ n thÃ nh',
      value: `${completionRate}%`,
      icon: Activity,
      iconColor: 'text-[var(--primary-dark)]',
      tone: 'bg-[rgba(135,17,22,0.12)]',
    },
  ];

  const pieData = [
    { name: 'ÄÃ£ tiáº¿p nháº­n', value: submittedCount },
    { name: 'ChÆ°a tiáº¿p nháº­n', value: totalUnits - submittedCount },
  ];

  const previewLogs = unitLogs.slice(0, 8);

  return (
    <div className="p-6 md:p-8">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="surface-tag">NÄƒm tá»•ng há»£p {dashboardYear}</div>
          <h2 className="page-title mt-4">HÄ† THá»NG QUáº¢N TRá» Dá»® LIá»†U TCÄ, ÄV Táº¬P TRUNG</h2>
          <p className="page-subtitle mt-3 max-w-3xl text-sm">
            Theo dÃµi nhanh tÃ¬nh hÃ¬nh tiáº¿p nháº­n dá»¯ liá»‡u cá»§a 132 Ä‘Æ¡n vá»‹, sá»‘ biá»ƒu Ä‘Ã£ nháº­p vÃ  má»©c Ä‘á»™ hoÃ n thÃ nh tá»•ng há»£p trÃªn toÃ n há»‡ thá»‘ng.
          </p>
        </div>

        <div className="panel-soft rounded-full px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-[var(--success)]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary-dark)]">
              Há»‡ thá»‘ng trá»±c tuyáº¿n
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="panel-card rounded-[24px] p-6">
          <p className="col-header mb-2">Chá»n dá»± Ã¡n</p>
          <select
            value={selectedProjectId}
            onChange={(event) => onSelectProject(event.target.value)}
            className="field-select text-sm font-bold"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            {selectedProject ? selectedProject.description || DEFAULT_PROJECT_NAME : DEFAULT_PROJECT_NAME}
          </p>
        </div>

        <div className="panel-card rounded-[24px] p-6">
          <p className="col-header mb-2">Dá»± Ã¡n Ä‘ang cháº¡y</p>
          <p className="data-value text-3xl font-bold text-[var(--ink)]">{activeProjects}</p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">Dá»± Ã¡n chÆ°a káº¿t thÃºc</p>
        </div>

        <div className="panel-card rounded-[24px] p-6">
          <p className="col-header mb-2">Dá»± Ã¡n hoÃ n thÃ nh</p>
          <p className="data-value text-3xl font-bold text-[var(--ink)]">{completedProjects}</p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">Dá»± Ã¡n Ä‘Ã£ Ä‘Ã³ng</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="panel-card rounded-[24px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="col-header mb-2">{stat.label}</p>
                <p className="data-value text-3xl font-bold text-[var(--ink)]">{stat.value}</p>
              </div>
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${stat.tone}`}>
                <stat.icon size={28} className={stat.iconColor} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">Biá»ƒu Ä‘á»“ tiáº¿p nháº­n dá»¯ liá»‡u</h3>
              <p className="page-subtitle mt-2 text-sm">Tá»· lá»‡ Ä‘Æ¡n vá»‹ Ä‘Ã£ ná»™p dá»¯ liá»‡u so vá»›i tá»•ng sá»‘ Ä‘Æ¡n vá»‹ trong nÄƒm {dashboardYear}.</p>
            </div>
            <div className="status-pill status-pill-submitted">{submittedCount} Ä‘Æ¡n vá»‹ Ä‘Ã£ ná»™p</div>
          </div>

          <div className="mt-8 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={108}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={index === 0 ? '#b30f14' : '#e2d6c4'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 text-center">
            <p className="data-value text-4xl font-bold text-[var(--primary-dark)]">{completionRate}%</p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">Má»©c Ä‘á»™ hoÃ n thÃ nh tiáº¿p nháº­n</p>
          </div>
        </div>

        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">Tráº¡ng thÃ¡i tiáº¿p nháº­n Ä‘Æ¡n vá»‹</h3>
              <p className="page-subtitle mt-2 text-sm">Danh sÃ¡ch Ä‘Æ°á»£c láº¥y tá»« dá»¯ liá»‡u tháº­t Ä‘Ã£ lÆ°u.</p>
            </div>
            <div className="status-pill status-pill-pending">{totalUnits - submittedCount} Ä‘Æ¡n vá»‹ chÆ°a ná»™p</div>
          </div>

          <div className="mt-6 space-y-3">
            {previewLogs.map((unit) => (
              <div
                key={unit.code}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{unit.name}</p>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    {unit.isSubmitted
                      ? `ÄÃ£ nháº­p ${unit.importedSheets.length}/${projectTemplates.length} biá»ƒu`
                      : 'ChÆ°a tiáº¿p nháº­n dá»¯ liá»‡u'}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-start md:self-auto">
                  <span className={unit.isSubmitted ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}>
                    {unit.isSubmitted ? 'ÄÃ£ tiáº¿p nháº­n' : 'Chá» tiáº¿p nháº­n'}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</span>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setIsLogOpen(true)} className="primary-btn mt-6 w-full">
            Xem táº¥t cáº£ nháº­t kÃ½
          </button>
        </div>
      </div>

      {isLogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-4 backdrop-blur-sm md:p-8">
          <div className="panel-card flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[30px]">
            <div className="flex flex-col gap-4 border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="surface-tag">132 Ä‘Æ¡n vá»‹ toÃ n há»‡ thá»‘ng</div>
                <h3 className="section-title mt-3">Nháº­t kÃ½ tiáº¿p nháº­n dá»¯ liá»‡u nÄƒm {dashboardYear}</h3>
                <p className="page-subtitle mt-2 text-sm">
                  Hiá»ƒn thá»‹ Ä‘áº§y Ä‘á»§ tráº¡ng thÃ¡i cá»§a tá»«ng Ä‘Æ¡n vá»‹ cÃ¹ng sá»‘ biá»ƒu Ä‘Ã£ Ä‘Æ°á»£c nháº­p vÃ o há»‡ thá»‘ng táº­p trung.
                </p>
              </div>

              <button
                onClick={() => setIsLogOpen(false)}
                className="secondary-btn flex items-center justify-center gap-2 self-start px-4 py-3"
              >
                <X size={16} />
                ÄÃ³ng
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 border-b border-[var(--line)] bg-[var(--primary-soft)] px-6 py-4 md:grid-cols-3">
              <div className="rounded-2xl bg-white/70 px-4 py-3">
                <p className="col-header mb-1">Tá»•ng Ä‘Æ¡n vá»‹</p>
                <p className="data-value text-2xl font-bold">{totalUnits}</p>
              </div>
              <div className="rounded-2xl bg-white/70 px-4 py-3">
                <p className="col-header mb-1">ÄÃ£ tiáº¿p nháº­n</p>
                <p className="data-value text-2xl font-bold text-[var(--success)]">{submittedCount}</p>
              </div>
              <div className="rounded-2xl bg-white/70 px-4 py-3">
                <p className="col-header mb-1">ChÆ°a tiáº¿p nháº­n</p>
                <p className="data-value text-2xl font-bold text-[var(--warning)]">{totalUnits - submittedCount}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="grid grid-cols-1 gap-3">
                {unitLogs.map((unit, index) => (
                  <div
                    key={unit.code}
                    className="grid gap-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 md:grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-alt)] text-sm font-bold text-[var(--primary-dark)]">
                      {index + 1}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">{unit.name}</p>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                        {unit.isSubmitted
                          ? `ÄÃ£ lÆ°u ${unit.rowCount.toLocaleString('vi-VN')} dÃ²ng dá»¯ liá»‡u.`
                          : 'Hiá»‡n chÆ°a cÃ³ dá»¯ liá»‡u nÃ o Ä‘Æ°á»£c tiáº¿p nháº­n trong nÄƒm nÃ y.'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="col-header mb-2">Biá»ƒu Ä‘Ã£ nháº­p</p>
                      <p className="truncate text-sm text-[var(--ink)]">
                        {unit.importedSheets.length > 0 ? unit.importedSheets.join(', ') : 'ChÆ°a cÃ³ biá»ƒu nÃ o'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto">
                      {unit.isSubmitted && <CheckCircle2 size={16} className="text-[var(--success)]" />}
                      <span className={unit.isSubmitted ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}>
                        {unit.isSubmitted ? 'ÄÃ£ tiáº¿p nháº­n' : 'Chá» tiáº¿p nháº­n'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

?import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
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
import { UnitAssignments } from './components/UnitAssignments';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, SHEET_CONFIGS, UNITS } from './constants';
import { auth, db, handleFirestoreError, loginWithGoogle, logout, OperationType } from './firebase';
import { AppSettings, ConsolidatedData, DataRow, FormTemplate, Project, UserProfile, ViewMode } from './types';
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
  lastUpdatedBy?: string;
  assignedTo?: string;
};

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('DASHBOARD');
  const [data, setData] = useState<ConsolidatedData>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(DEFAULT_PROJECT_ID);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [migrationStatus, setMigrationStatus] = useState<{ running: boolean; message?: string }>({ running: false });
  const [migrationHistory, setMigrationHistory] = useState<any[]>([]);

  const isAuthenticated = useMemo(() => !!user, [user]);
  const isAdmin = useMemo(
    () => userProfile?.role === 'admin' || user?.email === 'ldkien116@gmail.com',
    [userProfile, user],
  );
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
    if (!user) {
      setUserProfile(null);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    let cancelled = false;

    getDoc(userRef).then((snap) => {
      if (cancelled) return;
      if (!snap.exists()) {
        const role = user.email === 'ldkien116@gmail.com' ? 'admin' : 'contributor';
        const profile: UserProfile = {
          id: user.uid,
          email: user.email,
          displayName: user.displayName,
          role,
        };
        setDoc(userRef, profile, { merge: true });
      }
    });

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setUserProfile(snapshot.data() as UserProfile);
        }
      },
      () => setUserProfile(null),
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

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
    if (!isAdmin) {
      setUsers([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as UserProfile));
        setUsers(list);
      },
      () => setUsers([]),
    );

    return () => unsubscribe();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAuthenticated) {
      setAssignments({});
      return;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, 'assignments'), where('projectId', '==', selectedProjectId)),
      (snapshot) => {
        const map: Record<string, string[]> = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data.userId && Array.isArray(data.unitCodes)) {
            map[data.userId] = data.unitCodes;
          }
        });
        setAssignments(map);
      },
      () => setAssignments({}),
    );

    return () => unsubscribe();
  }, [isAuthenticated, selectedProjectId]);

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
    if (!isAdmin) {
      return;
    }

    let isMounted = true;
    setMigrationStatus({ running: true, message: 'Đang tạo dự án và chuy�fn �'�.i dữ li�?u...' });

    ensureNQ22Setup()
      .then((result) => {
        if (!isMounted) return;
        if (result.migrated) {
          setMigrationStatus({ running: false, message: `Đã chuy�fn �'�.i ${result.total} dòng dữ li�?u.` });
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
  }, [isAdmin]);

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
          updatedBy: {
            uid: user?.uid,
            email: user?.email,
            displayName: user?.displayName,
          },
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
    if (!isAdmin) {
      return;
    }

    try {
      await saveRowsInBatches(newData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'consolidated_data_v2');
    }
  };

  const handleDeleteUnitData = async (year: string, unitCode: string) => {
    if (!isAdmin || !currentProject) {
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
    if (!isAdmin || !currentProject) {
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
    if (!isAdmin) {
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      alert('Đã lưu cài �'ặt!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    }
  };

  const handleRerunMigration = async () => {
    if (!isAdmin) return;
    const confirmed = window.confirm('Chạy lại chuy�fn �'�.i dữ li�?u NQ22? Dữ li�?u �'ã chuy�fn sẽ �'ược tạo lại.');
    if (!confirmed) return;

    setMigrationStatus({ running: true, message: 'Đang chạy lại chuy�fn �'�.i dữ li�?u...' });
    await resetNQ22Migration();
    const result = await ensureNQ22Setup();
    setMigrationStatus({
      running: false,
      message: result.migrated ? `Đã chuy�fn �'�.i ${result.total} dòng dữ li�?u.` : 'Đã tạo dự án NQ22.',
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
            isAdmin={isAdmin}
            users={users}
            assignments={assignments}
            currentUser={userProfile}
          />
        );
      case 'PROJECTS':
        return isAdmin ? (
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
            isAdmin={isAdmin}
            users={users}
            assignments={assignments}
            currentUser={userProfile}
          />
        );
      case 'LEARN_FORM':
        return isAdmin && currentProject ? (
          <FormLearner project={currentProject} />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            isAdmin={isAdmin}
            users={users}
            assignments={assignments}
            currentUser={userProfile}
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
            canManageData={isAdmin}
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
            <h2 className="page-title">Cài �'ặt h�? th�'ng</h2>
            <p className="page-subtitle mt-2 max-w-3xl text-sm">
              Cấu hình ngu�"n lưu trữ và �'ường dẫn tiếp nhận dữ li�?u tập trung cho toàn h�? th�'ng.
            </p>

            <div className="mt-8 max-w-3xl space-y-6">
              <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Link OneDrive (Lưu trữ trực tuyến)</label>
                <div className="flex gap-3">
                  <LinkIcon size={18} className="mt-3 text-[var(--primary)]" />
                  <input
                    type="text"
                    value={settings.oneDriveLink}
                    onChange={(event) => setSettings({ ...settings, oneDriveLink: event.target.value })}
                    className="field-input field-link"
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Thư mục lưu trữ file g�'c</label>
                <input
                  type="text"
                  value={settings.storagePath}
                  onChange={(event) => setSettings({ ...settings, storagePath: event.target.value })}
                  className="field-input"
                    disabled={!isAdmin}
                />
              </div>

              <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Thư mục lưu trữ file �'ã tiếp nhận</label>
                <input
                  type="text"
                  value={settings.receivedPath}
                  onChange={(event) => setSettings({ ...settings, receivedPath: event.target.value })}
                  className="field-input"
                    disabled={!isAdmin}
                />
              </div>

              {isAdmin && (
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleSaveSettings} className="primary-btn">
                    Lưu cấu hình
                  </button>
                  <button onClick={handleRerunMigration} className="secondary-btn">
                    Chạy lại chuy�fn �'�.i NQ22
                  </button>
                </div>
              )}

              {migrationStatus.message && (
                <p className="text-xs text-[var(--ink-soft)]">{migrationStatus.message}</p>
              )}

              {isAdmin && migrationHistory.length > 0 && (
                <div className="panel-card rounded-[20px] p-4">
                  <p className="col-header mb-3">L�<ch sử chuy�fn �'�.i</p>
                  <div className="space-y-2 text-xs text-[var(--ink-soft)]">
                    {migrationHistory.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between gap-3">
                        <span className="font-semibold uppercase tracking-[0.12em]">
                          {entry.action === 'migrate' ? 'Chuy�fn �'�.i' : 'Reset'}
                        </span>
                        <span>{entry.total ? `${entry.total} dòng` : '-'}</span>
                        <span>
                          {entry.at?.toDate ? entry.at.toDate().toLocaleString('vi-VN') : 'Đang cập nhật...'}
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
        isAdmin={isAdmin}
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
        <h2 className="section-title">Đ�fng nhập h�? th�'ng</h2>
        <p className="page-subtitle mt-3 text-sm">Dành cho quản tr�< viên tiếp nhận và hợp nhất dữ li�?u báo cáo.</p>

        <div className="mt-8 space-y-4">
          <button onClick={onLogin} className="primary-btn flex w-full items-center justify-center gap-3">
            <LogIn size={18} />
            Đ�fng nhập v�>i Google
          </button>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-soft)]">
            Ch�? tài khoản admin �'ược cấp quyền tiếp nhận dữ li�?u
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
  isAdmin,
  users,
  assignments,
  currentUser,
}: {
  data: ConsolidatedData;
  templates: FormTemplate[];
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  isAdmin: boolean;
  users: UserProfile[];
  assignments: Record<string, string[]>;
  currentUser: UserProfile | null;
}) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('ALL');
  const dashboardYear = getPreferredReportingYear();

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const projectTemplates = templates.filter((tpl) => tpl.projectId === selectedProjectId);
  const templateMap = new Map(projectTemplates.map((tpl) => [tpl.id, tpl]));

  const rowsForYear = useMemo(() => {
    const rows = Object.values(data).flat();
    return rows.filter((row) => row.projectId === selectedProjectId && row.year === dashboardYear);
  }, [data, dashboardYear, selectedProjectId]);

  const lastUpdatedBy = useMemo(() => {
    const map = new Map<string, { name: string; at: number }>();
    rowsForYear.forEach((row) => {
      if (!row.updatedAt || !row.updatedBy) {
        return;
      }
      const time = row.updatedAt?.toDate ? row.updatedAt.toDate().getTime() : 0;
      const label = row.updatedBy.displayName || row.updatedBy.email || 'H? th?ng';
      const existing = map.get(row.unitCode);
      if (!existing || time > existing.at) {
        map.set(row.unitCode, { name: label || 'H? th?ng', at: time });
      }
    });
    return map;
  }, [rowsForYear]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(assignments).forEach(([userId, unitCodes]) => {
      const user = users.find((u) => u.id === userId);
      const name = user?.displayName || user?.email || 'Chua r�';
      unitCodes.forEach((code) => {
        map.set(code, name);
      });
    });
    return map;
  }, [assignments, users]);

  const unitLogs = useMemo<UnitLog[]>(() => {
    const sheetOrder = new Map(SHEET_CONFIGS.map((sheet, index) => [sheet.name, index]));

    const logs = UNITS.map((unit) => {
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
        lastUpdatedBy: lastUpdatedBy.get(unit.code)?.name,
        assignedTo: assignmentMap.get(unit.code),
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
    if (selectedAssignee === 'ALL') {
      return logs;
    }
    return logs.filter((unit) => assignments[selectedAssignee]?.includes(unit.code));
  }, [rowsForYear, templateMap, lastUpdatedBy, assignmentMap, selectedAssignee, assignments]);

  const submittedCount = unitLogs.filter((unit) => unit.isSubmitted).length;
  const totalRows = rowsForYear.length;
  const totalUnits = UNITS.length;
  const completionRate = totalUnits === 0 ? '0.0' : ((submittedCount / totalUnits) * 100).toFixed(1);

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
  const completedProjects = projects.filter((p) => p.status === 'COMPLETED').length;
  const assignees = useMemo(() => users.filter((u) => u.role === 'contributor'), [users]);

  const stats = [
    { label: 'T�.ng �'ơn v�<', value: totalUnits, icon: Users, iconColor: 'text-[var(--primary)]', tone: 'bg-[var(--primary-soft)]' },
    {
      label: 'Đơn v�< �'ã tiếp nhận',
      value: `${submittedCount}/${totalUnits}`,
      icon: FileBarChart,
      iconColor: 'text-[var(--success)]',
      tone: 'bg-[rgba(47,110,73,0.12)]',
    },
    {
      label: 'Dòng dữ li�?u �'ã lưu',
      value: totalRows.toLocaleString('vi-VN'),
      icon: Layers3,
      iconColor: 'text-[var(--gold)]',
      tone: 'bg-[var(--gold-soft)]',
    },
    {
      label: 'Tỷ l�? hoàn thành',
      value: `${completionRate}%`,
      icon: Activity,
      iconColor: 'text-[var(--primary-dark)]',
      tone: 'bg-[rgba(135,17,22,0.12)]',
    },
  ];

  const pieData = [
    { name: 'Đã tiếp nhận', value: submittedCount },
    { name: 'Chưa tiếp nhận', value: totalUnits - submittedCount },
  ];

  const previewLogs = unitLogs.slice(0, 8);

  return (
    <div className="p-6 md:p-8">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="surface-tag">N�fm t�.ng hợp {dashboardYear}</div>
          <h2 className="page-title mt-4">H�? THỐNG QUẢN TRỊ DỮ LI�?U TCĐ, ĐV TẬP TRUNG</h2>
          <p className="page-subtitle mt-3 max-w-3xl text-sm">
            Theo dõi nhanh tình hình tiếp nhận dữ li�?u của 132 �'ơn v�<, s�' bi�fu �'ã nhập và mức �'�T hoàn thành t�.ng hợp trên toàn h�? th�'ng.
          </p>
        </div>

        <div className="panel-soft rounded-full px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-[var(--success)]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary-dark)]">
              H�? th�'ng trực tuyến
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="panel-card rounded-[24px] p-6">
          <p className="col-header mb-2">Chọn dự án</p>
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
          <p className="col-header mb-2">Dự án �'ang chạy</p>
          <p className="data-value text-3xl font-bold text-[var(--ink)]">{activeProjects}</p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">Dự án chưa kết thúc</p>
        </div>

        <div className="panel-card rounded-[24px] p-6">
          <p className="col-header mb-2">Dự án hoàn thành</p>
          <p className="data-value text-3xl font-bold text-[var(--ink)]">{completedProjects}</p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">Dự án �'ã �'óng</p>
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

      {isAdmin && assignees.length > 0 && (
        <div className="mt-8">
          <UnitAssignments projectId={selectedProjectId} users={assignees} assignments={assignments} />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">Bi�fu �'�" tiếp nhận dữ li�?u</h3>
              <p className="page-subtitle mt-2 text-sm">Tỷ l�? �'ơn v�< �'ã n�Tp dữ li�?u so v�>i t�.ng s�' �'ơn v�< trong n�fm {dashboardYear}.</p>
            </div>
            <div className="status-pill status-pill-submitted">{submittedCount} �'ơn v�< �'ã n�Tp</div>
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
            <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">Mức �'�T hoàn thành tiếp nhận</p>
          </div>
        </div>

        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">Trạng thái tiếp nhận �'ơn v�<</h3>
              <p className="page-subtitle mt-2 text-sm">Danh sách �'ược lấy từ dữ li�?u thật �'ã lưu.</p>
            </div>
            <div className="status-pill status-pill-pending">{totalUnits - submittedCount} �'ơn v�< chưa n�Tp</div>
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
                      ? `Đã nhập ${unit.importedSheets.length}/${projectTemplates.length} bi�fu`
                      : 'Chưa tiếp nhận dữ li�?u'}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-start md:self-auto">
                  <span className={unit.isSubmitted ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}>
                    {unit.isSubmitted ? 'Đã tiếp nhận' : 'Chờ tiếp nhận'}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</span>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setIsLogOpen(true)} className="primary-btn mt-6 w-full">
            Xem tất cả nhật ký
          </button>
        </div>
      </div>

      {isLogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-4 backdrop-blur-sm md:p-8">
          <div className="panel-card flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[30px]">
            <div className="flex flex-col gap-4 border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="surface-tag">132 �'ơn v�< toàn h�? th�'ng</div>
                <h3 className="section-title mt-3">Nhật ký tiếp nhận dữ li�?u n�fm {dashboardYear}</h3>
                <p className="page-subtitle mt-2 text-sm">
                  Hi�fn th�< �'ầy �'ủ trạng thái của từng �'ơn v�< cùng s�' bi�fu �'ã �'ược nhập vào h�? th�'ng tập trung.
                </p>
              </div>

              <button
                onClick={() => setIsLogOpen(false)}
                className="secondary-btn flex items-center justify-center gap-2 self-start px-4 py-3"
              >
                <X size={16} />
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 border-b border-[var(--line)] bg-[var(--primary-soft)] px-6 py-4 md:grid-cols-3">
              <div className="rounded-2xl bg-white/70 px-4 py-3">
                <p className="col-header mb-1">T�.ng �'ơn v�<</p>
                <p className="data-value text-2xl font-bold">{totalUnits}</p>
              </div>
              <div className="rounded-2xl bg-white/70 px-4 py-3">
                <p className="col-header mb-1">Đã tiếp nhận</p>
                <p className="data-value text-2xl font-bold text-[var(--success)]">{submittedCount}</p>
              </div>
              <div className="rounded-2xl bg-white/70 px-4 py-3">
                <p className="col-header mb-1">Chưa tiếp nhận</p>
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
                          ? `Đã lưu ${unit.rowCount.toLocaleString('vi-VN')} dòng dữ li�?u.`
                          : 'Hi�?n chưa có dữ li�?u nào �'ược tiếp nhận trong n�fm này.'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="col-header mb-2">Bi�fu �'ã nhập</p>
                      <p className="truncate text-sm text-[var(--ink)]">
                        {unit.importedSheets.length > 0 ? unit.importedSheets.join(', ') : 'Chưa có bi�fu nào'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto">
                      {unit.isSubmitted && <CheckCircle2 size={16} className="text-[var(--success)]" />}
                      <span className={unit.isSubmitted ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}>
                        {unit.isSubmitted ? 'Đã tiếp nhận' : 'Chờ tiếp nhận'}
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


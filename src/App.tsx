import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
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
import { SHEET_CONFIGS, UNITS } from './constants';
import { auth, db, handleFirestoreError, loginWithGoogle, logout, OperationType } from './firebase';
import { AppSettings, ConsolidatedData, DataRow, ViewMode } from './types';
import { getPreferredReportingYear } from './utils/reportingYear';

const DEFAULT_SETTINGS: AppSettings = {
  oneDriveLink: 'https://onedrive.live.com/...',
  storagePath: 'C:\\TongHop\\02_LuuFileGoc',
  receivedPath: 'C:\\TongHop\\01_DaTiepNhan',
};

const FIRESTORE_BATCH_LIMIT = 400;
const TOTAL_SHEETS = SHEET_CONFIGS.length;

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
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const isAuthenticated = useMemo(() => user?.email === 'ldkien116@gmail.com', [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'consolidated_data'),
      (snapshot) => {
        const organized: ConsolidatedData = {};
        snapshot.docs.forEach((snapshotDoc) => {
          const row = snapshotDoc.data() as DataRow;
          if (!organized[row.sheetName]) {
            organized[row.sheetName] = [];
          }
          organized[row.sheetName].push(row);
        });
        setData(organized);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'consolidated_data');
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

  const saveRowsInBatches = async (rows: DataRow[]) => {
    for (let index = 0; index < rows.length; index += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      const currentRows = rows.slice(index, index + FIRESTORE_BATCH_LIMIT);

      currentRows.forEach((row) => {
        const rowId = `${row.unitCode}_${row.year}_${row.sheetName}_${row.sourceRow}`;
        batch.set(doc(db, 'consolidated_data', rowId), {
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
        batch.delete(doc(db, 'consolidated_data', rowId));
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
      handleFirestoreError(error, OperationType.WRITE, 'consolidated_data');
    }
  };

  const handleDeleteUnitData = async (year: string, unitCode: string) => {
    if (!isAuthenticated) {
      return 0;
    }

    try {
      const snapshot = await getDocs(query(collection(db, 'consolidated_data'), where('year', '==', year)));
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
      handleFirestoreError(error, OperationType.DELETE, `consolidated_data/${unitCode}/${year}`);
      return 0;
    }
  };

  const handleDeleteYearData = async (year: string) => {
    if (!isAuthenticated) {
      return 0;
    }

    try {
      const snapshot = await getDocs(query(collection(db, 'consolidated_data'), where('year', '==', year)));
      const rowIds = snapshot.docs.map((snapshotDoc) => snapshotDoc.id);

      if (rowIds.length === 0) {
        return 0;
      }

      await deleteRowsInBatches(rowIds);
      return rowIds.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `consolidated_data/${year}`);
      return 0;
    }
  };

  const handleSaveSettings = async () => {
    if (!isAuthenticated) {
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      alert('Đã lưu cài đặt!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    }
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
        return <DashboardOverview data={data} />;
      case 'IMPORT':
        return isAuthenticated ? (
          <ImportFiles
            onDataImported={handleDataImported}
            onDeleteUnitData={handleDeleteUnitData}
            onDeleteYearData={handleDeleteYearData}
          />
        ) : (
          <DashboardOverview data={data} />
        );
      case 'REPORTS':
        return <ReportView data={data} />;
      case 'SETTINGS':
        return (
          <div className="p-6 md:p-8">
            <h2 className="page-title">Cài đặt hệ thống</h2>
            <p className="page-subtitle mt-2 max-w-3xl text-sm">
              Cấu hình nguồn lưu trữ và đường dẫn tiếp nhận dữ liệu tập trung cho toàn hệ thống.
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
                    disabled={!isAuthenticated}
                  />
                </div>
              </div>

              <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Thư mục lưu trữ file gốc</label>
                <input
                  type="text"
                  value={settings.storagePath}
                  onChange={(event) => setSettings({ ...settings, storagePath: event.target.value })}
                  className="field-input"
                  disabled={!isAuthenticated}
                />
              </div>

              <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Thư mục lưu trữ file đã tiếp nhận</label>
                <input
                  type="text"
                  value={settings.receivedPath}
                  onChange={(event) => setSettings({ ...settings, receivedPath: event.target.value })}
                  className="field-input"
                  disabled={!isAuthenticated}
                />
              </div>

              {isAuthenticated && (
                <button onClick={handleSaveSettings} className="primary-btn">
                  Lưu cấu hình
                </button>
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
        <h2 className="section-title">Đăng nhập hệ thống</h2>
        <p className="page-subtitle mt-3 text-sm">Dành cho quản trị viên tiếp nhận và hợp nhất dữ liệu báo cáo.</p>

        <div className="mt-8 space-y-4">
          <button onClick={onLogin} className="primary-btn flex w-full items-center justify-center gap-3">
            <LogIn size={18} />
            Đăng nhập với Google
          </button>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-soft)]">
            Chỉ tài khoản admin được cấp quyền tiếp nhận dữ liệu
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardOverview({ data }: { data: ConsolidatedData }) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const dashboardYear = getPreferredReportingYear();

  const rowsForYear = useMemo(
    () => Object.values(data).flat().filter((row) => row.year === dashboardYear),
    [data, dashboardYear],
  );

  const unitLogs = useMemo<UnitLog[]>(() => {
    const sheetOrder = new Map(SHEET_CONFIGS.map((sheet, index) => [sheet.name, index]));

    return UNITS.map((unit) => {
      const unitRows = rowsForYear.filter((row) => row.unitCode === unit.code);
      const importedSheets = Array.from(new Set(unitRows.map((row) => row.sheetName))).sort(
        (left, right) => (sheetOrder.get(left) ?? 0) - (sheetOrder.get(right) ?? 0),
      );

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
  }, [rowsForYear]);

  const submittedCount = unitLogs.filter((unit) => unit.isSubmitted).length;
  const totalRows = rowsForYear.length;
  const totalUnits = UNITS.length;
  const completionRate = totalUnits === 0 ? '0.0' : ((submittedCount / totalUnits) * 100).toFixed(1);

  const stats = [
    { label: 'Tổng đơn vị', value: totalUnits, icon: Users, iconColor: 'text-[var(--primary)]', tone: 'bg-[var(--primary-soft)]' },
    {
      label: 'Đơn vị đã tiếp nhận',
      value: `${submittedCount}/${totalUnits}`,
      icon: FileBarChart,
      iconColor: 'text-[var(--success)]',
      tone: 'bg-[rgba(47,110,73,0.12)]',
    },
    {
      label: 'Dòng dữ liệu đã lưu',
      value: totalRows.toLocaleString('vi-VN'),
      icon: Layers3,
      iconColor: 'text-[var(--gold)]',
      tone: 'bg-[var(--gold-soft)]',
    },
    {
      label: 'Tỷ lệ hoàn thành',
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
      <header className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="surface-tag">Năm tổng hợp {dashboardYear}</div>
          <h2 className="page-title mt-4">Hệ thống quản trị dữ liệu TCĐ-ĐV tập trung</h2>
          <p className="page-subtitle mt-3 max-w-3xl text-sm">
            Theo dõi nhanh tình hình tiếp nhận dữ liệu của 132 đơn vị, số biểu đã nhập và mức độ hoàn thành tổng hợp trên toàn hệ thống.
          </p>
        </div>

        <div className="panel-soft rounded-full px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-[var(--success)]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--primary-dark)]">
              Hệ thống trực tuyến
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
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
              <h3 className="section-title">Biểu đồ tiếp nhận dữ liệu</h3>
              <p className="page-subtitle mt-2 text-sm">Tỷ lệ đơn vị đã nộp dữ liệu so với tổng số đơn vị trong năm {dashboardYear}.</p>
            </div>
            <div className="status-pill status-pill-submitted">{submittedCount} đơn vị đã nộp</div>
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
            <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">Mức độ hoàn thành tiếp nhận</p>
          </div>
        </div>

        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">Trạng thái tiếp nhận đơn vị</h3>
              <p className="page-subtitle mt-2 text-sm">Danh sách được lấy từ dữ liệu thật đã lưu, không còn là danh sách minh họa.</p>
            </div>
            <div className="status-pill status-pill-pending">{totalUnits - submittedCount} đơn vị chưa nộp</div>
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
                      ? `Đã nhập ${unit.importedSheets.length}/${TOTAL_SHEETS} biểu`
                      : 'Chưa tiếp nhận dữ liệu'}
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
                <div className="surface-tag">132 đơn vị toàn hệ thống</div>
                <h3 className="section-title mt-3">Nhật ký tiếp nhận dữ liệu năm {dashboardYear}</h3>
                <p className="page-subtitle mt-2 text-sm">
                  Hiển thị đầy đủ trạng thái của từng đơn vị cùng số biểu đã được nhập vào hệ thống tập trung.
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
                <p className="col-header mb-1">Tổng đơn vị</p>
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
                          ? `Đã lưu ${unit.rowCount.toLocaleString('vi-VN')} dòng dữ liệu.`
                          : 'Hiện chưa có dữ liệu nào được tiếp nhận trong năm này.'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="col-header mb-2">Biểu đã nhập</p>
                      <p className="truncate text-sm text-[var(--ink)]">
                        {unit.importedSheets.length > 0 ? unit.importedSheets.join(', ') : 'Chưa có biểu nào'}
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

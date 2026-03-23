import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ImportFiles } from './components/ImportFiles';
import { ReportView } from './components/ReportView';
import { ConsolidatedData, DataRow, ViewMode, AppSettings } from './types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { UNITS, YEARS } from './constants';
import { Users, FileBarChart, Activity, Lock, LogIn, Link as LinkIcon, Globe } from 'lucide-react';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, serverTimestamp, writeBatch, query, where, getDocs } from 'firebase/firestore';

const DEFAULT_SETTINGS: AppSettings = {
  oneDriveLink: 'https://onedrive.live.com/...',
  storagePath: 'C:\\TongHop\\02_LuuFileGoc',
  receivedPath: 'C:\\TongHop\\01_DaTiepNhan'
};

const FIRESTORE_BATCH_LIMIT = 400;

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('DASHBOARD');
  const [data, setData] = useState<ConsolidatedData>({});
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const isAuthenticated = useMemo(() => {
    return user?.email === 'ldkien116@gmail.com';
  }, [user]);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Data listener
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'consolidated_data'), (snapshot) => {
      const organized: ConsolidatedData = {};
      snapshot.docs.forEach(doc => {
        const row = doc.data() as DataRow;
        if (!organized[row.sheetName]) organized[row.sheetName] = [];
        organized[row.sheetName].push(row);
      });
      setData(organized);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'consolidated_data');
    });
    return () => unsubscribe();
  }, []);

  // Settings listener
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...(snapshot.data() as Partial<AppSettings>),
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });
    return () => unsubscribe();
  }, []);

  const saveRowsInBatches = async (rows: DataRow[]) => {
    for (let i = 0; i < rows.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      const currentRows = rows.slice(i, i + FIRESTORE_BATCH_LIMIT);

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
    for (let i = 0; i < rowIds.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      const currentRowIds = rowIds.slice(i, i + FIRESTORE_BATCH_LIMIT);

      currentRowIds.forEach((rowId) => {
        batch.delete(doc(db, 'consolidated_data', rowId));
      });

      await batch.commit();
    }
  };

  const handleDataImported = async (newData: DataRow[]) => {
    if (!isAuthenticated) return;

    try {
      await saveRowsInBatches(newData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'consolidated_data');
    }
  };

  const handleDeleteUnitData = async (year: string, unitCode: string) => {
    if (!isAuthenticated) return 0;

    try {
      const snapshot = await getDocs(query(collection(db, 'consolidated_data'), where('year', '==', year)));
      const rowIds = snapshot.docs
        .map((rowDoc) => ({ id: rowDoc.id, data: rowDoc.data() as DataRow }))
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
    if (!isAuthenticated) return 0;

    try {
      const snapshot = await getDocs(query(collection(db, 'consolidated_data'), where('year', '==', year)));
      const rowIds = snapshot.docs.map((rowDoc) => rowDoc.id);

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
    if (!isAuthenticated) return;
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
      <div className="h-screen flex items-center justify-center bg-[#E4E3E0]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
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
        ) : <DashboardOverview data={data} />;
      case 'REPORTS':
        return <ReportView data={data} />;
      case 'SETTINGS':
        return (
          <div className="p-8">
            <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif mb-8">Cài đặt hệ thống</h2>
            <div className="max-w-2xl space-y-8">
              <div className="p-6 border border-black bg-white">
                <label className="col-header block mb-2">Link OneDrive (Lưu trữ trực tuyến)</label>
                <div className="flex gap-2">
                  <LinkIcon size={18} className="mt-2 opacity-40" />
                  <input 
                    type="text" 
                    value={settings.oneDriveLink} 
                    onChange={(e) => setSettings({...settings, oneDriveLink: e.target.value})}
                    className="w-full bg-transparent border-b border-black py-2 font-mono focus:outline-none text-blue-600 underline" 
                    disabled={!isAuthenticated}
                  />
                </div>
              </div>
              <div className="p-6 border border-black bg-white">
                <label className="col-header block mb-2">Thư mục lưu trữ file gốc</label>
                <input 
                  type="text" 
                  value={settings.storagePath} 
                  onChange={(e) => setSettings({...settings, storagePath: e.target.value})}
                  className="w-full bg-transparent border-b border-black py-2 font-mono focus:outline-none" 
                  disabled={!isAuthenticated}
                />
              </div>
              <div className="p-6 border border-black bg-white">
                <label className="col-header block mb-2">Thư mục lưu trữ file đã tiếp nhận</label>
                <input 
                  type="text" 
                  value={settings.receivedPath} 
                  onChange={(e) => setSettings({...settings, receivedPath: e.target.value})}
                  className="w-full bg-transparent border-b border-black py-2 font-mono focus:outline-none" 
                  disabled={!isAuthenticated}
                />
              </div>
              {isAuthenticated && (
                <button 
                  onClick={handleSaveSettings}
                  className="px-8 py-4 bg-[#141414] text-[#E4E3E0] text-sm font-bold uppercase tracking-widest hover:scale-105 transition-transform"
                >
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
        user={user}
      />
      <main className="flex-1 overflow-auto bg-[#E4E3E0]">
        {renderContent()}
      </main>
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="w-full max-w-md p-12 border border-black bg-white shadow-2xl">
        <div className="text-center mb-8">
          <Lock className="mx-auto mb-4" size={48} />
          <h2 className="text-2xl font-bold tracking-tighter uppercase italic font-serif">Đăng nhập hệ thống</h2>
          <p className="text-[10px] uppercase tracking-widest opacity-50 mt-2">Dành cho quản trị viên tiếp nhận file</p>
        </div>
        <div className="space-y-6">
          <button 
            onClick={onLogin}
            className="w-full py-4 bg-[#141414] text-[#E4E3E0] text-sm font-bold uppercase tracking-widest hover:bg-black/90 transition-colors flex items-center justify-center gap-3"
          >
            <LogIn size={18} />
            Đăng nhập với Google
          </button>
          <p className="text-[9px] text-center opacity-40 uppercase tracking-widest">Chỉ tài khoản admin được cấp quyền tiếp nhận dữ liệu</p>
        </div>
      </div>
    </div>
  );
}

function DashboardOverview({ data }: { data: ConsolidatedData }) {
  const submittedCount = useMemo(() => {
    const sheet1B = data['1B'] || [];
    const uniqueUnits = new Set(sheet1B.map(d => d.unitCode));
    return uniqueUnits.size;
  }, [data]);

  const totalUnits = UNITS.length;
  const completionRate = ((submittedCount / totalUnits) * 100).toFixed(1);

  const stats = [
    { label: 'Tổng đơn vị', value: totalUnits, icon: Users, color: 'text-blue-600' },
    { label: 'Báo cáo đã tiếp nhận', value: `${submittedCount}/${totalUnits}`, icon: FileBarChart, color: 'text-green-600' },
    { label: 'Tỷ lệ hoàn thành', value: `${completionRate}%`, icon: Activity, color: 'text-orange-600' },
  ];

  const pieData = [
    { name: 'Đã nộp', value: submittedCount },
    { name: 'Chưa nộp', value: totalUnits - submittedCount },
  ];

  const COLORS = ['#141414', '#D1D1D1'];

  return (
    <div className="p-8">
      <header className="mb-12 flex justify-between items-start">
        <div>
          <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">Hệ thống Tổng hợp</h2>
          <p className="text-sm opacity-60 mt-2">Tổng quan tình hình tiếp nhận và xử lý dữ liệu toàn hệ thống.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border border-black bg-white/50">
          <Globe size={14} className="animate-pulse text-green-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Hệ thống trực tuyến</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {stats.map((stat, i) => (
          <div key={i} className="p-6 border border-black bg-white flex items-center justify-between group hover:bg-black hover:text-white transition-all duration-300">
            <div>
              <p className="col-header mb-1 group-hover:text-white/60">{stat.label}</p>
              <p className="text-3xl font-bold data-value">{stat.value}</p>
            </div>
            <stat.icon size={32} className={stat.color} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-8 border border-black bg-white flex flex-col items-center">
          <h3 className="col-header mb-8 self-start">Biểu đồ tỷ lệ tiếp nhận file</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-center">
            <p className="text-4xl font-bold data-value">{completionRate}%</p>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Hoàn thành tổng hợp</p>
          </div>
        </div>

        <div className="p-8 border border-black bg-white">
          <h3 className="col-header mb-8">Trạng thái tiếp nhận gần đây</h3>
          <div className="space-y-4">
            {UNITS.slice(0, 8).map((unit, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-black/5">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${i < 3 ? 'bg-green-500' : 'bg-orange-500'}`} />
                  <span className="text-sm font-medium">{unit.name}</span>
                </div>
                <span className="text-[10px] font-mono opacity-50 uppercase">
                  {i < 3 ? 'Đã tiếp nhận' : 'Đang chờ...'}
                </span>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-3 border border-black text-[10px] uppercase tracking-widest font-bold hover:bg-black hover:text-white transition-all">
            Xem tất cả nhật ký
          </button>
        </div>
      </div>
    </div>
  );
}

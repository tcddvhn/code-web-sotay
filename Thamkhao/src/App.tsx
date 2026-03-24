import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ImportFiles } from './components/ImportFiles';
import { ReportView } from './components/ReportView';
import { ProjectManager } from './components/ProjectManager';
import { FormLearner } from './components/FormLearner';
import { ConsolidatedData, DataRow, ViewMode, AppSettings, Project, FormTemplate } from './types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { UNITS, YEARS } from './constants';
import { Users, FileBarChart, Activity, Lock, LogIn, Link as LinkIcon, Globe, FolderPlus, BrainCircuit } from 'lucide-react';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('DASHBOARD');
  const [data, setData] = useState<ConsolidatedData>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    oneDriveLink: 'https://onedrive.live.com/...',
    storagePath: 'C:\\TongHop\\02_LuuFileGoc',
    receivedPath: 'C:\\TongHop\\01_DaTiepNhan'
  });

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

  // Firestore Projects listener
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });
    return () => unsubscribe();
  }, []);

  // Firestore Templates listener
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'templates'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FormTemplate));
      setTemplates(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'templates');
    });
    return () => unsubscribe();
  }, []);

  // Firestore Data listener
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'consolidated_data'), (snapshot) => {
      const organized: ConsolidatedData = {};
      snapshot.docs.forEach(doc => {
        const row = doc.data() as DataRow;
        if (!organized[row.templateId]) organized[row.templateId] = [];
        organized[row.templateId].push(row);
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
        setSettings(snapshot.data() as AppSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });
    return () => unsubscribe();
  }, []);

  const handleDataImported = async (newData: DataRow[]) => {
    if (!isAuthenticated) return;

    try {
      const promises = newData.map(row => {
        const rowId = `${row.projectId}_${row.templateId}_${row.unitCode}_${row.year}_${row.sourceRow}`;
        return setDoc(doc(db, 'consolidated_data', rowId), {
          ...row,
          updatedAt: serverTimestamp()
        });
      });
      await Promise.all(promises);
      setCurrentView('REPORTS');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'consolidated_data');
    }
  };

  const handleSaveSettings = async () => {
    if (!isAuthenticated) return;
    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      alert('D� luu c�i d?t!');
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
        return <DashboardOverview data={data} projects={projects} templates={templates} />;
      case 'PROJECTS':
        return isAuthenticated ? (
          <ProjectManager onSelectProject={(p) => { setSelectedProject(p); setCurrentView('LEARN_FORM'); }} />
        ) : <DashboardOverview data={data} projects={projects} templates={templates} />;
      case 'LEARN_FORM':
        return selectedProject ? (
          <FormLearner project={selectedProject} onComplete={() => setCurrentView('IMPORT')} />
        ) : <DashboardOverview data={data} projects={projects} templates={templates} />;
      case 'IMPORT':
        return isAuthenticated ? <ImportFiles onDataImported={handleDataImported} /> : <DashboardOverview data={data} projects={projects} templates={templates} />;
      case 'REPORTS':
        return <ReportView data={data} />;
      case 'SETTINGS':
        return (
          <div className="p-8">
            <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif mb-8">C�i d?t h? th?ng</h2>
            <div className="max-w-2xl space-y-8">
              <div className="p-6 border border-black bg-white">
                <label className="col-header block mb-2">Link OneDrive (Luu tr? tr?c tuy?n)</label>
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
                <label className="col-header block mb-2">Thu m?c luu tr? file g?c</label>
                <input 
                  type="text" 
                  value={settings.storagePath} 
                  onChange={(e) => setSettings({...settings, storagePath: e.target.value})}
                  className="w-full bg-transparent border-b border-black py-2 font-mono focus:outline-none" 
                  disabled={!isAuthenticated}
                />
              </div>
              <div className="p-6 border border-black bg-white">
                <label className="col-header block mb-2">Thu m?c luu tr? file d� ti?p nh?n</label>
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
                  Luu c?u h�nh
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
          <h2 className="text-2xl font-bold tracking-tighter uppercase italic font-serif">Dang nh?p h? th?ng</h2>
          <p className="text-[10px] uppercase tracking-widest opacity-50 mt-2">D�nh cho qu?n tr? vi�n ti?p nh?n file</p>
        </div>
        <div className="space-y-6">
          <button 
            onClick={onLogin}
            className="w-full py-4 bg-[#141414] text-[#E4E3E0] text-sm font-bold uppercase tracking-widest hover:bg-black/90 transition-colors flex items-center justify-center gap-3"
          >
            <LogIn size={18} />
            Dang nh?p v?i Google
          </button>
          <p className="text-[9px] text-center opacity-40 uppercase tracking-widest">Ch? t�i kho?n admin du?c c?p quy?n ti?p nh?n d? li?u</p>
        </div>
      </div>
    </div>
  );
}

function DashboardOverview({ data, projects, templates }: { data: ConsolidatedData, projects: Project[], templates: FormTemplate[] }) {
  const activeProjects = projects.filter(p => p.status === 'ACTIVE').length;
  const completedProjects = projects.filter(p => p.status === 'COMPLETED').length;
  
  const totalSubmissions = useMemo(() => {
    let count = 0;
    Object.values(data).forEach(rows => {
      const uniqueUnits = new Set(rows.map(r => r.unitCode));
      count += uniqueUnits.size;
    });
    return count;
  }, [data]);

  const stats = [
    { label: 'D? �n dang ch?y', value: activeProjects, icon: FolderPlus, color: 'text-blue-600' },
    { label: 'D? �n ho�n th�nh', value: completedProjects, icon: Activity, color: 'text-green-600' },
    { label: 'Bi?u m?u d� h?c', value: templates.length, icon: BrainCircuit, color: 'text-orange-600' },
  ];

  const pieData = [
    { name: 'Dang ch?y', value: activeProjects },
    { name: 'Ho�n th�nh', value: completedProjects },
  ];

  const COLORS = ['#141414', '#D1D1D1'];

  return (
    <div className="p-8">
      <header className="mb-12 flex justify-between items-start">
        <div>
          <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">H? th?ng T?ng h?p Da D? �n</h2>
          <p className="text-sm opacity-60 mt-2">Qu?n l� linh ho?t nhi?u d? �n v� bi?u m?u d?ng b?ng AI.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border border-black bg-white/50">
          <Globe size={14} className="animate-pulse text-green-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest">H? th?ng tr?c tuy?n</span>
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
          <h3 className="col-header mb-8 self-start">T? l? ho�n th�nh d? �n</h3>
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
        </div>

        <div className="p-8 border border-black bg-white">
          <h3 className="col-header mb-8">Danh s�ch d? �n m?i nh?t</h3>
          <div className="space-y-4">
            {projects.slice(0, 5).map((project, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-black/5">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${project.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-sm font-medium">{project.name}</span>
                </div>
                <span className="text-[10px] font-mono opacity-50 uppercase">
                  {project.status === 'ACTIVE' ? 'Dang ch?y' : 'Ho�n th�nh'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


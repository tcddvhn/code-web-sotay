import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  FileBarChart,
  Globe,
  Link as LinkIcon,
  Lock,
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
import {
  deleteFileByPath,
  getCurrentSupabaseUser,
  loginWithSupabaseEmail,
  logoutSupabase,
  onSupabaseAuthStateChange,
} from './supabase';
import { AppSettings, AuthenticatedUser, ConsolidatedData, DataRow, FormTemplate, ManagedUnit, Project, UserProfile, ViewMode } from './types';
import { getPreferredReportingYear } from './utils/reportingYear';
import { buildAssignmentUsers, getAssignmentKey } from './access';
import {
  deleteDataFileByUnit,
  deleteDataFilesByYear,
  getUserProfileByEmail,
  getSettings as getSettingsFromSupabase,
  listUserProfiles as listUserProfilesFromSupabase,
  deleteDataFilesByProject,
  deleteProjectById as deleteProjectFromSupabase,
  deleteReportExportsByProject as deleteReportExportsByProjectFromSupabase,
  deleteReportExportsByTemplate as deleteReportExportsByTemplateFromSupabase,
  deleteRowsByProject as deleteRowsByProjectFromSupabase,
  deleteRowsByTemplate as deleteRowsByTemplateFromSupabase,
  deleteRowsByUnit as deleteRowsByUnitFromSupabase,
  deleteRowsByYear as deleteRowsByYearFromSupabase,
  deleteTemplateById as deleteTemplateFromSupabase,
  listAssignments as listAssignmentsFromSupabase,
  listProjects as listProjectsFromSupabase,
  listRowsByProject as listRowsByProjectFromSupabase,
  listTemplates as listTemplatesFromSupabase,
  listUnits as listUnitsFromSupabase,
  replaceAssignments as replaceAssignmentsInSupabase,
  seedUnits as seedUnitsToSupabase,
  touchUserProfileSession,
  upsertRows as upsertRowsToSupabase,
  upsertProject as upsertProjectToSupabase,
  upsertSettings as upsertSettingsToSupabase,
  upsertUnit as upsertUnitToSupabase,
} from './supabaseStore';

const DEFAULT_SETTINGS: AppSettings = {
  oneDriveLink: 'https://onedrive.live.com/...',
  storagePath: 'C:\\TongHop\\02_LuuFileGoc',
  receivedPath: 'C:\\TongHop\\01_DaTiepNhan',
};

type UnitLog = {
  code: string;
  name: string;
  importedSheets: string[];
  rowCount: number;
  isSubmitted: boolean;
  lastUpdatedBy?: string;
  assignedTo?: string;
};

type UnitStatusFilter = 'ALL' | 'SUBMITTED' | 'PENDING';

function getTimestampMs(value: any) {
  if (!value) {
    return null;
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function isUnitVisibleForProject(unit: ManagedUnit, project: Project | null) {
  if (!unit.isDeleted) {
    return true;
  }

  if (!project) {
    return false;
  }

  const deletedAtMs = getTimestampMs(unit.deletedAt);
  const projectCreatedAtMs = getTimestampMs(project.createdAt);

  if (deletedAtMs === null || projectCreatedAtMs === null) {
    return false;
  }

  return projectCreatedAtMs <= deletedAtMs;
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('DASHBOARD');
  const [data, setData] = useState<ConsolidatedData>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(DEFAULT_PROJECT_ID);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSettingsHelpExpanded, setIsSettingsHelpExpanded] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [units, setUnits] = useState<ManagedUnit[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const isAuthenticated = useMemo(() => !!user, [user]);
  const assignmentUsers = useMemo(() => buildAssignmentUsers(users), [users]);
  const effectiveUserProfile = useMemo<UserProfile | null>(() => {
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: userProfile?.displayName || user.displayName || null,
      role: userProfile?.role || 'contributor',
    };
  }, [user, userProfile]);
  const isAdmin = useMemo(() => effectiveUserProfile?.role === 'admin', [effectiveUserProfile]);
  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );
  const allUnits = useMemo<ManagedUnit[]>(
    () => (units.length > 0 ? units : UNITS.map((unit) => ({ ...unit, isDeleted: false }))),
    [units],
  );
  const availableUnitsForProject = useMemo(
    () => allUnits.filter((unit) => isUnitVisibleForProject(unit, currentProject)),
    [allUnits, currentProject],
  );

  useEffect(() => {
    let active = true;

    const applyAuthUser = async (nextUser: AuthenticatedUser | null) => {
      if (!nextUser) {
        if (!active) {
          return;
        }
        setUser(null);
        setUserProfile(null);
        setIsAuthReady(true);
        return;
      }

      if (!nextUser.email) {
        try {
          await logoutSupabase();
        } catch (error) {
          console.error('Supabase logout cleanup error:', error);
        }
        if (!active) {
          return;
        }
        setAuthError('Phiên Supabase hiện không có email hợp lệ.');
        setUser(null);
        setUserProfile(null);
        setCurrentView('LOGIN');
        setIsAuthReady(true);
        return;
      }

      try {
        const profile = await getUserProfileByEmail(nextUser.email);
        if (!profile) {
          setAuthError('Tài khoản này chưa được cấp quyền truy cập trong bảng user_profiles của Supabase.');
          try {
            await logoutSupabase();
          } catch (error) {
            console.error('Supabase logout cleanup error:', error);
          }
          if (!active) {
            return;
          }
          setUser(null);
          setUserProfile(null);
          setCurrentView('LOGIN');
          setIsAuthReady(true);
          return;
        }

        try {
          await touchUserProfileSession(nextUser.email, nextUser.id);
        } catch (error) {
          console.error('Supabase user profile touch warning:', error);
        }

        if (!active) {
          return;
        }

        setUser(nextUser);
        setUserProfile({
          ...profile,
          displayName: profile.displayName || nextUser.displayName || nextUser.email,
        });
        setAuthError(null);
        setCurrentView((current) => (current === 'LOGIN' ? 'DASHBOARD' : current));
        setIsAuthReady(true);
        return;
      } catch (error) {
        console.error('Supabase profile load error:', error);
        try {
          await logoutSupabase();
        } catch (logoutError) {
          console.error('Supabase logout cleanup error:', logoutError);
        }
        if (!active) {
          return;
        }
        setAuthError(error instanceof Error ? error.message : 'Không thể tải hồ sơ tài khoản từ Supabase.');
        setUser(null);
        setUserProfile(null);
        setCurrentView('LOGIN');
        setIsAuthReady(true);
        return;
      }

    };

    getCurrentSupabaseUser()
      .then((currentUser) => applyAuthUser(currentUser))
      .catch((error) => {
        console.error('Supabase session load error:', error);
        if (!active) {
          return;
        }
        setAuthError('Không thể khởi tạo phiên đăng nhập từ Supabase.');
        setUser(null);
        setIsAuthReady(true);
      });

    const unsubscribe = onSupabaseAuthStateChange((nextUser) => {
      void applyAuthUser(nextUser);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => {
      const nextIsMobile = mq.matches;
      setIsMobile(nextIsMobile);
      if (nextIsMobile) {
        setCurrentView('DASHBOARD');
      }
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

    setProjects([]);
    setTemplates([]);
    setData({});
    setUnits([]);
    setAssignments({});
    setUsers([]);
    setSettings(DEFAULT_SETTINGS);
    setSelectedProjectId('');
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setProjects([]);
      return;
    }

    let cancelled = false;

    listProjectsFromSupabase()
      .then((list) => {
        if (!cancelled) {
          setProjects(list);
        }
      })
      .catch((error) => {
        console.error('Supabase projects load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setTemplates([]);
      return;
    }

    if (!selectedProjectId) {
      setTemplates([]);
      return;
    }

    let cancelled = false;
    listTemplatesFromSupabase(selectedProjectId)
      .then((list) => {
        if (!cancelled && list.length >= 0) {
          setTemplates(list);
        }
      })
      .catch((error) => {
        console.error('Supabase templates load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (!isAuthenticated) {
      setData({});
      return;
    }

    if (!selectedProjectId) {
      setData({});
      return;
    }

    let cancelled = false;
    listRowsByProjectFromSupabase(selectedProjectId)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        const organized: ConsolidatedData = {};
        rows.forEach((row) => {
          if (!organized[row.templateId]) {
            organized[row.templateId] = [];
          }
          organized[row.templateId].push(row);
        });
        setData(organized);
      })
      .catch((error) => {
        console.error('Supabase rows load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;
    listUnitsFromSupabase()
      .then(async (list) => {
        if (cancelled) {
          return;
        }
        if (list.length === 0 && isAdmin) {
          await seedUnitsToSupabase(UNITS.map((unit) => ({ ...unit, isDeleted: false })));
          if (cancelled) {
            return;
          }
          list = await listUnitsFromSupabase();
        }
        setUnits(list);
      })
      .catch((error) => {
        console.error('Supabase units load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    if (!isAuthenticated) {
      setAssignments({});
      return;
    }

    if (!selectedProjectId) {
      setAssignments({});
      return;
    }

    let cancelled = false;
    listAssignmentsFromSupabase(selectedProjectId)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        const map: Record<string, string[]> = {};
        rows.forEach((row) => {
          map[row.assignee_key] = Array.isArray(row.unit_codes) ? row.unit_codes : [];
        });
        setAssignments(map);
      })
      .catch((error) => {
        console.error('Supabase assignments load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;
    getSettingsFromSupabase()
      .then((nextSettings) => {
        if (!cancelled && nextSettings) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...nextSettings,
          });
        }
      })
      .catch((error) => {
        console.error('Supabase settings load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUsers([]);
      return;
    }

    let cancelled = false;
    listUserProfilesFromSupabase()
      .then((list) => {
        if (!cancelled) {
          setUsers(list);
        }
      })
      .catch((error) => {
        console.error('Supabase user profiles load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (projects.length > 0 && !projects.find((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
      return;
    }

    if (projects.length === 0 && selectedProjectId) {
      setSelectedProjectId('');
    }
  }, [projects, selectedProjectId]);

  const deleteReportExports = async (projectId: string) => {
    const storagePaths = await deleteReportExportsByProjectFromSupabase(projectId);
    for (const storagePath of storagePaths) {
      try {
        await deleteFileByPath(storagePath);
      } catch {
        // ignore
      }
    }
    return storagePaths.length;
  };

  const deleteReportExportsByTemplate = async (templateId: string) => {
    const storagePaths = await deleteReportExportsByTemplateFromSupabase(templateId);
    for (const storagePath of storagePaths) {
      try {
        await deleteFileByPath(storagePath);
      } catch {
        // ignore
      }
    }
    return storagePaths.length;
  };

  const handleDeleteProjectData = async (projectId: string) => {
    if (!isAdmin) {
      return 0;
    }

    try {
      const deletedDataRows = (Object.values(data).flat() as DataRow[]).filter((row) => row.projectId === projectId).length;
      const deletedTemplates = (await listTemplatesFromSupabase(projectId)).length;
      const deletedAssignments = (await listAssignmentsFromSupabase(projectId)).length;
      const deletedExports = await deleteReportExports(projectId);
      await deleteRowsByProjectFromSupabase(projectId);
      await replaceAssignmentsInSupabase(projectId, []);
      const deletedDataFilePaths = await deleteDataFilesByProject(projectId);
      for (const storagePath of deletedDataFilePaths) {
        try {
          await deleteFileByPath(storagePath);
        } catch {
          // ignore
        }
      }
      const projectTemplates = await listTemplatesFromSupabase(projectId);
      for (const template of projectTemplates) {
        if (template.sourceWorkbookPath) {
          try {
            await deleteFileByPath(template.sourceWorkbookPath);
          } catch {
            // ignore
          }
        }
        await deleteTemplateFromSupabase(template.id);
      }
      await deleteProjectFromSupabase(projectId);

      if (selectedProjectId === projectId) {
        setCurrentView('DASHBOARD');
      }

      return deletedDataRows + deletedTemplates + deletedAssignments + deletedExports + 1;
    } catch (error) {
      console.error('Delete project error:', error);
      return 0;
    }
  };

  const handleCreateProject = async (payload: { name: string; description: string }) => {
    const project: Project = {
      id: `proj_${Date.now()}`,
      name: payload.name.trim(),
      description: payload.description.trim(),
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertProjectToSupabase(project);
    const nextProjects = await listProjectsFromSupabase();
    setProjects(nextProjects);
    return project;
  };

  const handleToggleProjectStatus = async (project: Project) => {
    const nextProject: Project = {
      ...project,
      status: project.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE',
      updatedAt: new Date().toISOString(),
    };

    await upsertProjectToSupabase(nextProject);
    const nextProjects = await listProjectsFromSupabase();
    setProjects(nextProjects);
    return nextProject;
  };

  const handleDeleteProject = async (project: Project) => {
    const deletedCount = await handleDeleteProjectData(project.id);
    return deletedCount > 0;
  };

  const handleDeleteTemplate = async (template: FormTemplate) => {
    if (!isAdmin) {
      return false;
    }

    try {
      const deletedDataRows = (Object.values(data).flat() as DataRow[]).filter((row) => row.templateId === template.id).length;
      const deletedExports = await deleteReportExportsByTemplate(template.id);
      await deleteRowsByTemplateFromSupabase(template.id);
      await deleteTemplateFromSupabase(template.id);

      if (template.sourceWorkbookPath) {
        const otherTemplatesUsingWorkbook = templates.filter(
          (item) => item.id !== template.id && item.sourceWorkbookPath === template.sourceWorkbookPath,
        );

        if (otherTemplatesUsingWorkbook.length === 0) {
          try {
            await deleteFileByPath(template.sourceWorkbookPath);
          } catch (error) {
            // ignore workbook cleanup errors
          }
        }
      }

      return deletedDataRows + deletedExports + 1 > 0;
    } catch (error) {
      console.error('Delete template error:', error);
      return false;
    }
  };

  const handleDataImported = async (newData: DataRow[]) => {
    if (!user) {
      return;
    }

    try {
      const nextRows = newData.map((row) => ({
        ...row,
        updatedAt: new Date().toISOString(),
        updatedBy: {
          uid: user.id,
          email: user.email,
          displayName: effectiveUserProfile?.displayName || user.displayName,
        },
      }));
      await upsertRowsToSupabase(nextRows);
      const refreshedRows = await listRowsByProjectFromSupabase(selectedProjectId);
      const organized: ConsolidatedData = {};
      refreshedRows.forEach((row) => {
        if (!organized[row.templateId]) {
          organized[row.templateId] = [];
        }
        organized[row.templateId].push(row);
      });
      setData(organized);
    } catch (error) {
      console.error('Import data error:', error);
    }
  };

  const handleDeleteUnitData = async (year: string, unitCode: string) => {
    if (!isAdmin || !currentProject) {
      return 0;
    }

    try {
      const count = (Object.values(data).flat() as DataRow[])
        .filter((row) => row.projectId === currentProject.id && row.year === year && row.unitCode === unitCode).length;
      if (count === 0) {
        return 0;
      }
      await deleteRowsByUnitFromSupabase(currentProject.id, year, unitCode);
      const deletedDataFilePaths = await deleteDataFileByUnit(currentProject.id, year, unitCode);
      for (const storagePath of deletedDataFilePaths) {
        try {
          await deleteFileByPath(storagePath);
        } catch {
          // ignore
        }
      }
      const refreshedRows = await listRowsByProjectFromSupabase(currentProject.id);
      const organized: ConsolidatedData = {};
      refreshedRows.forEach((row) => {
        if (!organized[row.templateId]) {
          organized[row.templateId] = [];
        }
        organized[row.templateId].push(row);
      });
      setData(organized);
      return count;
    } catch (error) {
      console.error('Delete unit rows error:', error);
      return 0;
    }
  };

  const handleDeleteYearData = async (year: string) => {
    if (!isAdmin || !currentProject) {
      return 0;
    }

    try {
      const count = (Object.values(data).flat() as DataRow[])
        .filter((row) => row.projectId === currentProject.id && row.year === year).length;
      if (count === 0) {
        return 0;
      }
      await deleteRowsByYearFromSupabase(currentProject.id, year);
      const deletedDataFilePaths = await deleteDataFilesByYear(currentProject.id, year);
      for (const storagePath of deletedDataFilePaths) {
        try {
          await deleteFileByPath(storagePath);
        } catch {
          // ignore
        }
      }
      const refreshedRows = await listRowsByProjectFromSupabase(currentProject.id);
      const organized: ConsolidatedData = {};
      refreshedRows.forEach((row) => {
        if (!organized[row.templateId]) {
          organized[row.templateId] = [];
        }
        organized[row.templateId].push(row);
      });
      setData(organized);
      return count;
    } catch (error) {
      console.error('Delete year rows error:', error);
      return 0;
    }
  };

  const handleSaveAssignments = async (assigneeKey: string, unitCodes: string[]) => {
    if (!isAdmin) {
      return;
    }

    const normalizedAssigneeKey = getAssignmentKey(assigneeKey);
    const assignmentUser = assignmentUsers.find((item) => item.id === normalizedAssigneeKey);
    if (!assignmentUser) {
      throw new Error('Không tìm thấy người theo dõi để lưu phân công.');
    }

    const orderedUnitCodes = UNITS.filter((unit) => unitCodes.includes(unit.code)).map((unit) => unit.code);
    const selectedUnitSet = new Set(orderedUnitCodes);

    // Optimistic local update so switching assignee reflects the latest save immediately.
    setAssignments((current: Record<string, string[]>) => {
      const next: Record<string, string[]> = {};
      Object.entries(current).forEach(([key, assignedUnits]) => {
        const filtered = assignedUnits.filter((unitCode) => !selectedUnitSet.has(unitCode));
        if (filtered.length > 0) {
          next[key] = filtered;
        }
      });
      if (orderedUnitCodes.length > 0) {
        next[normalizedAssigneeKey] = orderedUnitCodes;
      }
      return next;
    });

    const targetProjectIds: string[] = Array.from(
      new Set(
        projects
          .map((project) => project.id)
          .filter((projectId): projectId is string => typeof projectId === 'string' && projectId.trim() !== ''),
      ),
    );

    if (targetProjectIds.length === 0) {
      throw new Error('Không tìm thấy dự án nào để lưu phân công.');
    }

    const saveAssignmentsForProject = async (projectId: string) => {
      const snapshot = await listAssignmentsFromSupabase(projectId);
      const nextAssignments = new Map<string, { userId?: string; email: string; displayName: string; unitCodes: string[] }>();

      snapshot.forEach((row) => {
        const key = getAssignmentKey(row.assignee_key || row.email) || row.user_id || '';
        if (!key) {
          return;
        }

        nextAssignments.set(key, {
          userId: row.user_id || undefined,
          email: row.email || key,
          displayName: row.display_name || row.email || key,
          unitCodes: Array.isArray(row.unit_codes) ? row.unit_codes : [],
        });
      });

      nextAssignments.forEach((entry, key) => {
        nextAssignments.set(key, {
          ...entry,
          unitCodes: entry.unitCodes.filter((unitCode) => !selectedUnitSet.has(unitCode)),
        });
      });

      nextAssignments.set(normalizedAssigneeKey, {
        userId: assignmentUser.userId,
        email: assignmentUser.email,
        displayName: assignmentUser.displayName,
        unitCodes: orderedUnitCodes,
      });

      const payload = Array.from(nextAssignments.entries())
        .filter(([, entry]) => entry.unitCodes.length > 0)
        .map(([key, entry]) => ({
          id: `${projectId}_${key}`,
          project_id: projectId,
          assignee_key: key,
          user_id: entry.userId || null,
          email: entry.email,
          display_name: entry.displayName,
          unit_codes: entry.unitCodes,
          updated_at: new Date().toISOString(),
        }));

      await replaceAssignmentsInSupabase(projectId, payload);
    };

    await Promise.all(targetProjectIds.map((projectId) => saveAssignmentsForProject(projectId)));
    const refreshed = await listAssignmentsFromSupabase(selectedProjectId);
    const nextMap: Record<string, string[]> = {};
    refreshed.forEach((row) => {
      nextMap[row.assignee_key] = Array.isArray(row.unit_codes) ? row.unit_codes : [];
    });
    setAssignments(nextMap);
  };

  const handleSaveSettings = async () => {
    if (!isAdmin) {
      return;
    }

    try {
      await upsertSettingsToSupabase(settings);
      alert('Đã lưu cài đặt!');
    } catch (error) {
      console.error('Save settings error:', error);
    }
  };

  const handleAddUnit = async (name: string) => {
    if (!isAdmin) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Tên đơn vị không được để trống.');
    }

    const duplicate = allUnits.find((unit) => unit.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (duplicate) {
      throw new Error('Tên đơn vị đã tồn tại trong danh mục.');
    }

    const maxUnitNumber = allUnits.reduce((maxValue, unit) => {
      const matched = unit.code.match(/(\d+)$/);
      const currentValue = matched ? Number(matched[1]) : 0;
      return Math.max(maxValue, currentValue);
    }, 0);

    const nextCode = `DV${String(maxUnitNumber + 1).padStart(3, '0')}`;
    await upsertUnitToSupabase({
      code: nextCode,
      name: trimmedName,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setUnits(await listUnitsFromSupabase());
  };

  const handleSoftDeleteUnit = async (unitCode: string) => {
    if (!isAdmin) {
      return;
    }

    const targetUnit = allUnits.find((unit) => unit.code === unitCode);
    if (!targetUnit) {
      throw new Error('Không tìm thấy đơn vị cần xóa.');
    }

    await upsertUnitToSupabase({
      ...targetUnit,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedBy: {
        uid: user?.id,
        email: user?.email,
        displayName: effectiveUserProfile?.displayName || user?.displayName,
      },
    });
    setUnits(await listUnitsFromSupabase());
  };

  const handleRestoreUnit = async (unitCode: string) => {
    if (!isAdmin) {
      return;
    }

    const targetUnit = allUnits.find((unit) => unit.code === unitCode);
    if (!targetUnit) {
      throw new Error('Không tìm thấy đơn vị cần khôi phục.');
    }

    await upsertUnitToSupabase({
      ...targetUnit,
      isDeleted: false,
      deletedAt: null,
      deletedBy: undefined,
      updatedAt: new Date().toISOString(),
    });
    setUnits(await listUnitsFromSupabase());
  };

  const handleRenameUnit = async (unitCode: string, name: string) => {
    if (!isAdmin) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Tên đơn vị không được để trống.');
    }

    const targetUnit = allUnits.find((unit) => unit.code === unitCode);
    if (!targetUnit) {
      throw new Error('Không tìm thấy đơn vị cần cập nhật.');
    }

    const duplicate = allUnits.find(
      (unit) => unit.code !== unitCode && unit.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      throw new Error('Tên đơn vị đã tồn tại trong danh mục.');
    }

    await upsertUnitToSupabase({
      ...targetUnit,
      name: trimmedName,
      updatedAt: new Date().toISOString(),
    });
    setUnits(await listUnitsFromSupabase());
  };

  const handleDeleteAllSystemData = async () => {
    if (!isAdmin) {
      return;
    }

    const confirmed = window.confirm(
      'Xóa toàn bộ dự án, biểu mẫu, dữ liệu tiếp nhận, phân công và lịch sử xuất báo cáo trên hệ thống? Hành động này không thể hoàn tác.',
    );
    if (!confirmed) {
      return;
    }

    try {
      const projectIds = Array.from<string>(new Set(projects.map((project) => project.id)));

      for (const projectId of projectIds) {
        await handleDeleteProjectData(projectId);
      }

      setSelectedProjectId('');
      setCurrentView('DASHBOARD');
      alert('Đã xóa sạch toàn bộ dữ liệu hệ thống.');
    } catch (error) {
      console.error('Reset system error:', error);
    }
  };

  const handleEmailLogin = async (email: string, password: string) => {
    try {
      setAuthError(null);
      await loginWithSupabaseEmail(email, password);
    } catch (error) {
      console.error('Email login error:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      setAuthError(null);
      await logoutSupabase();
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
      return <LoginView onLoginWithEmail={handleEmailLogin} authError={authError} />;
    }

    switch (currentView) {
      case 'DASHBOARD':
        return (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            isAdmin={isAdmin}
            assignmentUsers={assignmentUsers}
            assignments={assignments}
            currentUser={effectiveUserProfile}
            onSaveAssignments={handleSaveAssignments}
          />
        );
      case 'PROJECTS':
        return isAdmin ? (
          <ProjectManager
            projects={projects}
            onSelectProject={(project) => {
              setSelectedProjectId(project.id);
              setCurrentView('LEARN_FORM');
            }}
            onDeleteProject={handleDeleteProject}
            onCreateProject={handleCreateProject}
            onToggleProjectStatus={handleToggleProjectStatus}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            isAdmin={isAdmin}
            assignmentUsers={assignmentUsers}
            assignments={assignments}
            currentUser={effectiveUserProfile}
            onSaveAssignments={handleSaveAssignments}
          />
        );
      case 'LEARN_FORM':
        return isAdmin ? (
          <FormLearner
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            onDeleteTemplate={handleDeleteTemplate}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            isAdmin={isAdmin}
            assignmentUsers={assignmentUsers}
            assignments={assignments}
            currentUser={effectiveUserProfile}
            onSaveAssignments={handleSaveAssignments}
          />
        );
      case 'IMPORT':
        return isAuthenticated ? (
          <ImportFiles
            onDataImported={handleDataImported}
            onDeleteUnitData={handleDeleteUnitData}
            onDeleteYearData={handleDeleteYearData}
            onDeleteProjectData={handleDeleteProjectData}
            projects={projects}
            data={data}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            templates={templates}
            canManageData={isAdmin}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            isAdmin={isAdmin}
            assignmentUsers={assignmentUsers}
            assignments={assignments}
            currentUser={effectiveUserProfile}
            onSaveAssignments={handleSaveAssignments}
          />
        );
      case 'REPORTS':
        return (
          <ReportView
            data={data}
            projects={projects}
            templates={templates}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            currentUser={effectiveUserProfile}
          />
        );
      case 'SETTINGS':
        if (!isAdmin) {
          return (
            <DashboardOverview
              data={data}
              templates={templates}
              projects={projects}
              units={availableUnitsForProject}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              isAdmin={isAdmin}
              assignmentUsers={assignmentUsers}
              assignments={assignments}
              currentUser={effectiveUserProfile}
              onSaveAssignments={handleSaveAssignments}
            />
          );
        }
        return (
          <div className="p-6 md:p-8">
            <h2 className="page-title">Cài đặt hệ thống</h2>
            <p className="page-subtitle mt-2 max-w-3xl text-sm">
              Cấu hình nguồn lưu trữ và đường dẫn tiếp nhận dữ liệu tập trung cho toàn hệ thống.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.55fr)_320px] xl:grid-cols-[minmax(0,1.45fr)_300px]">
              <div className="space-y-6">
                <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Link OneDrive (lưu trữ trực tuyến)</label>
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
                <label className="col-header block mb-3">Thư mục lưu trữ file gốc</label>
                <input
                  type="text"
                  value={settings.storagePath}
                  onChange={(event) => setSettings({ ...settings, storagePath: event.target.value })}
                  className="field-input"
                    disabled={!isAdmin}
                />
                </div>

                <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Thư mục lưu trữ file đã tiếp nhận</label>
                <input
                  type="text"
                  value={settings.receivedPath}
                  onChange={(event) => setSettings({ ...settings, receivedPath: event.target.value })}
                  className="field-input"
                    disabled={!isAdmin}
                />
                </div>

                {isAdmin && (
                  <SystemSettingsUnitsPanel
                    units={allUnits}
                    onAddUnit={handleAddUnit}
                    onSoftDeleteUnit={handleSoftDeleteUnit}
                    onRestoreUnit={handleRestoreUnit}
                    onRenameUnit={handleRenameUnit}
                  />
                )}

                {isAdmin && (
                  <div className="flex flex-wrap gap-3">
                    <button onClick={handleSaveSettings} className="primary-btn">
                      Lưu cấu hình
                    </button>
                    <button onClick={handleDeleteAllSystemData} className="secondary-btn">
                      Xóa sạch dữ liệu hệ thống
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4 xl:max-w-[320px] 2xl:max-w-[340px]">
                <div className="panel-card rounded-[24px] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="section-title text-[1.08rem] leading-6">Các mục cài đặt dùng để làm gì?</h3>
                    <button
                      type="button"
                      onClick={() => setIsSettingsHelpExpanded((current) => !current)}
                      className="secondary-btn px-4 py-2 text-[10px]"
                    >
                      {isSettingsHelpExpanded ? 'Ẩn hướng dẫn' : 'Xem hướng dẫn'}
                    </button>
                  </div>
                  {isSettingsHelpExpanded && (
                  <div className="mt-3 space-y-3 text-[13px] leading-6 text-[var(--ink-soft)]">
                    <p>
                      <strong className="text-[var(--ink)]">Link OneDrive</strong> dùng để lưu đường dẫn truy cập kho tài liệu trực tuyến,
                      giúp người vận hành mở nhanh nơi chứa file mẫu hoặc file gốc dùng chung.
                    </p>
                    <p>
                      <strong className="text-[var(--ink)]">Thư mục lưu trữ file gốc</strong> là nơi quy ước chứa các file Excel ban đầu do
                      đơn vị gửi lên trước khi chuẩn hóa hoặc nhập dữ liệu vào hệ thống.
                    </p>
                    <p>
                      <strong className="text-[var(--ink)]">Thư mục lưu trữ file đã tiếp nhận</strong> là nơi quy ước lưu các file đã được kiểm tra,
                      tiếp nhận và sẵn sàng đối chiếu với dữ liệu đã nhập.
                    </p>
                    <p>
                      <strong className="text-[var(--ink)]">Quản lý danh sách đơn vị</strong> dùng để vận hành danh mục 132 đơn vị toàn hệ thống.
                      Khi xóa mềm một đơn vị, dự án cũ vẫn giữ nguyên dữ liệu lịch sử, còn dự án tạo mới sau thời điểm xóa sẽ không còn nhìn thấy đơn vị đó.
                    </p>
                    <p>
                      <strong className="text-[var(--ink)]">Xóa sạch dữ liệu hệ thống</strong> là thao tác quản trị cao nhất, dùng khi cần làm sạch
                      toàn bộ dữ liệu dự án, biểu mẫu, tiếp nhận và lịch sử xuất báo cáo.
                    </p>
                  </div>
                  )}
                </div>

                {!isAdmin && (
                  <div className="panel-card rounded-[24px] p-5 text-sm text-[var(--ink-soft)]">
                    Chỉ tài khoản Admin mới được phép thay đổi cấu hình hệ thống và quản lý danh mục đơn vị.
                  </div>
                )}
              </div>
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
        userProfile={effectiveUserProfile}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isMobile={isMobile}
      />
      <main className="app-main flex-1 overflow-auto">{renderContent()}</main>
    </div>
  );
}

function SystemSettingsUnitsPanel({
  units,
  onAddUnit,
  onSoftDeleteUnit,
  onRestoreUnit,
  onRenameUnit,
}: {
  units: ManagedUnit[];
  onAddUnit: (name: string) => Promise<void>;
  onSoftDeleteUnit: (unitCode: string) => Promise<void>;
  onRestoreUnit: (unitCode: string) => Promise<void>;
  onRenameUnit: (unitCode: string, name: string) => Promise<void>;
}) {
  const [newUnitName, setNewUnitName] = useState('');
  const [editingUnitCode, setEditingUnitCode] = useState<string | null>(null);
  const [editingUnitName, setEditingUnitName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeUnits = useMemo(
    () => units.filter((unit) => !unit.isDeleted).sort((left, right) => left.code.localeCompare(right.code)),
    [units],
  );
  const deletedUnits = useMemo(
    () => units.filter((unit) => unit.isDeleted).sort((left, right) => left.code.localeCompare(right.code)),
    [units],
  );

  const submitNewUnit = async () => {
    setIsSubmitting(true);
    setMessage(null);

    try {
      await onAddUnit(newUnitName);
      setNewUnitName('');
      setMessage('Đã thêm đơn vị mới vào danh mục hệ thống.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể thêm đơn vị mới.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteUnit = async (unit: ManagedUnit) => {
    const confirmed = window.confirm(
      `Đánh dấu xóa mềm đơn vị "${unit.name}" (${unit.code})? Đơn vị sẽ bị ẩn ở các dự án tạo mới sau thời điểm xóa.`,
    );
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      await onSoftDeleteUnit(unit.code);
      setMessage(`Đã đánh dấu xóa mềm đơn vị ${unit.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể xóa mềm đơn vị.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const restoreUnit = async (unit: ManagedUnit) => {
    const confirmed = window.confirm(`Khôi phục đơn vị "${unit.name}" (${unit.code}) vào danh mục sử dụng?`);
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      await onRestoreUnit(unit.code);
      setMessage(`Đã khôi phục đơn vị ${unit.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể khôi phục đơn vị.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const beginEditUnit = (unit: ManagedUnit) => {
    setEditingUnitCode(unit.code);
    setEditingUnitName(unit.name);
    setMessage(null);
  };

  const cancelEditUnit = () => {
    setEditingUnitCode(null);
    setEditingUnitName('');
  };

  const saveEditedUnit = async (unit: ManagedUnit) => {
    setIsSubmitting(true);
    setMessage(null);

    try {
      await onRenameUnit(unit.code, editingUnitName);
      setMessage(`Đã cập nhật tên đơn vị ${unit.code}.`);
      cancelEditUnit();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể cập nhật tên đơn vị.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel-card rounded-[24px] p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="section-title">Quản lý danh sách đơn vị</h3>
          <p className="page-subtitle mt-2 text-sm">
            Danh mục nền của toàn hệ thống. Mã đơn vị được tự sinh theo số lớn nhất hiện có.
          </p>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          Đang hoạt động {activeUnits.length} đơn vị
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={newUnitName}
          onChange={(event) => setNewUnitName(event.target.value)}
          className="field-input"
          placeholder="Nhập tên đơn vị mới"
        />
        <button
          onClick={submitNewUnit}
          disabled={isSubmitting || !newUnitName.trim()}
          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
        >
          Thêm đơn vị
        </button>
      </div>

      {message && <p className="mt-4 text-sm font-medium text-[var(--ink-soft)]">{message}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <p className="col-header mb-3">Đơn vị đang sử dụng</p>
          <div className="max-h-[420px] space-y-3 overflow-y-auto overflow-x-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            {activeUnits.map((unit) => (
              <div
                key={unit.code}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_128px]"
              >
                <div className="min-w-0 space-y-2">
                  {editingUnitCode === unit.code ? (
                    <input
                      value={editingUnitName}
                      onChange={(event) => setEditingUnitName(event.target.value)}
                      className="field-input h-11 py-2 text-sm"
                      placeholder="Nhập tên đơn vị"
                    />
                  ) : (
                    <p className="break-words text-sm font-semibold leading-5 text-[var(--ink)]">{unit.name}</p>
                  )}
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 self-start lg:w-[128px]">
                  {editingUnitCode === unit.code ? (
                    <>
                      <button
                        onClick={() => saveEditedUnit(unit)}
                        disabled={isSubmitting || !editingUnitName.trim()}
                        className="primary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Lưu tên
                      </button>
                      <button
                        onClick={cancelEditUnit}
                        disabled={isSubmitting}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Hủy
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => beginEditUnit(unit)}
                        disabled={isSubmitting}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Đổi tên
                      </button>
                      <button
                        onClick={() => deleteUnit(unit)}
                        disabled={isSubmitting}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Xóa mềm
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="col-header mb-3">Đơn vị đã xóa mềm</p>
          <div className="max-h-[420px] space-y-3 overflow-y-auto overflow-x-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            {deletedUnits.length > 0 ? (
              deletedUnits.map((unit) => (
                <div
                  key={unit.code}
                  className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_128px]"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold leading-5 text-[var(--ink)]">{unit.name}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</p>
                  </div>
                  <button
                    onClick={() => restoreUnit(unit)}
                    disabled={isSubmitting}
                    className="secondary-btn w-full self-start px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 lg:w-[128px]"
                  >
                    Khôi phục
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--ink-soft)]">
                Chưa có đơn vị nào bị xóa mềm.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginView({
  onLoginWithEmail,
  authError,
}: {
  onLoginWithEmail: (email: string, password: string) => Promise<void>;
  authError: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitEmailLogin = async () => {
    setError(null);
    if (!email || !password) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }
    try {
      await onLoginWithEmail(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập bằng tài khoản này.');
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-6 md:p-8">
      <div className="panel-card w-full max-w-md rounded-[28px] p-8 md:p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)]">
          <Lock size={30} />
        </div>
        <h2 className="section-title">Đăng nhập hệ thống</h2>
        <p className="page-subtitle mt-3 text-sm">Dành cho các tài khoản đã được kích hoạt trong Supabase.</p>

        <div className="mt-8 space-y-4">
          <div className="panel-soft rounded-[20px] p-4 text-left">
            <label className="col-header block mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field-input"
              placeholder="email@domain.com"
            />
            <label className="col-header block mt-4 mb-2">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input"
              placeholder="Nhập mật khẩu"
            />
            <button onClick={submitEmailLogin} className="primary-btn mt-4 w-full">
              Đăng nhập bằng tài khoản
            </button>
            <p className="mt-3 text-[12px] leading-5 text-[var(--ink-soft)]">
              Tài khoản và mật khẩu được quản trị viên cấp sẵn trên Supabase.
            </p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-soft)]">
            Chỉ tài khoản được cấp quyền mới có thể tiếp nhận dữ liệu
          </p>
          {authError && <p className="text-xs text-red-600">{authError}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function DashboardOverview({
  data,
  templates,
  projects,
  units,
  selectedProjectId,
  onSelectProject,
  isAdmin,
  assignmentUsers,
  assignments,
  currentUser,
  onSaveAssignments,
}: {
  data: ConsolidatedData;
  templates: FormTemplate[];
  projects: Project[];
  units: ManagedUnit[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  isAdmin: boolean;
  assignmentUsers: ReturnType<typeof buildAssignmentUsers>;
  assignments: Record<string, string[]>;
  currentUser: UserProfile | null;
  onSaveAssignments: (assigneeKey: string, unitCodes: string[]) => Promise<void>;
}) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<UnitStatusFilter>('ALL');
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
      const label = row.updatedBy.displayName || row.updatedBy.email || 'Hệ thống';
      const existing = map.get(row.unitCode);
      if (!existing || time > existing.at) {
        map.set(row.unitCode, { name: label || 'Hệ thống', at: time });
      }
    });
    return map;
  }, [rowsForYear]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(assignments).forEach(([userId, unitCodes]) => {
      const user = assignmentUsers.find((u) => u.id === userId);
      const name = user?.displayName || user?.email || 'Chưa rõ';
      unitCodes.forEach((code) => {
        map.set(code, name);
      });
    });
    return map;
  }, [assignments, assignmentUsers]);

  const allUnitLogs = useMemo<UnitLog[]>(() => {
    const sheetOrder = new Map(SHEET_CONFIGS.map((sheet, index) => [sheet.name, index]));

    return units.map((unit) => {
      const unitRows = rowsForYear.filter((row) => row.unitCode === unit.code);
      const importedSheets = Array.from<string>(
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
  }, [rowsForYear, templateMap, lastUpdatedBy, assignmentMap, units]);

  const unitLogs = useMemo<UnitLog[]>(() => {
    const assigneeFilteredLogs =
      selectedAssignee === 'ALL'
        ? allUnitLogs
        : allUnitLogs.filter((unit) => assignments[selectedAssignee]?.includes(unit.code));

    if (statusFilter === 'SUBMITTED') {
      return assigneeFilteredLogs.filter((unit) => unit.isSubmitted);
    }

    if (statusFilter === 'PENDING') {
      return assigneeFilteredLogs.filter((unit) => !unit.isSubmitted);
    }

    return assigneeFilteredLogs;
  }, [allUnitLogs, assignments, selectedAssignee, statusFilter]);

  const submittedCount = allUnitLogs.filter((unit) => unit.isSubmitted).length;
  const totalUnits = units.length;
  const completionRate = totalUnits === 0 ? '0.0' : ((submittedCount / totalUnits) * 100).toFixed(1);

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
  const completedProjects = projects.filter((p) => p.status === 'COMPLETED').length;
  const assignees = useMemo(() => assignmentUsers, [assignmentUsers]);

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
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="surface-tag">Năm tổng hợp {dashboardYear}</div>
          <h2 className="page-title mt-4">HỆ THỐNG QUẢN TRỊ DỮ LIỆU TCĐ, ĐV TẬP TRUNG</h2>
          {currentUser && (
            <p className="mt-3 text-sm font-bold text-[var(--primary-dark)]">
              Tài khoản đang đăng nhập: {currentUser.displayName || currentUser.email || 'Chưa xác định'}
            </p>
          )}
          <p className="page-subtitle mt-3 max-w-3xl text-sm">
            Theo dõi nhanh tình hình tiếp nhận dữ liệu của các đơn vị, số biểu đã nhập và mức độ hoàn thành tổng hợp trên toàn hệ thống.
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
          <p className="col-header mb-2">Dự án đang chạy</p>
          <p className="data-value text-3xl font-bold text-[var(--ink)]">{activeProjects}</p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">Dự án chưa kết thúc</p>
        </div>

        <div className="panel-card rounded-[24px] p-6">
          <p className="col-header mb-2">Dự án hoàn thành</p>
          <p className="data-value text-3xl font-bold text-[var(--ink)]">{completedProjects}</p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">Dự án đã đóng</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
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
          <UnitAssignments
            projectId={selectedProjectId}
            units={units}
            users={assignees}
            assignments={assignments}
            onSaveAssignments={onSaveAssignments}
          />
        </div>
      )}

      <div className={`mt-8 grid grid-cols-1 gap-8 ${selectedProject ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : ''}`}>
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

        {selectedProject && (
        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">Trạng thái tiếp nhận đơn vị</h3>
              <p className="page-subtitle mt-2 text-sm">Danh sách được lấy từ dữ liệu thật đã lưu.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === 'SUBMITTED' ? 'ALL' : 'SUBMITTED'))}
                className={statusFilter === 'SUBMITTED' ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}
              >
                Đã tiếp nhận
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === 'PENDING' ? 'ALL' : 'PENDING'))}
                className={statusFilter === 'PENDING' ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}
              >
                Chưa tiếp nhận
              </button>
            </div>
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
                      ? `Đã nhập ${unit.importedSheets.length}/${projectTemplates.length} biểu`
                      : 'Chưa tiếp nhận dữ liệu'}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-start md:self-auto">
                  <span className={unit.isSubmitted ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}>
                    {unit.isSubmitted ? 'Đã tiếp nhận' : 'Chưa tiếp nhận'}
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
        )}
      </div>

      {isLogOpen && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-4 backdrop-blur-sm md:p-8">
          <div className="panel-card flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[30px]">
            <div className="flex flex-col gap-4 border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="surface-tag">{totalUnits} đơn vị toàn hệ thống</div>
                <h3 className="section-title mt-3">Nhật ký tiếp nhận dữ liệu năm {dashboardYear}</h3>
                <p className="page-subtitle mt-2 text-sm">
                  Hiển thị đầy đủ trạng thái của từng đơn vị cùng số biểu đã được nhập vào hệ thống tập trung.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {assignees.length > 0 && (
                  <div className="panel-soft rounded-full px-3 py-2">
                    <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                      Lọc theo người theo dõi
                    </label>
                    <select
                      value={selectedAssignee}
                      onChange={(event) => setSelectedAssignee(event.target.value)}
                      className="mt-1 w-full bg-transparent text-xs font-semibold text-[var(--ink)] focus:outline-none"
                    >
                      <option value="ALL">Tất cả người theo dõi</option>
                      {assignees.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName || user.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={() => setIsLogOpen(false)}
                  className="secondary-btn flex items-center justify-center gap-2 self-start px-4 py-3"
                >
                  <X size={16} />
                  Đóng
                </button>
              </div>
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
                      <div className="mt-2 text-[11px] text-[var(--ink-soft)]">
                        <p>Người theo dõi: {unit.assignedTo || 'Chưa phân công'}</p>
                        <p>Cập nhật gần nhất: {unit.lastUpdatedBy || 'Chưa có'}</p>
                      </div>
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
                        {unit.isSubmitted ? 'Đã tiếp nhận' : 'Chưa tiếp nhận'}
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

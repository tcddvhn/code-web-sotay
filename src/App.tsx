import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  FileBarChart,
  Link as LinkIcon,
  Lock,
  LogIn,
  LogOut,
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
import { HandbookShell } from './handbook/HandbookShell';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, SHEET_CONFIGS, UNITS, YEARS } from './constants';
import {
  deleteFileByPath,
  deleteFolderByPath,
  getCurrentSupabaseUser,
  loginWithSupabaseEmail,
  logoutSupabase,
  onSupabaseAuthStateChange,
} from './supabase';
import { AppSettings, AuthenticatedUser, ConsolidatedData, DataFileRecordSummary, DataRow, FormTemplate, ManagedUnit, Project, UserProfile, ViewMode } from './types';
import { getPreferredReportingYear } from './utils/reportingYear';
import { buildAssignmentUsers, getAssignmentKey } from './access';
import {
  countDataFilesByYear,
  countRowsByYear,
  deleteDataFileByUnit,
  deleteDataFilesByYear,
  getUserProfileByEmail,
  getSettings as getSettingsFromSupabase,
  listDataFilesByProject as listDataFilesByProjectFromSupabase,
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
  listGlobalAssignments as listGlobalAssignmentsFromSupabase,
  listProjects as listProjectsFromSupabase,
  listRowsByProject as listRowsByProjectFromSupabase,
  listTemplates as listTemplatesFromSupabase,
  listUnits as listUnitsFromSupabase,
  replaceAssignments as replaceAssignmentsInSupabase,
  replaceGlobalAssignments as replaceGlobalAssignmentsInSupabase,
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
const GLOBAL_ASSIGNMENT_PROJECT_NAME = 'THá»NG KÃŠ Sá» LIá»†U SÆ  Káº¾T NQ21';

function normalizeProjectName(value: string) {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi-VN');
}

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
  const [dataFiles, setDataFiles] = useState<DataFileRecordSummary[]>([]);
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
        setAuthError('PhiÃªn Supabase hiá»‡n khÃ´ng cÃ³ email há»£p lá»‡.');
        setUser(null);
        setUserProfile(null);
        setCurrentView('LOGIN');
        setIsAuthReady(true);
        return;
      }

      try {
        const profile = await getUserProfileByEmail(nextUser.email);
        if (!profile) {
          setAuthError('TÃ i khoáº£n nÃ y chÆ°a Ä‘Æ°á»£c cáº¥p quyá»n truy cáº­p trong báº£ng user_profiles cá»§a Supabase.');
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
        setAuthError(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ táº£i há»“ sÆ¡ tÃ i khoáº£n tá»« Supabase.');
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
        setAuthError('KhÃ´ng thá»ƒ khá»Ÿi táº¡o phiÃªn Ä‘Äƒng nháº­p tá»« Supabase.');
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

    setUsers([]);
    setSettings(DEFAULT_SETTINGS);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthReady) {
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
  }, [isAuthReady]);

  useEffect(() => {
    if (!isAuthReady) {
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
  }, [isAuthReady, selectedProjectId]);

  const refreshTemplatesForProject = async (projectId: string) => {
    if (!projectId) {
      setTemplates([]);
      return;
    }

    const list = await listTemplatesFromSupabase(projectId);
    setTemplates(list);
  };

  useEffect(() => {
    if (!isAuthReady) {
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
  }, [isAuthReady, selectedProjectId]);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!selectedProjectId) {
      setDataFiles([]);
      return;
    }

    let cancelled = false;
    listDataFilesByProjectFromSupabase(selectedProjectId)
      .then((rows) => {
        if (!cancelled) {
          setDataFiles(rows);
        }
      })
      .catch((error) => {
        console.error('Supabase data files load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, selectedProjectId]);

  useEffect(() => {
    if (!isAuthReady) {
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
  }, [isAuthenticated, isAdmin, isAuthReady]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      setAssignments({});
      return;
    }

    let cancelled = false;
    listGlobalAssignmentsFromSupabase()
      .then(async (rows) => {
        if (cancelled) {
          return;
        }

        let sourceRows = rows;

        if (sourceRows.length === 0) {
          const legacySourceProject = projects.find(
            (project) => normalizeProjectName(project.name) === normalizeProjectName(GLOBAL_ASSIGNMENT_PROJECT_NAME),
          );

          if (legacySourceProject) {
            const legacyRows = await listAssignmentsFromSupabase(legacySourceProject.id);
            sourceRows = legacyRows.map((row) => ({
              id: row.assignee_key,
              assignee_key: row.assignee_key,
              user_id: row.user_id,
              email: row.email,
              display_name: row.display_name,
              unit_codes: row.unit_codes,
              updated_at: row.updated_at,
            }));

            if (legacyRows.length > 0) {
              try {
                await replaceGlobalAssignmentsInSupabase(sourceRows);
              } catch (bootstrapError) {
                console.warn('KhÃ´ng thá»ƒ tá»± bootstrap global_assignments tá»« dá»¯ liá»‡u cÅ©:', bootstrapError);
              }
            }
          }
        }

        const map: Record<string, string[]> = {};
        sourceRows.forEach((row) => {
          map[row.assignee_key] = Array.isArray(row.unit_codes) ? row.unit_codes : [];
        });
        setAssignments(map);
      })
      .catch((error) => {
        console.error('Supabase global assignments load error:', error);
        const legacySourceProject = projects.find(
          (project) => normalizeProjectName(project.name) === normalizeProjectName(GLOBAL_ASSIGNMENT_PROJECT_NAME),
        );
        if (!legacySourceProject || cancelled) {
          return;
        }

        listAssignmentsFromSupabase(legacySourceProject.id)
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
          .catch((legacyError) => {
            console.error('Supabase legacy assignments fallback load error:', legacyError);
          });
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isAuthenticated, projects]);

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
      const cleanupPrefixes = [
        `data_files/${projectId}`,
        `project_templates/${projectId}`,
        `report_exports/${projectId}`,
        projectId,
      ];
      for (const prefix of cleanupPrefixes) {
        try {
          await deleteFolderByPath(prefix);
        } catch (error) {
          console.warn(`KhÃ´ng thá»ƒ dá»n thÆ° má»¥c lÆ°u trá»¯ ${prefix}:`, error);
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

      const nextProjects = await listProjectsFromSupabase();
      setProjects(nextProjects);
      setTemplates((prev) => prev.filter((template) => template.projectId !== projectId));
      setData((prev) => {
        const nextData: ConsolidatedData = {};
        Object.entries(prev).forEach(([templateId, rows]) => {
          const safeRows = Array.isArray(rows) ? rows : [];
          const remainingRows = safeRows.filter((row) => row.projectId !== projectId);
          if (remainingRows.length > 0) {
            nextData[templateId] = remainingRows;
          }
        });
        return nextData;
      });
      setAssignments({});

      if (selectedProjectId === projectId) {
        setDataFiles([]);
        setCurrentView('DASHBOARD');
      }

      return deletedDataRows + deletedTemplates + deletedAssignments + deletedExports + 1;
    } catch (error) {
      console.error('Delete project error:', error);
      return 0;
    }
  };

  const handleCreateProject = async (payload: { name: string; description: string }) => {
    const normalizedName = normalizeProjectName(payload.name);
    const duplicateProject = projects.find((project) => normalizeProjectName(project.name) === normalizedName);

    if (duplicateProject) {
      throw new Error(`TÃªn dá»± Ã¡n "${payload.name.trim()}" Ä‘Ã£ tá»“n táº¡i. Vui lÃ²ng chá»n tÃªn khÃ¡c.`);
    }

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

  const handleUpdateProject = async (project: Project, payload: { name: string; description: string }) => {
    const normalizedName = normalizeProjectName(payload.name);
    const duplicateProject = projects.find(
      (item) => item.id !== project.id && normalizeProjectName(item.name) === normalizedName,
    );

    if (duplicateProject) {
      throw new Error(`TÃªn dá»± Ã¡n "${payload.name.trim()}" Ä‘Ã£ tá»“n táº¡i. Vui lÃ²ng chá»n tÃªn khÃ¡c.`);
    }

    const nextProject: Project = {
      ...project,
      name: payload.name.trim(),
      description: payload.description.trim(),
      updatedAt: new Date().toISOString(),
    };

    await upsertProjectToSupabase(nextProject);
    const nextProjects = await listProjectsFromSupabase();
    setProjects(nextProjects);
    return nextProject;
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
      const refreshedDataFiles = await listDataFilesByProjectFromSupabase(selectedProjectId);
      const organized: ConsolidatedData = {};
      refreshedRows.forEach((row) => {
        if (!organized[row.templateId]) {
          organized[row.templateId] = [];
        }
        organized[row.templateId].push(row);
      });
      setData(organized);
      setDataFiles(refreshedDataFiles);
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
      const refreshedDataFiles = await listDataFilesByProjectFromSupabase(currentProject.id);
      const organized: ConsolidatedData = {};
      refreshedRows.forEach((row) => {
        if (!organized[row.templateId]) {
          organized[row.templateId] = [];
        }
        organized[row.templateId].push(row);
      });
      setData(organized);
      setDataFiles(refreshedDataFiles);
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
      const rowsBeforeDelete = await countRowsByYear(currentProject.id, year);
      const dataFilesBeforeDelete = await countDataFilesByYear(currentProject.id, year);

      if (rowsBeforeDelete === 0 && dataFilesBeforeDelete === 0) {
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
      const refreshedDataFiles = await listDataFilesByProjectFromSupabase(currentProject.id);
      const organized: ConsolidatedData = {};
      refreshedRows.forEach((row) => {
        if (!organized[row.templateId]) {
          organized[row.templateId] = [];
        }
        organized[row.templateId].push(row);
      });

      const remainingRowsForYear = refreshedRows.filter((row) => row.projectId === currentProject.id && row.year === year).length;
      const remainingDataFilesForYear = refreshedDataFiles.filter((file) => file.projectId === currentProject.id && file.year === year).length;

      setData(organized);
      setDataFiles(refreshedDataFiles);

      if (remainingRowsForYear > 0 || remainingDataFilesForYear > 0) {
        throw new Error(
          `Há»‡ thá»‘ng chÆ°a xÃ³a háº¿t dá»¯ liá»‡u nÄƒm ${year}. CÃ²n ${remainingRowsForYear} dÃ²ng dá»¯ liá»‡u vÃ  ${remainingDataFilesForYear} file metadata.`,
        );
      }

      return rowsBeforeDelete;
    } catch (error) {
      console.error('Delete year rows error:', error);
      throw error instanceof Error ? error : new Error('KhÃ´ng thá»ƒ xÃ³a dá»¯ liá»‡u theo nÄƒm.');
    }
  };

  const handleSaveAssignments = async (assigneeKey: string, unitCodes: string[]) => {
    if (!isAdmin) {
      return;
    }

    const normalizedAssigneeKey = getAssignmentKey(assigneeKey);
    const assignmentUser = assignmentUsers.find((item) => item.id === normalizedAssigneeKey);
    if (!assignmentUser) {
      throw new Error('KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i theo dÃµi Ä‘á»ƒ lÆ°u phÃ¢n cÃ´ng.');
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

    const nextAssignments = new Map<string, { userId?: string; email: string; displayName: string; unitCodes: string[] }>();

    Object.entries(assignments).forEach(([key, currentUnitCodes]) => {
      const currentUserProfile = assignmentUsers.find((item) => item.id === key);
      nextAssignments.set(key, {
        userId: currentUserProfile?.userId,
        email: currentUserProfile?.email || key,
        displayName: currentUserProfile?.displayName || currentUserProfile?.email || key,
        unitCodes: (Array.isArray(currentUnitCodes) ? currentUnitCodes : []).filter((unitCode) => !selectedUnitSet.has(unitCode)),
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
        id: key,
        assignee_key: key,
        user_id: entry.userId || null,
        email: entry.email,
        display_name: entry.displayName,
        unit_codes: entry.unitCodes,
        updated_at: new Date().toISOString(),
      }));

    await replaceGlobalAssignmentsInSupabase(payload);
    const refreshed = await listGlobalAssignmentsFromSupabase();
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
      alert('ÄÃ£ lÆ°u cÃ i Ä‘áº·t!');
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
      throw new Error('TÃªn Ä‘Æ¡n vá»‹ khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.');
    }

    const duplicate = allUnits.find((unit) => unit.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (duplicate) {
      throw new Error('TÃªn Ä‘Æ¡n vá»‹ Ä‘Ã£ tá»“n táº¡i trong danh má»¥c.');
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
      throw new Error('KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n vá»‹ cáº§n xÃ³a.');
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
      throw new Error('KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n vá»‹ cáº§n khÃ´i phá»¥c.');
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
      throw new Error('TÃªn Ä‘Æ¡n vá»‹ khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.');
    }

    const targetUnit = allUnits.find((unit) => unit.code === unitCode);
    if (!targetUnit) {
      throw new Error('KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n vá»‹ cáº§n cáº­p nháº­t.');
    }

    const duplicate = allUnits.find(
      (unit) => unit.code !== unitCode && unit.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      throw new Error('TÃªn Ä‘Æ¡n vá»‹ Ä‘Ã£ tá»“n táº¡i trong danh má»¥c.');
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
      'XÃ³a toÃ n bá»™ dá»± Ã¡n, biá»ƒu máº«u, dá»¯ liá»‡u tiáº¿p nháº­n, phÃ¢n cÃ´ng vÃ  lá»‹ch sá»­ xuáº¥t bÃ¡o cÃ¡o trÃªn há»‡ thá»‘ng? HÃ nh Ä‘á»™ng nÃ y khÃ´ng thá»ƒ hoÃ n tÃ¡c.',
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
      alert('ÄÃ£ xÃ³a sáº¡ch toÃ n bá»™ dá»¯ liá»‡u há»‡ thá»‘ng.');
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
      case 'HANDBOOK':
        return (
          <HandbookShell
            isAdmin={isAdmin}
            onOpenDataSystem={() => setCurrentView('DASHBOARD')}
            onOpenAdmin={() => setCurrentView(isAdmin ? 'SETTINGS' : 'LOGIN')}
          />
        );
      case 'DASHBOARD':
        return (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
            assignmentUsers={assignmentUsers}
            assignments={assignments}
            currentUser={effectiveUserProfile}
            onSaveAssignments={handleSaveAssignments}
            dataFiles={dataFiles}
            onOpenLogin={() => setCurrentView('LOGIN')}
            onLogout={handleLogout}
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
            onUpdateProject={handleUpdateProject}
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
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
            assignmentUsers={assignmentUsers}
            assignments={assignments}
            currentUser={effectiveUserProfile}
            onSaveAssignments={handleSaveAssignments}
            dataFiles={dataFiles}
            onOpenLogin={() => setCurrentView('LOGIN')}
            onLogout={handleLogout}
          />
        );
      case 'LEARN_FORM':
        return isAdmin ? (
          <FormLearner
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            onDeleteTemplate={handleDeleteTemplate}
            onTemplatesChanged={refreshTemplatesForProject}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={projects}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
            assignmentUsers={assignmentUsers}
            assignments={assignments}
            currentUser={effectiveUserProfile}
            onSaveAssignments={handleSaveAssignments}
            dataFiles={dataFiles}
            onOpenLogin={() => setCurrentView('LOGIN')}
            onLogout={handleLogout}
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
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
            assignmentUsers={assignmentUsers}
            assignments={assignments}
            currentUser={effectiveUserProfile}
            onSaveAssignments={handleSaveAssignments}
            dataFiles={dataFiles}
            onOpenLogin={() => setCurrentView('LOGIN')}
            onLogout={handleLogout}
          />
        );
      case 'REPORTS':
        return (
          <ReportView
            data={data}
            dataFiles={dataFiles}
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
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              assignmentUsers={assignmentUsers}
              assignments={assignments}
              currentUser={effectiveUserProfile}
              onSaveAssignments={handleSaveAssignments}
              dataFiles={dataFiles}
              onOpenLogin={() => setCurrentView('LOGIN')}
              onLogout={handleLogout}
            />
          );
        }
        return (
          <div className="p-6 md:p-8">
            <h2 className="page-title">CÃ i Ä‘áº·t há»‡ thá»‘ng</h2>
            <p className="page-subtitle mt-2 max-w-3xl text-sm">
              Cáº¥u hÃ¬nh nguá»“n lÆ°u trá»¯ vÃ  Ä‘Æ°á»ng dáº«n tiáº¿p nháº­n dá»¯ liá»‡u táº­p trung cho toÃ n há»‡ thá»‘ng.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.55fr)_320px] xl:grid-cols-[minmax(0,1.45fr)_300px]">
              <div className="space-y-6">
                <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">Link OneDrive (lÆ°u trá»¯ trá»±c tuyáº¿n)</label>
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
                <label className="col-header block mb-3">ThÆ° má»¥c lÆ°u trá»¯ file gá»‘c</label>
                <input
                  type="text"
                  value={settings.storagePath}
                  onChange={(event) => setSettings({ ...settings, storagePath: event.target.value })}
                  className="field-input"
                    disabled={!isAdmin}
                />
                </div>

                <div className="panel-card rounded-[24px] p-6">
                <label className="col-header block mb-3">ThÆ° má»¥c lÆ°u trá»¯ file Ä‘Ã£ tiáº¿p nháº­n</label>
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
                      LÆ°u cáº¥u hÃ¬nh
                    </button>
                    <button onClick={handleDeleteAllSystemData} className="secondary-btn">
                      XÃ³a sáº¡ch dá»¯ liá»‡u há»‡ thá»‘ng
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4 xl:max-w-[320px] 2xl:max-w-[340px]">
                <div className="panel-card rounded-[24px] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="section-title text-[1.08rem] leading-6">CÃ¡c má»¥c cÃ i Ä‘áº·t dÃ¹ng Ä‘á»ƒ lÃ m gÃ¬?</h3>
                    <button
                      type="button"
                      onClick={() => setIsSettingsHelpExpanded((current) => !current)}
                      className="secondary-btn px-4 py-2 text-[10px]"
                    >
                      {isSettingsHelpExpanded ? 'áº¨n hÆ°á»›ng dáº«n' : 'Xem hÆ°á»›ng dáº«n'}
                    </button>
                  </div>
                  {isSettingsHelpExpanded && (
                  <div className="mt-3 space-y-3 text-[13px] leading-6 text-[var(--ink-soft)]">
                    <p>
                      <strong className="text-[var(--ink)]">Link OneDrive</strong> dÃ¹ng Ä‘á»ƒ lÆ°u Ä‘Æ°á»ng dáº«n truy cáº­p kho tÃ i liá»‡u trá»±c tuyáº¿n,
                      giÃºp ngÆ°á»i váº­n hÃ nh má»Ÿ nhanh nÆ¡i chá»©a file máº«u hoáº·c file gá»‘c dÃ¹ng chung.
                    </p>
                    <p>
                      <strong className="text-[var(--ink)]">ThÆ° má»¥c lÆ°u trá»¯ file gá»‘c</strong> lÃ  nÆ¡i quy Æ°á»›c chá»©a cÃ¡c file Excel ban Ä‘áº§u do
                      Ä‘Æ¡n vá»‹ gá»­i lÃªn trÆ°á»›c khi chuáº©n hÃ³a hoáº·c nháº­p dá»¯ liá»‡u vÃ o há»‡ thá»‘ng.
                    </p>
                    <p>
                      <strong className="text-[var(--ink)]">ThÆ° má»¥c lÆ°u trá»¯ file Ä‘Ã£ tiáº¿p nháº­n</strong> lÃ  nÆ¡i quy Æ°á»›c lÆ°u cÃ¡c file Ä‘Ã£ Ä‘Æ°á»£c kiá»ƒm tra,
                      tiáº¿p nháº­n vÃ  sáºµn sÃ ng Ä‘á»‘i chiáº¿u vá»›i dá»¯ liá»‡u Ä‘Ã£ nháº­p.
                    </p>
                    <p>
                      <strong className="text-[var(--ink)]">Quáº£n lÃ½ danh sÃ¡ch Ä‘Æ¡n vá»‹</strong> dÃ¹ng Ä‘á»ƒ váº­n hÃ nh danh má»¥c 132 Ä‘Æ¡n vá»‹ toÃ n há»‡ thá»‘ng.
                      Khi xÃ³a má»m má»™t Ä‘Æ¡n vá»‹, dá»± Ã¡n cÅ© váº«n giá»¯ nguyÃªn dá»¯ liá»‡u lá»‹ch sá»­, cÃ²n dá»± Ã¡n táº¡o má»›i sau thá»i Ä‘iá»ƒm xÃ³a sáº½ khÃ´ng cÃ²n nhÃ¬n tháº¥y Ä‘Æ¡n vá»‹ Ä‘Ã³.
                    </p>
                    <p>
                      <strong className="text-[var(--ink)]">XÃ³a sáº¡ch dá»¯ liá»‡u há»‡ thá»‘ng</strong> lÃ  thao tÃ¡c quáº£n trá»‹ cao nháº¥t, dÃ¹ng khi cáº§n lÃ m sáº¡ch
                      toÃ n bá»™ dá»¯ liá»‡u dá»± Ã¡n, biá»ƒu máº«u, tiáº¿p nháº­n vÃ  lá»‹ch sá»­ xuáº¥t bÃ¡o cÃ¡o.
                    </p>
                  </div>
                  )}
                </div>

                {!isAdmin && (
                  <div className="panel-card rounded-[24px] p-5 text-sm text-[var(--ink-soft)]">
                    Chá»‰ tÃ i khoáº£n Admin má»›i Ä‘Æ°á»£c phÃ©p thay Ä‘á»•i cáº¥u hÃ¬nh há»‡ thá»‘ng vÃ  quáº£n lÃ½ danh má»¥c Ä‘Æ¡n vá»‹.
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
      setMessage('ÄÃ£ thÃªm Ä‘Æ¡n vá»‹ má»›i vÃ o danh má»¥c há»‡ thá»‘ng.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ thÃªm Ä‘Æ¡n vá»‹ má»›i.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteUnit = async (unit: ManagedUnit) => {
    const confirmed = window.confirm(
      `ÄÃ¡nh dáº¥u xÃ³a má»m Ä‘Æ¡n vá»‹ "${unit.name}" (${unit.code})? ÄÆ¡n vá»‹ sáº½ bá»‹ áº©n á»Ÿ cÃ¡c dá»± Ã¡n táº¡o má»›i sau thá»i Ä‘iá»ƒm xÃ³a.`,
    );
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      await onSoftDeleteUnit(unit.code);
      setMessage(`ÄÃ£ Ä‘Ã¡nh dáº¥u xÃ³a má»m Ä‘Æ¡n vá»‹ ${unit.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ xÃ³a má»m Ä‘Æ¡n vá»‹.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const restoreUnit = async (unit: ManagedUnit) => {
    const confirmed = window.confirm(`KhÃ´i phá»¥c Ä‘Æ¡n vá»‹ "${unit.name}" (${unit.code}) vÃ o danh má»¥c sá»­ dá»¥ng?`);
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      await onRestoreUnit(unit.code);
      setMessage(`ÄÃ£ khÃ´i phá»¥c Ä‘Æ¡n vá»‹ ${unit.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ khÃ´i phá»¥c Ä‘Æ¡n vá»‹.');
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
      setMessage(`ÄÃ£ cáº­p nháº­t tÃªn Ä‘Æ¡n vá»‹ ${unit.code}.`);
      cancelEditUnit();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ cáº­p nháº­t tÃªn Ä‘Æ¡n vá»‹.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel-card rounded-[24px] p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="section-title">Quáº£n lÃ½ danh sÃ¡ch Ä‘Æ¡n vá»‹</h3>
          <p className="page-subtitle mt-2 text-sm">
            Danh má»¥c ná»n cá»§a toÃ n há»‡ thá»‘ng. MÃ£ Ä‘Æ¡n vá»‹ Ä‘Æ°á»£c tá»± sinh theo sá»‘ lá»›n nháº¥t hiá»‡n cÃ³.
          </p>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          Äang hoáº¡t Ä‘á»™ng {activeUnits.length} Ä‘Æ¡n vá»‹
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={newUnitName}
          onChange={(event) => setNewUnitName(event.target.value)}
          className="field-input"
          placeholder="Nháº­p tÃªn Ä‘Æ¡n vá»‹ má»›i"
        />
        <button
          onClick={submitNewUnit}
          disabled={isSubmitting || !newUnitName.trim()}
          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
        >
          ThÃªm Ä‘Æ¡n vá»‹
        </button>
      </div>

      {message && <p className="mt-4 text-sm font-medium text-[var(--ink-soft)]">{message}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <p className="col-header mb-3">ÄÆ¡n vá»‹ Ä‘ang sá»­ dá»¥ng</p>
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
                      placeholder="Nháº­p tÃªn Ä‘Æ¡n vá»‹"
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
                        LÆ°u tÃªn
                      </button>
                      <button
                        onClick={cancelEditUnit}
                        disabled={isSubmitting}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Há»§y
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => beginEditUnit(unit)}
                        disabled={isSubmitting}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Äá»•i tÃªn
                      </button>
                      <button
                        onClick={() => deleteUnit(unit)}
                        disabled={isSubmitting}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        XÃ³a má»m
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="col-header mb-3">ÄÆ¡n vá»‹ Ä‘Ã£ xÃ³a má»m</p>
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
                    KhÃ´i phá»¥c
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--ink-soft)]">
                ChÆ°a cÃ³ Ä‘Æ¡n vá»‹ nÃ o bá»‹ xÃ³a má»m.
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
      setError('Vui lÃ²ng nháº­p email vÃ  máº­t kháº©u.');
      return;
    }
    try {
      await onLoginWithEmail(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'KhÃ´ng thá»ƒ Ä‘Äƒng nháº­p báº±ng tÃ i khoáº£n nÃ y.');
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-6 md:p-8">
      <div className="panel-card w-full max-w-md rounded-[28px] p-8 md:p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)]">
          <Lock size={30} />
        </div>
        <h2 className="section-title">ÄÄƒng nháº­p há»‡ thá»‘ng</h2>
        <p className="page-subtitle mt-3 text-sm">DÃ nh cho cÃ¡c tÃ i khoáº£n Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t trong Supabase.</p>

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
            <label className="col-header block mt-4 mb-2">Máº­t kháº©u</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input"
              placeholder="Nháº­p máº­t kháº©u"
            />
            <button onClick={submitEmailLogin} className="primary-btn mt-4 w-full">
              ÄÄƒng nháº­p báº±ng tÃ i khoáº£n
            </button>
            <p className="mt-3 text-[12px] leading-5 text-[var(--ink-soft)]">
              TÃ i khoáº£n vÃ  máº­t kháº©u Ä‘Æ°á»£c quáº£n trá»‹ viÃªn cáº¥p sáºµn trÃªn Supabase.
            </p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-soft)]">
            Chá»‰ tÃ i khoáº£n Ä‘Æ°á»£c cáº¥p quyá»n má»›i cÃ³ thá»ƒ tiáº¿p nháº­n dá»¯ liá»‡u
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
  dataFiles,
  templates,
  projects,
  units,
  selectedProjectId,
  onSelectProject,
  isAuthenticated,
  isAdmin,
  assignmentUsers,
  assignments,
  currentUser,
  onSaveAssignments,
  onOpenLogin,
  onLogout,
}: {
  data: ConsolidatedData;
  dataFiles: DataFileRecordSummary[];
  templates: FormTemplate[];
  projects: Project[];
  units: ManagedUnit[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  assignmentUsers: ReturnType<typeof buildAssignmentUsers>;
  assignments: Record<string, string[]>;
  currentUser: UserProfile | null;
  onSaveAssignments: (assigneeKey: string, unitCodes: string[]) => Promise<void>;
  onOpenLogin: () => void;
  onLogout: () => Promise<void>;
}) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<UnitStatusFilter>('ALL');
  const [dashboardYear, setDashboardYear] = useState(() => getPreferredReportingYear());
  const currentAssignmentKey = useMemo(() => getAssignmentKey(currentUser?.email), [currentUser?.email]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const projectTemplates = templates.filter((tpl) => tpl.projectId === selectedProjectId);
  const templateMap = new Map(projectTemplates.map((tpl) => [tpl.id, tpl]));
  const submittedUnitCodes = useMemo(() => {
    return new Set(
      dataFiles
        .filter((file) => file.projectId === selectedProjectId && file.year === dashboardYear)
        .map((file) => file.unitCode),
    );
  }, [dashboardYear, dataFiles, selectedProjectId]);

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
      const label = row.updatedBy.displayName || row.updatedBy.email || 'Há»‡ thá»‘ng';
      const existing = map.get(row.unitCode);
      if (!existing || time > existing.at) {
        map.set(row.unitCode, { name: label || 'Há»‡ thá»‘ng', at: time });
      }
    });
    return map;
  }, [rowsForYear]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(assignments).forEach(([userId, unitCodes]) => {
      const user = assignmentUsers.find((u) => u.id === userId);
      const name = user?.displayName || user?.email || 'ChÆ°a rÃµ';
      unitCodes.forEach((code) => {
        map.set(code, name);
      });
    });
    return map;
  }, [assignments, assignmentUsers]);

  const currentAssignedUnitCodes = useMemo(
    () => (currentAssignmentKey ? assignments[currentAssignmentKey] || [] : []),
    [assignments, currentAssignmentKey],
  );
  const shouldLockToCurrentUserAssignments = isAuthenticated && !isAdmin && currentAssignedUnitCodes.length > 0;

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
        isSubmitted: submittedUnitCodes.has(unit.code) || importedSheets.length > 0,
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
  }, [assignmentMap, lastUpdatedBy, rowsForYear, submittedUnitCodes, templateMap, units]);

  const unitLogs = useMemo<UnitLog[]>(() => {
    if (isAuthenticated && !isAdmin) {
      if (currentAssignedUnitCodes.length === 0) {
        return [];
      }

      const currentUserLogs = allUnitLogs.filter((unit) => currentAssignedUnitCodes.includes(unit.code));

      if (statusFilter === 'SUBMITTED') {
        return currentUserLogs.filter((unit) => unit.isSubmitted);
      }

      if (statusFilter === 'PENDING') {
        return currentUserLogs.filter((unit) => !unit.isSubmitted);
      }

      return currentUserLogs;
    }

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
  }, [allUnitLogs, assignments, currentAssignedUnitCodes, isAdmin, isAuthenticated, selectedAssignee, statusFilter]);

  const submittedCount = allUnitLogs.filter((unit) => unit.isSubmitted).length;
  const totalUnits = units.length;
  const completionRate = totalUnits === 0 ? '0.0' : ((submittedCount / totalUnits) * 100).toFixed(1);

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
  const completedProjects = projects.filter((p) => p.status === 'COMPLETED').length;
  const assignees = useMemo(() => assignmentUsers, [assignmentUsers]);

  useEffect(() => {
    if (shouldLockToCurrentUserAssignments) {
      setSelectedAssignee(currentAssignmentKey);
      return;
    }

    setSelectedAssignee('ALL');
  }, [currentAssignmentKey, shouldLockToCurrentUserAssignments]);

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

  const openLogView = (nextStatus?: UnitStatusFilter) => {
    if (!isAuthenticated) {
      setIsLoginPromptOpen(true);
      return;
    }

    if (nextStatus) {
      setStatusFilter(nextStatus);
    }

    setIsLogOpen(true);
  };

  return (
    <div className="p-6 md:p-8">
      <header className="relative mb-6 md:mb-8">
        <button
          type="button"
          onClick={isAuthenticated ? () => void onLogout() : onOpenLogin}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-white/90 text-[var(--primary-dark)] shadow-sm md:hidden"
          title={isAuthenticated ? 'ÄÄƒng xuáº¥t' : 'ÄÄƒng nháº­p'}
        >
          {isAuthenticated ? <LogOut size={18} /> : <LogIn size={18} />}
        </button>
        <div>
          <div className="surface-tag">NÄƒm tá»•ng há»£p {dashboardYear}</div>
          <h2 className="page-title mt-4">Há»† THá»NG QUáº¢N TRá»Š Dá»® LIá»†U TCÄ, ÄV Táº¬P TRUNG</h2>
          {currentUser && (
            <p className="mt-3 text-sm font-bold text-[var(--primary-dark)]">
              TÃ i khoáº£n Ä‘ang Ä‘Äƒng nháº­p: {currentUser.displayName || currentUser.email || 'ChÆ°a xÃ¡c Ä‘á»‹nh'}
            </p>
          )}
          <p className="page-subtitle mt-3 max-w-3xl text-sm">
            Theo dÃµi nhanh tÃ¬nh hÃ¬nh tiáº¿p nháº­n dá»¯ liá»‡u cá»§a cÃ¡c Ä‘Æ¡n vá»‹, sá»‘ biá»ƒu Ä‘Ã£ nháº­p vÃ  má»©c Ä‘á»™ hoÃ n thÃ nh tá»•ng há»£p trÃªn toÃ n há»‡ thá»‘ng.
          </p>
        </div>
      </header>

      <div className="panel-card rounded-[24px] p-5 md:hidden">
        <div className="space-y-4">
          <div>
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
          </div>

          <div className="border-t border-[var(--line)]" />

          <div>
            <p className="col-header mb-2">Chá»n nÄƒm</p>
            <select
              value={dashboardYear}
              onChange={(event) => setDashboardYear(event.target.value)}
              className="field-select text-sm font-bold"
            >
              {YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-[var(--line)]" />

          <p className="text-xs leading-5 text-[var(--ink-soft)]">
            {selectedProject ? selectedProject.description || DEFAULT_PROJECT_NAME : DEFAULT_PROJECT_NAME}
          </p>
        </div>
      </div>

      <div className="mt-6 panel-card rounded-[24px] p-5 md:hidden">
        <h3 className="section-title text-base">Tiáº¿n Ä‘á»™ tiáº¿p nháº­n</h3>
        <div className="mt-3 space-y-1.5 text-sm leading-tight text-[var(--ink)]">
          <p>- Dá»± Ã¡n Ä‘ang cháº¡y: <span className="font-semibold">{activeProjects}</span></p>
          <p>- Dá»± Ã¡n hoÃ n thÃ nh: <span className="font-semibold">{completedProjects}</span></p>
          <p>- Tá»•ng sá»‘ Ä‘Æ¡n vá»‹: <span className="font-semibold">{totalUnits}</span></p>
          <p>- ÄÆ¡n vá»‹ Ä‘Ã£ tiáº¿p nháº­n: <span className="font-semibold">{submittedCount}/{totalUnits}</span></p>
          <p>- Tá»· lá»‡ hoÃ n thÃ nh: <span className="font-semibold text-[var(--primary-dark)]">{completionRate}%</span></p>
        </div>
      </div>

      <div className="mt-6 hidden grid-cols-1 gap-6 md:grid md:grid-cols-2 xl:grid-cols-4">
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
          <p className="col-header mb-2">Chá»n nÄƒm</p>
          <select
            value={dashboardYear}
            onChange={(event) => setDashboardYear(event.target.value)}
            className="field-select text-sm font-bold"
          >
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            Tiáº¿n Ä‘á»™ vÃ  nháº­t kÃ½ bÃªn dÆ°á»›i sáº½ Ä‘Æ°á»£c lá»c theo Ä‘Ãºng dá»± Ã¡n vÃ  nÄƒm báº¡n Ä‘ang chá»n.
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

      <div className="mt-8 hidden grid-cols-1 gap-6 md:grid md:grid-cols-2 xl:grid-cols-3">
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
            units={units}
            users={assignees}
            assignments={assignments}
            onSaveAssignments={onSaveAssignments}
          />
        </div>
      )}

      {selectedProject && (
        <div className="mt-6 panel-card rounded-[28px] p-5 md:hidden">
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="section-title text-base">Nháº­t kÃ½ tiáº¿p nháº­n Ä‘Æ¡n vá»‹</h3>
              <p className="page-subtitle mt-2 text-sm">Má»Ÿ nhanh danh sÃ¡ch Ä‘Ã£ tiáº¿p nháº­n hoáº·c chÆ°a tiáº¿p nháº­n.</p>
            </div>
            <button
              type="button"
              onClick={() => openLogView('SUBMITTED')}
              className="status-pill status-pill-submitted w-full justify-center"
            >
              ÄÃ£ tiáº¿p nháº­n
            </button>
            <button
              type="button"
              onClick={() => openLogView('PENDING')}
              className="status-pill status-pill-pending w-full justify-center"
            >
              ChÆ°a tiáº¿p nháº­n
            </button>
            <button onClick={() => openLogView()} className="primary-btn w-full">
              Xem táº¥t cáº£ nháº­t kÃ½
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 panel-card rounded-[28px] p-6 md:hidden">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="section-title">Biá»ƒu Ä‘á»“ tiáº¿p nháº­n dá»¯ liá»‡u</h3>
            <p className="page-subtitle mt-2 text-sm">Tá»· lá»‡ Ä‘Æ¡n vá»‹ Ä‘Ã£ ná»™p dá»¯ liá»‡u so vá»›i tá»•ng sá»‘ Ä‘Æ¡n vá»‹ trong nÄƒm {dashboardYear}.</p>
          </div>
          <div className="status-pill status-pill-submitted self-start">{submittedCount} Ä‘Æ¡n vá»‹ Ä‘Ã£ ná»™p</div>
        </div>

        <div className="mt-8 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={96}
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

      <div className={`mt-8 hidden grid-cols-1 gap-8 md:grid ${selectedProject ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : ''}`}>
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

        {selectedProject && (
        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">Tráº¡ng thÃ¡i tiáº¿p nháº­n Ä‘Æ¡n vá»‹</h3>
              <p className="page-subtitle mt-2 text-sm">Danh sÃ¡ch Ä‘Æ°á»£c láº¥y tá»« dá»¯ liá»‡u tháº­t Ä‘Ã£ lÆ°u.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === 'SUBMITTED' ? 'ALL' : 'SUBMITTED'))}
                className={statusFilter === 'SUBMITTED' ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}
              >
                ÄÃ£ tiáº¿p nháº­n
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === 'PENDING' ? 'ALL' : 'PENDING'))}
                className={statusFilter === 'PENDING' ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}
              >
                ChÆ°a tiáº¿p nháº­n
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
                      ? `ÄÃ£ nháº­p ${unit.importedSheets.length}/${projectTemplates.length} biá»ƒu`
                      : 'ChÆ°a tiáº¿p nháº­n dá»¯ liá»‡u'}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-start md:self-auto">
                  <span className={unit.isSubmitted ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}>
                    {unit.isSubmitted ? 'ÄÃ£ tiáº¿p nháº­n' : 'ChÆ°a tiáº¿p nháº­n'}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <button onClick={() => openLogView()} className="primary-btn w-full">
              Xem táº¥t cáº£ nháº­t kÃ½
            </button>
          </div>
        </div>
        )}
      </div>

      {isLoginPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-4 backdrop-blur-sm">
          <div className="panel-card w-full max-w-md rounded-[28px] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="section-title">Báº N Cáº¦N ÄÄ‚NG NHáº¬P Äá»‚ XEM CHI TIáº¾T</h3>
                <p className="page-subtitle mt-2 text-sm">
                  HÃ£y Ä‘Äƒng nháº­p Ä‘á»ƒ xem nháº­t kÃ½ chi tiáº¿t vÃ  danh sÃ¡ch Ä‘Æ¡n vá»‹ Ä‘Æ°á»£c phÃ¢n cÃ´ng cho tÃ i khoáº£n cá»§a báº¡n.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLoginPromptOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-white/85 text-[var(--primary-dark)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsLoginPromptOpen(false)}
                className="secondary-btn px-5 py-3"
              >
                ÄÃ³ng
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLoginPromptOpen(false);
                  onOpenLogin();
                }}
                className="primary-btn px-5 py-3"
              >
                ÄÄƒng nháº­p
              </button>
            </div>
          </div>
        </div>
      )}

      {isLogOpen && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-4 backdrop-blur-sm md:p-8">
          <div className="panel-card flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[30px]">
            <div className="relative flex flex-col gap-4 border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="surface-tag hidden md:inline-flex">{totalUnits} Ä‘Æ¡n vá»‹ toÃ n há»‡ thá»‘ng</div>
                <h3 className="mt-3 text-[1.6rem] font-black leading-tight tracking-[-0.02em] text-[var(--primary-dark)] md:text-[2.3rem]">
                  NHáº¬T KÃ NÄ‚M {dashboardYear}
                </h3>
                <p className="page-subtitle mt-2 hidden text-sm md:block">
                  Hiá»ƒn thá»‹ Ä‘áº§y Ä‘á»§ tráº¡ng thÃ¡i cá»§a tá»«ng Ä‘Æ¡n vá»‹ cÃ¹ng sá»‘ biá»ƒu Ä‘Ã£ Ä‘Æ°á»£c nháº­p vÃ o há»‡ thá»‘ng táº­p trung.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pr-10 md:pr-0">
                {isAdmin && assignees.length > 0 && (
                  <div className="panel-soft rounded-full px-3 py-2">
                    <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                      Lá»c theo ngÆ°á»i theo dÃµi
                    </label>
                    <select
                      value={selectedAssignee}
                      onChange={(event) => setSelectedAssignee(event.target.value)}
                      className="mt-1 w-full bg-transparent text-xs font-semibold text-[var(--ink)] focus:outline-none"
                    >
                      <option value="ALL">Táº¥t cáº£ ngÆ°á»i theo dÃµi</option>
                      {assignees.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName || user.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {shouldLockToCurrentUserAssignments && (
                  <div className="panel-soft rounded-full px-3 py-2 text-xs font-semibold text-[var(--primary-dark)]">
                    Äang xem Ä‘Æ¡n vá»‹ Ä‘Æ°á»£c phÃ¢n cÃ´ng cho {currentUser?.displayName || currentUser?.email || 'báº¡n'}
                  </div>
                )}
                <button
                  onClick={() => setIsLogOpen(false)}
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-white/85 text-[var(--primary-dark)] md:static md:h-auto md:w-auto md:gap-2 md:self-start md:rounded-[18px] md:px-4 md:py-3"
                >
                  <X size={16} />
                  <span className="hidden md:inline">ÄÃ³ng</span>
                </button>
              </div>
            </div>

            <div className="border-b border-[var(--line)] bg-[var(--primary-soft)] px-6 py-4">
              <div className="space-y-1 text-sm leading-tight text-[var(--ink)] md:hidden">
                <p>
                  - Dá»± Ã¡n: <span className="font-semibold">{selectedProject.name}</span>
                </p>
                <p>
                  - ÄÃ£ tiáº¿p nháº­n: <span className="font-semibold text-[var(--success)]">{submittedCount}</span>
                </p>
                <p>
                  - ChÆ°a tiáº¿p nháº­n: <span className="font-semibold text-[var(--warning)]">{totalUnits - submittedCount}</span>
                </p>
              </div>

              <div className="hidden grid-cols-3 gap-4 md:grid">
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
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="grid grid-cols-1 gap-3">
                {unitLogs.length === 0 && (
                  <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--ink-soft)]">
                    {isAuthenticated && !isAdmin
                      ? 'TÃ i khoáº£n cá»§a báº¡n hiá»‡n chÆ°a Ä‘Æ°á»£c phÃ¢n cÃ´ng Ä‘Æ¡n vá»‹ nÃ o trong dá»± Ã¡n nÃ y.'
                      : 'ChÆ°a cÃ³ Ä‘Æ¡n vá»‹ nÃ o phÃ¹ há»£p vá»›i bá»™ lá»c hiá»‡n táº¡i.'}
                  </div>
                )}
                {unitLogs.map((unit, index) => (
                  <div
                    key={unit.code}
                    className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3 md:hidden">
                      <p className="min-w-0 text-sm font-semibold text-[var(--ink)]">{unit.name}</p>
                      <span className={unit.isSubmitted ? 'status-pill status-pill-submitted shrink-0' : 'status-pill status-pill-pending shrink-0'}>
                        {unit.isSubmitted ? 'ÄÃ£ tiáº¿p nháº­n' : 'ChÆ°a tiáº¿p nháº­n'}
                      </span>
                    </div>

                    <div className="hidden gap-4 md:grid md:grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center">
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
                        <div className="mt-2 text-[11px] text-[var(--ink-soft)]">
                          {isAdmin && <p>NgÆ°á»i theo dÃµi: {unit.assignedTo || 'ChÆ°a phÃ¢n cÃ´ng'}</p>}
                          <p>Cáº­p nháº­t gáº§n nháº¥t: {unit.lastUpdatedBy || 'ChÆ°a cÃ³'}</p>
                        </div>
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
                          {unit.isSubmitted ? 'ÄÃ£ tiáº¿p nháº­n' : 'ChÆ°a tiáº¿p nháº­n'}
                        </span>
                      </div>
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



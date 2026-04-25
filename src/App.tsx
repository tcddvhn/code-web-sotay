import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  BellDot,
  CheckCircle2,
  FileBarChart,
  Lock,
  LogIn,
  LogOut,
  Users,
  X,
} from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ImportFiles } from './components/ImportFiles';
import { ReportView } from './components/ReportView';
import { ExtractReportView } from './components/ExtractReportView';
import { AIAnalysisView } from './components/AIAnalysisView';
import { Sidebar } from './components/Sidebar';
import { ProjectManager } from './components/ProjectManager';
import { FormLearner } from './components/FormLearner';
import dashboardDongSon from './assets/dashboard-dong-son.jpg';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, SHEET_CONFIGS, UNITS, YEARS } from './constants';
import {
  deleteFileByPath,
  deleteFolderByPath,
  getCurrentSupabaseUser,
  loginWithSupabaseEmail,
  logoutSupabase,
  onSupabaseAuthStateChange,
  updateSupabasePassword,
} from './supabase';
import {
  AppSettings,
  AssignmentUser,
  AuthenticatedUser,
  ConsolidatedData,
  DataFileRecordSummary,
  DataRow,
  Department,
  DepartmentMember,
  FormTemplate,
  ManagedUnit,
  OverwriteRequestRecord,
  Project,
  ProjectUnitScope,
  ReportTreeProjectNode,
  UserProfile,
  ViewMode,
} from './types';
import { getPreferredReportingYear } from './utils/reportingYear';
import { buildAssignmentUsers, getAssignmentKey } from './access';
import { getReadableDisplayName, repairLegacyUtf8 } from './utils/textEncoding';
import {
  countDataFilesByYear,
  countRowsByYear,
  deleteDataFileByUnit,
  deleteDataFilesByYear,
  getUserProfileByEmail,
  getSettings as getSettingsFromSupabase,
  listDataFilesByProject as listDataFilesByProjectFromSupabase,
  listDataFilesByScope as listDataFilesByScopeFromSupabase,
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
  deactivateUserProfile as deactivateUserProfileInSupabase,
  deactivateDepartmentMember as deactivateDepartmentMemberInSupabase,
  listDepartments as listDepartmentsFromSupabase,
  listDepartmentMembers as listDepartmentMembersFromSupabase,
  listAssignments as listAssignmentsFromSupabase,
  listGlobalAssignments as listGlobalAssignmentsFromSupabase,
  listOverwriteRequests as listOverwriteRequestsFromSupabase,
  listProjectUnitScope as listProjectUnitScopeFromSupabase,
  listProjects as listProjectsFromSupabase,
  listRowsByProject as listRowsByProjectFromSupabase,
  listTemplates as listTemplatesFromSupabase,
  listUnits as listUnitsFromSupabase,
  markOverwriteRequestsSeen as markOverwriteRequestsSeenInSupabase,
  replaceAssignments as replaceAssignmentsInSupabase,
  replaceGlobalAssignments as replaceGlobalAssignmentsInSupabase,
  replaceProjectUnits as replaceProjectUnitsInSupabase,
  seedUnits as seedUnitsToSupabase,
  touchUserProfileSession,
  updateUserProfile as updateUserProfileInSupabase,
  upsertRows as upsertRowsToSupabase,
  upsertDepartment as upsertDepartmentToSupabase,
  upsertDepartmentMember as upsertDepartmentMemberToSupabase,
  upsertProject as upsertProjectToSupabase,
  upsertSettings as upsertSettingsToSupabase,
  upsertUnit as upsertUnitToSupabase,
  upsertUserProfile as upsertUserProfileToSupabase,
} from './supabaseStore';
import {
  deleteAnalysisCellsByProject,
  deleteAnalysisCellsByTemplate,
  deleteAnalysisCellsByUnit,
  deleteAnalysisCellsByYear,
  syncAnalysisCellsFromRows,
} from './aiAnalysisStore';

const DEFAULT_SETTINGS: AppSettings = {
  oneDriveLink: 'https://onedrive.live.com/...',
  storagePath: 'C:\\TongHop\\02_LuuFileGoc',
  receivedPath: 'C:\\TongHop\\01_DaTiepNhan',
};
const TOTAL_REPORT_UNIT_CODE = '__TOTAL_CITY__';
const DEFAULT_INTERNAL_DEPARTMENTS: Array<Pick<Department, 'id' | 'code' | 'name' | 'isActive' | 'sortOrder'>> = [
  { id: 'PB01', code: 'PB01', name: 'Phòng Tổ chức đảng, đảng viên', isActive: true, sortOrder: 1 },
  { id: 'PB02', code: 'PB02', name: 'Phòng Bảo vệ chính trị Nội bộ', isActive: true, sortOrder: 2 },
  { id: 'PB03', code: 'PB03', name: 'Phòng Tổ chức cán bộ', isActive: true, sortOrder: 3 },
  { id: 'PB04', code: 'PB04', name: 'Phòng địa bàn xã, phường', isActive: true, sortOrder: 4 },
  { id: 'PB05', code: 'PB05', name: 'Văn phòng ban', isActive: true, sortOrder: 5 },
];

type UnitLog = {
  code: string;
  name: string;
  importedSheets: string[];
  rowCount: number;
  isSubmitted: boolean;
  lastUpdatedBy?: string;
  assignedTo?: string;
  submittedAt?: string | null;
  overwriteRequestCount: number;
  overwriteStatus?: OverwriteRequestRecord['status'] | null;
};

type UnitStatusFilter = 'ALL' | 'SUBMITTED' | 'PENDING';
const GLOBAL_ASSIGNMENT_PROJECT_NAME = 'THỐNG KÊ SỐ LIỆU SƠ KẾT NQ21';

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

function formatDateTime(value?: string | number | Date | null) {
  if (!value) {
    return 'Chưa có';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Chưa có';
  }

  return date.toLocaleString('vi-VN', {
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const didBootstrapDefaultDepartmentsRef = useRef(false);
  const [currentView, setCurrentView] = useState<ViewMode>('DASHBOARD');
  const [data, setData] = useState<ConsolidatedData>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentMembers, setDepartmentMembers] = useState<DepartmentMember[]>([]);
  const [projectUnitScopeByProjectId, setProjectUnitScopeByProjectId] = useState<ProjectUnitScope>({});
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(DEFAULT_PROJECT_ID);
  const [selectedReportUnitCode, setSelectedReportUnitCode] = useState<string>(TOTAL_REPORT_UNIT_CODE);
  const [selectedReportYear, setSelectedReportYear] = useState<string>(() => getPreferredReportingYear());
  const [expandedReportProjectIds, setExpandedReportProjectIds] = useState<string[]>(DEFAULT_PROJECT_ID ? [DEFAULT_PROJECT_ID] : []);
  const [reportTreeSearchTerm, setReportTreeSearchTerm] = useState('');
  const [reportTreeDataFiles, setReportTreeDataFiles] = useState<DataFileRecordSummary[]>([]);
  const [reportOverwriteRequests, setReportOverwriteRequests] = useState<OverwriteRequestRecord[]>([]);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') {
      return 320;
    }

    const stored = Number(window.localStorage.getItem('sidebarWidth'));
    return Number.isFinite(stored) && stored >= 280 && stored <= 460 ? stored : 320;
  });
  const [isMobile, setIsMobile] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [units, setUnits] = useState<ManagedUnit[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [dataFiles, setDataFiles] = useState<DataFileRecordSummary[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const isAuthenticated = useMemo(() => !!user, [user]);
  const assignmentUsers = useMemo(() => buildAssignmentUsers(users), [users]);
  const effectiveUserProfile = useMemo<UserProfile | null>(() => {
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: repairLegacyUtf8(userProfile?.displayName || user.displayName || null) || null,
      role: userProfile?.role || (user.unitCode ? 'unit_user' : 'contributor'),
      unitCode: userProfile?.unitCode || user.unitCode || null,
      unitName: repairLegacyUtf8(userProfile?.unitName || user.unitName || null) || null,
    };
  }, [user, userProfile]);
  const isAdmin = useMemo(() => effectiveUserProfile?.role === 'admin', [effectiveUserProfile]);
  const isUnitUser = useMemo(() => effectiveUserProfile?.role === 'unit_user', [effectiveUserProfile]);
  const currentDepartmentMembership = useMemo(() => {
    const normalizedEmail = getAssignmentKey(effectiveUserProfile?.email);
    return (
      departmentMembers.find(
        (member) =>
          member.isActive &&
          ((member.authUserId && member.authUserId === effectiveUserProfile?.id) ||
            (!!normalizedEmail && getAssignmentKey(member.userEmail) === normalizedEmail)),
      ) || null
    );
  }, [departmentMembers, effectiveUserProfile]);
  const currentDepartmentId = currentDepartmentMembership?.departmentId || null;
  const hasDepartmentMembership = Boolean(currentDepartmentMembership);
  const isDepartmentManager = currentDepartmentMembership?.membershipRole === 'manager';
  const canManageProjects = isAdmin || isDepartmentManager;
  const canManageTemplates = isAdmin || isDepartmentManager;
  const canUseDepartmentWorkspace = isAdmin || hasDepartmentMembership;
  const canAccessImport = isAuthenticated && (isUnitUser || canUseDepartmentWorkspace);
  const canAccessReports = isAuthenticated && (isUnitUser || canUseDepartmentWorkspace);
  const canAccessExtractReports = isAuthenticated && !isUnitUser && canUseDepartmentWorkspace;
  const canAccessAIAnalysis = isAdmin;
  const getProjectScopedUnitCodes = (projectId?: string | null) => {
    if (!projectId) {
      return null;
    }
    const scopedUnitCodes = projectUnitScopeByProjectId[projectId];
    return Array.isArray(scopedUnitCodes) && scopedUnitCodes.length > 0 ? scopedUnitCodes : null;
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('sidebarCollapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);
  const visibleProjects = useMemo(() => {
    if (isUnitUser && effectiveUserProfile?.unitCode) {
      return projects.filter((project) => {
        if (project.status !== 'ACTIVE') {
          return false;
        }
        const scopedUnitCodes = getProjectScopedUnitCodes(project.id);
        return !scopedUnitCodes || scopedUnitCodes.includes(effectiveUserProfile.unitCode || '');
      });
    }

    if (isAdmin) {
      return projects;
    }

    if (currentDepartmentId) {
      return projects.filter((project) => project.ownerDepartmentId === currentDepartmentId);
    }

    if (isAuthenticated) {
      return [];
    }

    return projects;
  }, [currentDepartmentId, effectiveUserProfile, isAdmin, isAuthenticated, isUnitUser, projectUnitScopeByProjectId, projects]);
  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );
  const allUnits = useMemo<ManagedUnit[]>(
    () => (units.length > 0 ? units : UNITS.map((unit) => ({ ...unit, isDeleted: false }))),
    [units],
  );
  const activeUnits = useMemo(
    () => allUnits.filter((unit) => !unit.isDeleted),
    [allUnits],
  );
  const unitWatcherByCode = useMemo<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    Object.entries(assignments).forEach(([assigneeKey, unitCodes]) => {
      const codes = Array.isArray(unitCodes) ? unitCodes : [];
      codes.forEach((unitCode) => {
        next[unitCode] = assigneeKey;
      });
    });
    return next;
  }, [assignments]);
  const unitUserProfiles = useMemo(
    () =>
      users
        .filter((profile) => profile.role === 'unit_user' && !!profile.email)
        .sort((left, right) =>
          (left.unitCode || '').localeCompare(right.unitCode || '', 'vi') ||
          (left.displayName || left.email || '').localeCompare(right.displayName || right.email || '', 'vi'),
        ),
    [users],
  );
  const internalUserProfiles = useMemo(
    () =>
      users
        .filter((profile) => profile.role !== 'unit_user' && !!profile.email)
        .sort((left, right) =>
          (left.displayName || left.email || '').localeCompare(right.displayName || right.email || '', 'vi'),
        ),
    [users],
  );
  const departmentById = useMemo(
    () =>
      departments.reduce<Record<string, Department>>((accumulator, department) => {
        accumulator[department.id] = department;
        return accumulator;
      }, {}),
    [departments],
  );
  const availableUnitsForProject = useMemo(
    () => {
      const scopedUnitCodes = getProjectScopedUnitCodes(currentProject?.id);
      const visibleUnits = allUnits.filter((unit) => {
        if (!isUnitVisibleForProject(unit, currentProject)) {
          return false;
        }
        if (!scopedUnitCodes) {
          return true;
        }
        return scopedUnitCodes.includes(unit.code);
      });
      if (effectiveUserProfile?.role === 'unit_user' && effectiveUserProfile.unitCode) {
        return visibleUnits.filter((unit) => unit.code === effectiveUserProfile.unitCode);
      }
      return visibleUnits;
    },
    [allUnits, currentProject, effectiveUserProfile, projectUnitScopeByProjectId],
  );
  const reportSelectedUnitSummary = useMemo(() => {
    if (isUnitUser && effectiveUserProfile?.unitCode) {
      return {
        code: effectiveUserProfile.unitCode,
        name: effectiveUserProfile.unitName || availableUnitsForProject.find((unit) => unit.code === effectiveUserProfile.unitCode)?.name || effectiveUserProfile.unitCode,
      };
    }

    if (selectedReportUnitCode === TOTAL_REPORT_UNIT_CODE) {
      return { code: TOTAL_REPORT_UNIT_CODE, name: 'Đảng bộ Thành phố' };
    }

    const matchedUnit = availableUnitsForProject.find((unit) => unit.code === selectedReportUnitCode);
    return matchedUnit ? { code: matchedUnit.code, name: matchedUnit.name } : { code: TOTAL_REPORT_UNIT_CODE, name: 'Đảng bộ Thành phố' };
  }, [availableUnitsForProject, effectiveUserProfile, isUnitUser, selectedReportUnitCode]);
  const sortedReportProjects = useMemo(
    () =>
      [...visibleProjects].sort((left, right) => {
        const leftTime = new Date(left.createdAt as string | number | Date).getTime();
        const rightTime = new Date(right.createdAt as string | number | Date).getTime();
        return rightTime - leftTime;
      }),
    [visibleProjects],
  );
  const reportTreeProjects = useMemo<ReportTreeProjectNode[]>(() => {
    return sortedReportProjects.map((project) => {
      const scopedCodes = getProjectScopedUnitCodes(project.id);
      const projectUnits = (scopedCodes && scopedCodes.length > 0
        ? allUnits.filter((unit) => scopedCodes.includes(unit.code))
        : allUnits
      )
        .filter((unit) => !unit.isDeleted)
        .sort((left, right) => left.code.localeCompare(right.code, 'vi'))
        .filter((unit) => !isUnitUser || unit.code === effectiveUserProfile?.unitCode)
        .map((unit) => ({
          code: unit.code,
          name: unit.name,
          hasData: reportTreeDataFiles.some(
            (file) => file.projectId === project.id && file.year === selectedReportYear && file.unitCode === unit.code,
          ),
          hasPendingOverwrite: reportOverwriteRequests.some(
            (request) =>
              request.projectId === project.id &&
              request.year === selectedReportYear &&
              request.unitCode === unit.code &&
              request.status === 'PENDING',
          ),
        }));

      const importedCount = projectUnits.filter((unit) => unit.hasData).length;
      const pendingCount = reportOverwriteRequests.filter(
        (request) => request.projectId === project.id && request.year === selectedReportYear && request.status === 'PENDING',
      ).length;

      return {
        project,
        importedCount,
        pendingCount,
        units: projectUnits,
      } satisfies ReportTreeProjectNode;
    });
  }, [
    allUnits,
    effectiveUserProfile?.unitCode,
    getProjectScopedUnitCodes,
    isUnitUser,
    reportOverwriteRequests,
    reportTreeDataFiles,
    selectedReportYear,
    sortedReportProjects,
  ]);

  useEffect(() => {
    let active = true;
    let authResolved = false;

    const releaseAuthGate = () => {
      authResolved = true;
      if (active) {
        setIsAuthReady(true);
      }
    };

    const authBootstrapTimeout = window.setTimeout(() => {
      if (authResolved || !active) {
        return;
      }
      console.warn('Supabase auth bootstrap timed out, releasing app shell in public mode.');
      setAuthError((current) => current || 'Khởi tạo phiên đăng nhập đang chậm. Hệ thống đã mở ở chế độ công khai.');
      setIsAuthReady(true);
    }, 4000);

    const applyAuthUser = async (nextUser: AuthenticatedUser | null) => {
      if (!nextUser) {
        if (!active) {
          return;
        }
        setUser(null);
        setUserProfile(null);
        releaseAuthGate();
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
        releaseAuthGate();
        return;
      }

      try {
        let profile = await getUserProfileByEmail(nextUser.email);
        if (!profile && nextUser.unitCode) {
          await upsertUserProfileToSupabase({
            email: nextUser.email,
            authUserId: nextUser.id,
            displayName: getReadableDisplayName(nextUser.unitName, nextUser.displayName || nextUser.email),
            role: 'unit_user',
            unitCode: nextUser.unitCode,
            unitName: repairLegacyUtf8(nextUser.unitName || nextUser.displayName || nextUser.email) || nextUser.email,
            isActive: true,
          });
          profile = await getUserProfileByEmail(nextUser.email);
        }

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
          releaseAuthGate();
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
          displayName: getReadableDisplayName(profile.displayName, nextUser.displayName || nextUser.email),
        });
        setAuthError(null);
        setCurrentView((current) => (current === 'LOGIN' ? 'DASHBOARD' : current));
        releaseAuthGate();
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
        releaseAuthGate();
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
        releaseAuthGate();
      });

    const unsubscribe = onSupabaseAuthStateChange((nextUser) => {
      void applyAuthUser(nextUser);
    });

    return () => {
      active = false;
      window.clearTimeout(authBootstrapTimeout);
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
    setDepartments([]);
    setDepartmentMembers([]);
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

    let cancelled = false;

    listProjectUnitScopeFromSupabase()
      .then((scope) => {
        if (!cancelled) {
          setProjectUnitScopeByProjectId(scope);
        }
      })
      .catch((error) => {
        console.error('Supabase project unit scope load error:', error);
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

  useEffect(() => {
    if (!isAuthReady || visibleProjects.length === 0) {
      setReportTreeDataFiles([]);
      return;
    }

    let cancelled = false;

    Promise.all(
      visibleProjects.map((project) =>
        listDataFilesByScopeFromSupabase({
          projectId: project.id,
          years: [selectedReportYear],
        }),
      ),
    )
      .then((items) => {
        if (!cancelled) {
          setReportTreeDataFiles(items.flat());
        }
      })
      .catch((error) => {
        console.error('Supabase report tree data files load error:', error);
        if (!cancelled) {
          setReportTreeDataFiles([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, selectedReportYear, visibleProjects]);

  useEffect(() => {
    if (!isAuthReady || !isAdmin) {
      setReportOverwriteRequests([]);
      return;
    }

    let cancelled = false;

    listOverwriteRequestsFromSupabase()
      .then((items) => {
        if (!cancelled) {
          setReportOverwriteRequests(items);
        }
      })
      .catch((error) => {
        console.error('Supabase report overwrite requests load error:', error);
        if (!cancelled) {
          setReportOverwriteRequests([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isAuthReady]);

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
    if (!isAuthenticated) {
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

        if (sourceRows.length === 0 && isAdmin) {
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
                console.warn('Không thể tự bootstrap global_assignments từ dữ liệu cũ:', bootstrapError);
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
        if (!isAdmin) {
          return;
        }

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
      setDepartments([]);
      setDepartmentMembers([]);
      didBootstrapDefaultDepartmentsRef.current = false;
      return;
    }

    let cancelled = false;
    Promise.all([
      listUserProfilesFromSupabase(),
      listDepartmentsFromSupabase(),
      listDepartmentMembersFromSupabase(),
    ])
      .then(([nextUsers, nextDepartments, nextDepartmentMembers]) => {
        if (!cancelled) {
          setUsers(nextUsers);
          setDepartments(nextDepartments);
          setDepartmentMembers(nextDepartmentMembers);
        }
      })
      .catch((error) => {
        console.error('Supabase user and department load error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin || didBootstrapDefaultDepartmentsRef.current) {
      return;
    }

    const needsBootstrap = DEFAULT_INTERNAL_DEPARTMENTS.some((defaultDepartment) => {
      const existingDepartment = departments.find((department) => department.id === defaultDepartment.id);
      return (
        !existingDepartment ||
        existingDepartment.code !== defaultDepartment.code ||
        existingDepartment.name !== defaultDepartment.name ||
        existingDepartment.isActive !== defaultDepartment.isActive ||
        existingDepartment.sortOrder !== defaultDepartment.sortOrder
      );
    });

    if (!needsBootstrap) {
      didBootstrapDefaultDepartmentsRef.current = true;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await Promise.all(
          DEFAULT_INTERNAL_DEPARTMENTS.map((defaultDepartment) =>
            upsertDepartmentToSupabase({
              ...defaultDepartment,
              createdAt:
                departments.find((department) => department.id === defaultDepartment.id)?.createdAt ||
                new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          ),
        );

        if (cancelled) {
          return;
        }

        setDepartments(await listDepartmentsFromSupabase());
        didBootstrapDefaultDepartmentsRef.current = true;
      } catch (error) {
        console.error('Không thể bootstrap 5 phòng ban mặc định:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departments, isAdmin, isAuthenticated]);

  useEffect(() => {
    if (projects.length > 0 && !projects.find((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
      return;
    }

    if (projects.length === 0 && selectedProjectId) {
      setSelectedProjectId('');
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!isAuthenticated && ['IMPORT', 'REPORTS', 'EXTRACT_REPORTS', 'AI_ANALYSIS', 'PROJECTS', 'LEARN_FORM', 'SETTINGS'].includes(currentView)) {
      setCurrentView('DASHBOARD');
    }
  }, [currentView, isAuthenticated]);

  useEffect(() => {
    if (!effectiveUserProfile || effectiveUserProfile.role !== 'unit_user') {
      return;
    }

    if (['PROJECTS', 'LEARN_FORM', 'SETTINGS', 'AI_ANALYSIS', 'EXTRACT_REPORTS'].includes(currentView)) {
      setCurrentView('DASHBOARD');
    }
  }, [currentView, effectiveUserProfile]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (currentView === 'IMPORT' && !canAccessImport) {
      setCurrentView('DASHBOARD');
      return;
    }

    if (currentView === 'REPORTS' && !canAccessReports) {
      setCurrentView('DASHBOARD');
      return;
    }

    if (currentView === 'EXTRACT_REPORTS' && !canAccessExtractReports) {
      setCurrentView('DASHBOARD');
      return;
    }

    if (currentView === 'AI_ANALYSIS' && !canAccessAIAnalysis) {
      setCurrentView('DASHBOARD');
    }
  }, [canAccessAIAnalysis, canAccessExtractReports, canAccessImport, canAccessReports, currentView, isAuthenticated]);

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    if (visibleProjects.length === 0) {
      if (selectedProjectId) {
        setSelectedProjectId('');
      }
      return;
    }

    if (!visibleProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(visibleProjects[0].id);
    }
  }, [isAdmin, selectedProjectId, visibleProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    setExpandedReportProjectIds((current) =>
      current.includes(selectedProjectId) ? current : [...current, selectedProjectId],
    );
  }, [selectedProjectId]);

  useEffect(() => {
    if (isUnitUser && effectiveUserProfile?.unitCode) {
      setSelectedReportUnitCode(effectiveUserProfile.unitCode);
      return;
    }

    if (!selectedProjectId) {
      setSelectedReportUnitCode(TOTAL_REPORT_UNIT_CODE);
      return;
    }

    if (selectedReportUnitCode === TOTAL_REPORT_UNIT_CODE) {
      return;
    }

    const validUnitCodes = new Set(availableUnitsForProject.map((unit) => unit.code));
    if (!validUnitCodes.has(selectedReportUnitCode)) {
      setSelectedReportUnitCode(TOTAL_REPORT_UNIT_CODE);
    }
  }, [availableUnitsForProject, effectiveUserProfile?.unitCode, isUnitUser, selectedProjectId, selectedReportUnitCode]);

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
      try {
        await deleteAnalysisCellsByProject(projectId);
      } catch (analysisError) {
        console.warn('Không thể xóa lớp dữ liệu phân tích AI theo dự án:', analysisError);
      }
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
          console.warn(`Không thể dọn thư mục lưu trữ ${prefix}:`, error);
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
      setProjectUnitScopeByProjectId((prev) => {
        const nextScope = { ...prev };
        delete nextScope[projectId];
        return nextScope;
      });
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

  const handleCreateProject = async (payload: {
    name: string;
    description: string;
    unitCodes: string[];
    ownerDepartmentId?: string | null;
  }) => {
    if (!canManageProjects) {
      throw new Error('Bạn không có quyền tạo dự án.');
    }

    const normalizedName = normalizeProjectName(payload.name);
    const duplicateProject = projects.find((project) => normalizeProjectName(project.name) === normalizedName);

    if (duplicateProject) {
      throw new Error(`Tên dự án "${payload.name.trim()}" đã tồn tại. Vui lòng chọn tên khác.`);
    }

    const ownerDepartmentId = isAdmin ? payload.ownerDepartmentId || null : currentDepartmentId;
    if (!ownerDepartmentId) {
      throw new Error('Chưa xác định được phòng ban chủ quản cho dự án.');
    }

    const project: Project = {
      id: `proj_${Date.now()}`,
      name: payload.name.trim(),
      description: payload.description.trim(),
      status: 'ACTIVE',
      ownerDepartmentId,
      createdByEmail: effectiveUserProfile?.email || null,
      createdByAuthUserId: effectiveUserProfile?.id || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertProjectToSupabase(project);
    await replaceProjectUnitsInSupabase(project.id, payload.unitCodes);
    const nextProjects = await listProjectsFromSupabase();
    setProjects(nextProjects);
    setProjectUnitScopeByProjectId((prev) => ({
      ...prev,
      [project.id]: [...payload.unitCodes],
    }));
    return project;
  };

  const handleUpdateProject = async (
    project: Project,
    payload: { name: string; description: string; ownerDepartmentId?: string | null },
  ) => {
    if (!isAdmin && !(isDepartmentManager && project.ownerDepartmentId === currentDepartmentId)) {
      throw new Error('Bạn không có quyền cập nhật dự án này.');
    }

    const normalizedName = normalizeProjectName(payload.name);
    const duplicateProject = projects.find(
      (item) => item.id !== project.id && normalizeProjectName(item.name) === normalizedName,
    );

    if (duplicateProject) {
      throw new Error(`Tên dự án "${payload.name.trim()}" đã tồn tại. Vui lòng chọn tên khác.`);
    }

    const nextProject: Project = {
      ...project,
      name: payload.name.trim(),
      description: payload.description.trim(),
      ownerDepartmentId: isAdmin ? payload.ownerDepartmentId || null : project.ownerDepartmentId,
      updatedAt: new Date().toISOString(),
    };

    await upsertProjectToSupabase(nextProject);
    const nextProjects = await listProjectsFromSupabase();
    setProjects(nextProjects);
    return nextProject;
  };

  const handleToggleProjectStatus = async (project: Project) => {
    if (!isAdmin && !(isDepartmentManager && project.ownerDepartmentId === currentDepartmentId)) {
      throw new Error('Bạn không có quyền thay đổi trạng thái dự án này.');
    }

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
    if (!isAdmin) {
      throw new Error('Chỉ tài khoản Admin mới được phép xóa dự án.');
    }
    const deletedCount = await handleDeleteProjectData(project.id);
    return deletedCount > 0;
  };

  const handleDeleteTemplate = async (template: FormTemplate) => {
    const templateProject = projects.find((project) => project.id === template.projectId) || null;
    const canDeleteTemplate =
      isAdmin || (!!templateProject && isDepartmentManager && templateProject.ownerDepartmentId === currentDepartmentId);
    if (!canDeleteTemplate) {
      return false;
    }

    try {
      const deletedDataRows = (Object.values(data).flat() as DataRow[]).filter((row) => row.templateId === template.id).length;
      const deletedExports = await deleteReportExportsByTemplate(template.id);
      await deleteRowsByTemplateFromSupabase(template.id);
      try {
        await deleteAnalysisCellsByTemplate(template.id);
      } catch (analysisError) {
        console.warn('Không thể xóa lớp dữ liệu phân tích AI theo biểu mẫu:', analysisError);
      }
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

  const handleDataImported = async (
    newData: DataRow[],
    options?: {
      updatedBy?: {
        uid?: string | null;
        email?: string | null;
        displayName?: string | null;
      } | null;
      updatedAt?: string | null;
    },
  ) => {
    if (!user) {
      return;
    }

    try {
      const effectiveUpdatedAt = options?.updatedAt || new Date().toISOString();
      const effectiveUpdatedBy =
        options?.updatedBy || {
          uid: user.id,
          email: user.email,
          displayName: effectiveUserProfile?.displayName || user.displayName,
        };
      const nextRows = newData.map((row) => ({
        ...row,
        updatedAt: effectiveUpdatedAt,
        updatedBy: effectiveUpdatedBy,
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
      try {
        await syncAnalysisCellsFromRows({
          rows: refreshedRows,
          templates,
          projects,
          units: allUnits,
          dataFiles: refreshedDataFiles,
        });
      } catch (analysisError) {
        console.warn('Không thể đồng bộ lớp dữ liệu phân tích AI sau khi nhập dữ liệu:', analysisError);
      }
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
      try {
        await deleteAnalysisCellsByUnit(currentProject.id, year, unitCode);
      } catch (analysisError) {
        console.warn('Không thể xóa lớp dữ liệu phân tích AI theo đơn vị:', analysisError);
      }
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
      try {
        await deleteAnalysisCellsByYear(currentProject.id, year);
      } catch (analysisError) {
        console.warn('Không thể xóa lớp dữ liệu phân tích AI theo năm:', analysisError);
      }
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
          `Hệ thống chưa xóa hết dữ liệu năm ${year}. Còn ${remainingRowsForYear} dòng dữ liệu và ${remainingDataFilesForYear} file metadata.`,
        );
      }

      return rowsBeforeDelete;
    } catch (error) {
      console.error('Delete year rows error:', error);
      throw error instanceof Error ? error : new Error('Không thể xóa dữ liệu theo năm.');
    }
  };

  const persistGlobalAssignments = async (nextAssignmentsMap: Record<string, string[]>) => {
    const payload = Object.entries(nextAssignmentsMap)
      .map(([key, unitCodes]) => {
        const assignmentUser = assignmentUsers.find((item) => item.id === key);
        if (!assignmentUser || unitCodes.length === 0) {
          return null;
        }

        return {
          id: key,
          assignee_key: key,
          user_id: assignmentUser.userId || null,
          email: assignmentUser.email,
          display_name: assignmentUser.displayName,
          unit_codes: UNITS.filter((unit) => unitCodes.includes(unit.code)).map((unit) => unit.code),
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        assignee_key: string;
        user_id: string | null;
        email: string;
        display_name: string;
        unit_codes: string[];
        updated_at: string;
      }>;

    await replaceGlobalAssignmentsInSupabase(payload);
    const refreshed = await listGlobalAssignmentsFromSupabase();
    const nextMap: Record<string, string[]> = {};
    refreshed.forEach((row) => {
      nextMap[row.assignee_key] = Array.isArray(row.unit_codes) ? row.unit_codes : [];
    });
    setAssignments(nextMap);
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

    const nextMap: Record<string, string[]> = {};
    Array.from(nextAssignments.entries())
      .filter(([, entry]) => entry.unitCodes.length > 0)
      .forEach(([key, entry]) => {
        nextMap[key] = entry.unitCodes;
      });

    await persistGlobalAssignments(nextMap);
  };

  const handleSaveUnitWatcherAssignments = async (watcherByUnitCode: Record<string, string>) => {
    if (!isAdmin) {
      return;
    }

    const nextAssignmentsMap: Record<string, string[]> = {};
    Object.entries(watcherByUnitCode).forEach(([unitCode, assigneeKey]) => {
      const normalizedAssigneeKey = getAssignmentKey(assigneeKey);
      if (!normalizedAssigneeKey) {
        return;
      }

      if (!nextAssignmentsMap[normalizedAssigneeKey]) {
        nextAssignmentsMap[normalizedAssigneeKey] = [];
      }
      nextAssignmentsMap[normalizedAssigneeKey].push(unitCode);
    });

    await persistGlobalAssignments(nextAssignmentsMap);
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
    return { code: nextCode, name: trimmedName };
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

  const refreshDepartmentsAndUsers = async () => {
    const [nextUsers, nextDepartments, nextDepartmentMembers] = await Promise.all([
      listUserProfilesFromSupabase(),
      listDepartmentsFromSupabase(),
      listDepartmentMembersFromSupabase(),
    ]);
    setUsers(nextUsers);
    setDepartments(nextDepartments);
    setDepartmentMembers(nextDepartmentMembers);
  };

  const handleUpsertDepartment = async (payload: {
    id?: string;
    code: string;
    name: string;
    sortOrder?: number;
    isActive?: boolean;
  }) => {
    if (!isAdmin) {
      return;
    }

    const trimmedCode = payload.code.trim().toUpperCase();
    const trimmedName = payload.name.trim();
    if (!trimmedCode || !trimmedName) {
      throw new Error('Mã và tên phòng ban không được để trống.');
    }

    const existing = departments.find((department) => department.id === payload.id);
    const duplicateCode = departments.find(
      (department) => department.id !== payload.id && department.code.trim().toUpperCase() === trimmedCode,
    );
    if (duplicateCode) {
      throw new Error(`Mã phòng ban "${trimmedCode}" đã tồn tại.`);
    }

    await upsertDepartmentToSupabase({
      id: payload.id || `dept_${Date.now()}`,
      code: trimmedCode,
      name: trimmedName,
      isActive: payload.isActive ?? existing?.isActive ?? true,
      sortOrder: payload.sortOrder ?? existing?.sortOrder ?? departments.length + 1,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await refreshDepartmentsAndUsers();
  };

  const handleUpsertDepartmentMember = async (payload: {
    departmentId: string;
    userEmail: string;
    membershipRole: 'manager' | 'member';
  }) => {
    if (!isAdmin) {
      return;
    }

    const normalizedEmail = getAssignmentKey(payload.userEmail);
    const matchedProfile = internalUserProfiles.find((profile) => getAssignmentKey(profile.email) === normalizedEmail);
    if (!matchedProfile || !matchedProfile.email) {
      throw new Error('Không tìm thấy tài khoản nội bộ để gán vào phòng ban.');
    }

    const existingMembership = departmentMembers.find(
      (member) => getAssignmentKey(member.userEmail) === normalizedEmail,
    );

    await upsertDepartmentMemberToSupabase({
      id: existingMembership?.id || `dept_member_${Date.now()}`,
      departmentId: payload.departmentId,
      userEmail: matchedProfile.email,
      authUserId: existingMembership?.authUserId || null,
      displayName: matchedProfile.displayName || matchedProfile.email,
      membershipRole: payload.membershipRole,
      isActive: true,
      createdAt: existingMembership?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await refreshDepartmentsAndUsers();
  };

  const handleDeactivateDepartmentMember = async (memberId: string) => {
    if (!isAdmin) {
      return;
    }

    await deactivateDepartmentMemberInSupabase(memberId);
    await refreshDepartmentsAndUsers();
  };

  const handleUpsertUnitAccount = async (payload: {
    email: string;
    displayName: string;
    unitCode: string;
  }) => {
    if (!isAdmin) {
      return;
    }

    const normalizedEmail = getAssignmentKey(payload.email);
    if (!normalizedEmail) {
      throw new Error('Email tài khoản không hợp lệ.');
    }

    const unit = allUnits.find((item) => item.code === payload.unitCode);
    if (!unit) {
      throw new Error('Không tìm thấy đơn vị để gắn tài khoản.');
    }

    await upsertUserProfileToSupabase({
      email: normalizedEmail,
      displayName: payload.displayName,
      role: 'unit_user',
      unitCode: unit.code,
      unitName: unit.name,
      isActive: true,
    });

    setUsers(await listUserProfilesFromSupabase());
  };

  const handleDeleteUnitAccount = async (email: string) => {
    if (!isAdmin) {
      return;
    }

    await deactivateUserProfileInSupabase(email);
    setUsers(await listUserProfilesFromSupabase());
  };

  const handleUpsertInternalAccount = async (payload: {
    email: string;
    displayName: string;
    role: 'admin' | 'contributor';
  }) => {
    if (!isAdmin) {
      return;
    }

    const normalizedEmail = getAssignmentKey(payload.email);
    if (!normalizedEmail) {
      throw new Error('Email tài khoản nội bộ không hợp lệ.');
    }

    await upsertUserProfileToSupabase({
      email: normalizedEmail,
      displayName: payload.displayName || normalizedEmail,
      role: payload.role,
      unitCode: null,
      unitName: null,
      isActive: true,
    });

    setUsers(await listUserProfilesFromSupabase());
  };

  const handleDeleteInternalAccount = async (email: string) => {
    if (!isAdmin) {
      return;
    }

    const normalizedEmail = getAssignmentKey(email);
    if (normalizedEmail && normalizedEmail === getAssignmentKey(effectiveUserProfile?.email)) {
      throw new Error('Không thể tự vô hiệu hóa tài khoản quản trị đang đăng nhập.');
    }

    await deactivateUserProfileInSupabase(email);
    setUsers(await listUserProfilesFromSupabase());
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

  const handleChangePassword = async (nextPassword: string) => {
    await updateSupabasePassword(nextPassword);
    setIsChangePasswordOpen(false);
    alert('Đã cập nhật mật khẩu mới.');
  };

  const handleOpenImportFromDashboard = (projectId?: string) => {
    if (!canAccessImport) {
      return;
    }

    if (projectId) {
      setSelectedProjectId(projectId);
    }
    setCurrentView('IMPORT');
  };

  const handleToggleReportProject = (projectId: string) => {
    setExpandedReportProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
    );
  };

  const handleCollapseAllReportProjects = () => {
    setExpandedReportProjectIds([]);
  };

  const handleSelectReportProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    if (!isUnitUser) {
      setSelectedReportUnitCode(TOTAL_REPORT_UNIT_CODE);
    }
    setExpandedReportProjectIds((current) => (current.includes(projectId) ? current : [...current, projectId]));
  };

  const handleSelectReportUnit = (projectId: string, unitCode: string) => {
    setSelectedProjectId(projectId);
    setSelectedReportUnitCode(unitCode);
    setExpandedReportProjectIds((current) => (current.includes(projectId) ? current : [...current, projectId]));
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
            projects={visibleProjects}
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
            onOpenAIAnalysis={() => setCurrentView('AI_ANALYSIS')}
            onOpenImport={handleOpenImportFromDashboard}
          />
        );
      case 'PROJECTS':
        return canManageProjects ? (
          <ProjectManager
            projects={visibleProjects}
            units={activeUnits}
            departments={departments}
            currentDepartmentId={currentDepartmentId}
            isAdmin={isAdmin}
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
            projects={visibleProjects}
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
            onOpenAIAnalysis={() => setCurrentView('AI_ANALYSIS')}
            onOpenImport={handleOpenImportFromDashboard}
          />
        );
      case 'LEARN_FORM':
        return canManageTemplates ? (
          <FormLearner
            projects={visibleProjects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            onDeleteTemplate={handleDeleteTemplate}
            onTemplatesChanged={refreshTemplatesForProject}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={visibleProjects}
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
            onOpenAIAnalysis={() => setCurrentView('AI_ANALYSIS')}
            onOpenImport={handleOpenImportFromDashboard}
          />
        );
      case 'IMPORT':
        return canAccessImport ? (
          <ImportFiles
            onDataImported={handleDataImported}
            onDeleteUnitData={handleDeleteUnitData}
            onDeleteYearData={handleDeleteYearData}
            onDeleteProjectData={handleDeleteProjectData}
            projects={visibleProjects}
            data={data}
            dataFiles={dataFiles}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            templates={templates}
            canManageData={isAdmin}
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
            assignments={assignments}
            currentUser={effectiveUserProfile}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={visibleProjects}
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
            onOpenAIAnalysis={() => setCurrentView('AI_ANALYSIS')}
            onOpenImport={handleOpenImportFromDashboard}
          />
        );
      case 'REPORTS':
        return canAccessReports ? (
          <ReportView
            data={data}
            dataFiles={dataFiles}
            projects={visibleProjects}
            templates={templates}
            units={availableUnitsForProject}
            selectedProjectId={selectedProjectId}
            selectedUnitCode={reportSelectedUnitSummary.code}
            selectedYear={selectedReportYear}
            onSelectedYearChange={setSelectedReportYear}
            currentUser={effectiveUserProfile}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={visibleProjects}
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
            onOpenAIAnalysis={() => setCurrentView('AI_ANALYSIS')}
            onOpenImport={handleOpenImportFromDashboard}
          />
        );
      case 'EXTRACT_REPORTS':
        return canAccessExtractReports ? (
          <ExtractReportView
            projects={visibleProjects}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            templates={templates}
            data={data}
            units={allUnits}
            projectUnitScopeByProjectId={projectUnitScopeByProjectId}
            selectedYear={selectedReportYear}
            onSelectedYearChange={setSelectedReportYear}
            currentUser={effectiveUserProfile}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={visibleProjects}
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
            onOpenAIAnalysis={() => setCurrentView('AI_ANALYSIS')}
            onOpenImport={handleOpenImportFromDashboard}
          />
        );
      case 'AI_ANALYSIS':
        return canAccessAIAnalysis ? (
          <AIAnalysisView
            projects={visibleProjects}
            templates={templates}
            units={allUnits}
            data={data}
            dataFiles={dataFiles}
            currentUser={{
              uid: user?.id || null,
              email: user?.email || null,
              displayName: getReadableDisplayName(effectiveUserProfile?.displayName, user?.displayName || user?.email, user?.email || ''),
            }}
          />
        ) : (
          <DashboardOverview
            data={data}
            templates={templates}
            projects={visibleProjects}
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
            onOpenAIAnalysis={() => setCurrentView('AI_ANALYSIS')}
            onOpenImport={handleOpenImportFromDashboard}
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
              onOpenAIAnalysis={() => setCurrentView('AI_ANALYSIS')}
            onOpenImport={handleOpenImportFromDashboard}
            />
          );
        }
        return (
          <div className="p-6 md:p-8">
            <h2 className="page-title">{'Cài đặt hệ thống'}</h2>
            <p className="page-subtitle mt-2 max-w-5xl text-sm">
              {'Tập trung toàn bộ cấu hình quản trị: danh mục đơn vị, tài khoản nội bộ, phòng ban nội bộ, phân công theo dõi và hồ sơ tài khoản đơn vị.'}
            </p>

            <div className="mt-8 space-y-6">
              {isAdmin && (
                <SystemSettingsUnitsPanel
                  units={allUnits}
                  assignmentUsers={assignmentUsers}
                  assignmentsByUnit={unitWatcherByCode}
                  onAddUnit={handleAddUnit}
                  onSoftDeleteUnit={handleSoftDeleteUnit}
                  onRestoreUnit={handleRestoreUnit}
                  onRenameUnit={handleRenameUnit}
                  onSaveWatcherAssignments={handleSaveUnitWatcherAssignments}
                />
              )}

              {isAdmin && (
                <SystemSettingsUnitAccountsPanel
                  units={allUnits}
                  accounts={unitUserProfiles}
                  onUpsertAccount={handleUpsertUnitAccount}
                  onDeleteAccount={handleDeleteUnitAccount}
                />
              )}

              {isAdmin && (
                <SystemSettingsInternalAccountsPanel
                  accounts={internalUserProfiles}
                  currentAdminEmail={effectiveUserProfile?.email || null}
                  onUpsertAccount={handleUpsertInternalAccount}
                  onDeleteAccount={handleDeleteInternalAccount}
                />
              )}

              {isAdmin && (
                <SystemSettingsDepartmentsPanel
                  departments={departments}
                  members={departmentMembers}
                  internalUsers={internalUserProfiles}
                  onUpsertDepartment={handleUpsertDepartment}
                  onUpsertDepartmentMember={handleUpsertDepartmentMember}
                  onDeactivateDepartmentMember={handleDeactivateDepartmentMember}
                />
              )}

              {isAdmin ? (
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleDeleteAllSystemData} className="secondary-btn">
                    {'Xóa sạch dữ liệu hệ thống'}
                  </button>
                </div>
              ) : (
                <div className="panel-card rounded-[24px] p-5 text-sm text-[var(--ink-soft)]">
                  {'Chỉ tài khoản Admin mới được phép thay đổi cấu hình hệ thống và quản lý danh mục đơn vị.'}
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
      {!isMobile && (
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          isAuthenticated={isAuthenticated}
          isAdmin={isAdmin}
          canManageProjects={canManageProjects}
          canManageTemplates={canManageTemplates}
          canAccessImport={canAccessImport}
          canAccessReports={canAccessReports}
          canAccessExtractReports={canAccessExtractReports}
          canAccessAIAnalysis={canAccessAIAnalysis}
          onLogout={handleLogout}
          onOpenChangePassword={() => {
            setIsChangePasswordOpen(true);
          }}
          user={user}
          userProfile={effectiveUserProfile}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          sidebarWidth={sidebarWidth}
          onSidebarWidthChange={setSidebarWidth}
          isMobile={isMobile}
          reportTreeProjects={reportTreeProjects}
          selectedReportProjectId={selectedProjectId}
          selectedReportUnitCode={reportSelectedUnitSummary.code}
          expandedReportProjectIds={expandedReportProjectIds}
          onToggleReportProject={handleToggleReportProject}
          onCollapseAllReportProjects={handleCollapseAllReportProjects}
          onSelectReportProject={handleSelectReportProject}
          onSelectReportUnit={handleSelectReportUnit}
          reportTreeSearchTerm={reportTreeSearchTerm}
          onReportTreeSearchTermChange={setReportTreeSearchTerm}
        />
      )}
      <main className="app-main flex-1 overflow-auto">{renderContent()}</main>
      {isChangePasswordOpen && (
        <ChangePasswordModal
          onClose={() => setIsChangePasswordOpen(false)}
          onSubmit={handleChangePassword}
        />
      )}

    </div>
  );
}

function SystemSettingsUnitsPanel({
  units,
  assignmentUsers,
  assignmentsByUnit,
  onAddUnit,
  onSoftDeleteUnit,
  onRestoreUnit,
  onRenameUnit,
  onSaveWatcherAssignments,
}: {
  units: ManagedUnit[];
  assignmentUsers: AssignmentUser[];
  assignmentsByUnit: Record<string, string>;
  onAddUnit: (name: string) => Promise<{ code: string; name: string }>;
  onSoftDeleteUnit: (unitCode: string) => Promise<void>;
  onRestoreUnit: (unitCode: string) => Promise<void>;
  onRenameUnit: (unitCode: string, name: string) => Promise<void>;
  onSaveWatcherAssignments: (watcherByUnitCode: Record<string, string>) => Promise<void>;
}) {
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitWatcher, setNewUnitWatcher] = useState('');
  const [watcherFilter, setWatcherFilter] = useState('');
  const [editingUnitCode, setEditingUnitCode] = useState<string | null>(null);
  const [editingUnitName, setEditingUnitName] = useState('');
  const [watcherDrafts, setWatcherDrafts] = useState<Record<string, string>>({});
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
  const filteredActiveUnits = useMemo(() => {
    if (!watcherFilter) {
      return activeUnits;
    }
    if (watcherFilter === '__UNASSIGNED__') {
      return activeUnits.filter((unit) => !(watcherDrafts[unit.code] || ''));
    }
    return activeUnits.filter((unit) => (watcherDrafts[unit.code] || '') === watcherFilter);
  }, [activeUnits, watcherDrafts, watcherFilter]);

  useEffect(() => {
    setWatcherDrafts(assignmentsByUnit);
  }, [assignmentsByUnit]);

  const submitNewUnit = async () => {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const createdUnit = await onAddUnit(newUnitName);
      if (newUnitWatcher) {
        await onSaveWatcherAssignments({
          ...watcherDrafts,
          [createdUnit.code]: newUnitWatcher,
        });
      }
      setNewUnitName('');
      setNewUnitWatcher('');
      setMessage('Đã thêm đơn vị mới vào danh mục hệ thống.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể thêm đơn vị mới.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveWatcherDrafts = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onSaveWatcherAssignments(watcherDrafts);
      setMessage('Đã cập nhật phân công theo dõi cho danh sách đơn vị.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu phân công theo dõi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateWatcherDraft = (unitCode: string, assigneeKey: string) => {
    setWatcherDrafts((current) => ({
      ...current,
      [unitCode]: assigneeKey,
    }));
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
          <h3 className="section-title">{'Quản lý danh sách đơn vị'}</h3>
          <p className="page-subtitle mt-2 text-sm">
            {'Danh mục nền của toàn hệ thống. Ngay trong từng đơn vị có thể chọn luôn người theo dõi phụ trách.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
            {`Đang hoạt động ${activeUnits.length} đơn vị`}
          </div>
          <button
            onClick={saveWatcherDrafts}
            disabled={isSubmitting}
            className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
          >
            {'Lưu phân công theo dõi'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)_200px] xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,1fr)_180px]">
        <input
          value={newUnitName}
          onChange={(event) => setNewUnitName(event.target.value)}
          className="field-input"
          placeholder="Nhập tên đơn vị mới"
        />
        <select
          value={newUnitWatcher}
          onChange={(event) => setNewUnitWatcher(event.target.value)}
          className="field-select"
        >
          <option value="">-- Chưa phân công --</option>
          {assignmentUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName || user.email}
            </option>
          ))}
        </select>
        <button
          onClick={submitNewUnit}
          disabled={isSubmitting || !newUnitName.trim()}
          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
        >
          {'Thêm đơn vị'}
        </button>
      </div>

      {message && <p className="mt-4 text-sm font-medium text-[var(--ink-soft)]">{message}</p>}

      <div className="mt-6 space-y-6">
        <div>
          <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="col-header">{'Đơn vị đang sử dụng'}</p>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                {`Hiển thị ${filteredActiveUnits.length}/${activeUnits.length} đơn vị theo bộ lọc người theo dõi.`}
              </p>
            </div>
            <div className="w-full xl:w-[320px]">
              <label className="col-header mb-2 block">{'Lọc theo người theo dõi'}</label>
              <select
                value={watcherFilter}
                onChange={(event) => setWatcherFilter(event.target.value)}
                className="field-select h-11 text-sm"
              >
                <option value="">-- Tất cả --</option>
                <option value="__UNASSIGNED__">Chưa phân công</option>
                {assignmentUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName || user.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="max-h-[520px] space-y-3 overflow-y-auto overflow-x-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            {filteredActiveUnits.map((unit) => (
              <div key={unit.code} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(340px,1.15fr)_132px]">
                  <div className="min-w-0">
                    <p className="col-header mb-2">{'Tên đơn vị'}</p>
                    {editingUnitCode === unit.code ? (
                      <input
                        value={editingUnitName}
                        onChange={(event) => setEditingUnitName(event.target.value)}
                        className="field-input h-11 py-2 text-sm"
                        placeholder="Nhập tên đơn vị"
                      />
                    ) : (
                      <p className="break-words text-base font-semibold leading-6 text-[var(--ink)]">{unit.name}</p>
                    )}
                    <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="col-header mb-2">{'Người theo dõi'}</p>
                    <select
                      value={watcherDrafts[unit.code] || ''}
                      onChange={(event) => updateWatcherDraft(unit.code, event.target.value)}
                      className="field-select h-11 w-full text-sm"
                      disabled={isSubmitting}
                    >
                      <option value="">-- Chưa phân công --</option>
                      {assignmentUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName || user.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 self-start">
                    {editingUnitCode === unit.code ? (
                      <>
                        <button
                          onClick={() => saveEditedUnit(unit)}
                          disabled={isSubmitting || !editingUnitName.trim()}
                          className="primary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {'Lưu tên'}
                        </button>
                        <button
                          onClick={cancelEditUnit}
                          disabled={isSubmitting}
                          className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {'Hủy'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => beginEditUnit(unit)}
                          disabled={isSubmitting}
                          className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {'Đổi tên'}
                        </button>
                        <button
                          onClick={() => deleteUnit(unit)}
                          disabled={isSubmitting}
                          className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {'Xóa mềm'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="col-header mb-3">{'Đơn vị đã xóa mềm'}</p>
          <div className="max-h-[360px] space-y-3 overflow-y-auto overflow-x-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            {deletedUnits.length > 0 ? (
              deletedUnits.map((unit) => (
                <div
                  key={unit.code}
                  className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_140px]"
                >
                  <div className="min-w-0">
                    <p className="break-words text-base font-semibold leading-6 text-[var(--ink)]">{unit.name}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</p>
                  </div>
                  <button
                    onClick={() => restoreUnit(unit)}
                    disabled={isSubmitting}
                    className="secondary-btn w-full self-start px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 lg:w-[140px]"
                  >
                    {'Khôi phục'}
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--ink-soft)]">
                {'Chưa có đơn vị nào bị xóa mềm.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemSettingsUnitAccountsPanel({
  units,
  accounts,
  onUpsertAccount,
  onDeleteAccount,
}: {
  units: ManagedUnit[];
  accounts: UserProfile[];
  onUpsertAccount: (payload: { email: string; displayName: string; unitCode: string }) => Promise<void>;
  onDeleteAccount: (email: string) => Promise<void>;
}) {
  const activeUnits = useMemo(
    () => units.filter((unit) => !unit.isDeleted).sort((left, right) => left.code.localeCompare(right.code, 'vi')),
    [units],
  );
  const [draftEmail, setDraftEmail] = useState('');
  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [draftUnitCode, setDraftUnitCode] = useState('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [editingUnitCode, setEditingUnitCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submitAccount = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onUpsertAccount({
        email: draftEmail,
        displayName: draftDisplayName || draftEmail,
        unitCode: draftUnitCode,
      });
      setDraftEmail('');
      setDraftDisplayName('');
      setDraftUnitCode('');
      setMessage('Đã thêm hoặc cập nhật hồ sơ tài khoản đơn vị.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu hồ sơ tài khoản đơn vị.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const beginEdit = (account: UserProfile) => {
    setEditingEmail(account.email || null);
    setEditingDisplayName(account.displayName || account.email || '');
    setEditingUnitCode(account.unitCode || '');
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingEmail(null);
    setEditingDisplayName('');
    setEditingUnitCode('');
  };

  const saveEdit = async () => {
    if (!editingEmail) {
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onUpsertAccount({
        email: editingEmail,
        displayName: editingDisplayName || editingEmail,
        unitCode: editingUnitCode,
      });
      cancelEdit();
      setMessage('Đã cập nhật hồ sơ tài khoản đơn vị.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể cập nhật hồ sơ tài khoản đơn vị.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteAccount = async (email: string) => {
    const confirmed = window.confirm(`Ẩn hồ sơ tài khoản đơn vị "${email}" khỏi hệ thống?`);
    if (!confirmed) {
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onDeleteAccount(email);
      if (editingEmail === email) {
        cancelEdit();
      }
      setMessage(`Đã xóa hồ sơ tài khoản ${email}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể xóa hồ sơ tài khoản đơn vị.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel-card rounded-[24px] p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="section-title">{'Quản trị tài khoản đơn vị'}</h3>
          <p className="page-subtitle mt-2 text-sm">
            {'Quản lý hồ sơ đăng nhập theo đơn vị. Email tại đây phải trùng với tài khoản đã có trong Supabase Auth.'}
          </p>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          {`Đang quản lý ${accounts.length} tài khoản đơn vị`}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.9fr)_minmax(320px,1.1fr)_180px] xl:grid-cols-[minmax(0,1.1fr)_240px_280px_160px]">
        <input
          value={draftEmail}
          onChange={(event) => setDraftEmail(event.target.value)}
          className="field-input"
          placeholder="Email tài khoản đơn vị"
        />
        <input
          value={draftDisplayName}
          onChange={(event) => setDraftDisplayName(event.target.value)}
          className="field-input"
          placeholder="Tên hiển thị"
        />
        <select
          value={draftUnitCode}
          onChange={(event) => setDraftUnitCode(event.target.value)}
          className="field-select"
        >
          <option value="">-- Chọn đơn vị --</option>
          {activeUnits.map((unit) => (
            <option key={unit.code} value={unit.code}>
              {unit.name} ({unit.code})
            </option>
          ))}
        </select>
        <button
          onClick={submitAccount}
          disabled={isSubmitting || !draftEmail.trim() || !draftUnitCode}
          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
        >
          {'Thêm tài khoản'}
        </button>
      </div>

      {message && <p className="mt-4 text-sm font-medium text-[var(--ink-soft)]">{message}</p>}

      <div className="mt-6 max-h-[520px] space-y-3 overflow-y-auto rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--ink-soft)]">
            {'Chưa có hồ sơ tài khoản đơn vị nào được khai báo.'}
          </div>
        ) : (
          accounts.map((account) => (
            <div
              key={account.email || account.id}
              className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(220px,0.9fr)_minmax(320px,1fr)_128px] xl:grid-cols-[minmax(0,1.1fr)_220px_280px_128px]"
            >
              <div className="min-w-0">
                <p className="col-header mb-2">{'Email đăng nhập'}</p>
                <p className="break-all text-sm font-semibold text-[var(--ink)]">{account.email}</p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  {editingEmail === account.email ? 'Đang chỉnh sửa hồ sơ tài khoản.' : `Tên hiển thị: ${account.displayName || 'Chưa có'}`}
                </p>
              </div>
              <div>
                <p className="col-header mb-2">{'Tên hiển thị'}</p>
                {editingEmail === account.email ? (
                  <input
                    value={editingDisplayName}
                    onChange={(event) => setEditingDisplayName(event.target.value)}
                    className="field-input h-11 py-2 text-sm"
                    placeholder="Tên hiển thị"
                  />
                ) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-3 text-sm text-[var(--ink)]">
                    {account.displayName || 'Chưa có'}
                  </div>
                )}
              </div>
              <div>
                <p className="col-header mb-2">{'Đơn vị gắn với tài khoản'}</p>
                {editingEmail === account.email ? (
                  <select
                    value={editingUnitCode}
                    onChange={(event) => setEditingUnitCode(event.target.value)}
                    className="field-select h-11 text-sm"
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {activeUnits.map((unit) => (
                      <option key={unit.code} value={unit.code}>
                        {unit.name} ({unit.code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-3 text-sm text-[var(--ink)]">
                    {account.unitName || account.unitCode || 'Chưa gắn đơn vị'}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {editingEmail === account.email ? (
                  <>
                    <button
                      onClick={saveEdit}
                      disabled={isSubmitting || !editingUnitCode}
                      className="primary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {'Lưu'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={isSubmitting}
                      className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {'Hủy'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => beginEdit(account)}
                      disabled={isSubmitting || !account.email}
                      className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {'Sửa'}
                    </button>
                    <button
                      onClick={() => account.email && deleteAccount(account.email)}
                      disabled={isSubmitting || !account.email}
                      className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {'Xóa'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SystemSettingsInternalAccountsPanel({
  accounts,
  currentAdminEmail,
  onUpsertAccount,
  onDeleteAccount,
}: {
  accounts: UserProfile[];
  currentAdminEmail?: string | null;
  onUpsertAccount: (payload: {
    email: string;
    displayName: string;
    role: 'admin' | 'contributor';
  }) => Promise<void>;
  onDeleteAccount: (email: string) => Promise<void>;
}) {
  const [draftEmail, setDraftEmail] = useState('');
  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [draftRole, setDraftRole] = useState<'admin' | 'contributor'>('contributor');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [editingRole, setEditingRole] = useState<'admin' | 'contributor'>('contributor');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const roleLabel = (role: 'admin' | 'contributor') => (role === 'admin' ? 'Quản trị hệ thống' : 'Người dùng nội bộ');

  const submitAccount = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onUpsertAccount({
        email: draftEmail,
        displayName: draftDisplayName || draftEmail,
        role: draftRole,
      });
      setDraftEmail('');
      setDraftDisplayName('');
      setDraftRole('contributor');
      setMessage('Đã thêm hoặc cập nhật tài khoản nội bộ. Tài khoản này sẽ xuất hiện trong phần phân công theo dõi và gán phòng ban.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu tài khoản nội bộ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const beginEdit = (account: UserProfile) => {
    setEditingEmail(account.email || null);
    setEditingDisplayName(account.displayName || account.email || '');
    setEditingRole(account.role === 'admin' ? 'admin' : 'contributor');
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingEmail(null);
    setEditingDisplayName('');
    setEditingRole('contributor');
  };

  const saveEdit = async () => {
    if (!editingEmail) {
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onUpsertAccount({
        email: editingEmail,
        displayName: editingDisplayName || editingEmail,
        role: editingRole,
      });
      cancelEdit();
      setMessage('Đã cập nhật hồ sơ tài khoản nội bộ.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể cập nhật tài khoản nội bộ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteAccount = async (email: string) => {
    const confirmed = window.confirm(`Ẩn tài khoản nội bộ "${email}" khỏi hệ thống?`);
    if (!confirmed) {
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onDeleteAccount(email);
      if (editingEmail === email) {
        cancelEdit();
      }
      setMessage(`Đã vô hiệu hóa hồ sơ tài khoản ${email}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể vô hiệu hóa tài khoản nội bộ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel-card rounded-[24px] p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="section-title">{'Quản trị tài khoản nội bộ'}</h3>
          <p className="page-subtitle mt-2 text-sm">
            {'Nguồn tài khoản này dùng cho phân công người theo dõi và gán thành viên phòng ban. Email tại đây phải trùng với tài khoản đã có trong Supabase Auth.'}
          </p>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          {`Đang quản lý ${accounts.length} tài khoản nội bộ`}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.95fr)_220px_180px] xl:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.9fr)_200px_160px]">
        <input
          value={draftEmail}
          onChange={(event) => setDraftEmail(event.target.value)}
          className="field-input"
          placeholder="Email tài khoản nội bộ"
        />
        <input
          value={draftDisplayName}
          onChange={(event) => setDraftDisplayName(event.target.value)}
          className="field-input"
          placeholder="Tên hiển thị"
        />
        <select
          value={draftRole}
          onChange={(event) => setDraftRole(event.target.value as 'admin' | 'contributor')}
          className="field-select"
        >
          <option value="contributor">Người dùng nội bộ</option>
          <option value="admin">Quản trị hệ thống</option>
        </select>
        <button
          onClick={submitAccount}
          disabled={isSubmitting || !draftEmail.trim()}
          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
        >
          {'Thêm tài khoản'}
        </button>
      </div>

      {message && <p className="mt-4 text-sm font-medium text-[var(--ink-soft)]">{message}</p>}

      <div className="mt-6 max-h-[520px] space-y-3 overflow-y-auto rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--ink-soft)]">
            {'Chưa có hồ sơ tài khoản nội bộ nào được khai báo.'}
          </div>
        ) : (
          accounts.map((account) => {
            const isCurrentAdmin = getAssignmentKey(account.email) === getAssignmentKey(currentAdminEmail);

            return (
              <div
                key={account.email || account.id}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(240px,1fr)_220px_128px] xl:grid-cols-[minmax(0,1.15fr)_minmax(220px,0.95fr)_200px_128px]"
              >
                <div className="min-w-0">
                  <p className="col-header mb-2">{'Email đăng nhập'}</p>
                  <p className="break-all text-sm font-semibold text-[var(--ink)]">{account.email}</p>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    {editingEmail === account.email
                      ? 'Đang chỉnh sửa tài khoản nội bộ.'
                      : isCurrentAdmin
                        ? 'Tài khoản quản trị đang đăng nhập.'
                        : 'Có thể dùng cho phân công theo dõi và gán phòng ban.'}
                  </p>
                </div>
                <div>
                  <p className="col-header mb-2">{'Tên hiển thị'}</p>
                  {editingEmail === account.email ? (
                    <input
                      value={editingDisplayName}
                      onChange={(event) => setEditingDisplayName(event.target.value)}
                      className="field-input h-11 py-2 text-sm"
                      placeholder="Tên hiển thị"
                    />
                  ) : (
                    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-3 text-sm text-[var(--ink)]">
                      {account.displayName || 'Chưa có'}
                    </div>
                  )}
                </div>
                <div>
                  <p className="col-header mb-2">{'Vai trò hệ thống'}</p>
                  {editingEmail === account.email ? (
                    <select
                      value={editingRole}
                      onChange={(event) => setEditingRole(event.target.value as 'admin' | 'contributor')}
                      className="field-select h-11 text-sm"
                    >
                      <option value="contributor">Người dùng nội bộ</option>
                      <option value="admin">Quản trị hệ thống</option>
                    </select>
                  ) : (
                    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-3 text-sm text-[var(--ink)]">
                      {roleLabel(account.role === 'admin' ? 'admin' : 'contributor')}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {editingEmail === account.email ? (
                    <>
                      <button
                        onClick={saveEdit}
                        disabled={isSubmitting}
                        className="primary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {'Lưu'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isSubmitting}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {'Hủy'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => beginEdit(account)}
                        disabled={isSubmitting || !account.email}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {'Sửa'}
                      </button>
                      <button
                        onClick={() => account.email && deleteAccount(account.email)}
                        disabled={isSubmitting || !account.email || isCurrentAdmin}
                        className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {'Vô hiệu hóa'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SystemSettingsDepartmentsPanel({
  departments,
  members,
  internalUsers,
  onUpsertDepartment,
  onUpsertDepartmentMember,
  onDeactivateDepartmentMember,
}: {
  departments: Department[];
  members: DepartmentMember[];
  internalUsers: UserProfile[];
  onUpsertDepartment: (payload: {
    id?: string;
    code: string;
    name: string;
    sortOrder?: number;
    isActive?: boolean;
  }) => Promise<void>;
  onUpsertDepartmentMember: (payload: {
    departmentId: string;
    userEmail: string;
    membershipRole: 'manager' | 'member';
  }) => Promise<void>;
  onDeactivateDepartmentMember: (memberId: string) => Promise<void>;
}) {
  const sortedDepartments = useMemo(
    () => [...departments].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'vi')),
    [departments],
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(sortedDepartments[0]?.id || '');
  const [draftCode, setDraftCode] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftSortOrder, setDraftSortOrder] = useState('');
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const [selectedMembershipRole, setSelectedMembershipRole] = useState<'manager' | 'member'>('member');
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!sortedDepartments.length) {
      setSelectedDepartmentId('');
      return;
    }
    if (!sortedDepartments.some((department) => department.id === selectedDepartmentId)) {
      setSelectedDepartmentId(sortedDepartments[0].id);
    }
  }, [selectedDepartmentId, sortedDepartments]);

  const selectedDepartment = sortedDepartments.find((department) => department.id === selectedDepartmentId) || null;
  const departmentMembers = useMemo(
    () =>
      members
        .filter((member) => member.isActive && member.departmentId === selectedDepartmentId)
        .sort((left, right) => {
          if (left.membershipRole !== right.membershipRole) {
            return left.membershipRole === 'manager' ? -1 : 1;
          }
          return left.displayName.localeCompare(right.displayName, 'vi');
        }),
    [members, selectedDepartmentId],
  );

  const availableInternalUsers = useMemo(() => {
    const activeEmails = new Set(
      members.filter((member) => member.isActive).map((member) => getAssignmentKey(member.userEmail)),
    );
    return internalUsers.filter((profile) => {
      const normalizedEmail = getAssignmentKey(profile.email);
      return !!normalizedEmail && (!activeEmails.has(normalizedEmail) || normalizedEmail === getAssignmentKey(selectedUserEmail));
    });
  }, [internalUsers, members, selectedUserEmail]);

  const submitDepartment = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onUpsertDepartment({
        code: draftCode,
        name: draftName,
        sortOrder: draftSortOrder ? Number(draftSortOrder) : undefined,
      });
      setDraftCode('');
      setDraftName('');
      setDraftSortOrder('');
      setMessage('Đã cập nhật danh mục phòng ban nội bộ.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu phòng ban nội bộ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleDepartmentStatus = async (department: Department) => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      await onUpsertDepartment({
        id: department.id,
        code: department.code,
        name: department.name,
        sortOrder: department.sortOrder,
        isActive: !department.isActive,
      });
      setMessage(
        department.isActive
          ? `Đã tạm ngừng phòng ban "${department.name}".`
          : `Đã kích hoạt lại phòng ban "${department.name}".`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái phòng ban.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDepartmentMember = async () => {
    if (!selectedDepartmentId || !selectedUserEmail) {
      setMessage('Vui lòng chọn phòng ban và tài khoản nội bộ.');
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      await onUpsertDepartmentMember({
        departmentId: selectedDepartmentId,
        userEmail: selectedUserEmail,
        membershipRole: selectedMembershipRole,
      });
      setSelectedUserEmail('');
      setSelectedMembershipRole('member');
      setMessage('Đã cập nhật thành viên phòng ban.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu thành viên phòng ban.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deactivateMember = async (member: DepartmentMember) => {
    const confirmed = window.confirm(`Gỡ ${member.displayName} khỏi phòng ban hiện tại?`);
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      await onDeactivateDepartmentMember(member.id);
      setMessage(`Đã gỡ ${member.displayName} khỏi phòng ban.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể cập nhật thành viên phòng ban.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel-card rounded-[24px] p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="section-title">Quản lý phòng ban nội bộ</h3>
          <p className="page-subtitle mt-2 text-sm">
            Thiết lập 5 phòng ban nội bộ và gán người dùng nội bộ vào đúng phòng ban để tạo, quản lý dự án theo sở hữu.
          </p>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          {`Đang quản lý ${sortedDepartments.length} phòng ban`}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-[160px_minmax(0,1fr)_120px_auto]">
        <input
          value={draftCode}
          onChange={(event) => setDraftCode(event.target.value)}
          className="field-input"
          placeholder="Mã phòng ban"
        />
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          className="field-input"
          placeholder="Tên phòng ban"
        />
        <input
          value={draftSortOrder}
          onChange={(event) => setDraftSortOrder(event.target.value)}
          className="field-input"
          placeholder="Thứ tự"
        />
        <button
          onClick={submitDepartment}
          disabled={isSubmitting || !draftCode.trim() || !draftName.trim()}
          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
        >
          Thêm phòng ban
        </button>
      </div>

      {message && <p className="mt-4 text-sm font-medium text-[var(--ink-soft)]">{message}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3 rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          {sortedDepartments.map((department) => (
            <div
              key={department.id}
              onClick={() => setSelectedDepartmentId(department.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedDepartmentId(department.id);
                }
              }}
              role="button"
              tabIndex={0}
              className={`w-full cursor-pointer rounded-2xl border px-4 py-4 text-left transition ${
                selectedDepartmentId === department.id
                  ? 'border-[var(--primary)] bg-white shadow-[0_12px_24px_rgba(111,17,17,0.08)]'
                  : 'border-[var(--line)] bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{department.name}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    {department.code}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleDepartmentStatus(department);
                  }}
                  className="secondary-btn !px-3 !py-2 text-[10px]"
                >
                  {department.isActive ? 'Tạm ngừng' : 'Kích hoạt'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="section-title !text-xl">{selectedDepartment?.name || 'Chưa chọn phòng ban'}</p>
              <p className="page-subtitle mt-2 text-sm">
                Thành viên <code>manager</code> được tạo và chỉnh sửa dự án của phòng ban này. Thành viên <code>member</code> được tham gia nghiệp vụ nội bộ như tiếp nhận dữ liệu, báo cáo và trích báo cáo trong phạm vi phòng ban.
              </p>
            </div>
            {selectedDepartment ? (
              <div className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                {selectedDepartment.code}
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_180px_auto]">
            <select
              value={selectedUserEmail}
              onChange={(event) => setSelectedUserEmail(event.target.value)}
              className="field-select"
            >
              <option value="">-- Chọn tài khoản nội bộ --</option>
              {availableInternalUsers.map((profile) => (
                <option key={profile.email || profile.id} value={profile.email || ''}>
                  {profile.displayName || profile.email}
                </option>
              ))}
            </select>
            <select
              value={selectedMembershipRole}
              onChange={(event) => setSelectedMembershipRole(event.target.value as 'manager' | 'member')}
              className="field-select"
            >
              <option value="manager">Quản lý phòng ban</option>
              <option value="member">Thành viên phòng ban</option>
            </select>
            <button
              onClick={submitDepartmentMember}
              disabled={isSubmitting || !selectedDepartmentId || !selectedUserEmail}
              className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
            >
              Gán thành viên
            </button>
          </div>

          <div className="mt-5 max-h-[360px] space-y-3 overflow-y-auto">
            {departmentMembers.length === 0 ? (
              <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--ink-soft)]">
                Chưa có thành viên nội bộ nào được gán cho phòng ban này.
              </div>
            ) : (
              departmentMembers.map((member) => (
                <div
                  key={member.id}
                  className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_140px_120px]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">{member.displayName}</p>
                    <p className="mt-1 text-xs text-[var(--ink-soft)]">{member.userEmail}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                    {member.membershipRole === 'manager' ? 'Quản lý' : 'Thành viên'}
                  </div>
                  <button
                    onClick={() => deactivateMember(member)}
                    disabled={isSubmitting}
                    className="secondary-btn w-full px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Gỡ khỏi phòng
                  </button>
                </div>
              ))
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

function ChangePasswordModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setError(null);

    if (password.trim().length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-4 backdrop-blur-sm">
      <div className="panel-card w-full max-w-md rounded-[28px] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="section-title">Đổi mật khẩu</h3>
            <p className="page-subtitle mt-2 text-sm">
              Chức năng này chỉ đổi mật khẩu cho tài khoản đang đăng nhập. Reset mật khẩu vẫn thực hiện trực tiếp trong Supabase Dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-white/85 text-[var(--primary-dark)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field-input"
            placeholder="Mật khẩu mới"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="field-input"
            placeholder="Nhập lại mật khẩu mới"
          />
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="secondary-btn px-5 py-3" disabled={isSubmitting}>
            Hủy
          </button>
          <button type="button" onClick={() => void submit()} className="primary-btn px-5 py-3" disabled={isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu mật khẩu'}
          </button>
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
  onOpenAIAnalysis,
  onOpenImport,
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
  onOpenAIAnalysis: () => void;
  onOpenImport: (projectId?: string) => void;
}) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [overwriteRequests, setOverwriteRequests] = useState<OverwriteRequestRecord[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<UnitStatusFilter>('ALL');
  const [dashboardYear, setDashboardYear] = useState(() => getPreferredReportingYear());
  const currentAssignmentKey = useMemo(() => getAssignmentKey(currentUser?.email), [currentUser?.email]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const projectTemplates = templates.filter((tpl) => tpl.projectId === selectedProjectId);
  const templateMap = new Map(projectTemplates.map((tpl) => [tpl.id, tpl]));
  const dataFilesForYear = useMemo(
    () => dataFiles.filter((file) => file.projectId === selectedProjectId && file.year === dashboardYear),
    [dashboardYear, dataFiles, selectedProjectId],
  );
  const submittedUnitCodes = useMemo(() => new Set(dataFilesForYear.map((file) => file.unitCode)), [dataFilesForYear]);

  const rowsForYear = useMemo(() => {
    const rows = Object.values(data).flat();
    return rows.filter((row) => row.projectId === selectedProjectId && row.year === dashboardYear);
  }, [data, dashboardYear, selectedProjectId]);

  const overwriteRequestsForYear = useMemo(
    () => overwriteRequests.filter((request) => request.projectId === selectedProjectId && request.year === dashboardYear),
    [dashboardYear, overwriteRequests, selectedProjectId],
  );

  const adminNotifications = useMemo(
    () => overwriteRequests.filter((request) => request.status === 'PENDING'),
    [overwriteRequests],
  );

  const unitNotifications = useMemo(() => {
    if (!currentUser?.email) {
      return [] as OverwriteRequestRecord[];
    }

    return overwriteRequests.filter(
      (request) =>
        getAssignmentKey(request.requestedBy?.email) === getAssignmentKey(currentUser.email) &&
        request.status !== 'PENDING' &&
        !request.requesterSeenAt,
    );
  }, [currentUser?.email, overwriteRequests]);

  const activeNotifications = isAdmin ? adminNotifications : currentUser?.role === 'unit_user' ? unitNotifications : [];
  const canUseNotifications = isAdmin || currentUser?.role === 'unit_user';

  const handleToggleNotifications = async () => {
    const nextOpen = !isNotificationOpen;
    setIsNotificationOpen(nextOpen);

    if (!nextOpen || isAdmin || unitNotifications.length === 0) {
      return;
    }

    try {
      await markOverwriteRequestsSeenInSupabase(unitNotifications.map((request) => request.id));
      const seenAt = new Date().toISOString();
      setOverwriteRequests((current) =>
        current.map((request) =>
          unitNotifications.some((item) => item.id === request.id)
            ? { ...request, requesterSeenAt: seenAt }
            : request,
        ),
      );
    } catch (error) {
      console.error('Không thể đánh dấu thông báo ghi đè là đã xem:', error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || (!isAdmin && currentUser?.role !== 'unit_user')) {
      setOverwriteRequests([]);
      setIsNotificationOpen(false);
      return;
    }

    let active = true;
    setNotificationLoading(true);

    listOverwriteRequestsFromSupabase()
      .then((items) => {
        if (active) {
          setOverwriteRequests(items);
        }
      })
      .catch((error) => {
        console.error('Không thể tải thông báo ghi đè dữ liệu:', error);
        if (active) {
          setOverwriteRequests([]);
        }
      })
      .finally(() => {
        if (active) {
          setNotificationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentUser?.email, currentUser?.role, isAdmin, isAuthenticated]);

  const lastUpdatedBy = useMemo(() => {
    const map = new Map<string, { name: string; at: number }>();
    rowsForYear.forEach((row) => {
      if (!row.updatedAt || !row.updatedBy) {
        return;
      }
      const time = row.updatedAt?.toDate ? row.updatedAt.toDate().getTime() : 0;
      const label = getReadableDisplayName(row.updatedBy.displayName, row.updatedBy.email, 'Hệ thống');
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
      const name = getReadableDisplayName(user?.displayName, user?.email);
      unitCodes.forEach((code) => {
        map.set(code, name);
      });
    });
    return map;
  }, [assignments, assignmentUsers]);

  const latestDataFileByUnit = useMemo(() => {
    const map = new Map<string, DataFileRecordSummary>();
    dataFilesForYear.forEach((file) => {
      const previous = map.get(file.unitCode);
      const currentTime = getTimestampMs(file.submittedAt || file.updatedAt) || 0;
      const previousTime = getTimestampMs(previous?.submittedAt || previous?.updatedAt) || 0;
      if (!previous || currentTime >= previousTime) {
        map.set(file.unitCode, file);
      }
    });
    return map;
  }, [dataFilesForYear]);

  const overwriteRequestsByUnit = useMemo(() => {
    const map = new Map<string, OverwriteRequestRecord[]>();
    overwriteRequestsForYear.forEach((request) => {
      const current = map.get(request.unitCode) || [];
      current.push(request);
      map.set(request.unitCode, current);
    });
    return map;
  }, [overwriteRequestsForYear]);

  const currentAssignedUnitCodes = useMemo(
    () => (currentAssignmentKey ? assignments[currentAssignmentKey] || [] : []),
    [assignments, currentAssignmentKey],
  );
  const scopedUnitCodesForCurrentUser = useMemo(() => {
    if (!isAuthenticated || isAdmin) {
      return [] as string[];
    }

    if (currentUser?.role === 'unit_user' && currentUser.unitCode) {
      return [currentUser.unitCode];
    }

    return currentAssignedUnitCodes;
  }, [currentAssignedUnitCodes, currentUser, isAdmin, isAuthenticated]);

  const shouldLockToCurrentUserAssignments = isAuthenticated && !isAdmin && scopedUnitCodesForCurrentUser.length > 0;

  const allUnitLogs = useMemo<UnitLog[]>(() => {
    const sheetOrder = new Map(SHEET_CONFIGS.map((sheet, index) => [sheet.name, index]));

    return units.map((unit) => {
      const unitRows = rowsForYear.filter((row) => row.unitCode === unit.code);
      const unitFile = latestDataFileByUnit.get(unit.code);
      const unitRequests = overwriteRequestsByUnit.get(unit.code) || [];
      const latestRequest = unitRequests.reduce<OverwriteRequestRecord | null>((latest, current) => {
        const latestTime = getTimestampMs(latest?.createdAt) || 0;
        const currentTime = getTimestampMs(current.createdAt) || 0;
        return currentTime >= latestTime ? current : latest;
      }, null);
      const importedSheets = Array.from<string>(
        new Set(
          unitRows
            .map((row) => templateMap.get(row.templateId)?.sheetName || templateMap.get(row.templateId)?.name || row.templateId),
        ),
      ).sort((left, right) => (sheetOrder.get(left) ?? 0) - (sheetOrder.get(right) ?? 0));

      const latestAcceptedTime = getTimestampMs(unitFile?.submittedAt || unitFile?.updatedAt);
      const latestRequestTime = getTimestampMs(latestRequest?.createdAt);
      const submittedAt =
        latestRequestTime && (!latestAcceptedTime || latestRequestTime >= latestAcceptedTime)
          ? (typeof latestRequest?.createdAt === 'string' ? latestRequest.createdAt : null)
          : (typeof unitFile?.submittedAt === 'string'
              ? unitFile.submittedAt
              : typeof unitFile?.updatedAt === 'string'
                ? unitFile.updatedAt
                : null);

      const latestActor =
        latestRequestTime && (!latestAcceptedTime || latestRequestTime >= latestAcceptedTime)
          ? latestRequest?.unitName || latestRequest?.requestedBy?.displayName || latestRequest?.requestedBy?.email || unit.name
          : unitFile?.submittedBy?.displayName || lastUpdatedBy.get(unit.code)?.name;

      return {
        code: unit.code,
        name: unit.name,
        importedSheets,
        rowCount: unitRows.length,
        isSubmitted: submittedUnitCodes.has(unit.code) || importedSheets.length > 0,
        lastUpdatedBy: latestActor,
        assignedTo: assignmentMap.get(unit.code),
        submittedAt,
        overwriteRequestCount: unitRequests.length,
        overwriteStatus: latestRequest?.status || null,
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
  }, [assignmentMap, lastUpdatedBy, latestDataFileByUnit, overwriteRequestsByUnit, rowsForYear, submittedUnitCodes, templateMap, units]);

  const unitLogs = useMemo<UnitLog[]>(() => {
    if (isAuthenticated && !isAdmin) {
      if (scopedUnitCodesForCurrentUser.length === 0) {
        return [];
      }

      const currentUserLogs = allUnitLogs.filter((unit) => scopedUnitCodesForCurrentUser.includes(unit.code));

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
  }, [allUnitLogs, assignments, isAdmin, isAuthenticated, scopedUnitCodesForCurrentUser, selectedAssignee, statusFilter]);

  const dashboardScopeLogs = useMemo<UnitLog[]>(() => {
    if (isAuthenticated && !isAdmin) {
      return allUnitLogs.filter((unit) => scopedUnitCodesForCurrentUser.includes(unit.code));
    }

    return allUnitLogs;
  }, [allUnitLogs, isAdmin, isAuthenticated, scopedUnitCodesForCurrentUser]);

  const submittedCount = dashboardScopeLogs.filter((unit) => unit.isSubmitted).length;
  const totalUnits = dashboardScopeLogs.length;
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
    { label: 'T\u1ed5ng \u0111\u01a1n v\u1ecb', value: totalUnits, icon: Users, iconColor: 'text-[var(--primary)]', tone: 'bg-[var(--primary-soft)]' },
    {
      label: '\u0110\u01a1n v\u1ecb \u0111\u00e3 ti\u1ebfp nh\u1eadn',
      value: `${submittedCount}/${totalUnits}`,
      icon: FileBarChart,
      iconColor: 'text-[var(--success)]',
      tone: 'bg-[rgba(47,110,73,0.12)]',
    },
    {
      label: 'T\u1ef7 l\u1ec7 ho\u00e0n th\u00e0nh',
      value: `${completionRate}%`,
      icon: Activity,
      iconColor: 'text-[var(--primary-dark)]',
      tone: 'bg-[rgba(135,17,22,0.12)]',
    },
  ];

  const pieData = [
    { name: '\u0110\u00e3 ti\u1ebfp nh\u1eadn', value: submittedCount },
    { name: 'Ch\u01b0a ti\u1ebfp nh\u1eadn', value: totalUnits - submittedCount },
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
        <div className="absolute right-0 top-0 z-10 flex items-center gap-2 md:hidden">
          {canUseNotifications && activeNotifications.length > 0 && (
            <button
              type="button"
              onClick={() => void handleToggleNotifications()}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-white/90 text-[var(--primary-dark)] shadow-sm"
              title={'Th\u00f4ng b\u00e1o'}
            >
              <BellDot size={18} />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold text-white">
                {activeNotifications.length}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={isAuthenticated ? () => void onLogout() : onOpenLogin}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-white/90 text-[var(--primary-dark)] shadow-sm"
            title={isAuthenticated ? '\u0110\u0103ng xu\u1ea5t' : '\u0110\u0103ng nh\u1eadp'}
          >
            {isAuthenticated ? <LogOut size={18} /> : <LogIn size={18} />}
          </button>
        </div>
        <div
          className="overflow-hidden rounded-[24px] border border-[rgba(201,167,92,0.28)] px-6 py-6 shadow-[0_24px_80px_rgba(122,44,46,0.10)] md:px-8 md:py-7"
          style={{
            backgroundColor: '#8f1115',
            backgroundImage: `linear-gradient(135deg, rgba(68,5,5,0.14), rgba(68,5,5,0.06) 35%, rgba(255,255,255,0.03) 100%), linear-gradient(90deg, rgba(92,8,10,0.92) 0%, rgba(146,18,22,0.82) 45%, rgba(124,12,16,0.90) 100%), url(${dashboardDongSon})`,
            backgroundSize: 'auto, auto, min(72vw, 820px)',
            backgroundPosition: 'center, center, right -60px center',
            backgroundRepeat: 'no-repeat',
            backgroundBlendMode: 'overlay, normal, screen',
          }}
        >
          {canUseNotifications && (
            <div className="absolute right-6 top-6 hidden md:block">
              <button
                type="button"
                onClick={() => void handleToggleNotifications()}
                className="relative flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-white/10 text-white transition hover:bg-white/15"
                title={'Th\u00f4ng b\u00e1o'}
              >
                {activeNotifications.length > 0 ? <BellDot size={20} /> : <Bell size={20} />}
                {activeNotifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--gold)] px-1 text-[10px] font-bold text-[var(--primary-dark)]">
                    {activeNotifications.length}
                  </span>
                )}
              </button>
            </div>
          )}
          <h2 className="max-w-5xl text-[1.9rem] font-black leading-tight tracking-[-0.03em] text-white md:text-[2.8rem]">
            {'H\u1ec6 TH\u1ed0NG QU\u1ea2N TR\u1eca D\u1eee LI\u1ec6U TC\u0110, \u0110V T\u1eacP TRUNG'}
          </h2>
          {currentUser && (
            <p className="mt-3 text-sm font-bold text-white/90">
              {'T\u00e0i kho\u1ea3n \u0111ang \u0111\u0103ng nh\u1eadp: '}{getReadableDisplayName(currentUser.displayName, currentUser.email, 'Ch\u01b0a x\u00e1c \u0111\u1ecbnh')}
            </p>
          )}
          <p className="mt-3 max-w-3xl text-sm text-white/80">
            {'Theo d\u00f5i nhanh t\u00ecnh h\u00ecnh ti\u1ebfp nh\u1eadn d\u1eef li\u1ec7u c\u1ee7a c\u00e1c \u0111\u01a1n v\u1ecb, s\u1ed1 bi\u1ec3u \u0111\u00e3 nh\u1eadp v\u00e0 m\u1ee9c \u0111\u1ed9 ho\u00e0n th\u00e0nh t\u1ed5ng h\u1ee3p tr\u00ean to\u00e0n h\u1ec7 th\u1ed1ng.'}
          </p>
        </div>
        {canUseNotifications && isNotificationOpen && (
          <div className="absolute right-0 top-14 z-20 w-full max-w-[420px] rounded-[24px] border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(44,62,80,0.18)] md:right-6 md:top-20">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--primary-dark)]">{'Th\u00f4ng b\u00e1o'}</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                {isAdmin
                  ? 'C\u00e1c \u0111\u01a1n v\u1ecb v\u1eeba n\u1ed9p y\u00eau c\u1ea7u ghi \u0111\u00e8 \u0111ang ch\u1edd admin x\u1eed l\u00fd.'
                  : 'C\u00e1c y\u00eau c\u1ea7u ghi \u0111\u00e8 c\u1ee7a \u0111\u01a1n v\u1ecb b\u1ea1n \u0111\u00e3 \u0111\u01b0\u1ee3c admin x\u1eed l\u00fd.'}
              </p>
            </div>
            <div className="max-h-[360px] overflow-y-auto px-4 py-3">
              {notificationLoading ? (
                <p className="rounded-2xl bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--ink-soft)]">{'\u0110ang t\u1ea3i th\u00f4ng b\u00e1o...'}</p>
              ) : activeNotifications.length === 0 ? (
                <p className="rounded-2xl bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--ink-soft)]">{'Hi\u1ec7n ch\u01b0a c\u00f3 th\u00f4ng b\u00e1o m\u1edbi.'}</p>
              ) : (
                <div className="space-y-3">
                  {activeNotifications.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => {
                        setIsNotificationOpen(false);
                        onOpenImport(request.projectId);
                      }}
                      className="block w-full rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-left transition hover:border-[var(--primary)] hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--ink)]">
                            {isAdmin
                              ? `${request.unitName} \u0111\u1ec1 ngh\u1ecb ghi \u0111\u00e8 d\u1eef li\u1ec7u`
                              : `Y\u00eau c\u1ea7u ghi \u0111\u00e8 c\u1ee7a ${request.unitName} \u0111\u00e3 ${request.status === 'APPROVED' ? '\u0111\u01b0\u1ee3c ph\u00ea duy\u1ec7t' : 'b\u1ecb t\u1eeb ch\u1ed1i'}`}
                          </p>
                          <p className="mt-1 text-xs text-[var(--ink-soft)]">
                            {request.projectName || request.projectId} - {'Năm'} {request.year}
                          </p>
                          <p className="mt-2 text-xs text-[var(--ink-soft)]">
                            {isAdmin
                              ? `N\u1ed9p l\u00fac ${formatDateTime(typeof request.createdAt === 'string' ? request.createdAt : null)}`
                              : `X\u1eed l\u00fd l\u00fac ${formatDateTime(typeof request.reviewedAt === 'string' ? request.reviewedAt : null)}`}
                          </p>
                        </div>
                        <span className={request.status === 'APPROVED' ? 'status-pill status-pill-submitted' : request.status === 'REJECTED' ? 'status-pill status-pill-pending' : 'status-pill status-pill-pending'}>
                          {request.status === 'PENDING' ? 'Chờ duyệt' : request.status === 'APPROVED' ? 'Đã duyệt' : 'Từ chối'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="mt-4 space-y-5 md:hidden">
        <div className="space-y-5">
          <div>
            <p className="col-header mb-2">{'Ch\u1ecdn d\u1ef1 \u00e1n'}</p>
            <div className="flex items-center border-b border-[var(--line-strong)] py-2">
              <select
                value={selectedProjectId}
                onChange={(event) => onSelectProject(event.target.value)}
                className="field-select w-full border-0 bg-transparent px-0 py-0 text-sm font-bold"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--ink-soft)]">
              {selectedProject ? selectedProject.description || DEFAULT_PROJECT_NAME : DEFAULT_PROJECT_NAME}
            </p>
          </div>

          <div>
            <p className="col-header mb-2">{'Ch\u1ecdn n\u0103m'}</p>
            <div className="flex items-center border-b border-[var(--line-strong)] py-2">
              <select
                value={dashboardYear}
                onChange={(event) => setDashboardYear(event.target.value)}
                className="field-select w-full border-0 bg-transparent px-0 py-0 text-sm font-bold"
              >
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="col-header mb-2">{'D\u1ef1 \u00e1n \u0111ang ch\u1ea1y'}</p>
              <div className="border-b border-[var(--line-strong)] pb-2">
                <p className="data-value text-3xl font-bold text-[var(--ink)]">{activeProjects}</p>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">{'D\u1ef1 \u00e1n ch\u01b0a k\u1ebft th\u00fac'}</p>
              </div>
            </div>

            <div>
              <p className="col-header mb-2">{'D\u1ef1 \u00e1n ho\u00e0n th\u00e0nh'}</p>
              <div className="border-b border-[var(--line-strong)] pb-2">
                <p className="data-value text-3xl font-bold text-[var(--ink)]">{completedProjects}</p>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">{'D\u1ef1 \u00e1n \u0111\u00e3 \u0111\u00f3ng'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 border-b border-[var(--line)] pb-3 text-sm leading-tight text-[var(--ink)]">
            <p>{`Tổng số đơn vị: ${totalUnits}`}</p>
            <p>{`Đơn vị đã tiếp nhận: ${submittedCount}/${totalUnits}`}</p>
            <p>{`Tỷ lệ hoàn thành: ${completionRate}%`}</p>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="mt-6 panel-card rounded-[24px] p-5 md:hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="section-title text-base">{'Phân tích AI'}</h3>
              <p className="page-subtitle mt-2 text-sm">
                {'Mở module phân tích nhiều dự án, xem trước nội dung báo cáo và chuẩn bị xuất DOCX.'}
              </p>
            </div>
            <button type="button" onClick={onOpenAIAnalysis} className="primary-btn px-4 py-3 text-[11px]">
              {'Mở'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 hidden grid-cols-1 gap-8 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.5fr)_minmax(0,0.5fr)]">
        <div>
          <p className="col-header mb-2">{'Chọn dự án'}</p>
          <div className="flex items-center border-b border-[var(--line-strong)] py-2">
            <select
              value={selectedProjectId}
              onChange={(event) => onSelectProject(event.target.value)}
              className="field-select w-full border-0 bg-transparent px-0 py-0 text-sm font-bold"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--ink-soft)]">
            {selectedProject ? selectedProject.description || DEFAULT_PROJECT_NAME : DEFAULT_PROJECT_NAME}
          </p>
        </div>

        <div>
          <p className="col-header mb-2">{'Chọn năm'}</p>
          <div className="flex items-center border-b border-[var(--line-strong)] py-2">
            <select
              value={dashboardYear}
              onChange={(event) => setDashboardYear(event.target.value)}
              className="field-select w-full border-0 bg-transparent px-0 py-0 text-sm font-bold"
            >
              {YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--ink-soft)]">
            {'Tiến độ và nhật ký bên dưới sẽ được lọc theo đúng dự án và năm bạn đang chọn.'}
          </p>
        </div>

        <div>
          <p className="col-header mb-2">{'Dự án đang chạy'}</p>
          <div className="border-b border-[var(--line-strong)] pb-2">
            <p className="data-value text-3xl font-bold text-[var(--ink)]">{activeProjects}</p>
            <p className="mt-2 text-xs text-[var(--ink-soft)]">{'Dự án chưa kết thúc'}</p>
          </div>
        </div>

        <div>
          <p className="col-header mb-2">{'Dự án hoàn thành'}</p>
          <div className="border-b border-[var(--line-strong)] pb-2">
            <p className="data-value text-3xl font-bold text-[var(--ink)]">{completedProjects}</p>
            <p className="mt-2 text-xs text-[var(--ink-soft)]">{'Dự án đã đóng'}</p>
          </div>
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

      {selectedProject && (
        <div className="mt-6 panel-card rounded-[28px] p-5 md:hidden">
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="section-title text-base">{'Nhật ký tiếp nhận đơn vị'}</h3>
              <p className="page-subtitle mt-2 text-sm">{'Mở nhanh danh sách đã tiếp nhận hoặc chưa tiếp nhận.'}</p>
            </div>
            <button
              type="button"
              onClick={() => openLogView('SUBMITTED')}
              className="status-pill status-pill-submitted w-full justify-center"
            >
              {'Đã tiếp nhận'}
            </button>
            <button
              type="button"
              onClick={() => openLogView('PENDING')}
              className="status-pill status-pill-pending w-full justify-center"
            >
              {'Chưa tiếp nhận'}
            </button>
            <button onClick={() => openLogView()} className="primary-btn w-full">
              {'Xem tất cả nhật ký'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 panel-card rounded-[28px] p-6 md:hidden">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="section-title">{'Biểu đồ tiếp nhận dữ liệu'}</h3>
            <p className="page-subtitle mt-2 text-sm">{`Tỷ lệ đơn vị đã nộp dữ liệu so với tổng số đơn vị trong năm ${dashboardYear}.`}</p>
          </div>
          <div className="status-pill status-pill-submitted self-start">{`${submittedCount} đơn vị đã nộp`}</div>
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
          <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">{'Mức độ hoàn thành tiếp nhận'}</p>
        </div>
      </div>

      <div className={`mt-8 hidden grid-cols-1 gap-8 md:grid ${selectedProject ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : ''}`}>
        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">{'Biểu đồ tiếp nhận dữ liệu'}</h3>
              <p className="page-subtitle mt-2 text-sm">{`Tỷ lệ đơn vị đã nộp dữ liệu so với tổng số đơn vị trong năm ${dashboardYear}.`}</p>
            </div>
            <div className="status-pill status-pill-submitted">{`${submittedCount} đơn vị đã nộp`}</div>
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
            <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">{'Mức độ hoàn thành tiếp nhận'}</p>
          </div>
        </div>

        {selectedProject && (
        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="section-title">{'Trạng thái tiếp nhận đơn vị'}</h3>
              <p className="page-subtitle mt-2 text-sm">{'Danh sách được lấy từ dữ liệu thật đã lưu.'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === 'SUBMITTED' ? 'ALL' : 'SUBMITTED'))}
                className={statusFilter === 'SUBMITTED' ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}
              >
                {'Đã tiếp nhận'}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === 'PENDING' ? 'ALL' : 'PENDING'))}
                className={statusFilter === 'PENDING' ? 'status-pill status-pill-submitted' : 'status-pill status-pill-pending'}
              >
                {'Chưa tiếp nhận'}
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
                  <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                    {`Nộp gần nhất: ${formatDateTime(unit.submittedAt)} · Cập nhật lại: ${unit.overwriteRequestCount}`}
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

          <div className="mt-6">
            <button onClick={() => openLogView()} className="primary-btn w-full">
              {'Xem tất cả nhật ký'}
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
                <h3 className="section-title">{'BẠN CẦN ĐĂNG NHẬP ĐỂ XEM CHI TIẾT'}</h3>
                <p className="page-subtitle mt-2 text-sm">
                  {'Hãy đăng nhập để xem nhật ký chi tiết và danh sách đơn vị được phân công cho tài khoản của bạn.'}
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
                {'Đóng'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLoginPromptOpen(false);
                  onOpenLogin();
                }}
                className="primary-btn px-5 py-3"
              >
                {'Đăng nhập'}
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
                <div className="surface-tag hidden md:inline-flex">{`${totalUnits} đơn vị toàn hệ thống`}</div>
                <h3 className="mt-3 text-[1.6rem] font-black leading-tight tracking-[-0.02em] text-[var(--primary-dark)] md:text-[2.3rem]">
                  {`NHẬT KÝ NĂM ${dashboardYear}`}
                </h3>
                <p className="page-subtitle mt-2 hidden text-sm md:block">
                  {'Hiển thị đầy đủ trạng thái của từng đơn vị cùng số biểu đã được nhập vào hệ thống tập trung.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pr-10 md:pr-0">
                {isAdmin && assignees.length > 0 && (
                  <div className="panel-soft rounded-full px-3 py-2">
                    <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                      {'Lọc theo người theo dõi'}
                    </label>
                    <select
                      value={selectedAssignee}
                      onChange={(event) => setSelectedAssignee(event.target.value)}
                      className="mt-1 w-full bg-transparent text-xs font-semibold text-[var(--ink)] focus:outline-none"
                    >
                      <option value="ALL">{'Tất cả người theo dõi'}</option>
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
                    {'Đang xem đơn vị được phân công cho '}{getReadableDisplayName(currentUser?.displayName, currentUser?.email, 'bạn')}
                  </div>
                )}
                <button
                  onClick={() => setIsLogOpen(false)}
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-white/85 text-[var(--primary-dark)] md:static md:h-auto md:w-auto md:gap-2 md:self-start md:rounded-[18px] md:px-4 md:py-3"
                >
                  <X size={16} />
                  <span className="hidden md:inline">{'Đóng'}</span>
                </button>
              </div>
            </div>

            <div className="border-b border-[var(--line)] bg-[var(--primary-soft)] px-6 py-4">
              <div className="space-y-1 text-sm leading-tight text-[var(--ink)] md:hidden">
                <p>
                  {'- Dự án: '}<span className="font-semibold">{selectedProject.name}</span>
                </p>
                <p>
                  {'- Đã tiếp nhận: '}<span className="font-semibold text-[var(--success)]">{submittedCount}</span>
                </p>
                <p>
                  {'- Chưa tiếp nhận: '}<span className="font-semibold text-[var(--warning)]">{totalUnits - submittedCount}</span>
                </p>
              </div>

              <div className="hidden grid-cols-3 gap-4 md:grid">
                <div className="rounded-2xl bg-white/70 px-4 py-3">
                  <p className="col-header mb-1">{'Tổng đơn vị'}</p>
                  <p className="data-value text-2xl font-bold">{totalUnits}</p>
                </div>
                <div className="rounded-2xl bg-white/70 px-4 py-3">
                  <p className="col-header mb-1">{'Đã tiếp nhận'}</p>
                  <p className="data-value text-2xl font-bold text-[var(--success)]">{submittedCount}</p>
                </div>
                <div className="rounded-2xl bg-white/70 px-4 py-3">
                  <p className="col-header mb-1">{'Chưa tiếp nhận'}</p>
                  <p className="data-value text-2xl font-bold text-[var(--warning)]">{totalUnits - submittedCount}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="grid grid-cols-1 gap-3">
                {unitLogs.length === 0 && (
                  <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--ink-soft)]">
                    {isAuthenticated && !isAdmin
                      ? 'Tài khoản của bạn hiện chưa được phân công đơn vị nào trong dự án này.'
                      : 'Chưa có đơn vị nào phù hợp với bộ lọc hiện tại.'}
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
                        {unit.isSubmitted ? 'Đã tiếp nhận' : 'Chưa tiếp nhận'}
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
                            ? `Đã lưu ${unit.rowCount.toLocaleString('vi-VN')} dòng dữ liệu.`
                            : 'Hiện chưa có dữ liệu nào được tiếp nhận trong năm này.'}
                        </p>
                        <div className="mt-2 text-[11px] text-[var(--ink-soft)]">
                          {isAdmin && <p>{'Người theo dõi: '}{unit.assignedTo || 'Chưa phân công'}</p>}
                          <p>{'Ngày giờ nộp: '}{formatDateTime(unit.submittedAt)}</p>
                          <p>{'Số lần cập nhật lại: '}{unit.overwriteRequestCount}</p>
                          <p>{'Người cập nhật: '}{unit.lastUpdatedBy || 'Chưa có'}</p>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <p className="col-header mb-2">{'Biểu đã nhập'}</p>
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

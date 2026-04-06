import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileCheck, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react';
import { YEARS } from '../constants';
import { getAssignmentKey } from '../access';
import { uploadFile } from '../supabase';
import {
  createOverwriteRequest,
  listOverwriteRequests,
  updateOverwriteRequestDecision,
  upsertDataFileRecord,
} from '../supabaseStore';
import { DataFileRecordSummary, DataRow, FormTemplate, ManagedUnit, OverwriteRequestRecord, Project, UserProfile } from '../types';
import { parseLegacyFromWorkbook, parseTemplateFromWorkbook } from '../utils/excelParser';
import { getPinnedYearPreference, getPreferredReportingYear, setPinnedYearPreference } from '../utils/reportingYear';
import { validateTemplateSheetSignature, validateWorkbookSheetNames } from '../utils/workbookUtils';

type FileMatchType = 'CODE' | 'NAME' | 'FUZZY' | 'MANUAL' | 'NONE';
type FileMatchStatus = 'AUTO_FILLED' | 'NEEDS_CONFIRMATION' | 'MANUAL' | 'UNMATCHED' | 'CONFLICT';
type VisibleFileFilter = 'ALL' | 'READY' | 'NEEDS_CONFIRMATION' | 'INVALID' | 'WITH_EXISTING_DATA';

type PendingFile = {
  id: string;
  file: File;
  relativePath: string;
  unitCode: string;
  unitQuery: string;
  suggestedUnitCode: string;
  suggestedUnitName: string;
  matchType: FileMatchType;
  matchStatus: FileMatchStatus;
  matchScore: number;
  matchReason: string;
};

type FileValidationState = {
  status: 'pending' | 'valid' | 'invalid';
  missingSheets: string[];
  matchedSheets: string[];
  reason?: string;
};

type UnitMatchResult = {
  unitCode: string;
  unitName: string;
  type: FileMatchType;
  score: number;
  reason: string;
};

type FailedFile = {
  unitName: string;
  fileName: string;
  missingSheets: string[];
  reason?: string;
  relativePath?: string;
};

type OperationProgress = {
  visible: boolean;
  title: string;
  description: string;
  percent: number;
  status: 'running' | 'done';
};

type ImportResultSummary = {
  visible: boolean;
  totalSelected: number;
  updatedCount: number;
  failedFiles: FailedFile[];
  partialWarnings: string[];
};

type IntakeUnitStatus = {
  code: string;
  name: string;
  rowCount: number;
  isSubmitted: boolean;
};

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[_./\\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractSearchText(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  return [relativePath, file.name].filter(Boolean).join(' ');
}

function findBestUnitMatch(searchText: string, units: ManagedUnit[]): UnitMatchResult | null {
  if (!searchText.trim()) {
    return null;
  }

  const normalizedSearch = normalizeText(searchText);
  const upperSearch = searchText.toUpperCase();

  const codeMatch = units.find((unit) => {
    const pattern = new RegExp(`(^|[^A-Z0-9])${unit.code.toUpperCase()}([^A-Z0-9]|$)`);
    return pattern.test(upperSearch);
  });

  if (codeMatch) {
    return {
      unitCode: codeMatch.code,
      unitName: codeMatch.name,
      type: 'CODE',
      score: 1,
      reason: `Khá»›p theo mÃ£ Ä‘Æ¡n vá»‹ ${codeMatch.code}.`,
    };
  }

  const searchTokens = tokenize(searchText);
  if (searchTokens.length === 0) {
    return null;
  }

  let bestMatch: UnitMatchResult | null = null;

  units.forEach((unit) => {
    const normalizedUnit = normalizeText(unit.name);
    const unitTokens = tokenize(unit.name);
    if (unitTokens.length === 0) {
      return;
    }

    if (normalizedSearch.includes(normalizedUnit) || normalizedUnit.includes(normalizedSearch)) {
      const score = normalizedSearch === normalizedUnit ? 0.99 : 0.95;
      const next: UnitMatchResult = {
        unitCode: unit.code,
        unitName: unit.name,
        type: 'NAME',
        score,
        reason: 'Khá»›p máº¡nh theo tÃªn Ä‘Æ¡n vá»‹.',
      };
      if (!bestMatch || next.score > bestMatch.score) {
        bestMatch = next;
      }
      return;
    }

    const tokenSet = new Set(searchTokens);
    const overlap = unitTokens.filter((token) => tokenSet.has(token)).length;
    if (overlap === 0) {
      return;
    }

    const coverage = overlap / unitTokens.length;
    const precision = overlap / Math.max(searchTokens.length, 1);
    const score = coverage * 0.75 + precision * 0.25;
    const next: UnitMatchResult = {
      unitCode: unit.code,
      unitName: unit.name,
      type: 'FUZZY',
      score,
      reason: `Gá»£i Ã½ gáº§n Ä‘Ãºng ${Math.round(score * 100)}%.`,
    };

    if (!bestMatch || next.score > bestMatch.score) {
      bestMatch = next;
    }
  });

  return bestMatch;
}

function getMatchBadgeLabel(fileItem: PendingFile) {
  switch (fileItem.matchStatus) {
    case 'AUTO_FILLED':
      if (fileItem.matchType === 'CODE') return 'ÄÃ£ tá»± Ä‘iá»n theo mÃ£';
      if (fileItem.matchType === 'NAME') return 'ÄÃ£ tá»± Ä‘iá»n theo tÃªn';
      return 'ÄÃ£ tá»± Ä‘iá»n';
    case 'NEEDS_CONFIRMATION':
      return `Cáº§n xÃ¡c nháº­n ${Math.round(fileItem.matchScore * 100)}%`;
    case 'MANUAL':
      return 'ÄÃ£ chá»n thá»§ cÃ´ng';
    case 'CONFLICT':
      return 'ÄÆ¡n vá»‹ Ä‘Ã£ cÃ³ dá»¯ liá»‡u';
    default:
      return 'ChÆ°a nháº­n diá»‡n';
  }
}

function getMatchBadgeTone(fileItem: PendingFile) {
  switch (fileItem.matchStatus) {
    case 'AUTO_FILLED':
    case 'MANUAL':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'NEEDS_CONFIRMATION':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'CONFLICT':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    default:
      return 'border-[var(--line)] bg-white text-[var(--ink-soft)]';
  }
}

function buildPendingFiles(
  incomingFiles: File[],
  existingFiles: PendingFile[],
  availableUnits: ManagedUnit[],
  importedUnitCodesForProjectYear: Set<string>,
): PendingFile[] {
  const reservedUnitCodes = new Set([
    ...Array.from(importedUnitCodesForProjectYear),
    ...existingFiles.map((item) => item.unitCode).filter(Boolean),
  ]);

  return incomingFiles.map((file) => {
    const match = findBestUnitMatch(extractSearchText(file), availableUnits);
    const baseItem: PendingFile = {
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
      relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || '',
      unitCode: '',
      unitQuery: '',
      suggestedUnitCode: '',
      suggestedUnitName: '',
      matchType: 'NONE',
      matchStatus: 'UNMATCHED',
      matchScore: 0,
      matchReason: 'ChÆ°a nháº­n diá»‡n Ä‘Æ°á»£c Ä‘Æ¡n vá»‹ tá»« tÃªn file.',
    };

    if (!match) {
      return baseItem;
    }

    if (reservedUnitCodes.has(match.unitCode)) {
      return {
        ...baseItem,
        suggestedUnitCode: match.unitCode,
        suggestedUnitName: match.unitName,
        unitQuery: match.unitName,
        matchType: match.type,
        matchStatus: 'CONFLICT',
        matchScore: match.score,
        matchReason: `${match.reason} ÄÆ¡n vá»‹ nÃ y Ä‘Ã£ cÃ³ dá»¯ liá»‡u trong dá»± Ã¡n/nÄƒm Ä‘ang chá»n hoáº·c Ä‘Ã£ Ä‘Æ°á»£c chá»n trong Ä‘á»£t hiá»‡n táº¡i.`,
      };
    }

    if (match.type === 'CODE' || match.type === 'NAME' || match.score >= 0.92) {
      reservedUnitCodes.add(match.unitCode);
      return {
        ...baseItem,
        unitCode: match.unitCode,
        unitQuery: match.unitName,
        suggestedUnitCode: match.unitCode,
        suggestedUnitName: match.unitName,
        matchType: match.type,
        matchStatus: 'AUTO_FILLED',
        matchScore: match.score,
        matchReason: match.reason,
      };
    }

    if (match.score >= 0.82) {
      return {
        ...baseItem,
        unitQuery: match.unitName,
        suggestedUnitCode: match.unitCode,
        suggestedUnitName: match.unitName,
        matchType: match.type,
        matchStatus: 'NEEDS_CONFIRMATION',
        matchScore: match.score,
        matchReason: match.reason,
      };
    }

    return baseItem;
  });
}

function sanitizeStorageName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function uploadAcceptedDataFile(
  fileItem: PendingFile,
  projectId: string,
  unitCode: string,
  year: string,
  unitName: string,
) {
  const extension = fileItem.file.name.split('.').pop() || 'xlsx';
  const safeUnitName = sanitizeStorageName(unitName) || fileItem.unitCode;
  const fileName = `${unitCode}_${safeUnitName || fileItem.unitCode}.${extension}`;
  const renamedFile = new File([fileItem.file], fileName, {
    type: fileItem.file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const uploadResult = await uploadFile(renamedFile, {
    folder: `data_files/${projectId}`,
    fileName,
    upsert: true,
  });

  await upsertDataFileRecord({
    projectId,
    unitCode,
    unitName,
    year,
    fileName,
    storagePath: uploadResult.path,
    downloadURL: uploadResult.publicUrl,
  });
}

async function uploadOverwriteRequestFile(
  fileItem: PendingFile,
  projectId: string,
  unitCode: string,
  year: string,
  unitName: string,
) {
  const extension = fileItem.file.name.split('.').pop() || 'xlsx';
  const safeUnitName = sanitizeStorageName(unitName) || fileItem.unitCode;
  const fileName = `${unitCode}_${safeUnitName || fileItem.unitCode}_${year}_overwrite_request.${extension}`;
  const renamedFile = new File([fileItem.file], fileName, {
    type: fileItem.file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return uploadFile(renamedFile, {
    folder: `overwrite_requests/${projectId}`,
    fileName,
    upsert: true,
  });
}

function getFileUnitCode(item: PendingFile) {
  return item.unitCode || item.suggestedUnitCode || '';
}

export function ImportFiles({
  onDataImported,
  onDeleteUnitData,
  onDeleteYearData,
  onDeleteProjectData,
  projects,
  data,
  dataFiles,
  units,
  selectedProjectId,
  onSelectProject,
  templates,
  canManageData,
  isAuthenticated,
  isAdmin,
  assignments,
  currentUser,
}: {
  onDataImported: (rows: DataRow[]) => Promise<void>;
  onDeleteUnitData: (year: string, unitCode: string) => Promise<number>;
  onDeleteYearData: (year: string) => Promise<number>;
  onDeleteProjectData: (projectId: string) => Promise<number>;
  projects: Project[];
  data: Record<string, DataRow[]>;
  dataFiles: DataFileRecordSummary[];
  units: ManagedUnit[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  templates: FormTemplate[];
  canManageData: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  assignments: Record<string, string[]>;
  currentUser: UserProfile | null;
}) {
  const [selectedYear, setSelectedYear] = useState(getPreferredReportingYear());
  const [pinnedYear, setPinnedYear] = useState<string | null>(getPinnedYearPreference());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileValidation, setFileValidation] = useState<Record<string, FileValidationState>>({});
  const [selectedUnitToDelete, setSelectedUnitToDelete] = useState('');
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const [isManagingData, setIsManagingData] = useState(false);
  const [visibleFileFilter, setVisibleFileFilter] = useState<VisibleFileFilter>('ALL');
  const [lastFailedFiles, setLastFailedFiles] = useState<FailedFile[]>([]);
  const [operationProgress, setOperationProgress] = useState<OperationProgress | null>(null);
  const [importResultSummary, setImportResultSummary] = useState<ImportResultSummary | null>(null);
  const [overwriteRequests, setOverwriteRequests] = useState<OverwriteRequestRecord[]>([]);
  const [overwriteReviewNote, setOverwriteReviewNote] = useState<Record<string, string>>({});
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const isUnitUser = currentUser?.role === 'unit_user';

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const projectTemplates = useMemo(
    () => templates.filter((template) => template.projectId === selectedProjectId),
    [selectedProjectId, templates],
  );

  const publishedTemplates = useMemo(
    () => projectTemplates.filter((template) => template.isPublished),
    [projectTemplates],
  );

  const activeTemplates = useMemo(() => {
    if (!selectedTemplateId) {
      return publishedTemplates;
    }
    return publishedTemplates.filter((template) => template.id === selectedTemplateId);
  }, [publishedTemplates, selectedTemplateId]);

  const currentAssignmentKey = useMemo(() => getAssignmentKey(currentUser?.email), [currentUser?.email]);
  const currentAssignedUnitCodes = useMemo(
    () => (currentAssignmentKey ? assignments[currentAssignmentKey] || [] : []),
    [assignments, currentAssignmentKey],
  );

  const sortedUnits = useMemo(
    () => [...units].sort((left, right) => left.name.localeCompare(right.name, 'vi')),
    [units],
  );

  const scopedUnits = useMemo(() => {
    if (!isAuthenticated) {
      return [] as ManagedUnit[];
    }

    if (isUnitUser && currentUser?.unitCode) {
      return sortedUnits.filter((unit) => unit.code === currentUser.unitCode);
    }

    if (isAdmin) {
      return sortedUnits;
    }

    if (currentAssignedUnitCodes.length === 0) {
      return [] as ManagedUnit[];
    }

    const allowed = new Set(currentAssignedUnitCodes);
    return sortedUnits.filter((unit) => allowed.has(unit.code));
  }, [currentAssignedUnitCodes, currentUser?.unitCode, isAdmin, isAuthenticated, isUnitUser, sortedUnits]);

  const unitNameByCode = useMemo(
    () =>
      Object.fromEntries(
        sortedUnits.map((unit) => [unit.code, unit.name]),
      ) as Record<string, string>,
    [sortedUnits],
  );

  const rowsForYear = useMemo(() => {
    const rows = Object.values(data).flat();
    return rows.filter((row) => row.projectId === selectedProjectId && row.year === selectedYear);
  }, [data, selectedProjectId, selectedYear]);

  const unitCodesWithStoredData = useMemo(() => {
    const codes = new Set<string>();

    dataFiles.forEach((file) => {
      if (file.projectId === selectedProjectId && file.year === selectedYear && file.unitCode) {
        codes.add(file.unitCode);
      }
    });

    rowsForYear.forEach((row) => {
      if (row.unitCode) {
        codes.add(row.unitCode);
      }
    });

    return codes;
  }, [dataFiles, rowsForYear, selectedProjectId, selectedYear]);

  const unitIntakeStatuses = useMemo<IntakeUnitStatus[]>(() => {
    return scopedUnits
      .map((unit) => {
        const unitRows = rowsForYear.filter((row) => row.unitCode === unit.code);
        const isSubmitted = unitCodesWithStoredData.has(unit.code) || unitRows.length > 0;
        return {
          code: unit.code,
          name: unit.name,
          rowCount: unitRows.length,
          isSubmitted,
        };
      })
      .sort((left, right) => {
        if (left.isSubmitted !== right.isSubmitted) {
          return Number(left.isSubmitted) - Number(right.isSubmitted);
        }
        return left.name.localeCompare(right.name, 'vi');
      });
  }, [rowsForYear, scopedUnits, unitCodesWithStoredData]);

  const pendingUnits = useMemo(
    () => unitIntakeStatuses.filter((unit) => !unit.isSubmitted),
    [unitIntakeStatuses],
  );

  useEffect(() => {
    if (selectedTemplateId && !publishedTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(publishedTemplates[0]?.id || '');
    }
  }, [publishedTemplates, selectedTemplateId]);

  useEffect(() => {
    const currentPinned = getPinnedYearPreference();
    setPinnedYear(currentPinned);
    if (currentPinned && YEARS.includes(currentPinned)) {
      setSelectedYear(currentPinned);
    }
  }, []);

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    if (!selectedProjectId || !isAuthenticated) {
      setOverwriteRequests([]);
      return;
    }

    let cancelled = false;
    listOverwriteRequests(selectedProjectId)
      .then((items) => {
        if (!cancelled) {
          setOverwriteRequests(items);
        }
      })
      .catch((error) => {
        console.error('KhÃ´ng thá»ƒ táº£i yÃªu cáº§u ghi Ä‘Ã¨ dá»¯ liá»‡u:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, selectedProjectId]);

  useEffect(() => {
    let isCancelled = false;

    if (files.length === 0) {
      setFileValidation({});
      return undefined;
    }

    setFileValidation((current) => {
      const next = { ...current };
      files.forEach((item) => {
        next[item.id] = next[item.id] || {
          status: 'pending',
          missingSheets: [],
          matchedSheets: [],
        };
      });
      Object.keys(next).forEach((id) => {
        if (!files.some((item) => item.id === id)) {
          delete next[id];
        }
      });
      return next;
    });

    Promise.all(
      files.map(async (item) => {
        try {
          const buffer = await item.file.arrayBuffer();
          const workbook = XLSX.read(buffer, {
            type: 'array',
            cellFormula: true,
            cellHTML: false,
            cellText: false,
          });

          const validation = validateWorkbookSheetNames(workbook.SheetNames, activeTemplates);
          const matchedTemplates = resolveTemplatesForWorkbook(workbook);
          const matchedSheets = matchedTemplates.map((template) => template.sheetName);

          if (validation.missingSheets.length > 0) {
            return [
              item.id,
              {
                status: 'invalid',
                missingSheets: validation.missingSheets,
                matchedSheets,
                reason: 'Thiáº¿u biá»ƒu máº«u báº¯t buá»™c cá»§a dá»± Ã¡n.',
              } satisfies FileValidationState,
            ] as const;
          }

          if (matchedTemplates.length === 0) {
            return [
              item.id,
              {
                status: 'invalid',
                missingSheets: [],
                matchedSheets: [],
                reason: 'KhÃ´ng cÃ³ sheet nÃ o trÃ¹ng tÃªn biá»ƒu máº«u Ä‘Ã£ chá»‘t.',
              } satisfies FileValidationState,
            ] as const;
          }

          const signatureErrors = collectTemplateSignatureErrors(workbook, matchedTemplates);
          if (signatureErrors.length > 0) {
            return [
              item.id,
              {
                status: 'invalid',
                missingSheets: [],
                matchedSheets,
                reason: signatureErrors.map((item) => item.validation.reason).filter(Boolean).join(' | '),
              } satisfies FileValidationState,
            ] as const;
          }

          return [
            item.id,
            {
              status: 'valid',
              missingSheets: [],
              matchedSheets,
            } satisfies FileValidationState,
          ] as const;
        } catch (error) {
          return [
            item.id,
            {
              status: 'invalid',
              missingSheets: [],
              matchedSheets: [],
              reason: error instanceof Error ? error.message : 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c file Excel.',
            } satisfies FileValidationState,
          ] as const;
        }
      }),
    ).then((entries) => {
      if (isCancelled) {
        return;
      }

      setFileValidation((current) => {
        const next = { ...current };
        entries.forEach(([id, state]) => {
          next[id] = state;
        });
        return next;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [activeTemplates, files]);

  const appendFiles = (incomingFiles: FileList | File[]) => {
    let nextFiles = Array.from(incomingFiles).filter((file) => /\.(xlsx|xlsm|xls)$/i.test(file.name));
    if (nextFiles.length === 0) {
      return;
    }

    if (isUnitUser) {
      nextFiles = nextFiles.slice(0, 1);
    }

    setFiles((current) => {
      const seededFiles = buildPendingFiles(nextFiles, isUnitUser ? [] : current, scopedUnits, unitCodesWithStoredData).map((item) => {
        if (!isUnitUser || !currentUser?.unitCode) {
          return item;
        }

        return {
          ...item,
          unitCode: currentUser.unitCode,
          unitQuery: currentUser.unitName || unitNameByCode[currentUser.unitCode] || currentUser.unitCode,
          suggestedUnitCode: currentUser.unitCode,
          suggestedUnitName: currentUser.unitName || unitNameByCode[currentUser.unitCode] || currentUser.unitCode,
          matchType: 'MANUAL' as const,
          matchStatus: unitCodesWithStoredData.has(currentUser.unitCode) ? ('CONFLICT' as const) : ('MANUAL' as const),
          matchScore: 1,
          matchReason: unitCodesWithStoredData.has(currentUser.unitCode)
            ? 'ÄÆ¡n vá»‹ cá»§a tÃ i khoáº£n nÃ y Ä‘Ã£ cÃ³ dá»¯ liá»‡u trong dá»± Ã¡n/nÄƒm Ä‘ang chá»n. Ná»™p file má»›i sáº½ chuyá»ƒn sang yÃªu cáº§u ghi Ä‘Ã¨ chá» admin phÃª duyá»‡t.'
            : 'Há»‡ thá»‘ng tá»± gáº¯n Ä‘Æ¡n vá»‹ theo tÃ i khoáº£n Ä‘Äƒng nháº­p.',
        };
      });

      return isUnitUser ? seededFiles : [...current, ...seededFiles];
    });
    setManagementMessage(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      appendFiles(event.target.files);
      event.target.value = '';
    }
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      appendFiles(event.target.files);
      event.target.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((item) => item.id !== id));
    setFileValidation((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const updateUnit = (id: string, unitCode: string) => {
    setFiles((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (!unitCode) {
          return {
            ...item,
            unitCode: '',
            matchStatus: 'UNMATCHED',
            matchType: 'NONE',
            matchReason: 'ChÆ°a nháº­n diá»‡n Ä‘Æ°á»£c Ä‘Æ¡n vá»‹ tá»« tÃªn file.',
          };
        }

        const hasExistingData = unitCodesWithStoredData.has(unitCode);
        return {
          ...item,
          unitCode,
          unitQuery: unitNameByCode[unitCode] || '',
          matchType: 'MANUAL',
          matchStatus: hasExistingData ? 'CONFLICT' : 'MANUAL',
          matchReason: hasExistingData
            ? 'ÄÆ¡n vá»‹ nÃ y Ä‘Ã£ cÃ³ dá»¯ liá»‡u trong há»‡ thá»‘ng cho dá»± Ã¡n/nÄƒm Ä‘ang chá»n.'
            : 'NgÆ°á»i dÃ¹ng Ä‘Ã£ chá»n Ä‘Æ¡n vá»‹ thá»§ cÃ´ng.',
        };
      }),
    );
  };

  const updateUnitInput = (id: string, value: string) => {
    const normalizedValue = value.trim().toLowerCase();
    const takenUnitCodes = new Set(
      files.filter((item) => item.id !== id).map((item) => item.unitCode).filter(Boolean),
    );
    const availableUnitsForCurrentFile = scopedUnits.filter(
      (unit) => !unitCodesWithStoredData.has(unit.code) && !takenUnitCodes.has(unit.code),
    );
    const matchedUnit = availableUnitsForCurrentFile.find((unit) => {
      const matchesName = unit.name.trim().toLowerCase() === normalizedValue;
      const matchesCode = unit.code.trim().toLowerCase() === normalizedValue;
      return matchesName || matchesCode;
    });

    setFiles((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              unitQuery: value,
              unitCode: matchedUnit?.code || '',
              matchType: matchedUnit ? 'MANUAL' : item.matchType,
              matchStatus: matchedUnit ? 'MANUAL' : item.matchStatus,
              matchReason: matchedUnit
                ? 'NgÆ°á»i dÃ¹ng Ä‘Ã£ xÃ¡c nháº­n Ä‘Æ¡n vá»‹ báº±ng cÃ¡ch nháº­p trá»±c tiáº¿p.'
                : item.matchReason,
            }
          : item,
      ),
    );
  };

  const handleConfirmSuggested = () => {
    let confirmedCount = 0;
    const reserved = new Set<string>(Array.from(unitCodesWithStoredData));

    setFiles((current) =>
      current.map((item) => {
        if (item.matchStatus === 'NEEDS_CONFIRMATION' && item.suggestedUnitCode && !reserved.has(item.suggestedUnitCode)) {
          reserved.add(item.suggestedUnitCode);
          confirmedCount += 1;
          return {
            ...item,
            unitCode: item.suggestedUnitCode,
            unitQuery: item.suggestedUnitName,
            matchType: 'MANUAL',
            matchStatus: 'MANUAL',
            matchReason: 'ÄÃ£ xÃ¡c nháº­n tá»± Ä‘á»™ng tá»« gá»£i Ã½ há»£p lá»‡.',
          };
        }

        if (item.unitCode) {
          reserved.add(item.unitCode);
        }

        return item;
      }),
    );

    setManagementMessage(
      confirmedCount > 0
        ? `ÄÃ£ xÃ¡c nháº­n ${confirmedCount} gá»£i Ã½ há»£p lá»‡.`
        : 'KhÃ´ng cÃ³ gá»£i Ã½ há»£p lá»‡ nÃ o Ä‘á»ƒ xÃ¡c nháº­n thÃªm.',
    );
  };

  const exportFailedFiles = () => {
    if (lastFailedFiles.length === 0) {
      setManagementMessage('ChÆ°a cÃ³ danh sÃ¡ch file lá»—i Ä‘á»ƒ xuáº¥t.');
      return;
    }

    const rows = [
      ['TÃªn Ä‘Æ¡n vá»‹', 'TÃªn file', 'Thiáº¿u sheet', 'LÃ½ do', 'ÄÆ°á»ng dáº«n tÆ°Æ¡ng Ä‘á»‘i'],
      ...lastFailedFiles.map((item) => [
        item.unitName,
        item.fileName,
        item.missingSheets.join(', '),
        item.reason || '',
        item.relativePath || '',
      ]),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'File loi');
    XLSX.writeFile(workbook, `danh_sach_file_loi_${selectedProjectId || 'du_an'}.xlsx`);
    setManagementMessage('ÄÃ£ xuáº¥t danh sÃ¡ch file lá»—i ra Excel.');
  };

  const handleYearChange = (nextYear: string) => {
    setSelectedYear(nextYear);
    if (pinnedYear) {
      setPinnedYear(nextYear);
      setPinnedYearPreference(nextYear);
    }
  };

  const togglePinnedYear = () => {
    if (pinnedYear === selectedYear) {
      setPinnedYear(null);
      setPinnedYearPreference(null);
      return;
    }

    setPinnedYear(selectedYear);
    setPinnedYearPreference(selectedYear);
  };

  const resolveTemplatesForWorkbook = (workbook: XLSX.WorkBook) =>
    activeTemplates.filter((template) => workbook.SheetNames.includes(template.sheetName));

  const collectTemplateSignatureErrors = (workbook: XLSX.WorkBook, templatesToCheck: FormTemplate[]) =>
    templatesToCheck
      .map((template) => ({
        template,
        validation: validateTemplateSheetSignature(workbook, template),
      }))
      .filter((item) => !item.validation.isValid);

  const showProgress = (title: string, description: string, percent: number) => {
    setOperationProgress({
      visible: true,
      title,
      description,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      status: 'running',
    });
  };

  const completeProgress = (title: string, description: string) => {
    setOperationProgress({
      visible: true,
      title,
      description,
      percent: 100,
      status: 'done',
    });
  };

  const closeProgress = () => {
    setOperationProgress(null);
  };

  const closeImportResultSummary = () => {
    setImportResultSummary(null);
  };

  const parseRowsForTemplate = (workbook: XLSX.WorkBook, template: FormTemplate, unitCode: string, year: string) => {
    if (template.mode === 'LEGACY') {
      return parseLegacyFromWorkbook(
        workbook,
        unitCode,
        year,
        template.legacyConfigName || template.sheetName,
        template.projectId,
        template.id,
      );
    }

    return parseTemplateFromWorkbook(workbook, template, unitCode, year);
  };

  const refreshOverwriteRequests = async () => {
    if (!selectedProjectId || !isAuthenticated) {
      setOverwriteRequests([]);
      return;
    }

    const items = await listOverwriteRequests(selectedProjectId);
    setOverwriteRequests(items);
  };

  const handleReviewOverwriteRequest = async (
    request: OverwriteRequestRecord,
    decision: 'APPROVED' | 'REJECTED',
  ) => {
    if (!isAdmin || !currentUser) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      if (decision === 'APPROVED') {
        await onDeleteUnitData(request.year, request.unitCode);
        await upsertDataFileRecord({
          projectId: request.projectId,
          unitCode: request.unitCode,
          unitName: request.unitName,
          year: request.year,
          fileName: request.fileName,
          storagePath: request.storagePath,
          downloadURL: request.downloadURL || '',
        });
        await onDataImported(request.rowPayload || []);
      }

      await updateOverwriteRequestDecision({
        requestId: request.id,
        status: decision,
        reviewNote: overwriteReviewNote[request.id] || null,
        reviewedBy: {
          uid: currentUser.id,
          email: currentUser.email,
          displayName: currentUser.displayName,
        },
      });

      await refreshOverwriteRequests();
      setManagementMessage(
        decision === 'APPROVED'
          ? `ÄÃ£ phÃª duyá»‡t yÃªu cáº§u ghi Ä‘Ã¨ cho ${request.unitName} (${request.year}).`
          : `ÄÃ£ tá»« chá»‘i yÃªu cáº§u ghi Ä‘Ã¨ cho ${request.unitName} (${request.year}).`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ xá»­ lÃ½ yÃªu cáº§u ghi Ä‘Ã¨.');
    } finally {
      setIsManagingData(false);
    }
  };

  const processFiles = async () => {
    if (!currentProject) {
      setManagementMessage('Vui lÃ²ng chá»n dá»± Ã¡n trÆ°á»›c khi tiáº¿p nháº­n dá»¯ liá»‡u.');
      return;
    }

    if (publishedTemplates.length === 0) {
      const message =
        projectTemplates.length === 0
          ? 'Dá»± Ã¡n nÃ y chÆ°a cÃ³ biá»ƒu máº«u Ä‘á»ƒ tiáº¿p nháº­n dá»¯ liá»‡u.'
          : 'Dá»± Ã¡n nÃ y Ä‘Ã£ cÃ³ biá»ƒu máº«u nhÆ°ng chÆ°a chá»‘t máº«u nÃ o. HÃ£y vÃ o má»¥c Biá»ƒu máº«u Ä‘á»ƒ chá»‘t trÆ°á»›c khi tiáº¿p nháº­n dá»¯ liá»‡u.';
      setManagementMessage(message);
      return;
    }

    if (activeTemplates.length === 0) {
      setManagementMessage('Biá»ƒu máº«u Ä‘Ã£ chá»n khÃ´ng cÃ²n hiá»‡u lá»±c. Vui lÃ²ng chá»n láº¡i biá»ƒu máº«u cáº§n tiáº¿p nháº­n.');
      return;
    }

    if (files.length === 0) {
      setManagementMessage('Vui lÃ²ng chá»n Ã­t nháº¥t má»™t file Excel Ä‘á»ƒ tiáº¿p nháº­n.');
      return;
    }

    const importYear = selectedYear;
    setIsManagingData(true);
    setManagementMessage(null);
    setLastFailedFiles([]);
    showProgress('Äang tá»•ng há»£p dá»¯ liá»‡u', 'Äang chuáº©n bá»‹ Ä‘á»c cÃ¡c file Excel...', 3);

    try {
      const importedRows: DataRow[] = [];
      const failedFiles: FailedFile[] = [];
      const partialWarnings: string[] = [];
      const completedFileKeys = new Set<string>();
      let acceptedFiles = 0;
      const totalSelected = files.length;
      const totalFiles = Math.max(files.length, 1);

      for (const [index, fileItem] of files.entries()) {
        showProgress(
          'Äang tá»•ng há»£p dá»¯ liá»‡u',
          `Äang xá»­ lÃ½ file ${index + 1}/${files.length}: ${fileItem.file.name}`,
          5 + ((index + 0.25) / totalFiles) * 75,
        );
        const unitName = unitNameByCode[fileItem.unitCode] || fileItem.unitQuery || fileItem.file.name;

        if (!fileItem.unitCode) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: 'ChÆ°a xÃ¡c nháº­n Ä‘Æ¡n vá»‹ cho file nÃ y.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const validation = fileValidation[fileItem.id];
        if (validation?.status === 'invalid') {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: validation.missingSheets,
            reason: validation.reason,
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const buffer = await fileItem.file.arrayBuffer();
        const workbook = XLSX.read(buffer, {
          type: 'array',
          cellFormula: true,
          cellHTML: false,
          cellText: false,
        });
        showProgress(
          'Äang tá»•ng há»£p dá»¯ liá»‡u',
          `ÄÃ£ Ä‘á»c file ${index + 1}/${files.length}, Ä‘ang kiá»ƒm tra sheet vÃ  láº¥y dá»¯ liá»‡u...`,
          5 + ((index + 0.6) / totalFiles) * 75,
        );

        const sheetValidation = validateWorkbookSheetNames(workbook.SheetNames, activeTemplates);
        if (sheetValidation.missingSheets.length > 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: sheetValidation.missingSheets,
            reason: 'Thiáº¿u biá»ƒu máº«u báº¯t buá»™c cá»§a dá»± Ã¡n.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const matchedTemplates = resolveTemplatesForWorkbook(workbook);
        if (matchedTemplates.length === 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: 'KhÃ´ng cÃ³ sheet nÃ o trÃ¹ng tÃªn biá»ƒu máº«u Ä‘Ã£ chá»‘t.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const signatureErrors = collectTemplateSignatureErrors(workbook, matchedTemplates);
        if (signatureErrors.length > 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: signatureErrors.map((item) => item.validation.reason).filter(Boolean).join(' | '),
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const parsedRowsForFile: DataRow[] = [];
        const templateErrors: string[] = [];

        matchedTemplates.forEach((template) => {
          try {
            parsedRowsForFile.push(...parseRowsForTemplate(workbook, template, fileItem.unitCode, importYear));
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh.';
            templateErrors.push(`${template.name}: ${reason}`);
          }
        });

        if (parsedRowsForFile.length === 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason:
              templateErrors.length > 0
                ? `KhÃ´ng Ä‘á»c Ä‘Æ°á»£c dá»¯ liá»‡u tá»« biá»ƒu Ä‘Ã£ khá»›p. ${templateErrors.join(' | ')}`
                : 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c dá»¯ liá»‡u tá»« file.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const unitAlreadyHasData =
          unitCodesWithStoredData.has(fileItem.unitCode) ||
          rowsForYear.some((row) => row.unitCode === fileItem.unitCode);

        if (isUnitUser && unitAlreadyHasData) {
          try {
            const pendingUpload = await uploadOverwriteRequestFile(
              fileItem,
              selectedProjectId,
              fileItem.unitCode,
              importYear,
              unitName,
            );
            await createOverwriteRequest({
              projectId: selectedProjectId,
              projectName: currentProject.name,
              unitCode: fileItem.unitCode,
              unitName,
              year: importYear,
              fileName: fileItem.file.name,
              storagePath: pendingUpload.path,
              downloadURL: pendingUpload.publicUrl,
              rowPayload: parsedRowsForFile,
              requestedBy: currentUser
                ? {
                    uid: currentUser.id,
                    email: currentUser.email,
                    displayName: currentUser.displayName,
                  }
                : null,
              reviewNote: null,
            });
            partialWarnings.push(
              `${unitName} (${fileItem.file.name}) Ä‘Ã£ gá»­i yÃªu cáº§u ghi Ä‘Ã¨, chá» admin phÃª duyá»‡t trÆ°á»›c khi cáº­p nháº­t dá»¯ liá»‡u.`,
            );
            completedFileKeys.add(`${fileItem.file.name}__${fileItem.relativePath || ''}`);
          } catch (requestError) {
            failedFiles.push({
              unitName,
              fileName: fileItem.file.name,
              missingSheets: [],
              reason:
                requestError instanceof Error
                  ? requestError.message
                  : 'KhÃ´ng thá»ƒ táº¡o yÃªu cáº§u ghi Ä‘Ã¨ dá»¯ liá»‡u.',
              relativePath: fileItem.relativePath,
            });
          }
          continue;
        }

        importedRows.push(...parsedRowsForFile);
        try {
          await uploadAcceptedDataFile(fileItem, selectedProjectId, fileItem.unitCode, importYear, unitName);
        } catch (uploadError) {
          console.error('KhÃ´ng thá»ƒ upload file dá»¯ liá»‡u Ä‘Ã£ tiáº¿p nháº­n:', uploadError);
        }
        acceptedFiles += 1;
        completedFileKeys.add(`${fileItem.file.name}__${fileItem.relativePath || ''}`);
        showProgress(
          'Äang tá»•ng há»£p dá»¯ liá»‡u',
          `ÄÃ£ xá»­ lÃ½ ${index + 1}/${files.length} file. Äang tiáº¿p tá»¥c...`,
          5 + ((index + 1) / totalFiles) * 75,
        );

        if (templateErrors.length > 0) {
          partialWarnings.push(
            `${unitName} (${fileItem.file.name}) chá»‰ tiáº¿p nháº­n má»™t pháº§n. Bá» qua: ${templateErrors.join(' | ')}`,
          );
        }
      }

      if (importedRows.length > 0) {
        showProgress('Äang tá»•ng há»£p dá»¯ liá»‡u', 'Äang ghi dá»¯ liá»‡u tá»•ng há»£p vÃ o há»‡ thá»‘ng...', 90);
        await onDataImported(importedRows);
      }

      setLastFailedFiles(failedFiles);

      const summaryLines: string[] = [];
      if (acceptedFiles > 0) {
        summaryLines.push(`ÄÃ£ tiáº¿p nháº­n ${acceptedFiles} file há»£p lá»‡.`);
      }

      if (failedFiles.length > 0) {
        summaryLines.push('CÃ¡c file chÆ°a Ä‘Æ°á»£c tiáº¿p nháº­n:');
        failedFiles.forEach((item) => {
          const suffix = item.missingSheets.length > 0 ? ` - thiáº¿u sheet: ${item.missingSheets.join(', ')}` : '';
          summaryLines.push(`- ${item.unitName} (${item.fileName})${suffix}${item.reason ? ` - ${item.reason}` : ''}`);
        });
      }

      if (partialWarnings.length > 0) {
        summaryLines.push('CÃ¡c file tiáº¿p nháº­n má»™t pháº§n:');
        partialWarnings.forEach((warning) => {
          summaryLines.push(`- ${warning}`);
        });
      }

      if (summaryLines.length === 0) {
        summaryLines.push('KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u phÃ¹ há»£p trong cÃ¡c file Ä‘Ã£ chá»n.');
      }

      setManagementMessage(summaryLines.join('\n'));
      setImportResultSummary({
        visible: true,
        totalSelected,
        updatedCount: acceptedFiles,
        failedFiles,
        partialWarnings,
      });
      await refreshOverwriteRequests();
      closeProgress();

      if (completedFileKeys.size > 0) {
        setFiles((current) =>
          current.filter((item) => !completedFileKeys.has(`${item.file.name}__${item.relativePath || ''}`)),
        );
      }
    } catch (error) {
      closeProgress();
      setManagementMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ Ä‘á»c file Excel nÃ y.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteUnit = async () => {
    if (!selectedUnitToDelete) {
      setManagementMessage('Vui lÃ²ng chá»n Ä‘Æ¡n vá»‹ cáº§n xÃ³a dá»¯ liá»‡u.');
      return;
    }

    const yearToDelete = selectedYear;
    const unitName = unitNameByCode[selectedUnitToDelete] || selectedUnitToDelete;
    const confirmed = window.confirm(
      `XÃ³a toÃ n bá»™ dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹ "${unitName}" trong nÄƒm ${yearToDelete} thuá»™c dá»± Ã¡n hiá»‡n táº¡i?`,
    );
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteUnitData(yearToDelete, selectedUnitToDelete);
      setManagementMessage(
        deletedCount > 0
          ? `ÄÃ£ xÃ³a ${deletedCount} dÃ²ng dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹ ${unitName} trong nÄƒm ${yearToDelete}.`
          : `KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹ ${unitName} trong nÄƒm ${yearToDelete}.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ xÃ³a dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteYear = async () => {
    const yearToDelete = selectedYear;
    const confirmed = window.confirm(`XÃ³a toÃ n bá»™ dá»¯ liá»‡u Ä‘Ã£ lÆ°u cá»§a nÄƒm ${yearToDelete} trong dá»± Ã¡n hiá»‡n táº¡i?`);
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);
    showProgress('Äang xÃ³a dá»¯ liá»‡u theo nÄƒm', `Äang chuáº©n bá»‹ xÃ³a dá»¯ liá»‡u nÄƒm ${yearToDelete}...`, 10);

    try {
      showProgress('Äang xÃ³a dá»¯ liá»‡u theo nÄƒm', `Äang xÃ³a cÃ¡c dÃ²ng dá»¯ liá»‡u cá»§a nÄƒm ${yearToDelete}...`, 65);
      const deletedCount = await onDeleteYearData(yearToDelete);
      setManagementMessage(
        deletedCount > 0
          ? `ÄÃ£ xÃ³a ${deletedCount} dÃ²ng dá»¯ liá»‡u cá»§a nÄƒm ${yearToDelete}.`
          : `KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u nÃ o cá»§a nÄƒm ${yearToDelete} Ä‘á»ƒ xÃ³a.`,
      );
      completeProgress(
        'HoÃ n táº¥t xÃ³a dá»¯ liá»‡u theo nÄƒm',
        deletedCount > 0 ? `ÄÃ£ xá»­ lÃ½ xong dá»¯ liá»‡u nÄƒm ${yearToDelete}.` : `KhÃ´ng cÃ³ dá»¯ liá»‡u nÄƒm ${yearToDelete} Ä‘á»ƒ xÃ³a.`,
      );
    } catch (error) {
      closeProgress();
      setManagementMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ xÃ³a dá»¯ liá»‡u theo nÄƒm.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProject) {
      setManagementMessage('Vui lÃ²ng chá»n dá»± Ã¡n trÆ°á»›c khi xÃ³a dá»¯ liá»‡u.');
      return;
    }

    const confirmed = window.confirm(
      `XÃ³a toÃ n bá»™ dá»¯ liá»‡u, biá»ƒu máº«u, phÃ¢n cÃ´ng vÃ  lá»‹ch sá»­ xuáº¥t bÃ¡o cÃ¡o cá»§a dá»± Ã¡n "${currentProject.name}"?`,
    );
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);
    showProgress('Äang xÃ³a toÃ n bá»™ dá»± Ã¡n', `Äang chuáº©n bá»‹ xÃ³a dá»± Ã¡n "${currentProject.name}"...`, 5);

    try {
      showProgress('Äang xÃ³a toÃ n bá»™ dá»± Ã¡n', `Äang xÃ³a dá»¯ liá»‡u, biá»ƒu máº«u vÃ  file cá»§a dá»± Ã¡n "${currentProject.name}"...`, 70);
      const deletedCount = await onDeleteProjectData(currentProject.id);
      setManagementMessage(
        deletedCount > 0
          ? `ÄÃ£ xÃ³a dá»± Ã¡n "${currentProject.name}" vÃ  ${deletedCount - 1} báº£n ghi liÃªn quan.`
          : `KhÃ´ng thá»ƒ xÃ³a dá»± Ã¡n "${currentProject.name}".`,
      );
      completeProgress(
        deletedCount > 0 ? 'ÄÃ£ xÃ³a toÃ n bá»™ dá»± Ã¡n' : 'KhÃ´ng thá»ƒ xÃ³a dá»± Ã¡n',
        deletedCount > 0 ? `Dá»± Ã¡n "${currentProject.name}" Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½ xong.` : `KhÃ´ng thá»ƒ xÃ³a dá»± Ã¡n "${currentProject.name}".`,
      );
    } catch (error) {
      closeProgress();
      setManagementMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ xÃ³a dá»¯ liá»‡u cá»§a dá»± Ã¡n.');
    } finally {
      setIsManagingData(false);
    }
  };

  const visibleFiles = useMemo(() => {
    return files.filter((item) => {
      const validation = fileValidation[item.id];
      const fileUnitCode = getFileUnitCode(item);
      const hasExistingData = Boolean(fileUnitCode) && unitCodesWithStoredData.has(fileUnitCode);

      switch (visibleFileFilter) {
        case 'READY':
          return validation?.status === 'valid' && Boolean(item.unitCode);
        case 'NEEDS_CONFIRMATION':
          return (
            item.matchStatus === 'NEEDS_CONFIRMATION' ||
            item.matchStatus === 'UNMATCHED' ||
            item.matchStatus === 'CONFLICT'
          );
        case 'INVALID':
          return validation?.status === 'invalid';
        case 'WITH_EXISTING_DATA':
          return hasExistingData;
        default:
          return true;
      }
    });
  }, [fileValidation, files, unitCodesWithStoredData, visibleFileFilter]);

  const showExportErrors = lastFailedFiles.length > 0;

  return (
    <>
      <div className="space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="page-title">Tiáº¿p nháº­n dá»¯ liá»‡u</h2>
            <p className="page-subtitle mt-2">
              Chá»n dá»± Ã¡n, nÄƒm vÃ  biá»ƒu máº«u phÃ¹ há»£p Ä‘á»ƒ nháº­p dá»¯ liá»‡u Excel theo Ä‘Ãºng cáº¥u trÃºc Ä‘Ã£ phÃ¡t hÃ nh.
            </p>
          </div>
          {managementMessage && (
            <div className="flex max-w-2xl items-start gap-3 rounded-[20px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-soft)] shadow-[0_20px_60px_rgba(122,44,46,0.08)]">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span className="whitespace-pre-line">{managementMessage}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="panel-card min-w-0 rounded-[24px] p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="col-header">1. Dá»± Ã¡n</p>
                      <p className="page-subtitle mt-2 text-sm">
                        Chá»n Ä‘Ãºng dá»± Ã¡n Ä‘á»ƒ há»‡ thá»‘ng lá»c Ä‘Æ¡n vá»‹ chÆ°a tiáº¿p nháº­n vÃ  cÃ¡c biá»ƒu máº«u Ä‘Ã£ chá»‘t tÆ°Æ¡ng á»©ng.
                      </p>
                    </div>
                    {currentProject && (
                      <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        {currentProject.status === 'ACTIVE' ? 'Äang hoáº¡t Ä‘á»™ng' : 'ÄÃ£ hoÃ n thÃ nh'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full max-w-[360px] self-start lg:ml-6">
                  <div className="flex items-end justify-end gap-3">
                    <div className="min-w-[180px]">
                      <div className="mb-1 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
                        NÄƒm
                      </div>
                      <select
                        value={selectedYear}
                        onChange={(event) => handleYearChange(event.target.value)}
                        className="h-11 w-full border-0 border-b-2 border-[var(--brand)] bg-transparent px-0 text-right text-2xl font-semibold text-[var(--ink)] focus:outline-none"
                      >
                        {YEARS.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--ink-soft)]">
                    <input type="checkbox" checked={pinnedYear === selectedYear} onChange={togglePinnedYear} />
                    <span>Ghim nÄƒm nÃ y cho láº§n nháº­p sau</span>
                  </label>
                </div>
              </div>

            <div className="-mx-1 mt-4 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
              {projects.map((project) => {
                const isActive = project.id === selectedProjectId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className={`min-w-[220px] max-w-full rounded-[18px] border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-[var(--brand)] bg-[var(--primary-soft)] shadow-[0_12px_30px_rgba(122,44,46,0.10)]'
                        : 'border-[var(--line)] bg-white hover:border-[var(--brand)] hover:bg-[var(--surface-soft)]'
                    }`}
                  >
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{project.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--ink-soft)]">
                      {project.description || 'ChÆ°a cÃ³ mÃ´ táº£ dá»± Ã¡n.'}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    ÄÆ¡n vá»‹ chÆ°a tiáº¿p nháº­n
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                    {pendingUnits.length} Ä‘Æ¡n vá»‹
                  </p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                  {selectedYear}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                Danh sÃ¡ch nÃ y dÃ¹ng cÃ¹ng logic vá»›i Nháº­t kÃ½ vÃ  tá»± lá»c theo dá»± Ã¡n, nÄƒm vÃ  phÃ¢n quyá»n theo dÃµi.
              </p>
              <div className="mt-3 max-h-52 space-y-2 overflow-auto pr-1">
                {pendingUnits.length > 0 ? (
                  pendingUnits.map((unit) => (
                    <div
                      key={unit.code}
                      className="flex items-center justify-between rounded-[16px] border border-[var(--line)] bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">{unit.name}</p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          {unit.code}
                        </p>
                      </div>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                        ChÆ°a tiáº¿p nháº­n
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[var(--line)] bg-white px-3 py-4 text-sm text-[var(--ink-soft)]">
                    {isUnitUser
                      ? 'Đơn vị của bạn đã có dữ liệu trong dự án/năm đang chọn hoặc không còn mục chưa tiếp nhận.'
                      : !isAdmin && currentAssignedUnitCodes.length === 0
                      ? 'TÃ i khoáº£n nÃ y chÆ°a Ä‘Æ°á»£c phÃ¢n cÃ´ng Ä‘Æ¡n vá»‹ theo dÃµi cho luá»“ng tiáº¿p nháº­n.'
                      : 'KhÃ´ng cÃ²n Ä‘Æ¡n vá»‹ nÃ o chÆ°a tiáº¿p nháº­n trong dá»± Ã¡n/nÄƒm Ä‘ang chá»n.'}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>

          <div className="panel-card rounded-[24px] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="col-header">2. Biá»ƒu máº«u</p>
                <p className="page-subtitle mt-2 text-sm">
                  {selectedTemplateId
                    ? 'Há»‡ thá»‘ng Ä‘ang Ä‘á»‘i chiáº¿u theo biá»ƒu máº«u báº¡n chá»n. File chá»‰ Ä‘Æ°á»£c nháº­n khi cÃ³ Ä‘Ãºng sheet báº¯t buá»™c cá»§a biá»ƒu nÃ y.'
                    : 'Khi tiáº¿p nháº­n, há»‡ thá»‘ng sáº½ Ä‘á»‘i chiáº¿u toÃ n bá»™ biá»ƒu máº«u Ä‘Ã£ chá»‘t cá»§a dá»± Ã¡n. File chá»‰ Ä‘Æ°á»£c nháº­n khi Ä‘á»§ 100% sheet báº¯t buá»™c; cÃ¡c sheet thá»«a sáº½ tá»± bá» qua.'}
                </p>
              </div>
            </div>

            <div className="-mx-1 mt-4 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setSelectedTemplateId('')}
                className={`relative rounded-[18px] border px-4 py-3 text-left text-sm font-semibold transition ${
                  !selectedTemplateId
                    ? 'border-[var(--brand)] bg-[var(--brand)] text-white shadow-[0_14px_34px_rgba(122,44,46,0.22)]'
                    : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--brand)] hover:bg-[var(--surface-soft)]'
                }`}
              >
                {!selectedTemplateId && (
                  <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[var(--brand)]">
                    <CheckCircle2 size={14} />
                  </span>
                )}
                <span className="pr-7">Táº¥t cáº£ biá»ƒu máº«u Ä‘Ã£ chá»‘t</span>
              </button>
              {publishedTemplates.map((template) => {
                const isActive = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`relative min-w-[220px] max-w-full rounded-[18px] border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-[var(--brand)] bg-[var(--brand)] text-white shadow-[0_14px_34px_rgba(122,44,46,0.24)]'
                        : 'border-[var(--line)] bg-white hover:border-[var(--brand)] hover:bg-[var(--surface-soft)]'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[var(--brand)]">
                        <CheckCircle2 size={14} />
                      </span>
                    )}
                    <p className={`truncate pr-7 text-sm font-semibold ${isActive ? 'text-white' : 'text-[var(--ink)]'}`}>{template.name}</p>
                    <p className={`mt-1 text-xs ${isActive ? 'text-white/80' : 'text-[var(--ink-soft)]'}`}>{template.sheetName}</p>
                  </button>
                );
              })}
            </div>

            {publishedTemplates.length === 0 && (
              <div className="mt-4 rounded-[16px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--ink-soft)]">
                Dá»± Ã¡n nÃ y chÆ°a cÃ³ biá»ƒu máº«u Ä‘Ã£ chá»‘t Ä‘á»ƒ tiáº¿p nháº­n dá»¯ liá»‡u.
              </div>
            )}
          </div>

          {canManageData && (
            <div className="panel-card rounded-[24px] p-5">
              <p className="col-header mb-3">3. Quáº£n trá»‹ dá»¯ liá»‡u theo nÄƒm</p>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                <select
                  value={selectedUnitToDelete}
                  onChange={(event) => setSelectedUnitToDelete(event.target.value)}
                  className="field-input h-11 text-base font-semibold"
                >
                  <option value="">-- Chá»n Ä‘Æ¡n vá»‹ --</option>
                  {scopedUnits.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.name} ({unit.code})
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <button
                    onClick={handleDeleteUnit}
                    disabled={isManagingData || !selectedUnitToDelete}
                    className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    XÃ³a dá»¯ liá»‡u theo Ä‘Æ¡n vá»‹
                  </button>
                  <button
                    onClick={handleDeleteYear}
                    disabled={isManagingData}
                    className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    XÃ³a dá»¯ liá»‡u theo nÄƒm
                  </button>
                  <button
                    onClick={handleDeleteProject}
                    disabled={isManagingData || !currentProject}
                    className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    XÃ³a toÃ n bá»™ dá»± Ã¡n hiá»‡n táº¡i
                  </button>
                </div>
              </div>
            </div>
          )}

          {canManageData && overwriteRequests.some((request) => request.status === 'PENDING') && (
            <div className="panel-card rounded-[24px] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="col-header">4. Phê duyệt ghi đè dữ liệu</p>
                  <p className="page-subtitle mt-2 text-sm">
                    Đơn vị đã có dữ liệu muốn nộp lại file sẽ được đưa vào danh sách chờ phê duyệt. Admin duyệt tại đây để thay thế dữ liệu cũ.
                  </p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                  {overwriteRequests.filter((request) => request.status === 'PENDING').length} yêu cầu chờ duyệt
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {overwriteRequests
                  .filter((request) => request.status === 'PENDING')
                  .map((request) => (
                    <div key={request.id} className="rounded-[20px] border border-amber-200 bg-amber-50/40 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-[var(--ink)]">{request.unitName}</p>
                          <p className="mt-1 text-xs text-[var(--ink-soft)]">
                            {request.fileName} • {request.year} • {request.projectName || currentProject?.name || request.projectId}
                          </p>
                          <p className="mt-2 text-xs text-[var(--ink-soft)]">
                            Người gửi: {request.requestedBy?.displayName || request.requestedBy?.email || 'Chưa xác định'}
                          </p>
                        </div>
                        <div className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          Chờ phê duyệt
                        </div>
                      </div>

                      <textarea
                        value={overwriteReviewNote[request.id] || ''}
                        onChange={(event) =>
                          setOverwriteReviewNote((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        placeholder="Ghi chú phê duyệt / từ chối"
                        className="mt-3 field-input min-h-[88px] py-3"
                      />

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleReviewOverwriteRequest(request, 'APPROVED')}
                          disabled={isManagingData}
                          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Phê duyệt ghi đè
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewOverwriteRequest(request, 'REJECTED')}
                          disabled={isManagingData}
                          className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Từ chối
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="panel-card rounded-[28px] border border-dashed border-[var(--line)] p-4">
          <div className={`grid grid-cols-1 gap-3 ${isUnitUser ? "" : "md:grid-cols-2"}`}>
            <label className="flex min-h-[116px] cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-5 text-center transition hover:border-[var(--brand)] hover:bg-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)]">
                <Upload size={18} />
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Kéo thả hoặc bấm để chọn file</p>
              <p className="page-subtitle mt-1 text-xs">
                {isUnitUser ? "Tài khoản đơn vị chỉ nộp 1 file và hệ thống tự gắn đúng đơn vị đăng nhập." : "Phù hợp khi nhận từng file lẻ."}
              </p>
              <input type="file" multiple={!isUnitUser} accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFileChange} />
            </label>

            {!isUnitUser && (
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="flex min-h-[116px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-5 text-center transition hover:border-[var(--brand)] hover:bg-white"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)]">
                  <FolderOpen size={18} />
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Chọn cả thư mục dữ liệu</p>
                <p className="page-subtitle mt-1 text-xs">Hệ thống sẽ gợi ý đơn vị từ tên file trong thư mục.</p>
              </button>
            )}
          </div>

          {!isUnitUser && (
            <input ref={folderInputRef} type="file" multiple accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFolderChange} />
          )}
        </div>

        {files.length > 0 && (
          <div className="panel-card rounded-[28px] p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="section-title">Danh sÃ¡ch file chá» tiáº¿p nháº­n</h3>
                <p className="page-subtitle mt-2 text-sm">
                  {isUnitUser
                    ? 'Hệ thống tự gắn đơn vị theo tài khoản đăng nhập và chỉ nhận 1 file mỗi lần gửi.'
                    : 'Há»‡ thá»‘ng Ä‘Ã£ cá»‘ gáº¯ng tá»± nháº­n diá»‡n Ä‘Æ¡n vá»‹ tá»« tÃªn file. Báº¡n chá»‰ cáº§n rÃ  láº¡i cÃ¡c file cáº§n xÃ¡c nháº­n.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isUnitUser && (
                  <>
                    <select
                      value={visibleFileFilter}
                      onChange={(event) => setVisibleFileFilter(event.target.value as VisibleFileFilter)}
                      className="field-input h-10 min-w-[250px] text-sm font-semibold"
                    >
                      <option value="ALL">Hiá»‡n táº¥t cáº£ file</option>
                      <option value="READY">Chá»‰ hiá»‡n file Ä‘Ã£ sáºµn sÃ ng</option>
                      <option value="NEEDS_CONFIRMATION">Chá»‰ hiá»‡n file cáº§n xÃ¡c nháº­n</option>
                      <option value="WITH_EXISTING_DATA">ÄÆ¡n vá»‹ Ä‘Ã£ cÃ³ dá»¯ liá»‡u</option>
                      <option value="INVALID">Chá»‰ hiá»‡n file lá»—i sheet</option>
                    </select>
                    <button onClick={handleConfirmSuggested} className="secondary-btn">
                      XÃ¡c nháº­n táº¥t cáº£ gá»£i Ã½ há»£p lá»‡
                    </button>
                  </>
                )}
                <button onClick={exportFailedFiles} disabled={!showExportErrors} className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40">
                  Xuáº¥t danh sÃ¡ch file lá»—i
                </button>
                <button onClick={processFiles} disabled={isManagingData} className="primary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40">
                  {isManagingData ? <LoaderCircle size={16} className="animate-spin" /> : <FileCheck size={16} />}
                  Báº¯t Ä‘áº§u tá»•ng há»£p
                </button>
              </div>
            </div>

            {!isUnitUser && (
              <div className="mb-4 rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--ink-soft)]">
                Bá»™ lá»c <strong>ÄÆ¡n vá»‹ Ä‘Ã£ cÃ³ dá»¯ liá»‡u</strong> Ä‘ang dÃ¹ng cÃ¹ng Ä‘iá»u kiá»‡n vá»›i Nháº­t kÃ½:
                dá»± Ã¡n hiá»‡n táº¡i, nÄƒm Ä‘ang chá»n, Ä‘Æ¡n vá»‹ trong pháº¡m vi phÃ¢n quyá»n, vÃ  tá»“n táº¡i dá»¯ liá»‡u trong <code>data_files</code> hoáº·c <code>consolidated_rows</code>.
              </div>
            )}

            <div className="space-y-4">
              {visibleFiles.map((item) => {
                const validation = fileValidation[item.id];
                const takenUnitCodes = new Set(files.filter((fileItem) => fileItem.id !== item.id).map((fileItem) => fileItem.unitCode).filter(Boolean));
                const availableUnits = scopedUnits.filter(
                  (unit) => unit.code === item.unitCode || (!takenUnitCodes.has(unit.code) && !unitCodesWithStoredData.has(unit.code)),
                );
                const suggestions = item.unitQuery.trim()
                  ? availableUnits.filter((unit) => {
                      const keyword = item.unitQuery.trim().toLowerCase();
                      return unit.name.toLowerCase().includes(keyword) || unit.code.toLowerCase().includes(keyword);
                    })
                  : availableUnits.slice(0, 12);

                return (
                  <div
                    key={item.id}
                    className={`rounded-[24px] border p-4 ${
                      validation?.status === 'invalid'
                        ? 'border-red-200 bg-red-50/50'
                        : item.matchStatus === 'NEEDS_CONFIRMATION' || item.matchStatus === 'UNMATCHED' || item.matchStatus === 'CONFLICT'
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-[var(--line)] bg-[var(--surface-soft)]'
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[var(--ink)]">{item.file.name}</p>
                        <p className="page-subtitle mt-1 text-sm">
                          {(item.file.size / 1024).toFixed(1)} KB{item.relativePath ? ` - ${item.relativePath}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getMatchBadgeTone(item)}`}>
                          {getMatchBadgeLabel(item)}
                        </span>
                        {validation?.status === 'valid' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={12} />
                            File há»£p lá»‡
                          </span>
                        )}
                        <button
                          onClick={() => removeFile(item.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                        >
                          <X size={14} />
                          Bá» file
                        </button>
                      </div>
                    </div>
                    {isUnitUser ? (
                      <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">Đơn vị nộp dữ liệu</p>
                        <p className="mt-2 text-base font-semibold text-[var(--ink)]">{item.unitQuery || currentUser?.unitName || currentUser?.unitCode || "Chưa xác định"}</p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">Hệ thống tự gắn đơn vị theo tài khoản đăng nhập, không cần chọn lại.</p>
                      </div>
                    ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div>
                        <input
                          value={item.unitQuery}
                          onChange={(event) => updateUnitInput(item.id, event.target.value)}
                          list={`unit-suggestions-${item.id}`}
                          className="field-input h-11 text-base font-medium"
                          placeholder="G? t?n ??n v? ?? g?i ?"
                        />
                        <datalist id={`unit-suggestions-${item.id}`}>
                          {suggestions.map((unit) => (
                            <option key={unit.code} value={unit.name}>
                              {unit.code}
                            </option>
                          ))}
                        </datalist>
                      </div>

                      <select value={item.unitCode} onChange={(event) => updateUnit(item.id, event.target.value)} className="field-input h-11 text-base font-medium">
                        <option value="">-- Ho?c ch?n nhanh ??n v? --</option>
                        {availableUnits.map((unit) => (
                          <option key={unit.code} value={unit.code}>
                            {unit.name} ({unit.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    )}

                    <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm">
                      <p className="font-semibold text-[var(--ink)]">{item.matchReason}</p>
                      {item.suggestedUnitCode && (
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          Gá»£i Ã½: {item.suggestedUnitName} ({item.suggestedUnitCode})
                        </p>
                      )}
                      {validation?.status === 'valid' && (
                        <p className="mt-2 text-xs text-emerald-700">
                          File há»£p lá»‡. ÄÃ£ nháº­n Ä‘á»§ cÃ¡c sheet báº¯t buá»™c: {validation.matchedSheets.join(', ')}
                        </p>
                      )}
                      {validation?.status === 'invalid' && (
                        <>
                          {validation.missingSheets.length > 0 && (
                            <p className="mt-2 text-xs text-red-700">Thiáº¿u sheet: {validation.missingSheets.join(', ')}</p>
                          )}
                          {validation.reason && <p className="mt-2 text-xs text-red-700">{validation.reason}</p>}
                        </>
                      )}
                      {(!validation || validation.status === 'pending') && (
                        <p className="mt-2 text-xs text-[var(--ink-soft)]">Äang kiá»ƒm tra cáº¥u trÃºc file...</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {operationProgress?.visible && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(33,25,17,0.35)] px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-[var(--line)] bg-white p-6 shadow-[0_30px_90px_rgba(38,31,18,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">Tiáº¿n Ä‘á»™ xá»­ lÃ½</p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">{operationProgress.title}</h3>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">{operationProgress.description}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-full ${operationProgress.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--surface-soft)] text-[var(--brand)]'}`}>
                {operationProgress.status === 'done' ? <CheckCircle2 size={22} /> : <LoaderCircle size={22} className="animate-spin" />}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-sm font-semibold text-[var(--ink)]">
                <span>HoÃ n thÃ nh</span>
                <span>{operationProgress.percent}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--surface-soft)]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${operationProgress.status === 'done' ? 'bg-emerald-500' : 'bg-[var(--brand)]'}`}
                  style={{ width: `${operationProgress.percent}%` }}
                />
              </div>
            </div>

            {operationProgress.status === 'done' && (
              <div className="mt-6 flex justify-end">
                <button type="button" onClick={closeProgress} className="primary-btn">
                  ÄÃ£ hiá»ƒu
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {importResultSummary?.visible && (
        <div className="fixed inset-0 z-[81] flex items-center justify-center bg-[rgba(33,25,17,0.42)] px-4 py-6">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-[var(--line)] bg-white shadow-[0_30px_90px_rgba(38,31,18,0.24)]">
            <div className="border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">Káº¿t quáº£ tiáº¿p nháº­n</p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Tá»•ng há»£p file Ä‘Ã£ hoÃ n táº¥t</h3>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    ÄÃ£ cáº­p nháº­t {importResultSummary.updatedCount}/{importResultSummary.totalSelected} Ä‘Æ¡n vá»‹ Ä‘Æ°á»£c chá»n.
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={22} />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">ÄÃ£ cáº­p nháº­t</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-800">{importResultSummary.updatedCount}</p>
                </div>
                <div className="rounded-[18px] border border-[var(--line)] bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">ÄÃ£ chá»n</p>
                  <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{importResultSummary.totalSelected}</p>
                </div>
                <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">KhÃ´ng cáº­p nháº­t Ä‘Æ°á»£c</p>
                  <p className="mt-2 text-2xl font-bold text-amber-800">{importResultSummary.failedFiles.length}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
              {importResultSummary.failedFiles.length > 0 ? (
                <div>
                  <h4 className="text-sm font-semibold text-[var(--ink)]">Danh sÃ¡ch Ä‘Æ¡n vá»‹ khÃ´ng cáº­p nháº­t Ä‘Æ°á»£c</h4>
                  <div className="mt-3 space-y-3">
                    {importResultSummary.failedFiles.map((item, index) => (
                      <div key={`${item.fileName}-${item.relativePath || ''}-${index}`} className="rounded-[20px] border border-amber-200 bg-amber-50/50 px-4 py-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink)]">{item.unitName}</p>
                            <p className="mt-1 break-all text-xs text-[var(--ink-soft)]">{item.fileName}</p>
                            {item.relativePath && <p className="mt-1 break-all text-[11px] text-[var(--ink-soft)]">{item.relativePath}</p>}
                          </div>
                          <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                            KhÃ´ng cáº­p nháº­t
                          </div>
                        </div>
                        {item.missingSheets.length > 0 && (
                          <p className="mt-3 text-xs font-medium text-amber-800">
                            Thiáº¿u sheet: {item.missingSheets.join(', ')}
                          </p>
                        )}
                        {item.reason && (
                          <p className="mt-2 text-xs text-amber-900">
                            LÃ½ do: {item.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm font-medium text-emerald-800">
                  Táº¥t cáº£ cÃ¡c Ä‘Æ¡n vá»‹ Ä‘Ã£ chá»n Ä‘á»u Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t thÃ nh cÃ´ng.
                </div>
              )}

              {importResultSummary.partialWarnings.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[var(--ink)]">CÃ¡c Ä‘Æ¡n vá»‹ tiáº¿p nháº­n má»™t pháº§n</h4>
                  <div className="mt-3 space-y-3">
                    {importResultSummary.partialWarnings.map((warning, index) => (
                      <div key={`partial-warning-${index}`} className="rounded-[20px] border border-blue-200 bg-blue-50/60 px-4 py-4 text-sm text-blue-900">
                        {warning}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-[var(--line)] px-6 py-4">
              <button type="button" onClick={closeImportResultSummary} className="primary-btn">
                ÄÃ£ hiá»ƒu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

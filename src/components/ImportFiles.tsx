import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileCheck, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react';
import { YEARS } from '../constants';
import { DataRow, FormTemplate, ManagedUnit, Project } from '../types';
import { db } from '../firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { parseLegacyFromWorkbook, parseTemplateFromWorkbook } from '../utils/excelParser';
import { getPinnedYearPreference, getPreferredReportingYear, setPinnedYearPreference } from '../utils/reportingYear';
import { validateWorkbookSheetNames } from '../utils/workbookUtils';
import { uploadFile } from '../supabase';

type FileMatchType = 'CODE' | 'NAME' | 'FUZZY' | 'MANUAL' | 'NONE';
type FileMatchStatus = 'AUTO_FILLED' | 'NEEDS_CONFIRMATION' | 'MANUAL' | 'UNMATCHED' | 'CONFLICT';
type VisibleFileFilter = 'ALL' | 'READY' | 'NEEDS_CONFIRMATION' | 'INVALID';

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
      reason: `Khớp theo mã đơn vị ${codeMatch.code}.`,
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
        reason: 'Khớp mạnh theo tên đơn vị.',
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
      reason: `Gợi ý gần đúng ${Math.round(score * 100)}%.`,
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
      if (fileItem.matchType === 'CODE') return 'Đã tự điền theo mã';
      if (fileItem.matchType === 'NAME') return 'Đã tự điền theo tên';
      return 'Đã tự điền';
    case 'NEEDS_CONFIRMATION':
      return `Cần xác nhận ${Math.round(fileItem.matchScore * 100)}%`;
    case 'MANUAL':
      return 'Đã chọn thủ công';
    case 'CONFLICT':
      return 'Trùng đơn vị đã có dữ liệu';
    default:
      return 'Chưa nhận diện';
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
  importedUnitCodesForProject: Set<string>,
): PendingFile[] {
  const reservedUnitCodes = new Set([
    ...Array.from(importedUnitCodesForProject),
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
      matchReason: 'Chưa nhận diện được đơn vị từ tên file.',
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
        matchReason: `${match.reason} Đơn vị này đã có dữ liệu hoặc đã được chọn trong đợt hiện tại.`,
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

function buildDataFileDocumentId(projectId: string, unitCode: string, year: string) {
  return `${projectId}_${unitCode}_${year}`;
}

async function uploadAcceptedDataFile(
  fileItem: PendingFile,
  projectId: string,
  year: string,
  unitName: string,
) {
  const extension = fileItem.file.name.split('.').pop() || 'xlsx';
  const safeUnitName = sanitizeStorageName(unitName) || fileItem.unitCode;
  const fileName = `${safeUnitName || fileItem.unitCode}.${extension}`;
  const renamedFile = new File([fileItem.file], fileName, {
    type: fileItem.file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const uploadResult = await uploadFile(renamedFile, {
    folder: `app_data/${projectId}`,
    fileName,
    upsert: true,
  });

  await setDoc(
    doc(db, 'data_files', buildDataFileDocumentId(projectId, fileItem.unitCode, year)),
    {
      projectId,
      unitCode: fileItem.unitCode,
      unitName,
      year,
      fileName,
      storagePath: uploadResult.path,
      downloadURL: uploadResult.publicUrl,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function ImportFiles({
  onDataImported,
  onDeleteUnitData,
  onDeleteYearData,
  onDeleteProjectData,
  projects,
  data,
  units,
  selectedProjectId,
  onSelectProject,
  templates,
  canManageData,
}: {
  onDataImported: (rows: DataRow[]) => Promise<void>;
  onDeleteUnitData: (year: string, unitCode: string) => Promise<number>;
  onDeleteYearData: (year: string) => Promise<number>;
  onDeleteProjectData: (projectId: string) => Promise<number>;
  projects: Project[];
  data: Record<string, DataRow[]>;
  units: ManagedUnit[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  templates: FormTemplate[];
  canManageData: boolean;
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
  const folderInputRef = useRef<HTMLInputElement | null>(null);

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

  const sortedUnits = useMemo(
    () => [...units].sort((left, right) => left.name.localeCompare(right.name, 'vi')),
    [units],
  );

  const unitNameByCode = useMemo(
    () =>
      Object.fromEntries(
        sortedUnits.map((unit) => [unit.code, unit.name]),
      ) as Record<string, string>,
    [sortedUnits],
  );

  const importedUnitCodesForProject = useMemo(() => {
    const codes = new Set<string>();
    Object.values(data).forEach((rows) => {
      rows.forEach((row) => {
        if (row.projectId === selectedProjectId && row.unitCode) {
          codes.add(row.unitCode);
        }
      });
    });
    return codes;
  }, [data, selectedProjectId]);

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
          const matchedSheets = activeTemplates
            .filter((template) => workbook.SheetNames.includes(template.sheetName))
            .map((template) => template.sheetName);

          if (validation.missingSheets.length > 0) {
            return [
              item.id,
              {
                status: 'invalid',
                missingSheets: validation.missingSheets,
                matchedSheets,
                reason: 'Thiếu biểu mẫu bắt buộc của dự án.',
              } satisfies FileValidationState,
            ] as const;
          }

          if (matchedSheets.length === 0) {
            return [
              item.id,
              {
                status: 'invalid',
                missingSheets: [],
                matchedSheets: [],
                reason: 'Không có sheet nào trùng tên biểu mẫu đã chốt.',
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
              reason: error instanceof Error ? error.message : 'Không đọc được file Excel.',
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
    const nextFiles = Array.from(incomingFiles).filter((file) => /\.(xlsx|xlsm|xls)$/i.test(file.name));
    if (nextFiles.length === 0) {
      return;
    }

    setFiles((current) => [
      ...current,
      ...buildPendingFiles(nextFiles, current, sortedUnits, importedUnitCodesForProject),
    ]);
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
            matchReason: 'Chưa nhận diện được đơn vị từ tên file.',
          };
        }

        return {
          ...item,
          unitCode,
          unitQuery: unitNameByCode[unitCode] || '',
          matchType: 'MANUAL',
          matchStatus: 'MANUAL',
          matchReason: 'Người dùng đã chọn đơn vị thủ công.',
        };
      }),
    );
  };

  const updateUnitInput = (id: string, value: string) => {
    const normalizedValue = value.trim().toLowerCase();
    const takenUnitCodes = new Set(
      files.filter((item) => item.id !== id).map((item) => item.unitCode).filter(Boolean),
    );
    const availableUnitsForCurrentFile = sortedUnits.filter(
      (unit) => !importedUnitCodesForProject.has(unit.code) && !takenUnitCodes.has(unit.code),
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
                ? 'Người dùng đã xác nhận đơn vị bằng cách nhập trực tiếp.'
                : item.matchReason,
            }
          : item,
      ),
    );
  };

  const handleConfirmSuggested = () => {
    let confirmedCount = 0;
    const reserved = new Set<string>(Array.from(importedUnitCodesForProject));

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
            matchReason: 'Đã xác nhận tự động từ gợi ý hợp lệ.',
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
        ? `Đã xác nhận ${confirmedCount} gợi ý hợp lệ.`
        : 'Không có gợi ý hợp lệ nào để xác nhận thêm.',
    );
  };

  const exportFailedFiles = () => {
    if (lastFailedFiles.length === 0) {
      setManagementMessage('Chưa có danh sách file lỗi để xuất.');
      return;
    }

    const rows = [
      ['Tên đơn vị', 'Tên file', 'Thiếu sheet', 'Lý do', 'Đường dẫn tương đối'],
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
    setManagementMessage('Đã xuất danh sách file lỗi ra Excel.');
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

  const parseRowsForTemplate = (workbook: XLSX.WorkBook, template: FormTemplate, unitCode: string) => {
    if (template.mode === 'LEGACY') {
      return parseLegacyFromWorkbook(
        workbook,
        unitCode,
        selectedYear,
        template.legacyConfigName || template.sheetName,
        template.projectId,
        template.id,
      );
    }

    return parseTemplateFromWorkbook(workbook, template, unitCode, selectedYear);
  };

  const processFiles = async () => {
    if (!currentProject) {
      setManagementMessage('Vui lòng chọn dự án trước khi tiếp nhận dữ liệu.');
      return;
    }

    if (publishedTemplates.length === 0) {
      const message =
        projectTemplates.length === 0
          ? 'Dự án này chưa có biểu mẫu để tiếp nhận dữ liệu.'
          : 'Dự án này đã có biểu mẫu nhưng chưa chốt mẫu nào. Hãy vào mục Biểu mẫu để chốt trước khi tiếp nhận dữ liệu.';
      setManagementMessage(message);
      return;
    }

    if (activeTemplates.length === 0) {
      setManagementMessage('Biểu mẫu đã chọn không còn hiệu lực. Vui lòng chọn lại biểu mẫu cần tiếp nhận.');
      return;
    }

    if (files.length === 0) {
      setManagementMessage('Vui lòng chọn ít nhất một file Excel để tiếp nhận.');
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);
    setLastFailedFiles([]);

    try {
      const importedRows: DataRow[] = [];
      const failedFiles: FailedFile[] = [];
      const partialWarnings: string[] = [];
      let acceptedFiles = 0;

      for (const fileItem of files) {
        const unitName = unitNameByCode[fileItem.unitCode] || fileItem.unitQuery || fileItem.file.name;

        if (!fileItem.unitCode) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: 'Chưa xác nhận đơn vị cho file này.',
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

        const sheetValidation = validateWorkbookSheetNames(workbook.SheetNames, activeTemplates);
        if (sheetValidation.missingSheets.length > 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: sheetValidation.missingSheets,
            reason: 'Thiếu biểu mẫu bắt buộc của dự án.',
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
            reason: 'Không có sheet nào trùng tên biểu mẫu đã chốt.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const parsedRowsForFile: DataRow[] = [];
        const templateErrors: string[] = [];

        matchedTemplates.forEach((template) => {
          try {
            parsedRowsForFile.push(...parseRowsForTemplate(workbook, template, fileItem.unitCode));
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'Lỗi không xác định.';
            templateErrors.push(`${template.name}: ${reason}`);
          }
        });

        if (parsedRowsForFile.length === 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: templateErrors.length > 0 ? `Không đọc được dữ liệu từ biểu đã khớp. ${templateErrors.join(' | ')}` : 'Không đọc được dữ liệu từ file.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        importedRows.push(...parsedRowsForFile);
        try {
          await uploadAcceptedDataFile(fileItem, selectedProjectId, selectedYear, unitName);
        } catch (uploadError) {
          console.error('Không thể upload file dữ liệu đã tiếp nhận:', uploadError);
        }
        acceptedFiles += 1;

        if (templateErrors.length > 0) {
          partialWarnings.push(
            `${unitName} (${fileItem.file.name}) chỉ tiếp nhận một phần. Bỏ qua: ${templateErrors.join(' | ')}`,
          );
        }
      }

      if (importedRows.length > 0) {
        await onDataImported(importedRows);
      }

      setLastFailedFiles(failedFiles);

      const summaryLines: string[] = [];
      if (acceptedFiles > 0) {
        summaryLines.push(`Đã tiếp nhận ${acceptedFiles} file hợp lệ.`);
      }

      if (failedFiles.length > 0) {
        summaryLines.push('Các file chưa được tiếp nhận:');
        failedFiles.forEach((item) => {
          const suffix = item.missingSheets.length > 0 ? ` - thiếu sheet: ${item.missingSheets.join(', ')}` : '';
          summaryLines.push(`- ${item.unitName} (${item.fileName})${suffix}${item.reason ? ` - ${item.reason}` : ''}`);
        });
      }

      if (partialWarnings.length > 0) {
        summaryLines.push('Các file tiếp nhận một phần:');
        partialWarnings.forEach((warning) => {
          summaryLines.push(`- ${warning}`);
        });
      }

      if (summaryLines.length === 0) {
        summaryLines.push('Không tìm thấy dữ liệu phù hợp trong các file đã chọn.');
      }

      setManagementMessage(summaryLines.join('\n'));

      if (acceptedFiles > 0) {
        const failedFileKeys = new Set(failedFiles.map((item) => `${item.fileName}__${item.relativePath || ''}`));
        setFiles((current) =>
          current.filter((item) => failedFileKeys.has(`${item.file.name}__${item.relativePath || ''}`)),
        );
      }
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'Không thể đọc file Excel này.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteUnit = async () => {
    if (!selectedUnitToDelete) {
      setManagementMessage('Vui lòng chọn đơn vị cần xóa dữ liệu.');
      return;
    }

    const unitName = unitNameByCode[selectedUnitToDelete] || selectedUnitToDelete;
    const confirmed = window.confirm(
      `Xóa toàn bộ dữ liệu của đơn vị "${unitName}" trong năm ${selectedYear} thuộc dự án hiện tại?`,
    );
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteUnitData(selectedYear, selectedUnitToDelete);
      setManagementMessage(
        deletedCount > 0
          ? `Đã xóa ${deletedCount} dòng dữ liệu của đơn vị ${unitName} trong năm ${selectedYear}.`
          : `Không tìm thấy dữ liệu của đơn vị ${unitName} trong năm ${selectedYear}.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'Không thể xóa dữ liệu của đơn vị.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteYear = async () => {
    const confirmed = window.confirm(`Xóa toàn bộ dữ liệu đã lưu của năm ${selectedYear} trong dự án hiện tại?`);
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteYearData(selectedYear);
      setManagementMessage(
        deletedCount > 0
          ? `Đã xóa ${deletedCount} dòng dữ liệu của năm ${selectedYear}.`
          : `Không tìm thấy dữ liệu nào của năm ${selectedYear} để xóa.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'Không thể xóa dữ liệu theo năm.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProject) {
      setManagementMessage('Vui lòng chọn dự án trước khi xóa dữ liệu.');
      return;
    }

    const confirmed = window.confirm(
      `Xóa toàn bộ dữ liệu, biểu mẫu, phân công và lịch sử xuất báo cáo của dự án "${currentProject.name}"?`,
    );
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteProjectData(currentProject.id);
      setManagementMessage(
        deletedCount > 0
          ? `Đã xóa dự án "${currentProject.name}" và ${deletedCount - 1} bản ghi liên quan.`
          : `Không thể xóa dự án "${currentProject.name}".`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'Không thể xóa dữ liệu của dự án.');
    } finally {
      setIsManagingData(false);
    }
  };

  const visibleFiles = useMemo(() => {
    return files.filter((item) => {
      const validation = fileValidation[item.id];

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
        default:
          return true;
      }
    });
  }, [fileValidation, files, visibleFileFilter]);

  const showExportErrors = lastFailedFiles.length > 0;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="page-title">Tiếp nhận dữ liệu</h2>
          <p className="page-subtitle mt-2">
            Chọn dự án, năm và biểu mẫu phù hợp để nhập dữ liệu Excel theo đúng cấu trúc đã phát hành.
          </p>
        </div>
        {managementMessage && (
          <div className="flex max-w-2xl items-start gap-3 rounded-[20px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-soft)] shadow-[0_20px_60px_rgba(122,44,46,0.08)]">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
            <span className="whitespace-pre-line">{managementMessage}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">1. Dự án</p>
          <select value={selectedProjectId} onChange={(event) => onSelectProject(event.target.value)} className="field-input h-11 text-base font-semibold">
            <option value="">-- Chọn dự án --</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          {currentProject && <p className="page-subtitle mt-3 text-sm">{currentProject.description || 'Chưa có mô tả dự án.'}</p>}
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">2. Biểu mẫu</p>
          <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="field-input h-11 text-base font-semibold">
            <option value="">-- Chọn biểu mẫu --</option>
            {publishedTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          <p className="page-subtitle mt-3 text-sm">
            {selectedTemplateId
              ? 'Hệ thống đang đối chiếu theo biểu mẫu bạn chọn. File chỉ được nhận khi có đúng sheet bắt buộc của biểu này.'
              : 'Khi tiếp nhận, hệ thống sẽ đối chiếu toàn bộ biểu mẫu đã chốt của dự án. File chỉ được nhận khi đủ 100% sheet bắt buộc; các sheet thừa sẽ tự bỏ qua.'}
          </p>
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">3. Năm tổng hợp</p>
          <select value={selectedYear} onChange={(event) => handleYearChange(event.target.value)} className="field-input h-11 text-base font-semibold">
            {YEARS.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <label className="mt-4 flex items-center gap-2 text-sm text-[var(--ink-soft)]">
            <input type="checkbox" checked={pinnedYear === selectedYear} onChange={togglePinnedYear} />
            <span>Ghim năm này cho lần nhập sau</span>
          </label>
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">4. Quản trị dữ liệu theo năm</p>
          {canManageData ? (
            <div className="space-y-3">
              <select value={selectedUnitToDelete} onChange={(event) => setSelectedUnitToDelete(event.target.value)} className="field-input h-11 text-base font-semibold">
                <option value="">-- Chọn đơn vị --</option>
                {sortedUnits.map((unit) => (
                  <option key={unit.code} value={unit.code}>{unit.name} ({unit.code})</option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2">
                <button onClick={handleDeleteUnit} disabled={isManagingData || !selectedUnitToDelete} className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40">
                  Xóa dữ liệu theo đơn vị
                </button>
                <button onClick={handleDeleteYear} disabled={isManagingData} className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40">
                  Xóa dữ liệu theo năm
                </button>
                <button onClick={handleDeleteProject} disabled={isManagingData || !currentProject} className="primary-btn disabled:cursor-not-allowed disabled:opacity-40">
                  Xóa toàn bộ dự án hiện tại
                </button>
              </div>
            </div>
          ) : (
            <p className="page-subtitle text-sm">Chức năng này chỉ dành cho tài khoản quản trị.</p>
          )}
        </div>
      </div>

      <div className="panel-card rounded-[28px] border border-dashed border-[var(--line)] p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex min-h-[116px] cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-5 text-center transition hover:border-[var(--brand)] hover:bg-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)]">
              <Upload size={18} />
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Kéo thả hoặc bấm để chọn file</p>
            <p className="page-subtitle mt-1 text-xs">Phù hợp khi nhận từng file lẻ.</p>
            <input type="file" multiple accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFileChange} />
          </label>

          <button type="button" onClick={() => folderInputRef.current?.click()} className="flex min-h-[116px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-5 text-center transition hover:border-[var(--brand)] hover:bg-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)]">
              <FolderOpen size={18} />
            </div>
            <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Chọn cả thư mục dữ liệu</p>
            <p className="page-subtitle mt-1 text-xs">Hệ thống sẽ gợi ý đơn vị từ tên file trong thư mục.</p>
          </button>
        </div>

        <input ref={folderInputRef} type="file" multiple accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFolderChange} />
      </div>

      {files.length > 0 && (
        <div className="panel-card rounded-[28px] p-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="section-title">Danh sách file chờ tiếp nhận</h3>
              <p className="page-subtitle mt-2 text-sm">
                Hệ thống đã cố gắng tự nhận diện đơn vị từ tên file. Bạn chỉ cần rà lại các file cần xác nhận.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={visibleFileFilter} onChange={(event) => setVisibleFileFilter(event.target.value as VisibleFileFilter)} className="field-input h-10 min-w-[220px] text-sm font-semibold">
                <option value="ALL">Hiện tất cả file</option>
                <option value="READY">Chỉ hiện file đã sẵn sàng</option>
                <option value="NEEDS_CONFIRMATION">Chỉ hiện file cần xác nhận</option>
                <option value="INVALID">Chỉ hiện file lỗi sheet</option>
              </select>
              <button onClick={handleConfirmSuggested} className="secondary-btn">Xác nhận tất cả gợi ý hợp lệ</button>
              <button onClick={exportFailedFiles} disabled={!showExportErrors} className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40">Xuất danh sách file lỗi</button>
              <button onClick={processFiles} disabled={isManagingData} className="primary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40">
                {isManagingData ? <LoaderCircle size={16} className="animate-spin" /> : <FileCheck size={16} />}
                Bắt đầu tổng hợp
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {visibleFiles.map((item) => {
              const validation = fileValidation[item.id];
              const takenUnitCodes = new Set(files.filter((fileItem) => fileItem.id !== item.id).map((fileItem) => fileItem.unitCode).filter(Boolean));
              const availableUnits = sortedUnits.filter(
                (unit) => unit.code === item.unitCode || !takenUnitCodes.has(unit.code),
              );
              const suggestions = item.unitQuery.trim()
                ? availableUnits.filter((unit) => {
                    const keyword = item.unitQuery.trim().toLowerCase();
                    return unit.name.toLowerCase().includes(keyword) || unit.code.toLowerCase().includes(keyword);
                  })
                : availableUnits.slice(0, 12);

              return (
                <div key={item.id} className={`rounded-[24px] border p-4 ${validation?.status === 'invalid' ? 'border-red-200 bg-red-50/50' : item.matchStatus === 'NEEDS_CONFIRMATION' || item.matchStatus === 'UNMATCHED' || item.matchStatus === 'CONFLICT' ? 'border-amber-200 bg-amber-50/40' : 'border-[var(--line)] bg-[var(--surface-soft)]'}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-[var(--ink)]">{item.file.name}</p>
                      <p className="page-subtitle mt-1 text-sm">{(item.file.size / 1024).toFixed(1)} KB{item.relativePath ? ` - ${item.relativePath}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getMatchBadgeTone(item)}`}>{getMatchBadgeLabel(item)}</span>
                      {validation?.status === 'valid' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={12} />
                          File hợp lệ
                        </span>
                      )}
                      <button onClick={() => removeFile(item.id)} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]">
                        <X size={14} />
                        Bỏ file
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <input value={item.unitQuery} onChange={(event) => updateUnitInput(item.id, event.target.value)} list={`unit-suggestions-${item.id}`} className="field-input h-11 text-base font-medium" placeholder="Gõ tên đơn vị để gợi ý" />
                      <datalist id={`unit-suggestions-${item.id}`}>
                        {suggestions.map((unit) => (
                          <option key={unit.code} value={unit.name}>{unit.code}</option>
                        ))}
                      </datalist>
                    </div>

                    <select value={item.unitCode} onChange={(event) => updateUnit(item.id, event.target.value)} className="field-input h-11 text-base font-medium">
                      <option value="">-- Hoặc chọn nhanh đơn vị --</option>
                      {availableUnits.map((unit) => (
                        <option key={unit.code} value={unit.code}>{unit.name} ({unit.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm">
                    <p className="font-semibold text-[var(--ink)]">{item.matchReason}</p>
                    {item.suggestedUnitCode && <p className="mt-1 text-xs text-[var(--ink-soft)]">Gợi ý: {item.suggestedUnitName} ({item.suggestedUnitCode})</p>}
                    {validation?.status === 'valid' && <p className="mt-2 text-xs text-emerald-700">File hợp lệ. Đã nhận đủ các sheet bắt buộc: {validation.matchedSheets.join(', ')}</p>}
                    {validation?.status === 'invalid' && (
                      <>
                        {validation.missingSheets.length > 0 && <p className="mt-2 text-xs text-red-700">Thiếu sheet: {validation.missingSheets.join(', ')}</p>}
                        {validation.reason && <p className="mt-2 text-xs text-red-700">{validation.reason}</p>}
                      </>
                    )}
                    {(!validation || validation.status === 'pending') && <p className="mt-2 text-xs text-[var(--ink-soft)]">Đang kiểm tra cấu trúc file...</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

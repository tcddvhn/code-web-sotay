import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, FileCheck, LoaderCircle, Upload, X } from 'lucide-react';
import { YEARS } from '../constants';
import { DataRow, FormTemplate, ManagedUnit, Project } from '../types';
import { parseLegacyFromWorkbook, parseTemplateFromWorkbook } from '../utils/excelParser';
import { getPinnedYearPreference, getPreferredReportingYear, setPinnedYearPreference } from '../utils/reportingYear';
import { validateWorkbookSheetNames } from '../utils/workbookUtils';

type PendingFile = {
  id: string;
  file: File;
  unitCode: string;
  unitQuery: string;
};

type FileValidationState = {
  status: 'pending' | 'valid' | 'invalid';
  missingSheets: string[];
  matchedSheets: string[];
  reason?: string;
};

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

  useEffect(() => {
    if (!publishedTemplates.some((template) => template.id === selectedTemplateId)) {
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
          const validation = validateWorkbookSheetNames(workbook.SheetNames, publishedTemplates);
          const matchedSheets = publishedTemplates
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
  }, [files, publishedTemplates]);

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

  const appendFiles = (incomingFiles: FileList | File[]) => {
    const nextFiles = Array.from(incomingFiles);
    if (nextFiles.length === 0) {
      return;
    }

    const mappedFiles = nextFiles.map((file) => ({
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
      unitCode: '',
      unitQuery: '',
    }));

    setFiles((current) => [...current, ...mappedFiles]);
    setManagementMessage(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              unitCode,
              unitQuery: unitCode ? unitNameByCode[unitCode] || '' : item.unitQuery,
            }
          : item,
      ),
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
            }
          : item,
      ),
    );
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
    publishedTemplates.filter((template) => workbook.SheetNames.includes(template.sheetName));

  const parseRowsForTemplate = (
    workbook: XLSX.WorkBook,
    template: FormTemplate,
    unitCode: string,
  ) => {
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


    if (files.length === 0) {
      setManagementMessage('Vui lÃ²ng chá»n Ã­t nháº¥t má»™t file Excel Ä‘á»ƒ tiáº¿p nháº­n.');
      return;
    }

    const unassignedFile = files.find((item) => !item.unitCode);
    if (unassignedFile) {
      setManagementMessage(`Vui lÃ²ng chá»n Ä‘Æ¡n vá»‹ cho file "${unassignedFile.file.name}".`);
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const importedRows: DataRow[] = [];
      const failedFiles: { unitName: string; fileName: string; missingSheets: string[]; reason?: string }[] = [];
      let acceptedFiles = 0;

      for (const fileItem of files) {
        const buffer = await fileItem.file.arrayBuffer();
        const workbook = XLSX.read(buffer, {
          type: 'array',
          cellFormula: true,
          cellHTML: false,
          cellText: false,
        });

        const validation = validateWorkbookSheetNames(workbook.SheetNames, publishedTemplates);
        if (validation.missingSheets.length > 0) {
          failedFiles.push({
            unitName: unitNameByCode[fileItem.unitCode] || fileItem.unitCode,
            fileName: fileItem.file.name,
            missingSheets: validation.missingSheets,
          });
          continue;
        }

        const matchedTemplates = resolveTemplatesForWorkbook(workbook);
        if (matchedTemplates.length === 0) {
          failedFiles.push({
            unitName: unitNameByCode[fileItem.unitCode] || fileItem.unitCode,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: 'KhÃ´ng tÃ¬m tháº¥y sheet trÃ¹ng tÃªn biá»ƒu máº«u nÃ o trong dá»± Ã¡n.',
          });
          continue;
        }

        const fileRows: DataRow[] = [];
        matchedTemplates.forEach((template) => {
          const rows = parseRowsForTemplate(workbook, template, fileItem.unitCode);
          fileRows.push(...rows);
        });

        if (fileRows.length === 0) {
          failedFiles.push({
            unitName: unitNameByCode[fileItem.unitCode] || fileItem.unitCode,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: 'File Ä‘á»§ sheet nhÆ°ng khÃ´ng Ä‘á»c Ä‘Æ°á»£c dá»¯ liá»‡u há»£p lá»‡.',
          });
          continue;
        }

        importedRows.push(...fileRows);
        acceptedFiles += 1;
      }

      if (importedRows.length > 0) {
        await onDataImported(importedRows);
      }

      setFiles([]);
      const summaryLines: string[] = [];
      if (acceptedFiles > 0) {
        summaryLines.push(
          `ÄÃ£ tiáº¿p nháº­n ${acceptedFiles}/${files.length} file vÃ  lÆ°u ${importedRows.length} dÃ²ng dá»¯ liá»‡u cho dá»± Ã¡n ${currentProject.name}.`,
        );
      }
      if (failedFiles.length > 0) {
        summaryLines.push('CÃ¡c Ä‘Æ¡n vá»‹ khÃ´ng Ä‘Æ°á»£c tiáº¿p nháº­n trong Ä‘á»£t nÃ y:');
        failedFiles.forEach((item) => {
          if (item.missingSheets.length > 0) {
            summaryLines.push(`- ${item.unitName} (${item.fileName}): thiáº¿u sheet ${item.missingSheets.join(', ')}`);
            return;
          }
          summaryLines.push(`- ${item.unitName} (${item.fileName}): ${item.reason}`);
        });
      }
      if (summaryLines.length === 0) {
        summaryLines.push('KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u phÃ¹ há»£p trong cÃ¡c file Ä‘Ã£ chá»n.');
      }
      setManagementMessage(summaryLines.join('\n'));
    } catch (error) {
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

    const unitName = unitNameByCode[selectedUnitToDelete] || selectedUnitToDelete;
    const confirmed = window.confirm(
      `XÃ³a toÃ n bá»™ dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹ "${unitName}" trong nÄƒm ${selectedYear} thuá»™c dá»± Ã¡n hiá»‡n táº¡i?`,
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
          ? `ÄÃ£ xÃ³a ${deletedCount} dÃ²ng dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹ ${unitName} trong nÄƒm ${selectedYear}.`
          : `KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹ ${unitName} trong nÄƒm ${selectedYear}.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ xÃ³a dá»¯ liá»‡u cá»§a Ä‘Æ¡n vá»‹.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteYear = async () => {
    const confirmed = window.confirm(
      `XÃ³a toÃ n bá»™ dá»¯ liá»‡u Ä‘Ã£ lÆ°u cá»§a nÄƒm ${selectedYear} trong dá»± Ã¡n hiá»‡n táº¡i?`,
    );
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteYearData(selectedYear);
      setManagementMessage(
        deletedCount > 0
          ? `ÄÃ£ xÃ³a ${deletedCount} dÃ²ng dá»¯ liá»‡u cá»§a nÄƒm ${selectedYear}.`
          : `KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u nÃ o cá»§a nÄƒm ${selectedYear} Ä‘á»ƒ xÃ³a.`,
      );
    } catch (error) {
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

    try {
      const deletedCount = await onDeleteProjectData(currentProject.id);
      setManagementMessage(
        deletedCount > 0
          ? `ÄÃ£ xÃ³a dá»± Ã¡n "${currentProject.name}" vÃ  ${deletedCount - 1} báº£n ghi liÃªn quan.`
          : `KhÃ´ng thá»ƒ xÃ³a dá»± Ã¡n "${currentProject.name}".`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ xÃ³a dá»¯ liá»‡u cá»§a dá»± Ã¡n.');
    } finally {
      setIsManagingData(false);
    }
  };

  return (
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">1. Dá»± Ã¡n</p>
          <select
            value={selectedProjectId}
            onChange={(event) => onSelectProject(event.target.value)}
            className="field-input h-11 text-base font-semibold"
          >
            <option value="">-- Chá»n dá»± Ã¡n --</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {currentProject && <p className="page-subtitle mt-3 text-sm">{currentProject.description || 'ChÆ°a cÃ³ mÃ´ táº£ dá»± Ã¡n.'}</p>}
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">2. Biá»ƒu máº«u</p>
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="field-input h-11 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">-- Chá»n biá»ƒu máº«u --</option>
            {publishedTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <p className="page-subtitle mt-3 text-sm">
            Khi tiáº¿p nháº­n, há»‡ thá»‘ng sáº½ Ä‘á»‘i chiáº¿u toÃ n bá»™ biá»ƒu máº«u Ä‘Ã£ chá»‘t cá»§a dá»± Ã¡n. File chá»‰ Ä‘Æ°á»£c nháº­n khi Ä‘á»§ 100% sheet báº¯t buá»™c; cÃ¡c sheet thá»«a sáº½ tá»± bá» qua.
          </p>
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">3. NÄƒm tá»•ng há»£p</p>
          <select
            value={selectedYear}
            onChange={(event) => handleYearChange(event.target.value)}
            className="field-input h-11 text-base font-semibold"
          >
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <label className="mt-4 flex items-center gap-2 text-sm text-[var(--ink-soft)]">
            <input type="checkbox" checked={pinnedYear === selectedYear} onChange={togglePinnedYear} />
            <span>Ghim nÄƒm nÃ y cho láº§n nháº­p sau</span>
          </label>
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">4. Quáº£n trá»‹ dá»¯ liá»‡u theo nÄƒm</p>
          {canManageData ? (
            <div className="space-y-3">
              <select
                value={selectedUnitToDelete}
                onChange={(event) => setSelectedUnitToDelete(event.target.value)}
                className="field-input h-11 text-base font-semibold"
              >
                <option value="">-- Chá»n Ä‘Æ¡n vá»‹ --</option>
                {sortedUnits.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.name} ({unit.code})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2">
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
          ) : (
            <p className="page-subtitle text-sm">Chá»©c nÄƒng nÃ y chá»‰ dÃ nh cho tÃ i khoáº£n quáº£n trá»‹.</p>
          )}
        </div>
      </div>

      <div className="panel-card rounded-[28px] border border-dashed border-[var(--line)] p-5">
        <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-5 py-7 text-center transition hover:border-[var(--brand)] hover:bg-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)]">
            <Upload size={22} />
          </div>
          <p className="mt-4 text-base font-semibold text-[var(--ink)]">
            KÃ©o tháº£ hoáº·c click Ä‘á»ƒ chá»n file Excel (.xlsx, .xlsm, .xls)
          </p>
          <p className="page-subtitle mt-2 max-w-2xl text-sm">
            Má»—i file cáº§n Ä‘Æ°á»£c gÃ¡n Ä‘Ãºng Ä‘Æ¡n vá»‹ trÆ°á»›c khi tá»•ng há»£p. Báº¡n cÃ³ thá»ƒ nháº­p nhiá»u file cÃ¹ng lÃºc Ä‘á»ƒ Ä‘áº©y nhanh tiáº¿n Ä‘á»™.
          </p>
          <input type="file" multiple accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFileChange} />
        </label>
      </div>

      {files.length > 0 && (
        <div className="panel-card rounded-[28px] p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="section-title">Danh sÃ¡ch file chá» tiáº¿p nháº­n</h3>
              <p className="page-subtitle mt-2 text-sm">GÃ¡n Ä‘Ãºng Ä‘Æ¡n vá»‹ cho tá»«ng file rá»“i báº¥m báº¯t Ä‘áº§u tá»•ng há»£p.</p>
            </div>
            <button
              onClick={processFiles}
              disabled={isManagingData}
              className="primary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isManagingData ? <LoaderCircle size={16} className="animate-spin" /> : <FileCheck size={16} />}
              Báº¯t Ä‘áº§u tá»•ng há»£p
            </button>
          </div>

          <div className="space-y-4">
            {files.map((item) => {
              const validation = fileValidation[item.id];
              const takenUnitCodes = new Set(
                files.filter((fileItem) => fileItem.id !== item.id).map((fileItem) => fileItem.unitCode).filter(Boolean),
              );
              const availableUnits = sortedUnits.filter(
                (unit) => !importedUnitCodesForProject.has(unit.code) && !takenUnitCodes.has(unit.code),
              );
              const suggestions = item.unitQuery.trim()
                ? availableUnits.filter((unit) => {
                    const keyword = item.unitQuery.trim().toLowerCase();
                    return unit.name.toLowerCase().includes(keyword) || unit.code.toLowerCase().includes(keyword);
                  })
                : availableUnits.slice(0, 12);

              return (
                <div key={item.id} className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-[var(--ink)]">{item.file.name}</p>
                      <p className="page-subtitle mt-1 text-sm">
                        {(item.file.size / 1024).toFixed(1)} KB
                        {item.unitCode ? ` - ${unitNameByCode[item.unitCode]} (${item.unitCode})` : ' - ChÆ°a chá»n Ä‘Æ¡n vá»‹'}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFile(item.id)}
                      className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    >
                      <X size={14} />
                      Bá» file
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <input
                        value={item.unitQuery}
                        onChange={(event) => updateUnitInput(item.id, event.target.value)}
                        list={`unit-suggestions-${item.id}`}
                        className="field-input h-11 text-base font-medium"
                        placeholder="GÃµ tÃªn Ä‘Æ¡n vá»‹ Ä‘á»ƒ gá»£i Ã½"
                      />
                      <datalist id={`unit-suggestions-${item.id}`}>
                        {suggestions.map((unit) => (
                          <option key={unit.code} value={unit.name}>
                            {unit.code}
                          </option>
                        ))}
                      </datalist>
                    </div>

                    <select
                      value={item.unitCode}
                      onChange={(event) => updateUnit(item.id, event.target.value)}
                      className="field-input h-11 text-base font-medium"
                    >
                      <option value="">-- Hoáº·c chá»n nhanh Ä‘Æ¡n vá»‹ --</option>
                      {availableUnits.map((unit) => (
                        <option key={unit.code} value={unit.code}>
                          {unit.name} ({unit.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-white px-4 py-3">
                    {validation?.status === 'valid' && (
                      <div className="text-sm text-emerald-700">
                        <p className="font-semibold">File hợp lệ để tiếp nhận.</p>
                        <p className="mt-1 text-xs">
                          Đã nhận đủ các sheet bắt buộc: {validation.matchedSheets.join(', ')}
                        </p>
                      </div>
                    )}

                    {validation?.status === 'invalid' && (
                      <div className="text-sm text-red-700">
                        <p className="font-semibold">File chưa hợp lệ, sẽ bị bỏ qua khi tổng hợp.</p>
                        {validation.missingSheets.length > 0 && (
                          <p className="mt-1 text-xs">
                            Thiếu sheet: {validation.missingSheets.join(', ')}
                          </p>
                        )}
                        {validation.reason && (
                          <p className="mt-1 text-xs">{validation.reason}</p>
                        )}
                      </div>
                    )}

                    {(!validation || validation.status === 'pending') && (
                      <div className="text-sm text-[var(--ink-soft)]">
                        <p className="font-semibold">Đang kiểm tra cấu trúc file...</p>
                      </div>
                    )}
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


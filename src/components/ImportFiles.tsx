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

    if (files.length === 0) {
      setManagementMessage('Vui lòng chọn ít nhất một file Excel để tiếp nhận.');
      return;
    }

    const unassignedFile = files.find((item) => !item.unitCode);
    if (unassignedFile) {
      setManagementMessage(`Vui lòng chọn đơn vị cho file "${unassignedFile.file.name}".`);
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
            reason: 'Không tìm thấy sheet trùng tên biểu mẫu nào trong dự án.',
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
            reason: 'File đủ sheet nhưng không đọc được dữ liệu hợp lệ.',
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
          `Đã tiếp nhận ${acceptedFiles}/${files.length} file và lưu ${importedRows.length} dòng dữ liệu cho dự án ${currentProject.name}.`,
        );
      }

      if (failedFiles.length > 0) {
        summaryLines.push('Các đơn vị không được tiếp nhận trong đợt này:');
        failedFiles.forEach((item) => {
          if (item.missingSheets.length > 0) {
            summaryLines.push(`- ${item.unitName} (${item.fileName}): thiếu sheet ${item.missingSheets.join(', ')}`);
            return;
          }

          summaryLines.push(`- ${item.unitName} (${item.fileName}): ${item.reason}`);
        });
      }

      if (summaryLines.length === 0) {
        summaryLines.push('Không tìm thấy dữ liệu phù hợp trong các file đã chọn.');
      }

      setManagementMessage(summaryLines.join('\n'));
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
    const confirmed = window.confirm(
      `Xóa toàn bộ dữ liệu đã lưu của năm ${selectedYear} trong dự án hiện tại?`,
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
          <select
            value={selectedProjectId}
            onChange={(event) => onSelectProject(event.target.value)}
            className="field-input h-11 text-base font-semibold"
          >
            <option value="">-- Chọn dự án --</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {currentProject && (
            <p className="page-subtitle mt-3 text-sm">{currentProject.description || 'Chưa có mô tả dự án.'}</p>
          )}
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">2. Biểu mẫu</p>
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="field-input h-11 text-base font-semibold"
          >
            <option value="">-- Chọn biểu mẫu --</option>
            {publishedTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <p className="page-subtitle mt-3 text-sm">
            Khi tiếp nhận, hệ thống sẽ đối chiếu toàn bộ biểu mẫu đã chốt của dự án. File chỉ được nhận khi đủ 100%
            sheet bắt buộc; các sheet thừa sẽ tự bỏ qua.
          </p>
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">3. Năm tổng hợp</p>
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
            <span>Ghim năm này cho lần nhập sau</span>
          </label>
        </div>

        <div className="panel-card rounded-[24px] p-5">
          <p className="col-header mb-3">4. Quản trị dữ liệu theo năm</p>
          {canManageData ? (
            <div className="space-y-3">
              <select
                value={selectedUnitToDelete}
                onChange={(event) => setSelectedUnitToDelete(event.target.value)}
                className="field-input h-11 text-base font-semibold"
              >
                <option value="">-- Chọn đơn vị --</option>
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
                  Xóa dữ liệu theo đơn vị
                </button>
                <button
                  onClick={handleDeleteYear}
                  disabled={isManagingData}
                  className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Xóa dữ liệu theo năm
                </button>
                <button
                  onClick={handleDeleteProject}
                  disabled={isManagingData || !currentProject}
                  className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Xóa toàn bộ dự án hiện tại
                </button>
              </div>
            </div>
          ) : (
            <p className="page-subtitle text-sm">Chức năng này chỉ dành cho tài khoản quản trị.</p>
          )}
        </div>
      </div>

      <div className="panel-card rounded-[28px] border border-dashed border-[var(--line)] p-5">
        <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-5 py-7 text-center transition hover:border-[var(--brand)] hover:bg-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)]">
            <Upload size={22} />
          </div>
          <p className="mt-4 text-base font-semibold text-[var(--ink)]">
            Kéo thả hoặc click để chọn file Excel (.xlsx, .xlsm, .xls)
          </p>
          <p className="page-subtitle mt-2 max-w-2xl text-sm">
            Mỗi file cần được gán đúng đơn vị trước khi tổng hợp. Bạn có thể nhập nhiều file cùng lúc để đẩy nhanh
            tiến độ.
          </p>
          <input type="file" multiple accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFileChange} />
        </label>
      </div>

      {files.length > 0 && (
        <div className="panel-card rounded-[28px] p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="section-title">Danh sách file chờ tiếp nhận</h3>
              <p className="page-subtitle mt-2 text-sm">Gán đúng đơn vị cho từng file rồi bấm bắt đầu tổng hợp.</p>
            </div>
            <button
              onClick={processFiles}
              disabled={isManagingData}
              className="primary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isManagingData ? <LoaderCircle size={16} className="animate-spin" /> : <FileCheck size={16} />}
              Bắt đầu tổng hợp
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
                        {item.unitCode
                          ? ` - ${unitNameByCode[item.unitCode]} (${item.unitCode})`
                          : ' - Chưa chọn đơn vị'}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFile(item.id)}
                      className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    >
                      <X size={14} />
                      Bỏ file
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <input
                        value={item.unitQuery}
                        onChange={(event) => updateUnitInput(item.id, event.target.value)}
                        list={`unit-suggestions-${item.id}`}
                        className="field-input h-11 text-base font-medium"
                        placeholder="Gõ tên đơn vị để gợi ý"
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
                      <option value="">-- Hoặc chọn nhanh đơn vị --</option>
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
                        <p className="mt-1 text-xs">Đã nhận đủ các sheet bắt buộc: {validation.matchedSheets.join(', ')}</p>
                      </div>
                    )}

                    {validation?.status === 'invalid' && (
                      <div className="text-sm text-red-700">
                        <p className="font-semibold">File chưa hợp lệ, sẽ bị bỏ qua khi tổng hợp.</p>
                        {validation.missingSheets.length > 0 && (
                          <p className="mt-1 text-xs">Thiếu sheet: {validation.missingSheets.join(', ')}</p>
                        )}
                        {validation.reason && <p className="mt-1 text-xs">{validation.reason}</p>}
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

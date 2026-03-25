import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileCheck, AlertCircle, X, LoaderCircle } from 'lucide-react';
import { UNITS, YEARS } from '../constants';
import { DataRow, FormTemplate, Project } from '../types';
import { parseLegacyFromWorkbook, parseTemplateFromWorkbook } from '../utils/excelParser';
import { getPinnedYearPreference, getPreferredReportingYear, setPinnedYearPreference } from '../utils/reportingYear';
import { buildSheetValidationMessage, validateWorkbookSheetNames } from '../utils/workbookUtils';

interface ImportFilesProps {
  onDataImported: (newData: DataRow[]) => Promise<void>;
  onDeleteUnitData: (year: string, unitCode: string) => Promise<number>;
  onDeleteYearData: (year: string) => Promise<number>;
  onDeleteProjectData: (projectId: string) => Promise<number>;
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  templates: FormTemplate[];
  canManageData: boolean;
}

type FileItemStatus = 'pending' | 'processing' | 'success' | 'error';

interface FileItem {
  file: File;
  unitCode: string;
  unitInput: string;
  status: FileItemStatus;
  message?: string;
  importedRows?: number;
}

export function ImportFiles({
  onDataImported,
  onDeleteUnitData,
  onDeleteYearData,
  onDeleteProjectData,
  projects,
  selectedProjectId,
  onSelectProject,
  templates,
  canManageData,
}: ImportFilesProps) {
  const [selectedYear, setSelectedYear] = useState(() => getPreferredReportingYear());
  const [pinnedYear, setPinnedYear] = useState<string | null>(() => getPinnedYearPreference());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedUnitToDelete, setSelectedUnitToDelete] = useState('');
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const [isManagingData, setIsManagingData] = useState(false);
  const [autoDetectSheets, setAutoDetectSheets] = useState(false);
  const [includeExtraSheets, setIncludeExtraSheets] = useState(true);

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
  const selectedTemplate = publishedTemplates.find((template) => template.id === selectedTemplateId) || null;

  useEffect(() => {
    if (publishedTemplates.length > 0 && !publishedTemplates.find((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(publishedTemplates[0].id);
      return;
    }

    if (publishedTemplates.length === 0) {
      setSelectedTemplateId('');
    }
  }, [publishedTemplates, selectedTemplateId]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const nextFiles = Array.from(event.target.files).map((file) => ({
        file,
        unitCode: '',
        unitInput: '',
        status: 'pending' as const,
      }));
      setFiles((previous) => [...previous, ...nextFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index));
  };

  const updateUnit = (index: number, code: string) => {
    const matchedUnit = UNITS.find((unit) => unit.code === code);
    setFiles((previous) =>
      previous.map((file, fileIndex) =>
        fileIndex === index
          ? {
              ...file,
              unitCode: code,
              unitInput: matchedUnit?.name || file.unitInput,
            }
          : file,
      ),
    );
  };

  const updateUnitInput = (index: number, value: string) => {
    const normalizedValue = value.trim().toLowerCase();
    const matchedUnit =
      UNITS.find((unit) => unit.name.trim().toLowerCase() === normalizedValue) ||
      UNITS.find((unit) => unit.code.trim().toLowerCase() === normalizedValue);

    setFiles((previous) =>
      previous.map((file, fileIndex) =>
        fileIndex === index
          ? {
              ...file,
              unitInput: value,
              unitCode: matchedUnit?.code || '',
            }
          : file,
      ),
    );
  };

  const handleYearChange = (nextYear: string) => {
    const wasPinned = pinnedYear === selectedYear;
    setSelectedYear(nextYear);

    if (wasPinned) {
      setPinnedYearPreference(nextYear);
      setPinnedYear(nextYear);
    }
  };

  const togglePinnedYear = (checked: boolean) => {
    const nextPinnedYear = checked ? selectedYear : null;
    setPinnedYearPreference(nextPinnedYear);
    setPinnedYear(nextPinnedYear);
  };

  const processFiles = async () => {
    setManagementMessage(null);

    if (!currentProject) {
      setManagementMessage('Vui lòng chọn dự án trước khi tiếp nhận dữ liệu.');
      return;
    }

    if (publishedTemplates.length === 0) {
      setManagementMessage(
        projectTemplates.length === 0
          ? 'Dự án này chưa có biểu mẫu để tiếp nhận dữ liệu.'
          : 'Dự án này đã có biểu mẫu nhưng chưa chốt mẫu nào. Hãy vào mục Biểu mẫu để chốt trước khi tiếp nhận dữ liệu.',
      );
      return;
    }

    if (!selectedTemplate && !autoDetectSheets) {
      setManagementMessage('Vui lòng chọn biểu mẫu trước khi tổng hợp.');
      return;
    }

    const nextFiles = [...files];

    for (let index = 0; index < nextFiles.length; index += 1) {
      const fileItem = nextFiles[index];

      if (!fileItem.unitCode) {
        nextFiles[index] = {
          ...fileItem,
          status: 'error',
          message: 'Chưa chọn đơn vị cho file này.',
        };
        continue;
      }

      nextFiles[index] = {
        ...fileItem,
        status: 'processing',
        message: 'Đang kiểm tra sheet và đọc dữ liệu Excel...',
      };
      setFiles([...nextFiles]);

      try {
        const buffer = await fileItem.file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellFormula: true, cellHTML: false, cellText: false });
        const validation = validateWorkbookSheetNames(workbook.SheetNames, publishedTemplates);

        if (!validation.isValid) {
          const validationMessage = buildSheetValidationMessage(currentProject.name, validation);
          window.alert(validationMessage);
          throw new Error(validationMessage);
        }

        let rows: DataRow[] = [];

        if (autoDetectSheets) {
          const templatesToScan = includeExtraSheets ? publishedTemplates : selectedTemplate ? [selectedTemplate] : publishedTemplates;

          templatesToScan.forEach((template) => {
            if (!workbook.Sheets[template.sheetName]) {
              return;
            }

            const parsed =
              template.mode === 'LEGACY'
                ? parseLegacyFromWorkbook(workbook, fileItem.unitCode, selectedYear, template.sheetName, selectedProjectId, template.id)
                : parseTemplateFromWorkbook(workbook, template, fileItem.unitCode, selectedYear);

            rows = rows.concat(parsed);
          });

          if (rows.length === 0) {
            throw new Error('Không tìm thấy biểu phù hợp trong file sau khi quét sheet.');
          }
        } else {
          rows =
            selectedTemplate!.mode === 'LEGACY'
              ? parseLegacyFromWorkbook(workbook, fileItem.unitCode, selectedYear, selectedTemplate!.sheetName, selectedProjectId, selectedTemplate!.id)
              : parseTemplateFromWorkbook(workbook, selectedTemplate!, fileItem.unitCode, selectedYear);
        }

        await onDataImported(rows);

        nextFiles[index] = {
          ...fileItem,
          status: 'success',
          importedRows: rows.length,
          message: autoDetectSheets
            ? `Đã lưu ${rows.length} dòng dữ liệu cho các biểu thuộc dự án ${currentProject.name}.`
            : `Đã lưu ${rows.length} dòng dữ liệu cho biểu ${selectedTemplate!.name}.`,
        };
      } catch (error) {
        nextFiles[index] = {
          ...fileItem,
          status: 'error',
          message: error instanceof Error ? error.message : 'Không thể đọc file Excel này.',
        };
      }

      setFiles([...nextFiles]);
    }
  };

  const handleDeleteUnit = async () => {
    if (!selectedUnitToDelete) {
      setManagementMessage('Hãy chọn đơn vị cần xóa dữ liệu trước.');
      return;
    }

    const unitName = UNITS.find((unit) => unit.code === selectedUnitToDelete)?.name || selectedUnitToDelete;
    const confirmed = window.confirm(`Xóa toàn bộ dữ liệu của đơn vị "${unitName}" trong năm ${selectedYear}?`);

    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteUnitData(selectedYear, selectedUnitToDelete);
      setManagementMessage(
        deletedCount > 0
          ? `Đã xóa ${deletedCount} dòng dữ liệu của ${unitName} trong năm ${selectedYear}.`
          : `Không tìm thấy dữ liệu của ${unitName} trong năm ${selectedYear}.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'Không thể xóa dữ liệu đơn vị.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteYear = async () => {
    const confirmed = window.confirm(`Xóa toàn bộ dữ liệu đã lưu của năm ${selectedYear} trong dự án ${currentProject?.name || ''}?`);

    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteYearData(selectedYear);
      setManagementMessage(
        deletedCount > 0
          ? `Đã xóa sạch ${deletedCount} dòng dữ liệu của năm ${selectedYear}.`
          : `Không có dữ liệu nào của năm ${selectedYear} để xóa.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'Không thể xóa dữ liệu theo năm.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProject) {
      return;
    }

    const confirmed = window.confirm(
      `Xóa toàn bộ dữ liệu, biểu mẫu và dự án "${currentProject.name}"? Hành động này không thể hoàn tác.`,
    );
    if (!confirmed) return;

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteProjectData(currentProject.id);
      setManagementMessage(
        deletedCount > 0
          ? `Đã xóa toàn bộ dữ liệu, biểu mẫu và dự án ${currentProject.name}.`
          : `Không có dữ liệu nào của dự án ${currentProject.name} để xóa.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'Không thể xóa dữ liệu dự án.');
    } finally {
      setIsManagingData(false);
    }
  };

  const isPinnedYear = pinnedYear === selectedYear;
  const unitSuggestionListId = 'import-unit-suggestions';

  return (
    <div className="max-w-5xl p-6 md:p-8">
      <header className="mb-10">
        <h2 className="page-title">Tiếp nhận dữ liệu</h2>
        <p className="page-subtitle mt-2 text-sm">
          Chọn dự án, năm tổng hợp và tải lên các file báo cáo từ đơn vị cơ sở. Hệ thống sẽ kiểm tra đúng tên sheet trước khi nhận dữ liệu.
        </p>
      </header>

      <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel-soft rounded-[24px] p-6">
          <label className="col-header mb-2 block">Dự án</label>
          <select
            value={selectedProjectId}
            onChange={(event) => onSelectProject(event.target.value)}
            className="field-select"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            {currentProject?.description || 'Chọn dự án cần tiếp nhận dữ liệu.'}
          </p>
        </div>

        <div className="panel-soft rounded-[24px] p-6">
          <label className="col-header mb-2 block">Biểu mẫu</label>
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="field-select"
            disabled={autoDetectSheets || publishedTemplates.length === 0}
          >
            {publishedTemplates.length === 0 && <option value="">-- Chưa có biểu mẫu đã chốt --</option>}
            {publishedTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <label className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            <input
              type="checkbox"
              checked={autoDetectSheets}
              onChange={(event) => setAutoDetectSheets(event.target.checked)}
              className="theme-checkbox h-3.5 w-3.5"
            />
            Tự nhận nhiều sheet theo template
          </label>
          {autoDetectSheets && (
            <label className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
              <input
                type="checkbox"
                checked={includeExtraSheets}
                onChange={(event) => setIncludeExtraSheets(event.target.checked)}
                className="theme-checkbox h-3.5 w-3.5"
              />
              Quét toàn bộ template của dự án
            </label>
          )}
          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            Tên sheet của file nhập phải khớp 100% với các biểu mẫu đã chốt của dự án.
          </p>
        </div>

        <div className="panel-soft rounded-[24px] p-6">
          <label className="col-header mb-2 block">Năm tổng hợp</label>
          <select
            value={selectedYear}
            onChange={(event) => handleYearChange(event.target.value)}
            className="field-select"
          >
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <label className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            <input
              type="checkbox"
              checked={isPinnedYear}
              onChange={(event) => togglePinnedYear(event.target.checked)}
              className="theme-checkbox h-3.5 w-3.5"
            />
            Ghim năm này cho lần nhập sau
          </label>
        </div>

        {canManageData && (
          <div className="panel-card rounded-[24px] p-6">
            <label className="col-header mb-2 block">Quản trị dữ liệu theo năm</label>
            <div className="space-y-4">
              <select
                value={selectedUnitToDelete}
                onChange={(event) => setSelectedUnitToDelete(event.target.value)}
                className="field-select text-sm"
              >
                <option value="">-- Chọn đơn vị --</option>
                {UNITS.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.name}
                  </option>
                ))}
              </select>

              <button
                onClick={handleDeleteUnit}
                disabled={isManagingData || !selectedUnitToDelete}
                className="secondary-btn w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isManagingData ? 'Đang xóa...' : 'Xóa dữ liệu đơn vị'}
              </button>

              <button
                onClick={handleDeleteYear}
                disabled={isManagingData}
                className="primary-btn w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                Xóa toàn bộ năm
              </button>

              <button
                onClick={handleDeleteProject}
                disabled={isManagingData || !currentProject}
                className="secondary-btn w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                Xóa toàn bộ dữ liệu và dự án
              </button>
            </div>

            {managementMessage && (
              <p className="mt-4 text-xs font-medium text-[var(--ink-soft)]">{managementMessage}</p>
            )}
          </div>
        )}
      </div>

      <div className="relative mb-8 rounded-[26px] border-2 border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)] p-12 text-center transition-colors hover:border-[var(--primary)]">
        <input
          type="file"
          multiple
          accept=".xlsx,.xlsm,.xls"
          onChange={handleFileChange}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <Upload className="mx-auto mb-4 text-[var(--primary)] opacity-35" size={48} />
        <p className="text-sm font-medium text-[var(--ink)]">Kéo thả hoặc click để chọn file Excel (.xlsx, .xlsm, .xls)</p>
      </div>

      {files.length > 0 && (
        <div className="mb-8 space-y-4">
          <datalist id={unitSuggestionListId}>
            {UNITS.map((unit) => (
              <option key={unit.code} value={unit.name} />
            ))}
          </datalist>
          {files.map((fileItem, index) => (
            <div key={index} className="panel-card flex items-center gap-4 rounded-[22px] p-4">
              <div className="flex-1">
                <p className="truncate text-sm font-bold">{fileItem.file.name}</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                  {(fileItem.file.size / 1024).toFixed(1)} KB
                </p>
                {fileItem.message && (
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[var(--ink-soft)]">
                    {fileItem.message}
                  </p>
                )}
              </div>

              <div className="w-56">
                <input
                  list={unitSuggestionListId}
                  value={fileItem.unitInput}
                  onChange={(event) => updateUnitInput(index, event.target.value)}
                  className="field-input py-2 text-xs"
                  placeholder="Gõ tên đơn vị để gợi ý"
                />
                <select
                  value={fileItem.unitCode}
                  onChange={(event) => updateUnit(index, event.target.value)}
                  className="field-select mt-2 py-1 text-[11px]"
                >
                  <option value="">-- Hoặc chọn nhanh đơn vị --</option>
                  {UNITS.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>

              {fileItem.status === 'processing' && <LoaderCircle className="animate-spin" size={18} />}
              {fileItem.status === 'success' && <FileCheck className="text-[var(--success)]" size={18} />}
              {fileItem.status === 'error' && <AlertCircle className="text-[var(--primary)]" size={18} />}

              <button onClick={() => removeFile(index)} className="rounded p-1 transition-colors hover:bg-[var(--surface-alt)]">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={processFiles}
        disabled={
          files.length === 0 ||
          files.some((file) => !file.unitCode) ||
          files.some((file) => file.status === 'processing') ||
          isManagingData ||
          !currentProject ||
          publishedTemplates.length === 0
        }
        className="primary-btn px-8 py-4 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Bắt đầu tổng hợp
      </button>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileCheck, AlertCircle, X, LoaderCircle } from 'lucide-react';
import { UNITS, YEARS } from '../constants';
import { DataRow, FormTemplate } from '../types';
import { parseLegacySheet, parseTemplateSheet, parseLegacyFromWorkbook, parseTemplateFromWorkbook } from '../utils/excelParser';
import { getPinnedYearPreference, getPreferredReportingYear, setPinnedYearPreference } from '../utils/reportingYear';

interface ImportFilesProps {
  onDataImported: (newData: DataRow[]) => Promise<void>;
  onDeleteUnitData: (year: string, unitCode: string) => Promise<number>;
  onDeleteYearData: (year: string) => Promise<number>;
  onDeleteProjectData: (projectId: string) => Promise<number>;
  projectId: string;
  projectName: string;
  templates: FormTemplate[];
  canManageData: boolean;
}

type FileItemStatus = 'pending' | 'processing' | 'success' | 'error';

interface FileItem {
  file: File;
  unitCode: string;
  status: FileItemStatus;
  message?: string;
  importedRows?: number;
}

export function ImportFiles({
  onDataImported,
  onDeleteUnitData,
  onDeleteYearData,
  onDeleteProjectData,
  projectId,
  projectName,
  templates,
  canManageData,
}: ImportFilesProps) {
  const [selectedYear, setSelectedYear] = useState(() => getPreferredReportingYear());
  const [pinnedYear, setPinnedYear] = useState<string | null>(() => getPinnedYearPreference());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id || '');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedUnitToDelete, setSelectedUnitToDelete] = useState('');
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const [isManagingData, setIsManagingData] = useState(false);
  const [autoDetectSheets, setAutoDetectSheets] = useState(false);
  const [includeExtraSheets, setIncludeExtraSheets] = useState(true);

  const selectedTemplate = templates.find((tpl) => tpl.id === selectedTemplateId) || null;

  useEffect(() => {
    if (templates.length > 0 && !templates.find((tpl) => tpl.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((f) => ({
        file: f,
        unitCode: '',
        status: 'pending' as const,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateUnit = (index: number, code: string) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, unitCode: code } : f)));
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
        message: 'Đang đọc dữ liệu Excel và chuẩn hóa biểu...',
      };
      setFiles([...nextFiles]);

      try {
        let rows: DataRow[] = [];

        if (autoDetectSheets) {
          const data = await fileItem.file.arrayBuffer();
          const workbook = XLSX.read(data, { type: 'array', cellFormula: true, cellHTML: false, cellText: false });
          const availableSheets = new Set(Object.keys(workbook.Sheets));

          const templatesToScan = includeExtraSheets ? templates : selectedTemplate ? [selectedTemplate] : templates;

          templatesToScan.forEach((tpl) => {
            if (!availableSheets.has(tpl.sheetName)) {
              return;
            }
            const parsed =
              tpl.mode === 'LEGACY'
                ? parseLegacyFromWorkbook(workbook, fileItem.unitCode, selectedYear, tpl.sheetName, projectId, tpl.id)
                : parseTemplateFromWorkbook(workbook, tpl, fileItem.unitCode, selectedYear);
            rows = rows.concat(parsed);
          });

          if (rows.length === 0) {
            throw new Error('Không tìm thấy biểu phù hợp trong file. Hãy kiểm tra tên sheet.');
          }
        } else {
          rows =
            selectedTemplate!.mode === 'LEGACY'
              ? await parseLegacySheet(fileItem.file, fileItem.unitCode, selectedYear, selectedTemplate!.sheetName, projectId, selectedTemplate!.id)
              : await parseTemplateSheet(fileItem.file, selectedTemplate!, fileItem.unitCode, selectedYear);
        }

        await onDataImported(rows);

        nextFiles[index] = {
          ...fileItem,
          status: 'success',
          importedRows: rows.length,
          message: autoDetectSheets
            ? `Đã lưu ${rows.length} dòng dữ liệu cho các biểu trong sheet.`
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
    const confirmed = window.confirm(`Xóa toàn bộ dữ liệu của đơn vị "${unitName}" trong nam ${selectedYear}?`);

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
    const confirmed = window.confirm(`Xóa toàn bộ dữ liệu đã lưu của năm ${selectedYear}?`);

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
    const confirmed = window.confirm(
      `Xóa toàn bộ dữ liệu, biểu mẫu và dự án "${projectName}"? Hành động này không thể hoàn tác.`,
    );
    if (!confirmed) return;

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteProjectData(projectId);
      setManagementMessage(
        deletedCount > 0
          ? `Đã xóa toàn bộ dữ liệu, biểu mẫu và dự án ${projectName}.`
          : `Không có dữ liệu nào của dự án ${projectName} để xóa.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'Không thể xóa dữ liệu dự án.');
    } finally {
      setIsManagingData(false);
    }
  };

  const isPinnedYear = pinnedYear === selectedYear;

  return (
    <div className="max-w-5xl p-6 md:p-8">
      <header className="mb-10">
        <h2 className="page-title">Tiếp nhận dữ liệu</h2>
        <p className="page-subtitle mt-2 text-sm">
          Dự án: <span className="font-semibold">{projectName}</span>. Chọn năm tổng hợp và tải lên các file báo cáo từ đơn vị cơ sở.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="panel-soft rounded-[24px] p-6">
          <label className="col-header block mb-2">Biểu mẫu</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="field-select"
            disabled={autoDetectSheets}
          >
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </select>
          <label className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            <input
              type="checkbox"
              checked={autoDetectSheets}
              onChange={(e) => setAutoDetectSheets(e.target.checked)}
              className="theme-checkbox h-3.5 w-3.5"
            />
            Tự nhận nhiều sheet theo template
          </label>
          {autoDetectSheets && (
            <label className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
              <input
                type="checkbox"
                checked={includeExtraSheets}
                onChange={(e) => setIncludeExtraSheets(e.target.checked)}
                className="theme-checkbox h-3.5 w-3.5"
              />
              Quét toàn bộ template của dự án
            </label>
          )}
          <p className="mt-3 text-xs text-[var(--ink-soft)]">Chọn biểu mẫu đã được học hoặc thiết lập.</p>
        </div>

        <div className="panel-soft rounded-[24px] p-6">
          <label className="col-header block mb-2">Năm tổng hợp</label>
          <select
            value={selectedYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className="field-select"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            <input
              type="checkbox"
              checked={isPinnedYear}
              onChange={(e) => togglePinnedYear(e.target.checked)}
              className="theme-checkbox h-3.5 w-3.5"
            />
            Ghim năm này cho lần nhập sau
          </label>
        </div>

        {canManageData && (
          <div className="panel-card rounded-[24px] p-6">
            <label className="col-header block mb-2">Quản trị dữ liệu theo năm</label>
            <div className="space-y-4">
              <select
                value={selectedUnitToDelete}
                onChange={(e) => setSelectedUnitToDelete(e.target.value)}
                className="field-select text-sm"
              >
                <option value="">-- Chọn đơn vị --</option>
                {UNITS.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}
              </select>

              <button
                onClick={handleDeleteUnit}
                disabled={isManagingData || !selectedUnitToDelete}
                className="secondary-btn w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isManagingData ? 'Đang xóa...' : 'Xóa dữ liệu đơn vị?'}
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
                disabled={isManagingData}
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
        <div className="space-y-4 mb-8">
          {files.map((f, i) => (
            <div key={i} className="panel-card flex items-center gap-4 rounded-[22px] p-4">
              <div className="flex-1">
                <p className="text-sm font-bold truncate">{f.file.name}</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">{(f.file.size / 1024).toFixed(1)} KB</p>
                {f.message && (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">{f.message}</p>
                )}
              </div>

              <select
                value={f.unitCode}
                onChange={(e) => updateUnit(i, e.target.value)}
                className="field-select w-48 py-1 text-xs"
              >
                <option value="">-- Chọn đơn vị --</option>
                {UNITS.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
              </select>

              {f.status === 'processing' && <LoaderCircle className="animate-spin" size={18} />}
              {f.status === 'success' && <FileCheck className="text-[var(--success)]" size={18} />}
              {f.status === 'error' && <AlertCircle className="text-[var(--primary)]" size={18} />}

              <button onClick={() => removeFile(i)} className="rounded p-1 transition-colors hover:bg-[var(--surface-alt)]">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={processFiles}
        disabled={files.length === 0 || files.some((f) => !f.unitCode) || files.some((file) => file.status === 'processing') || isManagingData}
        className="primary-btn px-8 py-4 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Bắt đầu tổng hợp
      </button>
    </div>
  );
}




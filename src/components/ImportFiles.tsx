import React, { useState } from 'react';
import { Upload, FileCheck, AlertCircle, X, LoaderCircle } from 'lucide-react';
import { UNITS, YEARS } from '../constants';
import { DataRow } from '../types';
import { parseExcelReportFile } from '../utils/excelParser';
import { getPinnedYearPreference, getPreferredReportingYear, setPinnedYearPreference } from '../utils/reportingYear';

interface ImportFilesProps {
  onDataImported: (newData: DataRow[]) => Promise<void>;
  onDeleteUnitData: (year: string, unitCode: string) => Promise<number>;
  onDeleteYearData: (year: string) => Promise<number>;
}

type FileItemStatus = 'pending' | 'processing' | 'success' | 'error';

interface FileItem {
  file: File;
  unitCode: string;
  status: FileItemStatus;
  message?: string;
  importedRows?: number;
  importedSheets?: string[];
  missingSheets?: string[];
}

export function ImportFiles({ onDataImported, onDeleteUnitData, onDeleteYearData }: ImportFilesProps) {
  const [selectedYear, setSelectedYear] = useState(() => getPreferredReportingYear());
  const [pinnedYear, setPinnedYear] = useState<string | null>(() => getPinnedYearPreference());
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedUnitToDelete, setSelectedUnitToDelete] = useState('');
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const [isManagingData, setIsManagingData] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(f => ({
        file: f,
        unitCode: '',
        status: 'pending' as const
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateUnit = (index: number, code: string) => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, unitCode: code } : f));
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
        message: 'Đang đọc dữ liệu Excel và chuẩn hóa các biểu...',
      };
      setFiles([...nextFiles]);

      try {
        const parsedWorkbook = await parseExcelReportFile(fileItem.file, fileItem.unitCode, selectedYear);
        await onDataImported(parsedWorkbook.rows);

        const summary = [
          `Đã lưu ${parsedWorkbook.rows.length} dòng dữ liệu.`,
          `Biểu đã nhập: ${parsedWorkbook.importedSheets.join(', ')}.`,
        ];

        if (parsedWorkbook.missingSheets.length > 0) {
          summary.push(`Biểu không tìm thấy: ${parsedWorkbook.missingSheets.join(', ')}.`);
        }

        nextFiles[index] = {
          ...fileItem,
          status: 'success',
          importedRows: parsedWorkbook.rows.length,
          importedSheets: parsedWorkbook.importedSheets,
          missingSheets: parsedWorkbook.missingSheets,
          message: summary.join(' '),
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

  const isPinnedYear = pinnedYear === selectedYear;

  return (
    <div className="max-w-5xl p-6 md:p-8">
      <header className="mb-12">
        <h2 className="page-title">Tiếp nhận dữ liệu</h2>
        <p className="page-subtitle mt-2 text-sm">Chọn năm tổng hợp và tải lên các file báo cáo từ đơn vị cơ sở.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="panel-soft rounded-[24px] p-6">
          <label className="col-header block mb-2">Năm tổng hợp</label>
          <select 
            value={selectedYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className="field-select"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
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

        <div className="panel-card rounded-[24px] p-6 md:col-span-2">
          <label className="col-header block mb-2">Quản trị dữ liệu theo năm</label>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 items-end">
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">Đơn vị cần xóa dữ liệu</label>
              <select
                value={selectedUnitToDelete}
                onChange={(e) => setSelectedUnitToDelete(e.target.value)}
                className="field-select mt-2 text-sm"
              >
                <option value="">-- Chọn đơn vị --</option>
                {UNITS.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}
              </select>
            </div>

            <button
              onClick={handleDeleteUnit}
              disabled={isManagingData || !selectedUnitToDelete}
              className="secondary-btn px-5 py-3 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isManagingData ? 'Đang xóa...' : 'Xóa dữ liệu đơn vị'}
            </button>

            <button
              onClick={handleDeleteYear}
              disabled={isManagingData}
              className="primary-btn px-5 py-3 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xóa toàn bộ năm
            </button>
          </div>

          {managementMessage && (
            <p className="mt-4 text-xs font-medium text-[var(--ink-soft)]">{managementMessage}</p>
          )}
        </div>
      </div>

      <div className="relative mb-8 rounded-[26px] border-2 border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)] p-12 text-center transition-colors hover:border-[var(--primary)]">
        <input 
          type="file" 
          multiple 
          accept=".xlsx,.xlsm,.xls"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
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
                {UNITS.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
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
        disabled={files.length === 0 || files.some(f => !f.unitCode) || files.some((file) => file.status === 'processing') || isManagingData}
        className="primary-btn px-8 py-4 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Bắt đầu tổng hợp
      </button>
    </div>
  );
}

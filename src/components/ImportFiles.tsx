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
    <div className="p-8 max-w-4xl">
      <header className="mb-12">
        <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">Tiếp nhận dữ liệu</h2>
        <p className="text-sm opacity-60 mt-2">Chọn năm và tải lên các file báo cáo từ đơn vị cơ sở.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="p-6 border border-black bg-white/50">
          <label className="col-header block mb-2">Năm tổng hợp</label>
          <select 
            value={selectedYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className="w-full bg-transparent border-b border-black py-2 font-mono focus:outline-none"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
            <input
              type="checkbox"
              checked={isPinnedYear}
              onChange={(e) => togglePinnedYear(e.target.checked)}
              className="h-3.5 w-3.5 accent-black"
            />
            Ghim năm này cho lần nhập sau
          </label>
        </div>

        <div className="md:col-span-2 p-6 border border-black bg-white">
          <label className="col-header block mb-2">Quản trị dữ liệu theo năm</label>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 items-end">
            <div>
              <label className="text-[10px] uppercase tracking-widest opacity-50">Đơn vị cần xóa dữ liệu</label>
              <select
                value={selectedUnitToDelete}
                onChange={(e) => setSelectedUnitToDelete(e.target.value)}
                className="mt-2 w-full border-b border-black bg-transparent py-2 text-sm focus:outline-none"
              >
                <option value="">-- Chọn đơn vị --</option>
                {UNITS.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}
              </select>
            </div>

            <button
              onClick={handleDeleteUnit}
              disabled={isManagingData || !selectedUnitToDelete}
              className="px-5 py-3 border border-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isManagingData ? 'Đang xóa...' : 'Xóa dữ liệu đơn vị'}
            </button>

            <button
              onClick={handleDeleteYear}
              disabled={isManagingData}
              className="px-5 py-3 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-widest hover:bg-black/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Xóa toàn bộ năm
            </button>
          </div>

          {managementMessage && (
            <p className="mt-4 text-xs font-medium opacity-70">{managementMessage}</p>
          )}
        </div>
      </div>

      <div className="border-2 border-dashed border-black/20 p-12 text-center mb-8 hover:border-black transition-colors relative">
        <input 
          type="file" 
          multiple 
          accept=".xlsx,.xlsm,.xls"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <Upload className="mx-auto mb-4 opacity-20" size={48} />
        <p className="text-sm font-medium">Kéo thả hoặc click để chọn file Excel (.xlsx, .xlsm)</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-4 mb-8">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border border-black bg-white">
              <div className="flex-1">
                <p className="text-sm font-bold truncate">{f.file.name}</p>
                <p className="text-[10px] opacity-50 uppercase">{(f.file.size / 1024).toFixed(1)} KB</p>
                {f.message && (
                  <p className="mt-2 text-xs opacity-70 leading-relaxed">{f.message}</p>
                )}
              </div>
              
              <select 
                value={f.unitCode}
                onChange={(e) => updateUnit(i, e.target.value)}
                className="text-xs border-b border-black py-1 bg-transparent focus:outline-none w-48"
              >
                <option value="">-- Chọn đơn vị --</option>
                {UNITS.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
              </select>

              {f.status === 'processing' && <LoaderCircle className="animate-spin" size={18} />}
              {f.status === 'success' && <FileCheck className="text-green-600" size={18} />}
              {f.status === 'error' && <AlertCircle className="text-red-600" size={18} />}
              
              <button onClick={() => removeFile(i)} className="p-1 hover:bg-black/5 rounded">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button 
        onClick={processFiles}
        disabled={files.length === 0 || files.some(f => !f.unitCode) || files.some((file) => file.status === 'processing') || isManagingData}
        className="px-8 py-4 bg-[#141414] text-[#E4E3E0] text-sm font-bold uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform"
      >
        Bắt đầu tổng hợp
      </button>
    </div>
  );
}

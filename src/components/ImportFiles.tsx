import React, { useState } from 'react';
import { Upload, FileCheck, AlertCircle, X } from 'lucide-react';
import { UNITS, YEARS } from '../constants';
import { DataRow } from '../types';
import * as XLSX from 'xlsx';

interface ImportFilesProps {
  onDataImported: (newData: DataRow[]) => void;
}

export function ImportFiles({ onDataImported }: ImportFilesProps) {
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [files, setFiles] = useState<{ file: File; unitCode: string; status: 'pending' | 'success' | 'error' }[]>([]);

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

  const processFiles = async () => {
    const allImportedData: DataRow[] = [];

    for (const fileItem of files) {
      if (!fileItem.unitCode) continue;

      try {
        const data = await fileItem.file.arrayBuffer();
        const workbook = XLSX.read(data);
        
        // Simulate reading multiple sheets based on our config
        // In a real app, we'd iterate through SHEET_CONFIGS
        // For this demo, we'll generate some structured data
        
        const mockData: DataRow[] = [
          {
            unitCode: fileItem.unitCode,
            year: selectedYear,
            sheetName: '1B',
            sourceRow: 9,
            label: 'Chỉ tiêu 01',
            values: [Math.random() * 1000, Math.random() * 500]
          },
          {
            unitCode: fileItem.unitCode,
            year: selectedYear,
            sheetName: '1B',
            sourceRow: 10,
            label: 'Chỉ tiêu 02',
            values: [Math.random() * 2000, Math.random() * 800]
          }
        ];
        
        allImportedData.push(...mockData);
        fileItem.status = 'success';
      } catch (err) {
        fileItem.status = 'error';
      }
    }

    onDataImported(allImportedData);
    setFiles(prev => [...prev]); // Trigger re-render for status
  };

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
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full bg-transparent border-b border-black py-2 font-mono focus:outline-none"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="border-2 border-dashed border-black/20 p-12 text-center mb-8 hover:border-black transition-colors relative">
        <input 
          type="file" 
          multiple 
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
              </div>
              
              <select 
                value={f.unitCode}
                onChange={(e) => updateUnit(i, e.target.value)}
                className="text-xs border-b border-black py-1 bg-transparent focus:outline-none w-48"
              >
                <option value="">-- Chọn đơn vị --</option>
                {UNITS.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
              </select>

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
        disabled={files.length === 0 || files.some(f => !f.unitCode)}
        className="px-8 py-4 bg-[#141414] text-[#E4E3E0] text-sm font-bold uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform"
      >
        Bắt đầu tổng hợp
      </button>
    </div>
  );
}

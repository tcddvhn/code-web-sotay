import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Project, FormTemplate, DataRow } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { FileUp, CheckCircle, AlertCircle, Loader2, FolderOpen, FileSpreadsheet } from 'lucide-react';
import { UNITS, YEARS } from '../constants';

interface ImportFilesProps {
  onDataImported: (data: DataRow[]) => void;
}

export function ImportFiles({ onDataImported }: ImportFilesProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [selectedUnit, setSelectedUnit] = useState(UNITS[0].code);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(list);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setTemplates([]);
      return;
    }
    const q = query(collection(db, 'templates'), where('projectId', '==', selectedProject.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FormTemplate));
      setTemplates(list);
    });
    return () => unsubscribe();
  }, [selectedProject]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedProject || !selectedTemplate) return;
    
    setIsProcessing(true);
    setStatus(null);

    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[selectedTemplate.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
        
        const { labelColumn, dataColumns, startRow, endRow } = selectedTemplate.columnMapping;
        const rows: DataRow[] = [];

        // Parse rows based on template mapping
        for (let r = startRow; r <= endRow; r++) {
          const labelCell = sheet[`${labelColumn}${r}`];
          if (!labelCell || !labelCell.v) continue;

          const values: number[] = dataColumns.map(col => {
            const cell = sheet[`${col}${r}`];
            return cell ? Number(cell.v) || 0 : 0;
          });

          rows.push({
            projectId: selectedProject.id,
            templateId: selectedTemplate.id,
            unitCode: selectedUnit,
            year: selectedYear,
            sourceRow: r,
            label: String(labelCell.v),
            values
          });
        }

        if (rows.length === 0) {
          throw new Error('Không tìm thấy dữ liệu phù hợp trong file.');
        }

        onDataImported(rows);
        setStatus({ type: 'success', message: `Đã tiếp nhận ${rows.length} hàng dữ liệu thành công!` });
      } catch (err) {
        console.error(err);
        setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Lỗi khi xử lý file Excel.' });
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="p-8">
      <div className="mb-12">
        <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">Tiếp nhận Dữ liệu</h2>
        <p className="text-sm opacity-60 mt-2">Chọn dự án và biểu mẫu tương ứng để bắt đầu nạp dữ liệu.</p>
      </div>

      <div className="max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <div className="p-8 border border-black bg-white">
          <h3 className="col-header mb-6">1. Chọn Dự án & Biểu mẫu</h3>
          <div className="space-y-6">
            <div>
              <label className="text-[10px] uppercase tracking-widest opacity-50 block mb-2">Dự án triển khai</label>
              <select 
                value={selectedProject?.id || ''} 
                onChange={(e) => setSelectedProject(projects.find(p => p.id === e.target.value) || null)}
                className="w-full bg-transparent border-b border-black py-2 font-bold focus:outline-none"
              >
                <option value="">-- Chọn dự án --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest opacity-50 block mb-2">Biểu mẫu (Template)</label>
              <select 
                value={selectedTemplate?.id || ''} 
                onChange={(e) => setSelectedTemplate(templates.find(t => t.id === e.target.value) || null)}
                className="w-full bg-transparent border-b border-black py-2 font-bold focus:outline-none"
                disabled={!selectedProject}
              >
                <option value="">-- Chọn biểu mẫu --</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="p-8 border border-black bg-white">
          <h3 className="col-header mb-6">2. Thông tin Đơn vị & Năm</h3>
          <div className="space-y-6">
            <div>
              <label className="text-[10px] uppercase tracking-widest opacity-50 block mb-2">Đơn vị báo cáo</label>
              <select 
                value={selectedUnit} 
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full bg-transparent border-b border-black py-2 font-bold focus:outline-none"
              >
                {UNITS.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest opacity-50 block mb-2">Năm báo cáo</label>
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-transparent border-b border-black py-2 font-bold focus:outline-none"
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl">
        <div className={`p-16 border-2 border-dashed border-black bg-white/50 text-center relative transition-all ${(!selectedProject || !selectedTemplate) ? 'opacity-30 grayscale pointer-events-none' : 'hover:bg-white'}`}>
          {isProcessing ? (
            <div className="flex flex-col items-center">
              <Loader2 className="animate-spin mb-4" size={48} />
              <p className="text-sm font-bold uppercase tracking-widest">Đang xử lý dữ liệu...</p>
            </div>
          ) : (
            <>
              <FileUp className="mx-auto mb-4 opacity-20" size={64} />
              <h3 className="text-xl font-bold mb-4">Tải lên file báo cáo</h3>
              <p className="text-xs opacity-50 mb-8 uppercase tracking-widest">Hệ thống sẽ tự động parse theo Template đã chọn</p>
              
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleFileUpload}
                className="hidden" 
                id="file-upload"
              />
              <label 
                htmlFor="file-upload"
                className="px-12 py-5 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-widest cursor-pointer hover:scale-105 transition-transform inline-block"
              >
                Chọn file từ máy tính
              </label>
            </>
          )}
        </div>

        {status && (
          <div className={`mt-8 p-6 border flex items-center gap-4 animate-in fade-in slide-in-from-top-4 ${status.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {status.type === 'success' ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
            <p className="text-sm font-bold">{status.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

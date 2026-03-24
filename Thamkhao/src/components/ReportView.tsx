import React, { useState, useEffect, useMemo } from 'react';
import { Project, FormTemplate, DataRow, ConsolidatedData } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { UNITS, YEARS } from '../constants';
import { FileText, Download, Filter, Search, ChevronRight, FolderOpen } from 'lucide-react';
import * as XLSX from 'xlsx';

export function ReportView({ data }: { data: ConsolidatedData }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [searchTerm, setSearchTerm] = useState('');

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

  const aggregatedData = useMemo(() => {
    if (!selectedTemplate) return [];
    const rows = data[selectedTemplate.id] || [];
    
    // Filter by year
    const yearRows = rows.filter(row => row.year === selectedYear);
    
    // Group by label (criteria)
    const labelGroups: { [label: string]: DataRow[] } = {};
    yearRows.forEach(row => {
      if (!labelGroups[row.label]) labelGroups[row.label] = [];
      labelGroups[row.label].push(row);
    });

    // Create total rows for TOTAL_HN
    const totalRows: DataRow[] = Object.entries(labelGroups).map(([label, group]) => {
      const numValues = selectedTemplate.columnMapping.dataColumns.length;
      const summedValues = new Array(numValues).fill(0);
      
      group.forEach(row => {
        row.values.forEach((val, i) => {
          summedValues[i] += val;
        });
      });

      return {
        projectId: selectedTemplate.projectId,
        templateId: selectedTemplate.id,
        unitCode: 'TOTAL_HN',
        year: selectedYear,
        sourceRow: group[0].sourceRow,
        label: label,
        values: summedValues
      };
    });

    // Combine original data with total rows
    const combined = [...yearRows, ...totalRows];

    return combined.filter(row => 
      row.label.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => a.sourceRow - b.sourceRow);
  }, [data, selectedTemplate, selectedYear, searchTerm]);

  const exportToExcel = () => {
    if (!selectedTemplate || aggregatedData.length === 0) return;

    const exportRows = aggregatedData.map(row => {
      const unit = UNITS.find(u => u.code === row.unitCode);
      const rowData: any = {
        'Don v?': unit?.name || row.unitCode,
        'Nam': row.year,
        'Ti�u ch�': row.label,
      };
      row.values.forEach((val, i) => {
        rowData[selectedTemplate.columnHeaders[i] || `Gi� tr? ${i + 1}`] = val;
      });
      return rowData;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "B�o c�o");
    XLSX.writeFile(wb, `BaoCao_${selectedTemplate.name}_${selectedYear}.xlsx`);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-12">
        <div>
          <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">B�o c�o T?ng h?p</h2>
          <p className="text-sm opacity-60 mt-2">Truy xu?t d? li?u d� du?c t?ng h?p theo d? �n v� bi?u m?u.</p>
        </div>
        <button 
          onClick={exportToExcel}
          disabled={!selectedTemplate || aggregatedData.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-30 disabled:grayscale"
        >
          <Download size={16} />
          Xu?t file Excel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="p-6 border border-black bg-white">
          <label className="col-header block mb-2">1. Ch?n D? �n</label>
          <select 
            value={selectedProject?.id || ''} 
            onChange={(e) => setSelectedProject(projects.find(p => p.id === e.target.value) || null)}
            className="w-full bg-transparent border-b border-black py-2 font-bold focus:outline-none"
          >
            <option value="">-- Ch?n d? �n --</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="p-6 border border-black bg-white">
          <label className="col-header block mb-2">2. Ch?n Nam</label>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full bg-transparent border-b border-black py-2 font-bold focus:outline-none"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="p-6 border border-black bg-white">
          <label className="col-header block mb-2">3. T�m ki?m ti�u ch�</label>
          <div className="flex items-center gap-2 border-b border-black py-2">
            <Search size={16} className="opacity-40" />
            <input 
              type="text" 
              placeholder="T�n ti�u ch�..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent focus:outline-none font-medium"
            />
          </div>
        </div>
      </div>

      {selectedProject && templates.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8 border-b border-black/10 pb-4">
          {templates.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => setSelectedTemplate(tpl)}
              className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest border transition-all ${selectedTemplate?.id === tpl.id ? 'bg-black text-white border-black' : 'bg-white text-black border-black/20 hover:border-black'}`}
            >
              {tpl.name}
            </button>
          ))}
        </div>
      )}

      {!selectedTemplate ? (
        <div className="h-[400px] border border-black bg-white/50 flex flex-col items-center justify-center text-center p-12">
          <FolderOpen className="opacity-10 mb-4" size={80} />
          <h3 className="text-xl font-bold italic font-serif">Vui l�ng ch?n D? �n v� Bi?u m?u</h3>
          <p className="text-[10px] uppercase tracking-widest opacity-50 mt-2">D? li?u s? du?c hi?n th? sau khi b?n ch?n c?u h�nh b�o c�o</p>
        </div>
      ) : (
        <div className="border border-black bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#141414] text-[#E4E3E0]">
                  <th className="p-4 text-[10px] uppercase tracking-widest font-bold border-r border-white/10 sticky left-0 bg-[#141414] z-10">Don v?</th>
                  <th className="p-4 text-[10px] uppercase tracking-widest font-bold border-r border-white/10">Ti�u ch�</th>
                  {selectedTemplate.columnHeaders.map((header, i) => (
                    <th key={i} className="p-4 text-[10px] uppercase tracking-widest font-bold border-r border-white/10 text-center min-w-[120px]">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aggregatedData.length > 0 ? (
                  aggregatedData.map((row, idx) => {
                    const unit = UNITS.find(u => u.code === row.unitCode);
                    const isTotal = row.unitCode === 'TOTAL_HN';
                    return (
                      <tr key={idx} className={`border-b border-black/5 hover:bg-black/5 transition-colors group ${isTotal ? 'bg-blue-50/50 font-bold' : ''}`}>
                        <td className={`p-4 text-xs border-r border-black/5 sticky left-0 z-10 ${isTotal ? 'bg-blue-50' : 'bg-white group-hover:bg-gray-50'}`}>
                          {unit?.name || row.unitCode}
                        </td>
                        <td className="p-4 text-xs border-r border-black/5">{row.label}</td>
                        {row.values.map((val, i) => (
                          <td key={i} className="p-4 text-xs font-mono text-center border-r border-black/5">
                            {val.toLocaleString()}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={2 + selectedTemplate.columnHeaders.length} className="p-12 text-center opacity-40 italic">
                      Kh�ng t�m th?y d? li?u cho ti�u ch� n�y.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


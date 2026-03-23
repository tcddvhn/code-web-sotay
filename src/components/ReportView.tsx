import React, { useState, useMemo } from 'react';
import { SHEET_CONFIGS, UNITS, YEARS, SHEET_LABELS, SHEET_COLUMN_HEADERS } from '../constants';
import { ConsolidatedData, DataRow } from '../types';
import { Info, X } from 'lucide-react';
import { getPinnedYearPreference, getPreferredReportingYear, setPinnedYearPreference } from '../utils/reportingYear';

interface ReportViewProps {
  data: ConsolidatedData;
}

export function ReportView({ data }: ReportViewProps) {
  const [selectedSheet, setSelectedSheet] = useState(SHEET_CONFIGS[0].name);
  const [selectedYear, setSelectedYear] = useState(() => getPreferredReportingYear());
  const [pinnedYear, setPinnedYear] = useState<string | null>(() => getPinnedYearPreference());
  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [drillDown, setDrillDown] = useState<{ row: DataRow; colIndex: number } | null>(null);

  const currentConfig = useMemo(() => 
    SHEET_CONFIGS.find(s => s.name === selectedSheet)!, 
  [selectedSheet]);

  const headers = useMemo(() => {
    const customHeaders = SHEET_COLUMN_HEADERS[selectedSheet];
    if (customHeaders) return customHeaders;
    
    const colCount = currentConfig.endCol - currentConfig.startCol + 1;
    return Array.from({ length: colCount }).map((_, i) => `Cột ${i + 1}`);
  }, [selectedSheet, currentConfig]);

  const reportRows = useMemo(() => {
    const sheetData = data[selectedSheet] || [];
    const filteredByYear = sheetData.filter(d => d.year === selectedYear);
    const labels = SHEET_LABELS[selectedSheet] || [];
    
    // Create a base structure for all expected rows in this sheet
    const rows: DataRow[] = [];
    for (let r = currentConfig.startRow; r <= currentConfig.endRow; r++) {
      const labelDef = labels.find(l => l.row === r);
      const label = labelDef ? labelDef.label : `Dòng ${r}`;
      
      if (selectedUnit === 'ALL') {
        const matchingRows = filteredByYear.filter(d => d.sourceRow === r);
        const colCount = currentConfig.endCol - currentConfig.startCol + 1;
        const aggregatedValues = new Array(colCount).fill(0);
        
        matchingRows.forEach(mr => {
          mr.values.forEach((v, i) => {
            if (i < colCount) aggregatedValues[i] += v;
          });
        });

        rows.push({
          unitCode: 'ALL',
          year: selectedYear,
          sheetName: selectedSheet,
          sourceRow: r,
          label: label,
          values: aggregatedValues
        });
      } else {
        const unitRow = filteredByYear.find(d => d.unitCode === selectedUnit && d.sourceRow === r);
        const colCount = currentConfig.endCol - currentConfig.startCol + 1;
        
        rows.push({
          unitCode: selectedUnit,
          year: selectedYear,
          sheetName: selectedSheet,
          sourceRow: r,
          label: label,
          values: unitRow ? unitRow.values : new Array(colCount).fill(0)
        });
      }
    }
    return rows;
  }, [data, selectedSheet, selectedYear, selectedUnit, currentConfig]);

  const getDrillDownData = (sourceRow: number, colIndex: number) => {
    const sheetData = data[selectedSheet] || [];
    return sheetData
      .filter(d => d.year === selectedYear && d.sourceRow === sourceRow && d.values[colIndex] !== 0)
      .map(d => ({
        unitName: UNITS.find(u => u.code === d.unitCode)?.name || d.unitCode,
        value: d.values[colIndex]
      }))
      .sort((a, b) => b.value - a.value);
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

  const isPinnedYear = pinnedYear === selectedYear;

  return (
    <div className="p-8 h-screen flex flex-col">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">Báo cáo chi tiết</h2>
          <p className="text-sm opacity-60 mt-2">Biểu {selectedSheet} / Năm {selectedYear} / {selectedUnit === 'ALL' ? 'Tổng hợp toàn đơn vị' : UNITS.find(u => u.code === selectedUnit)?.name}</p>
        </div>

        <div className="flex gap-4">
          <div className="px-4 py-2 border border-black bg-white">
            <label className="col-header block mb-1">Biểu mẫu</label>
            <select 
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="bg-transparent text-sm font-bold focus:outline-none"
            >
              {SHEET_CONFIGS.map(s => <option key={s.name} value={s.name}>Biểu {s.name}</option>)}
            </select>
          </div>
          <div className="px-4 py-2 border border-black bg-white">
            <label className="col-header block mb-1">Năm</label>
            <select 
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="bg-transparent text-sm font-bold focus:outline-none"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
              <input
                type="checkbox"
                checked={isPinnedYear}
                onChange={(e) => togglePinnedYear(e.target.checked)}
                className="h-3.5 w-3.5 accent-black"
              />
              Ghim năm này cho lần mở sau
            </label>
          </div>
          <div className="px-4 py-2 border border-black bg-white">
            <label className="col-header block mb-1">Đơn vị</label>
            <select 
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="bg-transparent text-sm font-bold focus:outline-none"
            >
              <option value="ALL">-- TỔNG HỢP --</option>
              {UNITS.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto border border-black bg-white shadow-2xl">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[#141414] text-[#E4E3E0] z-10">
            <tr>
              <th className="p-4 text-left border-r border-white/20 w-16 text-[10px] uppercase tracking-widest">STT</th>
              <th className="p-4 text-left border-r border-white/20 min-w-[300px] text-[10px] uppercase tracking-widest">Chỉ tiêu / Tiêu chí</th>
              {headers.map((h, i) => (
                <th key={i} className="p-4 text-right border-r border-white/20 text-[10px] uppercase tracking-widest min-w-[120px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportRows.length > 0 ? reportRows.map((row, idx) => (
              <tr key={idx} className="border-b border-black/10 hover:bg-black/5 transition-colors group">
                <td className="p-4 border-r border-black/10 font-mono text-xs opacity-50">{idx + 1}</td>
                <td className="p-4 border-r border-black/10 text-sm font-medium">{row.label}</td>
                {row.values.map((val, vIdx) => (
                  <td 
                    key={vIdx} 
                    className="p-4 border-r border-black/10 text-right data-value text-sm cursor-pointer hover:bg-black hover:text-white transition-colors relative"
                    onClick={() => selectedUnit === 'ALL' && val !== 0 && setDrillDown({ row, colIndex: vIdx })}
                  >
                    {val !== 0 ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                    {selectedUnit === 'ALL' && val !== 0 && (
                      <Info size={10} className="absolute top-1 right-1 opacity-0 group-hover:opacity-30" />
                    )}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={100} className="p-12 text-center opacity-30 italic">Không có dữ liệu cho lựa chọn này</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {drillDown && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-[#E4E3E0] border border-black w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
            <div className="p-6 border-b border-black flex justify-between items-center bg-[#141414] text-[#E4E3E0]">
              <div>
                <h3 className="text-xl font-bold tracking-tighter uppercase italic font-serif">Chi tiết theo đơn vị</h3>
                <p className="text-[10px] uppercase tracking-widest opacity-60 mt-1">
                  {drillDown.row.label} / {headers[drillDown.colIndex]}
                </p>
              </div>
              <button onClick={() => setDrillDown(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto">
              <div className="p-6">
                <div className="grid grid-cols-1 gap-px bg-black/20 border border-black/20">
                  <div className="grid grid-cols-[40px_1fr_120px_80px] bg-[#141414] text-[#E4E3E0] p-3 text-[10px] uppercase tracking-widest font-bold">
                    <span>#</span>
                    <span>Đơn vị</span>
                    <span className="text-right">Giá trị</span>
                    <span className="text-right">Tỷ trọng</span>
                  </div>
                  {getDrillDownData(drillDown.row.sourceRow, drillDown.colIndex).map((item, i, arr) => {
                    const total = arr.reduce((sum, curr) => sum + curr.value, 0);
                    return (
                      <div key={i} className="grid grid-cols-[40px_1fr_120px_80px] bg-white p-3 text-sm items-center hover:bg-black hover:text-white transition-colors">
                        <span className="font-mono text-xs opacity-50">{i + 1}</span>
                        <span className="font-medium">{item.unitName}</span>
                        <span className="text-right data-value">{item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-right text-xs opacity-60 italic">
                          {((item.value / total) * 100).toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-black bg-white/50 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest">Tổng cộng</span>
              <span className="text-xl font-bold data-value">
                {getDrillDownData(drillDown.row.sourceRow, drillDown.colIndex).reduce((s, c) => s + c.value, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

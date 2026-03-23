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
    <div className="flex h-screen flex-col p-6 md:p-8">
      <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="page-title">Báo cáo chi tiết</h2>
          <p className="page-subtitle mt-2 text-sm">Biểu {selectedSheet} / Năm {selectedYear} / {selectedUnit === 'ALL' ? 'Tổng hợp toàn đơn vị' : UNITS.find(u => u.code === selectedUnit)?.name}</p>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap xl:flex-nowrap">
          <div className="panel-card rounded-[20px] px-4 py-3">
            <label className="col-header block mb-1">Biểu mẫu</label>
            <select 
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="field-select text-sm font-bold"
            >
              {SHEET_CONFIGS.map(s => <option key={s.name} value={s.name}>Biểu {s.name}</option>)}
            </select>
          </div>
          <div className="panel-card rounded-[20px] px-4 py-3">
            <label className="col-header block mb-1">Năm</label>
            <select 
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="field-select text-sm font-bold"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
              <input
                type="checkbox"
                checked={isPinnedYear}
                onChange={(e) => togglePinnedYear(e.target.checked)}
                className="theme-checkbox h-3.5 w-3.5"
              />
              Ghim năm này cho lần mở sau
            </label>
          </div>
          <div className="panel-card rounded-[20px] px-4 py-3">
            <label className="col-header block mb-1">Đơn vị</label>
            <select 
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="field-select text-sm font-bold"
            >
              <option value="ALL">-- TỔNG HỢP --</option>
              {UNITS.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </div>
        </div>
      </header>

      <div className="table-shell flex-1 overflow-auto rounded-[28px]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-16 border-r border-white/20 p-4 text-left text-[10px] uppercase tracking-[0.18em]">STT</th>
              <th className="min-w-[300px] border-r border-white/20 p-4 text-left text-[10px] uppercase tracking-[0.18em]">Chỉ tiêu / Tiêu chí</th>
              {headers.map((h, i) => (
                <th key={i} className="min-w-[120px] border-r border-white/20 p-4 text-right text-[10px] uppercase tracking-[0.18em]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportRows.length > 0 ? reportRows.map((row, idx) => (
              <tr key={idx} className="group border-b border-[var(--line)] transition-colors">
                <td className="border-r border-[var(--line)] p-4 text-xs opacity-50">{idx + 1}</td>
                <td className="border-r border-[var(--line)] p-4 text-sm font-medium">{row.label}</td>
                {row.values.map((val, vIdx) => (
                  <td 
                    key={vIdx} 
                    className="data-value relative cursor-pointer border-r border-[var(--line)] p-4 text-right text-sm transition-colors hover:bg-[var(--primary-dark)] hover:text-white"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-8 backdrop-blur-sm">
          <div className="panel-card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px]">
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--primary-dark)] p-6 text-white">
              <div>
                <h3 className="section-title !text-white">Chi tiết theo đơn vị</h3>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/70">
                  {drillDown.row.label} / {headers[drillDown.colIndex]}
                </p>
              </div>
              <button onClick={() => setDrillDown(null)} className="rounded-full p-2 transition-colors hover:bg-white/10">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto">
              <div className="p-6">
                <div className="grid grid-cols-1 gap-px rounded-[22px] border border-[var(--line)] bg-[var(--line)]">
                  <div className="grid grid-cols-[40px_1fr_120px_80px] bg-[var(--primary-dark)] p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                    <span>#</span>
                    <span>Đơn vị</span>
                    <span className="text-right">Giá trị</span>
                    <span className="text-right">Tỷ trọng</span>
                  </div>
                  {getDrillDownData(drillDown.row.sourceRow, drillDown.colIndex).map((item, i, arr) => {
                    const total = arr.reduce((sum, curr) => sum + curr.value, 0);
                    return (
                      <div key={i} className="grid grid-cols-[40px_1fr_120px_80px] items-center bg-white p-3 text-sm transition-colors hover:bg-[var(--primary-dark)] hover:text-white">
                        <span className="text-xs opacity-50">{i + 1}</span>
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

            <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-soft)] p-6">
              <span className="text-xs font-bold uppercase tracking-[0.18em]">Tổng cộng</span>
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

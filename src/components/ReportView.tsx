import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Search } from 'lucide-react';
import { UNITS, YEARS } from '../constants';
import { ConsolidatedData, DataRow, FormTemplate, HeaderLayout, Project } from '../types';
import { auth, db, storage } from '../firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getPreferredReportingYear } from '../utils/reportingYear';

interface ReportViewProps {
  data: ConsolidatedData;
  projects: Project[];
  templates: FormTemplate[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
}

export function ReportView({ data, projects, templates, selectedProjectId, onSelectProject }: ReportViewProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(() => getPreferredReportingYear());
  const [searchTerm, setSearchTerm] = useState('');

  const projectTemplates = templates.filter((tpl) => tpl.projectId === selectedProjectId);
  const selectedTemplate = projectTemplates.find((tpl) => tpl.id === selectedTemplateId) || null;
  const columnHeaders = useMemo(() => {
    if (!selectedTemplate) return [];
    if (Array.isArray(selectedTemplate.columnHeaders) && selectedTemplate.columnHeaders.length > 0) {
      return selectedTemplate.columnHeaders;
    }
    const fallbackCount = selectedTemplate.columnMapping?.dataColumns?.length || 0;
    return Array.from({ length: fallbackCount }, (_, i) => `Cột ${i + 1}`);
  }, [selectedTemplate]);

  useEffect(() => {
    if (projectTemplates.length > 0 && !projectTemplates.find((tpl) => tpl.id === selectedTemplateId)) {
      setSelectedTemplateId(projectTemplates[0].id);
    }
  }, [projectTemplates, selectedTemplateId]);

  const aggregatedData = useMemo(() => {
    if (!selectedTemplate) return [];
    const rows = data[selectedTemplate.id] || [];
    const yearRows = rows.filter((row) => row.year === selectedYear);

    const labelGroups: { [label: string]: DataRow[] } = {};
    yearRows.forEach((row) => {
      if (!labelGroups[row.label]) labelGroups[row.label] = [];
      labelGroups[row.label].push(row);
    });

    const totalRows: DataRow[] = Object.entries(labelGroups).map(([label, group]) => {
      const numValues = selectedTemplate.columnMapping.dataColumns.length;
      const summedValues = new Array(numValues).fill(0);

      group.forEach((row) => {
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
        label,
        values: summedValues,
      };
    });

    const combined = [...yearRows, ...totalRows];

    return combined
      .filter((row) => row.label.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.sourceRow - b.sourceRow);
  }, [data, selectedTemplate, selectedYear, searchTerm]);

  const headerRows = useMemo(() => {
    if (!selectedTemplate?.headerLayout) return null;
    const layout: HeaderLayout = selectedTemplate.headerLayout;
    const rowCount = layout.endRow - layout.startRow + 1;
    const colCount = layout.endCol - layout.startCol + 1;
    const expectedCols = 1 + (selectedTemplate.columnMapping?.dataColumns?.length || 0);
    if (colCount !== expectedCols || rowCount <= 0 || colCount <= 0) {
      return null;
    }

    const cellMap = new Map(layout.cells.map((cell) => [`${cell.row}:${cell.col}`, cell.value]));
    const merges = layout.merges || [];
    const occupied = Array.from({ length: rowCount }, () => Array(colCount).fill(false));
    const rows: { text: string; rowSpan: number; colSpan: number }[][] = [];

    for (let r = 0; r < rowCount; r += 1) {
      const rowCells: { text: string; rowSpan: number; colSpan: number }[] = [];
      for (let c = 0; c < colCount; c += 1) {
        if (occupied[r][c]) continue;
        const rowNum = layout.startRow + r;
        const colNum = layout.startCol + c;
        const merge = merges.find((m) => m.startRow === rowNum && m.startCol === colNum);
        let rowSpan = 1;
        let colSpan = 1;
        if (merge) {
          rowSpan = merge.endRow - merge.startRow + 1;
          colSpan = merge.endCol - merge.startCol + 1;
          for (let rr = r; rr < r + rowSpan; rr += 1) {
            for (let cc = c; cc < c + colSpan; cc += 1) {
              if (occupied[rr] && typeof occupied[rr][cc] !== 'undefined') {
                occupied[rr][cc] = true;
              }
            }
          }
        } else {
          occupied[r][c] = true;
        }
        const text = cellMap.get(`${rowNum}:${colNum}`) || '';
        rowCells.push({ text, rowSpan, colSpan });
      }
      rows.push(rowCells);
    }

    return rows;
  }, [selectedTemplate]);

  const tableColSpan = useMemo(() => {
    if (!selectedTemplate) return 0;
    const dataCols = selectedTemplate.columnMapping?.dataColumns?.length || 0;
    if (headerRows) {
      return 1 + (1 + dataCols);
    }
    return 2 + columnHeaders.length;
  }, [selectedTemplate, headerRows, columnHeaders]);

  const exportToExcel = async () => {
    if (!selectedTemplate || aggregatedData.length === 0) return;

    const exportRows = aggregatedData.map((row) => {
      const unit = UNITS.find((u) => u.code === row.unitCode);
      const unitName = row.unitCode === 'TOTAL_HN' ? 'Tổng hợp' : unit?.name || row.unitCode;
      const rowData: any = {
        'Đơn vị': unitName,
        'Năm': row.year,
        'Tiêu chí': row.label,
      };
      row.values.forEach((val, i) => {
        rowData[columnHeaders[i] || `Giá trị ${i + 1}`] = val;
      });
      return rowData;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo');

    const fileName = `BaoCao_${selectedTemplate.name}_${selectedYear}.xlsx`;
    XLSX.writeFile(wb, fileName);

    try {
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const storagePath = `report_exports/${selectedTemplate.projectId}/${Date.now()}_${selectedTemplate.id}.xlsx`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      const user = auth.currentUser;
      await addDoc(collection(db, 'report_exports'), {
        projectId: selectedTemplate.projectId,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        year: selectedYear,
        fileName,
        storagePath,
        downloadURL,
        createdAt: serverTimestamp(),
        createdBy: user
          ? {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
            }
          : null,
      });
    } catch (error) {
      console.error('Export upload error:', error);
      alert('Xuất file thành công nhưng chưa lưu được báo cáo trên hệ thống. Vui lòng kiểm tra quyền Storage.');
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
        <div>
          <h2 className="page-title">Báo cáo tổng hợp</h2>
          <p className="page-subtitle mt-2 text-sm">Truy xuất dữ liệu đã được tổng hợp theo dự án và biểu mẫu.</p>
        </div>
        <button
          onClick={exportToExcel}
          disabled={!selectedTemplate || aggregatedData.length === 0}
          className="primary-btn flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          Xuất file Excel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header block mb-2">1. Chọn Dự án</label>
          <select
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            className="field-select text-sm font-bold"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>

        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header block mb-2">2. Chọn Năm</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="field-select text-sm font-bold"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header block mb-2">3. Tìm kiếm tiêu chí</label>
          <div className="flex items-center gap-2 border-b border-[var(--line-strong)] py-2">
            <Search size={16} className="text-[var(--ink-soft)]" />
            <input
              type="text"
              placeholder="Tên tiêu chí..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent focus:outline-none text-sm font-medium"
            />
          </div>
        </div>
      </div>

      {projectTemplates.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {projectTemplates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setSelectedTemplateId(tpl.id)}
              className={`status-pill ${selectedTemplateId === tpl.id ? 'status-pill-submitted' : 'status-pill-pending'}`}
            >
              {tpl.name}
            </button>
          ))}
        </div>
      )}

      {!selectedTemplate ? (
        <div className="panel-card rounded-[24px] p-10 text-center opacity-60">
          Chưa chọn biểu mẫu. Vui lòng chọn dự án và biểu mẫu để hiển thị báo cáo.
        </div>
      ) : (
        <div className="table-shell rounded-[24px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                {headerRows ? (
                  headerRows.map((row, rowIndex) => (
                    <tr key={`hdr-${rowIndex}`}>
                      {rowIndex === 0 && (
                        <th
                          rowSpan={headerRows.length}
                          className="p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 sticky left-0 bg-[var(--primary-dark)] text-white z-10 min-w-[120px]"
                        >
                          Đơn vị
                        </th>
                      )}
                      {row.map((cell, cellIndex) => (
                        <th
                          key={`hdr-${rowIndex}-${cellIndex}`}
                          colSpan={cell.colSpan}
                          rowSpan={cell.rowSpan}
                          className="p-3 text-[10px] uppercase tracking-[0.16em] border-r border-white/20 bg-[var(--primary-dark)] text-white text-center min-w-[90px]"
                        >
                          {cell.text || '\u00A0'}
                        </th>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <th className="p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 sticky left-0 bg-[var(--primary-dark)] text-white z-10">Đơn vị</th>
                    <th className="p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 bg-[var(--primary-dark)] text-white">Tiêu chí</th>
                    {columnHeaders.map((header, i) => (
                      <th key={i} className="p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 bg-[var(--primary-dark)] text-white text-center min-w-[120px]">
                        {header}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {aggregatedData.length > 0 ? (
                  aggregatedData.map((row, idx) => {
                    const unit = UNITS.find((u) => u.code === row.unitCode);
                    const isTotal = row.unitCode === 'TOTAL_HN';
                    const unitName = isTotal ? 'Tổng hợp' : unit?.name || row.unitCode;
                    return (
                      <tr key={idx} className={`border-b border-[var(--line)] ${isTotal ? 'bg-[var(--primary-soft)]' : 'bg-white'} hover:bg-[var(--surface-alt)]`}>
                        <td className="p-4 text-xs border-r border-[var(--line)] sticky left-0 z-10 bg-white">{unitName}</td>
                        <td className="p-4 text-xs border-r border-[var(--line)]">{row.label}</td>
                        {row.values.map((val, i) => (
                          <td key={i} className="p-4 text-xs font-mono text-center border-r border-[var(--line)]">
                            {val.toLocaleString()}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={tableColSpan} className="p-12 text-center opacity-40 italic">
                      Không tìm thấy dữ liệu cho tiêu chí này.
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





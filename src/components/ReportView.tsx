import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Search, X } from 'lucide-react';
import { UNITS, YEARS } from '../constants';
import { ConsolidatedData, FormTemplate, HeaderLayout, Project } from '../types';
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

interface CellDetailItem {
  unitCode: string;
  unitName: string;
  value: number;
}

interface AggregatedReportRow {
  key: string;
  projectId: string;
  templateId: string;
  year: string;
  sourceRow: number;
  label: string;
  values: number[];
  details: CellDetailItem[][];
}

interface ActiveCellDetail {
  rowLabel: string;
  columnLabel: string;
  totalValue: number;
  items: CellDetailItem[];
}

type DetailSortOrder = 'desc' | 'asc';

export function ReportView({ data, projects, templates, selectedProjectId, onSelectProject }: ReportViewProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(() => getPreferredReportingYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCellDetail, setActiveCellDetail] = useState<ActiveCellDetail | null>(null);
  const [detailSortOrder, setDetailSortOrder] = useState<DetailSortOrder>('desc');

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

  useEffect(() => {
    setActiveCellDetail(null);
  }, [selectedProjectId, selectedTemplateId, selectedYear, searchTerm]);

  const sortedDetailItems = useMemo(() => {
    if (!activeCellDetail) {
      return [];
    }

    return [...activeCellDetail.items].sort((left, right) => {
      if (left.value === right.value) {
        return left.unitName.localeCompare(right.unitName, 'vi');
      }
      return detailSortOrder === 'desc' ? right.value - left.value : left.value - right.value;
    });
  }, [activeCellDetail, detailSortOrder]);

  const aggregatedRows = useMemo<AggregatedReportRow[]>(() => {
    if (!selectedTemplate) return [];

    const rows = data[selectedTemplate.id] || [];
    const yearRows = rows.filter((row) => row.year === selectedYear);
    const groupedRows = new Map<string, AggregatedReportRow>();

    yearRows.forEach((row) => {
      const groupKey = `${row.sourceRow}::${row.label}`;
      const existing = groupedRows.get(groupKey);

      if (!existing) {
        const initialValues = new Array(row.values.length).fill(0);
        const initialDetails = row.values.map(() => [] as CellDetailItem[]);

        groupedRows.set(groupKey, {
          key: groupKey,
          projectId: row.projectId,
          templateId: row.templateId,
          year: row.year,
          sourceRow: row.sourceRow,
          label: row.label,
          values: initialValues,
          details: initialDetails,
        });
      }

      const nextRow = groupedRows.get(groupKey)!;
      const unitName = UNITS.find((unit) => unit.code === row.unitCode)?.name || row.unitCode;

      row.values.forEach((value, index) => {
        nextRow.values[index] += value;
        if (!nextRow.details[index]) {
          nextRow.details[index] = [];
        }
        nextRow.details[index].push({
          unitCode: row.unitCode,
          unitName,
          value,
        });
      });
    });

    return Array.from(groupedRows.values())
      .filter((row) => row.label.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.sourceRow - b.sourceRow)
      .map((row) => ({
        ...row,
        details: row.details.map((items) =>
          [...items].sort((left, right) => left.unitName.localeCompare(right.unitName, 'vi')),
        ),
      }));
  }, [data, searchTerm, selectedTemplate, selectedYear]);

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
    return headerRows ? 1 + dataCols : 1 + columnHeaders.length;
  }, [selectedTemplate, headerRows, columnHeaders]);

  const exportToExcel = async () => {
    if (!selectedTemplate || aggregatedRows.length === 0) return;

    const exportRows = aggregatedRows.map((row) => {
      const rowData: Record<string, string | number> = {
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

  const openCellDetail = (row: AggregatedReportRow, columnIndex: number) => {
    setDetailSortOrder('desc');
    setActiveCellDetail({
      rowLabel: row.label,
      columnLabel: columnHeaders[columnIndex] || `Cột ${columnIndex + 1}`,
      totalValue: row.values[columnIndex] || 0,
      items: row.details[columnIndex] || [],
    });
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="page-title">Báo cáo tổng hợp</h2>
          <p className="page-subtitle mt-2 text-sm">Truy xuất dữ liệu đã được tổng hợp theo dự án và biểu mẫu.</p>
        </div>
        <button
          onClick={exportToExcel}
          disabled={!selectedTemplate || aggregatedRows.length === 0}
          className="primary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={16} />
          Xuất file Excel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-8 lg:grid-cols-3">
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
              className="w-full bg-transparent text-sm font-medium focus:outline-none"
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
        <div className="table-shell overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                {headerRows ? (
                  headerRows.map((row, rowIndex) => (
                    <tr key={`hdr-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <th
                          key={`hdr-${rowIndex}-${cellIndex}`}
                          colSpan={cell.colSpan}
                          rowSpan={cell.rowSpan}
                          className={`p-3 text-[10px] uppercase tracking-[0.16em] border-r border-white/20 bg-[var(--primary-dark)] text-white text-center ${
                            cellIndex === 0 ? 'sticky left-0 z-10 min-w-[260px]' : 'min-w-[120px]'
                          }`}
                        >
                          {cell.text || '\u00A0'}
                        </th>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <th className="sticky left-0 z-10 p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 bg-[var(--primary-dark)] text-white min-w-[260px]">
                      Tiêu chí
                    </th>
                    {columnHeaders.map((header, i) => (
                      <th
                        key={i}
                        className="p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 bg-[var(--primary-dark)] text-white text-center min-w-[120px]"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {aggregatedRows.length > 0 ? (
                  aggregatedRows.map((row) => (
                    <tr key={row.key} className="border-b border-[var(--line)] bg-white hover:bg-[var(--surface-alt)]">
                      <td className="sticky left-0 z-10 p-4 text-xs border-r border-[var(--line)] bg-white font-medium text-[var(--ink)]">
                        {row.label}
                      </td>
                      {row.values.map((val, index) => (
                        <td key={`${row.key}-${index}`} className="border-r border-[var(--line)] p-0">
                          <button
                            type="button"
                            onClick={() => openCellDetail(row, index)}
                            className="h-full w-full p-4 text-center text-xs font-mono text-[var(--ink)] transition-colors hover:bg-[var(--primary-soft)]"
                            title="Xem chi tiết theo đơn vị"
                          >
                            {val.toLocaleString('vi-VN')}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tableColSpan} className="p-12 text-center italic opacity-40">
                      Không tìm thấy dữ liệu cho tiêu chí này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeCellDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-4 backdrop-blur-sm md:p-8">
          <div className="panel-card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[30px]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-5">
              <div>
                <div className="surface-tag">{activeCellDetail.columnLabel}</div>
                <h3 className="section-title mt-3">Chi tiết đơn vị theo ô dữ liệu</h3>
                <p className="page-subtitle mt-2 text-sm">{activeCellDetail.rowLabel}</p>
                <p className="mt-3 text-sm font-semibold text-[var(--primary-dark)]">
                  Tổng cộng: {activeCellDetail.totalValue.toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="panel-soft rounded-full px-3 py-2">
                  <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                    Sắp xếp giá trị
                  </label>
                  <select
                    value={detailSortOrder}
                    onChange={(event) => setDetailSortOrder(event.target.value as DetailSortOrder)}
                    className="mt-1 w-full bg-transparent text-xs font-semibold text-[var(--ink)] focus:outline-none"
                  >
                    <option value="desc">Giảm dần</option>
                    <option value="asc">Tăng dần</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCellDetail(null)}
                  className="secondary-btn flex items-center gap-2"
                >
                  <X size={16} />
                  Đóng
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              {sortedDetailItems.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {sortedDetailItems.map((item) => (
                    <div
                      key={`${item.unitCode}-${item.unitName}`}
                      className="grid gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 md:grid-cols-[minmax(0,1fr)_140px] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">{item.unitName}</p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          {item.unitCode}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="col-header mb-1">Giá trị</p>
                        <p className="data-value text-lg font-bold text-[var(--primary-dark)]">
                          {item.value.toLocaleString('vi-VN')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-8 text-center text-sm text-[var(--ink-soft)]">
                  Không có đơn vị nào đóng góp dữ liệu cho ô này.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Search } from 'lucide-react';
import { UNITS, YEARS } from '../constants';
import { ConsolidatedData, DataRow, FormTemplate, Project } from '../types';

interface ReportViewProps {
  data: ConsolidatedData;
  projects: Project[];
  templates: FormTemplate[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
}

export function ReportView({ data, projects, templates, selectedProjectId, onSelectProject }: ReportViewProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [searchTerm, setSearchTerm] = useState('');

  const projectTemplates = templates.filter((tpl) => tpl.projectId === selectedProjectId);
  const selectedTemplate = projectTemplates.find((tpl) => tpl.id === selectedTemplateId) || null;

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

  const exportToExcel = () => {
    if (!selectedTemplate || aggregatedData.length === 0) return;

    const exportRows = aggregatedData.map((row) => {
      const unit = UNITS.find((u) => u.code === row.unitCode);
      const rowData: any = {
        'ÄÆ¡n vá»‹': unit?.name || row.unitCode,
        'NÄƒm': row.year,
        'TiÃªu chÃ­': row.label,
      };
      row.values.forEach((val, i) => {
        rowData[selectedTemplate.columnHeaders[i] || `GiÃ¡ trá»‹ ${i + 1}`] = val;
      });
      return rowData;
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BÃ¡o cÃ¡o');
    XLSX.writeFile(wb, `BaoCao_${selectedTemplate.name}_${selectedYear}.xlsx`);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
        <div>
          <h2 className="page-title">BÃ¡o cÃ¡o tá»•ng há»£p</h2>
          <p className="page-subtitle mt-2 text-sm">Truy xuáº¥t dá»¯ liá»‡u Ä‘Ã£ Ä‘Æ°á»£c tá»•ng há»£p theo dá»± Ã¡n vÃ  biá»ƒu máº«u.</p>
        </div>
        <button
          onClick={exportToExcel}
          disabled={!selectedTemplate || aggregatedData.length === 0}
          className="primary-btn flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          Xuáº¥t file Excel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header block mb-2">1. Chá»n Dá»± Ã¡n</label>
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
          <label className="col-header block mb-2">2. Chá»n NÄƒm</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="field-select text-sm font-bold"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header block mb-2">3. TÃ¬m kiáº¿m tiÃªu chÃ­</label>
          <div className="flex items-center gap-2 border-b border-[var(--line-strong)] py-2">
            <Search size={16} className="text-[var(--ink-soft)]" />
            <input
              type="text"
              placeholder="TÃªn tiÃªu chÃ­..."
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
          ChÆ°a chá»n biá»ƒu máº«u. Vui lÃ²ng chá»n dá»± Ã¡n vÃ  biá»ƒu máº«u Ä‘á»ƒ hiá»ƒn thá»‹ báº¡o cÃ¡o.
        </div>
      ) : (
        <div className="table-shell rounded-[24px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 sticky left-0 bg-[var(--primary-dark)] text-white z-10">ÄÆ¡n vá»‹</th>
                  <th className="p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 bg-[var(--primary-dark)] text-white">TiÃªu chÃ­</th>
                  {selectedTemplate.columnHeaders.map((header, i) => (
                    <th key={i} className="p-4 text-[10px] uppercase tracking-[0.18em] border-r border-white/20 bg-[var(--primary-dark)] text-white text-center min-w-[120px]">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aggregatedData.length > 0 ? (
                  aggregatedData.map((row, idx) => {
                    const unit = UNITS.find((u) => u.code === row.unitCode);
                    const isTotal = row.unitCode === 'TOTAL_HN';
                    return (
                      <tr key={idx} className={`border-b border-[var(--line)] ${isTotal ? 'bg-[var(--primary-soft)]' : 'bg-white'} hover:bg-[var(--surface-alt)]`}>
                        <td className="p-4 text-xs border-r border-[var(--line)] sticky left-0 z-10 bg-white">{unit?.name || row.unitCode}</td>
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
                    <td colSpan={2 + selectedTemplate.columnHeaders.length} className="p-12 text-center opacity-40 italic">
                      KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u cho tiÃªu chÃ­ nÃ y.
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

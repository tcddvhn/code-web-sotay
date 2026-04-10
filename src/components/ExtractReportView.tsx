import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Plus, Save, Search, Trash2 } from 'lucide-react';
import {
  DataRow,
  ExtractCriterionAxis,
  ExtractReportBlueprint,
  ExtractReportFieldConfig,
  FormTemplate,
  ManagedUnit,
  Project,
  ProjectUnitScope,
  UserProfile,
} from '../types';
import {
  deleteExtractReportBlueprint,
  listExtractReportBlueprints,
  upsertExtractReportBlueprint,
} from '../supabaseStore';
import {
  buildCriterionCatalogByTemplate,
  resolveExtractFieldAxes,
  TemplateCriterionCatalog,
} from '../utils/extractReportCatalog';

interface ExtractReportViewProps {
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  templates: FormTemplate[];
  data: Record<string, DataRow[]>;
  units: ManagedUnit[];
  projectUnitScopeByProjectId: ProjectUnitScope;
  selectedYear: string;
  onSelectedYearChange: (year: string) => void;
  currentUser: UserProfile | null;
}

type PreviewColumn = {
  field: ExtractReportFieldConfig;
  title: string;
  isValid: boolean;
  reason?: string;
  templateName?: string;
  verticalLabel?: string;
  horizontalLabel?: string;
};

function createEmptyField(index: number): ExtractReportFieldConfig {
  return {
    id: globalThis.crypto?.randomUUID?.() || `extract-field-${Date.now()}-${index}`,
    label: `Cột ${index + 1}`,
    templateId: '',
    firstAxis: 'VERTICAL',
    firstCriterionKey: '',
    secondAxis: 'HORIZONTAL',
    secondCriterionKey: '',
  };
}

function createEmptyBlueprint(projectId: string): ExtractReportBlueprint {
  return {
    id: globalThis.crypto?.randomUUID?.() || `extract-blueprint-${Date.now()}`,
    projectId,
    name: 'Biểu trích mới',
    description: '',
    fields: [createEmptyField(0), createEmptyField(1), createEmptyField(2)],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getProjectScopedUnits(
  units: ManagedUnit[],
  projectUnitScopeByProjectId: ProjectUnitScope,
  projectId: string,
) {
  const scopedUnitCodes = projectUnitScopeByProjectId[projectId];
  if (!Array.isArray(scopedUnitCodes) || scopedUnitCodes.length === 0) {
    return units.filter((unit) => !unit.isDeleted);
  }

  return units.filter((unit) => !unit.isDeleted && scopedUnitCodes.includes(unit.code));
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .trim();
}

export function ExtractReportView({
  projects,
  selectedProjectId,
  onSelectProject,
  templates,
  data,
  units,
  projectUnitScopeByProjectId,
  selectedYear,
  onSelectedYearChange,
  currentUser,
}: ExtractReportViewProps) {
  const isAdmin = currentUser?.role === 'admin';
  const [blueprints, setBlueprints] = useState<ExtractReportBlueprint[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>('');
  const [draft, setDraft] = useState<ExtractReportBlueprint | null>(null);
  const [catalogByTemplate, setCatalogByTemplate] = useState<Record<string, TemplateCriterionCatalog>>({});
  const [isLoadingBlueprints, setIsLoadingBlueprints] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [criterionFilters, setCriterionFilters] = useState<Record<string, string>>({});
  const [templateFilters, setTemplateFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      onSelectProject(projects[0].id);
    }
  }, [onSelectProject, projects, selectedProjectId]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedProjectId) {
      setBlueprints([]);
      setSelectedBlueprintId('');
      setDraft(null);
      return;
    }

    setIsLoadingBlueprints(true);
    listExtractReportBlueprints(selectedProjectId)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setBlueprints(items);
        if (items.length > 0) {
          setSelectedBlueprintId(items[0].id);
          setDraft(items[0]);
        } else {
          const initial = createEmptyBlueprint(selectedProjectId);
          setSelectedBlueprintId(initial.id);
          setDraft(initial);
        }
      })
      .catch((error) => {
        console.error('Extract report blueprints load error:', error);
        if (!cancelled) {
          const initial = createEmptyBlueprint(selectedProjectId);
          setBlueprints([]);
          setSelectedBlueprintId(initial.id);
          setDraft(initial);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingBlueprints(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCatalog(true);
    buildCriterionCatalogByTemplate(templates)
      .then((catalog) => {
        if (!cancelled) {
          setCatalogByTemplate(catalog);
        }
      })
      .catch((error) => {
        console.error('Extract report catalog load error:', error);
        if (!cancelled) {
          setCatalogByTemplate({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingCatalog(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [templates]);

  const scopedUnits = useMemo(
    () => getProjectScopedUnits(units, projectUnitScopeByProjectId, selectedProjectId),
    [projectUnitScopeByProjectId, selectedProjectId, units],
  );

  const previewColumns = useMemo<PreviewColumn[]>(() => {
    if (!draft) {
      return [];
    }

    return draft.fields.map((field) => {
      const catalog = catalogByTemplate[field.templateId];
      const { verticalCriterion, horizontalCriterion, isValid } = resolveExtractFieldAxes(field, catalog);
      const templateName = templates.find((template) => template.id === field.templateId)?.name || '';
      const title =
        field.label.trim() ||
        [verticalCriterion?.label, horizontalCriterion?.label].filter(Boolean).join(' / ') ||
        'Cột chưa đặt tên';

      let reason = '';
      if (!field.templateId) {
        reason = 'Chưa chọn biểu mẫu nguồn.';
      } else if (!field.firstCriterionKey || !field.secondCriterionKey) {
        reason = 'Chưa chọn đủ 2 tiêu chí nguồn.';
      } else if (field.firstAxis === field.secondAxis) {
        reason = 'Hai tiêu chí phải gồm 1 dọc và 1 ngang.';
      } else if (!isValid) {
        reason = 'Không xác định được giao điểm dữ liệu.';
      }

      return {
        field,
        title,
        isValid,
        reason,
        templateName,
        verticalLabel: verticalCriterion?.label,
        horizontalLabel: horizontalCriterion?.label,
      };
    });
  }, [catalogByTemplate, draft, templates]);

  const previewRows = useMemo(() => {
    return scopedUnits.map((unit) => {
      const values = previewColumns.map((column) => {
        if (!draft || !column.isValid) {
          return '';
        }

        const catalog = catalogByTemplate[column.field.templateId];
        const { verticalCriterion, horizontalCriterion } = resolveExtractFieldAxes(column.field, catalog);
        if (!verticalCriterion || !horizontalCriterion || typeof horizontalCriterion.valueIndex !== 'number') {
          return '';
        }

        const templateRows = data[column.field.templateId] || [];
        const matchingRow = templateRows.find(
          (row) =>
            row.unitCode === unit.code &&
            row.year === selectedYear &&
            row.sourceRow === verticalCriterion.sourceRow,
        );

        if (!matchingRow) {
          return '';
        }

        const value = matchingRow.values?.[horizontalCriterion.valueIndex];
        if (value === undefined || value === null || Number.isNaN(Number(value))) {
          return '';
        }

        return Number(value).toLocaleString('vi-VN');
      });

      return {
        unitCode: unit.code,
        unitName: unit.name,
        values,
      };
    });
  }, [catalogByTemplate, data, draft, previewColumns, scopedUnits, selectedYear]);

  const handleCreateBlueprint = () => {
    if (!selectedProjectId) {
      return;
    }

    const next = createEmptyBlueprint(selectedProjectId);
    setSelectedBlueprintId(next.id);
    setDraft(next);
    setSaveMessage(null);
  };

  const handleSelectBlueprint = (blueprint: ExtractReportBlueprint) => {
    setSelectedBlueprintId(blueprint.id);
    setDraft(blueprint);
    setSaveMessage(null);
  };

  const handleFieldChange = (fieldId: string, patch: Partial<ExtractReportFieldConfig>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) =>
              field.id === fieldId
                ? {
                    ...field,
                    ...patch,
                    ...(patch.templateId ? { firstCriterionKey: '', secondCriterionKey: '' } : {}),
                  }
                : field,
            ),
          }
        : current,
    );
  };

  const handleAddField = () => {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: [...current.fields, createEmptyField(current.fields.length)],
          }
        : current,
    );
  };

  const handleDeleteField = (fieldId: string) => {
    setDraft((current) => {
      if (!current || current.fields.length <= 1) {
        return current;
      }

      return {
        ...current,
        fields: current.fields.filter((field) => field.id !== fieldId),
      };
    });
  };

  const handleSaveBlueprint = async () => {
    if (!draft) {
      return;
    }

    await upsertExtractReportBlueprint({
      ...draft,
      projectId: selectedProjectId,
      updatedAt: new Date().toISOString(),
    });

    const refreshed = await listExtractReportBlueprints(selectedProjectId);
    setBlueprints(refreshed);
    const saved = refreshed.find((item) => item.id === draft.id) || draft;
    setSelectedBlueprintId(saved.id);
    setDraft(saved);
    setSaveMessage('Đã lưu biểu trích báo cáo.');
  };

  const handleDeleteBlueprint = async () => {
    if (!draft) {
      return;
    }

    if (!window.confirm(`Xóa biểu trích "${draft.name}"?`)) {
      return;
    }

    if (blueprints.some((item) => item.id === draft.id)) {
      await deleteExtractReportBlueprint(draft.id);
    }

    const refreshed = await listExtractReportBlueprints(selectedProjectId);
    setBlueprints(refreshed);
    if (refreshed.length > 0) {
      setSelectedBlueprintId(refreshed[0].id);
      setDraft(refreshed[0]);
    } else {
      const next = createEmptyBlueprint(selectedProjectId);
      setSelectedBlueprintId(next.id);
      setDraft(next);
    }
    setSaveMessage('Đã xóa biểu trích báo cáo.');
  };

  const handleExportPreview = () => {
    if (!draft) {
      return;
    }

    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Tên đơn vị', ...previewColumns.map((column) => column.title)],
      ...previewRows.map((row) => [row.unitName, ...row.values]),
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trich bao cao');
    XLSX.writeFile(workbook, `${sanitizeFileName(draft.name || 'trich_bao_cao')}_${selectedYear}.xlsx`);
  };

  const inputClassName =
    'mt-1 w-full border-b border-[var(--line)] bg-transparent px-0 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]';
  const selectClassName =
    'mt-1 w-full border-b border-[var(--line)] bg-transparent px-0 py-2 text-sm text-[var(--ink)] outline-none';
  const filterInputClassName =
    'w-full bg-transparent px-0 py-1 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]';
  const sectionLabelClassName =
    'inline-block border-b border-[var(--primary)] pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]';

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="page-title">Trích báo cáo</h2>
          <p className="page-subtitle mt-2 max-w-3xl text-sm">
            Thiết lập biểu trích dữ liệu theo dự án, lấy trực tiếp từ các biểu mẫu nguồn đã có.
          </p>
        </div>

        <button type="button" onClick={handleExportPreview} className="secondary-btn flex items-center gap-2">
          <Download size={16} />
          Xuất Excel
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <section className="panel-card rounded-[28px] p-5 md:p-6">
          <div className="grid grid-cols-1 gap-x-5 gap-y-3 border-b border-[var(--line)] pb-4 xl:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_90px_auto]">
            <label className="block">
              <span className={sectionLabelClassName}>Chọn dự án</span>
              <select
                value={selectedProjectId}
                onChange={(event) => onSelectProject(event.target.value)}
                className={selectClassName}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-3">
              <label className="block flex-1">
                <span className={sectionLabelClassName}>Biểu trích đã lưu</span>
                <select
                  value={selectedBlueprintId}
                  onChange={(event) => {
                    const next = blueprints.find((item) => item.id === event.target.value);
                    if (next) {
                      handleSelectBlueprint(next);
                    }
                  }}
                  className={selectClassName}
                >
                  {isLoadingBlueprints ? (
                    <option value="">Đang tải...</option>
                  ) : blueprints.length > 0 ? (
                    blueprints.map((blueprint) => (
                      <option key={blueprint.id} value={blueprint.id}>
                        {blueprint.name}
                      </option>
                    ))
                  ) : (
                    <option value={selectedBlueprintId || ''}>Chưa có biểu trích nào</option>
                  )}
                </select>
              </label>
              {isAdmin && (
                <button type="button" onClick={handleCreateBlueprint} className="secondary-btn px-3 py-2 text-xs">
                  <Plus size={14} />
                </button>
              )}
            </div>

            <label className="block">
              <span className={sectionLabelClassName}>Năm</span>
              <select
                value={selectedYear}
                onChange={(event) => onSelectedYearChange(event.target.value)}
                className={selectClassName}
              >
                {['2022', '2023', '2024', '2025', '2026'].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end justify-start gap-3 xl:justify-end">
              {isAdmin && (
                <button type="button" onClick={handleSaveBlueprint} className="primary-btn flex items-center gap-2">
                  <Save size={16} />
                  Lưu biểu trích
                </button>
              )}
              {isAdmin && draft && (
                <button type="button" onClick={handleDeleteBlueprint} className="secondary-btn">
                  Xóa
                </button>
              )}
            </div>
          </div>

          {draft && (
            <>
              <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <label className="block">
                  <span className={sectionLabelClassName}>Tên biểu trích</span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, name: event.target.value } : current))
                    }
                    className={inputClassName}
                  />
                </label>

                <label className="block">
                  <span className={sectionLabelClassName}>Mô tả</span>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, description: event.target.value } : current))
                    }
                    className={inputClassName}
                  />
                </label>
              </div>

              {saveMessage && <div className="mt-3 text-sm text-[var(--primary)]">{saveMessage}</div>}

              <div className="mt-5 flex items-end justify-between gap-4 border-t border-[var(--line)] pt-3">
                <div>
                  <h3 className={sectionLabelClassName}>Cột trích xuất</h3>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Mặc định có 3 cột. Mỗi cột chọn 2 tiêu chí nguồn từ biểu mẫu.
                  </p>
                </div>

                {isAdmin && (
                  <button type="button" onClick={handleAddField} className="secondary-btn flex items-center gap-2">
                    <Plus size={15} />
                    Thêm cột
                  </button>
                )}
              </div>

                <div className="mt-3 space-y-3">
                  {draft.fields.map((field, index) => {
                    const catalog = catalogByTemplate[field.templateId];
                    const templateFilterKey = `${field.id}:template`;
                    const firstFilterKey = `${field.id}:first`;
                    const secondFilterKey = `${field.id}:second`;
                    const templateFilter = templateFilters[templateFilterKey] || '';
                    const firstFilter = criterionFilters[firstFilterKey] || '';
                    const secondFilter = criterionFilters[secondFilterKey] || '';
                    const normalizedTemplateFilter = normalizeSearchText(templateFilter);
                    const normalizedFirstFilter = normalizeSearchText(firstFilter);
                    const normalizedSecondFilter = normalizeSearchText(secondFilter);
                    const filteredTemplates = templates.filter((template) =>
                      normalizeSearchText(template.name).includes(normalizedTemplateFilter),
                    );
                    const allFirstOptions =
                      field.firstAxis === 'VERTICAL' ? catalog?.vertical || [] : catalog?.horizontal || [];
                    const allSecondOptions =
                      field.secondAxis === 'VERTICAL' ? catalog?.vertical || [] : catalog?.horizontal || [];
                  const firstOptions = allFirstOptions.filter((option) =>
                    normalizeSearchText(option.label).includes(normalizedFirstFilter),
                  );
                  const secondOptions = allSecondOptions.filter((option) =>
                    normalizeSearchText(option.label).includes(normalizedSecondFilter),
                  );
                  const previewColumn = previewColumns.find((column) => column.field.id === field.id);

                  return (
                    <div key={field.id} className="border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-[var(--ink)]">Cột {index + 1}</div>
                        {isAdmin && draft.fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteField(field.id)}
                            className="text-sm text-[var(--ink-soft)] transition hover:text-[var(--primary)]"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 xl:grid-cols-[0.8fr_0.95fr_1.1fr_1.1fr]">
                        <label className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                            Tên cột
                          </span>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(event) => handleFieldChange(field.id, { label: event.target.value })}
                            className={inputClassName}
                          />
                        </label>

                        <label className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                            Biểu mẫu nguồn
                          </span>
                          <div className="mt-1 flex items-center gap-2 border-b border-[var(--line)] pb-1">
                            <Search size={14} className="shrink-0 text-[var(--ink-soft)]" />
                            <input
                              type="text"
                              value={templateFilter}
                              onChange={(event) =>
                                setTemplateFilters((current) => ({
                                  ...current,
                                  [templateFilterKey]: event.target.value,
                                }))
                              }
                              placeholder="Tìm biểu mẫu..."
                              className={filterInputClassName}
                            />
                          </div>
                          <select
                            value={field.templateId}
                            onChange={(event) => handleFieldChange(field.id, { templateId: event.target.value })}
                            className={selectClassName}
                          >
                            <option value="">-- Chọn biểu mẫu --</option>
                            {filteredTemplates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                            Tiêu chí nguồn 1
                          </div>
                          <select
                            value={field.firstAxis}
                            onChange={(event) =>
                              handleFieldChange(field.id, {
                                firstAxis: event.target.value as ExtractCriterionAxis,
                                firstCriterionKey: '',
                              })
                            }
                            className={selectClassName}
                          >
                            <option value="VERTICAL">Lấy từ tiêu chí dọc</option>
                            <option value="HORIZONTAL">Lấy từ tiêu chí ngang</option>
                          </select>
                          <div className="mt-1 flex items-center gap-2 border-b border-[var(--line)] pb-1">
                            <Search size={14} className="shrink-0 text-[var(--ink-soft)]" />
                            <input
                              type="text"
                              value={firstFilter}
                              onChange={(event) =>
                                setCriterionFilters((current) => ({
                                  ...current,
                                  [firstFilterKey]: event.target.value,
                                }))
                              }
                              placeholder="Tìm tiêu chí..."
                              className={filterInputClassName}
                            />
                          </div>
                          <select
                            value={field.firstCriterionKey}
                            onChange={(event) => handleFieldChange(field.id, { firstCriterionKey: event.target.value })}
                            className={selectClassName}
                          >
                            <option value="">-- Chọn tiêu chí --</option>
                            {firstOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                            Tiêu chí nguồn 2
                          </div>
                          <select
                            value={field.secondAxis}
                            onChange={(event) =>
                              handleFieldChange(field.id, {
                                secondAxis: event.target.value as ExtractCriterionAxis,
                                secondCriterionKey: '',
                              })
                            }
                            className={selectClassName}
                          >
                            <option value="VERTICAL">Lấy từ tiêu chí dọc</option>
                            <option value="HORIZONTAL">Lấy từ tiêu chí ngang</option>
                          </select>
                          <div className="mt-1 flex items-center gap-2 border-b border-[var(--line)] pb-1">
                            <Search size={14} className="shrink-0 text-[var(--ink-soft)]" />
                            <input
                              type="text"
                              value={secondFilter}
                              onChange={(event) =>
                                setCriterionFilters((current) => ({
                                  ...current,
                                  [secondFilterKey]: event.target.value,
                                }))
                              }
                              placeholder="Tìm tiêu chí..."
                              className={filterInputClassName}
                            />
                          </div>
                          <select
                            value={field.secondCriterionKey}
                            onChange={(event) => handleFieldChange(field.id, { secondCriterionKey: event.target.value })}
                            className={selectClassName}
                          >
                            <option value="">-- Chọn tiêu chí --</option>
                            {secondOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {previewColumn ? (
                        <div className="mt-2 text-sm">
                          <div className="font-medium text-[var(--ink)]">{previewColumn.title}</div>
                          <div className="mt-1 text-[var(--ink-soft)]">
                            {previewColumn.templateName
                              ? `${previewColumn.templateName} • ${previewColumn.verticalLabel || '—'} × ${previewColumn.horizontalLabel || '—'}`
                              : 'Chưa cấu hình biểu mẫu nguồn.'}
                          </div>
                          {!previewColumn.isValid && previewColumn.reason && (
                            <div className="mt-1 text-[var(--primary)]">{previewColumn.reason}</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className="panel-card rounded-[28px] p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--ink)]">Xem trước dữ liệu trích</h3>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Hàng dọc là đơn vị thuộc dự án. Mỗi cột lấy dữ liệu từ một giao điểm tiêu chí dọc/ngang.
              </p>
            </div>
            <div className="text-sm text-[var(--ink-soft)]">
              {scopedUnits.length} đơn vị • {previewColumns.length} cột
            </div>
          </div>

          {isLoadingCatalog ? (
            <div className="mt-4 text-sm text-[var(--ink-soft)]">Đang phân tích tiêu chí từ các biểu mẫu nguồn...</div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-[24px] border border-[var(--line)]">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-[rgba(145,13,18,0.05)]">
                  <tr>
                    <th className="border-b border-[var(--line)] px-4 py-3 text-left font-semibold text-[var(--ink)]">
                      Tên đơn vị
                    </th>
                    {previewColumns.map((column) => (
                      <th
                        key={column.field.id}
                        className="border-b border-[var(--line)] px-4 py-3 text-left font-semibold text-[var(--ink)]"
                      >
                        {column.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.unitCode} className="odd:bg-white even:bg-[rgba(145,13,18,0.02)]">
                      <td className="border-b border-[var(--line)] px-4 py-3 text-[var(--ink)]">{row.unitName}</td>
                      {row.values.map((value, index) => (
                        <td key={`${row.unitCode}-${index}`} className="border-b border-[var(--line)] px-4 py-3 text-[var(--ink)]">
                          {value || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

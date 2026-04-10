import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ChevronDown, ChevronRight, Copy, Download, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import {
  DataRow,
  ExtractCriterionAxis,
  ExtractCriterionOption,
  ExtractReportBlueprint,
  ExtractReportBlueprintVersion,
  ExtractReportFieldConfig,
  FormTemplate,
  ManagedUnit,
  Project,
  ProjectUnitScope,
  UserProfile,
} from '../types';
import {
  appendExtractReportBlueprintVersion,
  deleteExtractReportBlueprint,
  listExtractReportBlueprints,
  listExtractReportBlueprintVersions,
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

type ValidationIssue = {
  fieldId?: string;
  message: string;
};

type PreviewSortMode = 'CODE_ASC' | 'NAME_ASC';
type PreviewFilterMode = 'ALL' | 'HAS_DATA' | 'NO_DATA';
type ExtractTab = 'CONFIG' | 'PREVIEW' | 'VERSIONS';

type TreeProjectNode = {
  project: Project;
  blueprints: ExtractReportBlueprint[];
};

const TXT = {
  pageTitle: 'Trích báo cáo',
  pageSubtitle:
    'Thiết lập biểu trích dữ liệu theo dự án, lấy trực tiếp từ các biểu mẫu nguồn đã có.',
  exportExcel: 'Xuất Excel',
  createNew: 'Tạo mới',
  duplicate: 'Nhân bản',
  saveBlueprint: 'Lưu biểu trích',
  delete: 'Xóa',
  searchTree: 'Tìm dự án hoặc biểu trích...',
  emptyTree: 'Không tìm thấy dự án hoặc biểu trích phù hợp.',
  emptyBlueprints: 'Chưa có biểu trích nào.',
  configTab: 'Cấu hình',
  previewTab: 'Xem trước',
  versionsTab: 'Phiên bản',
  configTitle: 'Cấu hình biểu trích',
  configSubtitle:
    'Mỗi cột mặc định có 2 tiêu chí nguồn. Hệ thống lấy dữ liệu tại giao điểm của 1 tiêu chí dọc và 1 tiêu chí ngang.',
  year: 'Năm',
  blueprintName: 'Tên biểu trích',
  description: 'Mô tả',
  columnsTitle: 'Cột trích xuất',
  columnsSubtitle: 'Mặc định có 3 cột. Mỗi cột chọn 2 tiêu chí nguồn từ biểu mẫu.',
  addColumn: 'Thêm cột',
  validationTitle: 'Cấu hình cần bổ sung trước khi lưu',
  driftTitle: 'Cảnh báo thay đổi nguồn dữ liệu',
  versionHistory: 'Lịch sử phiên bản',
  loading: 'Đang tải...',
  noSavedVersions: 'Chưa có phiên bản đã lưu',
  restore: 'Khôi phục',
  sourceTemplate: 'Biểu mẫu nguồn',
  searchTemplate: 'Tìm biểu mẫu...',
  chooseTemplate: '-- Chọn biểu mẫu --',
  sourceCriterion1: 'Tiêu chí nguồn 1',
  sourceCriterion2: 'Tiêu chí nguồn 2',
  fromVertical: 'Lấy từ tiêu chí dọc',
  fromHorizontal: 'Lấy từ tiêu chí ngang',
  searchCriterion: 'Tìm tiêu chí...',
  chooseCriterion: '-- Chọn tiêu chí --',
  sourceReset: 'Đã đặt lại tiêu chí vì biểu mẫu nguồn thay đổi.',
  sourceNotConfigured: 'Chưa cấu hình biểu mẫu nguồn.',
  invalidSource: 'Cấu hình nguồn hiện không còn hợp lệ.',
  sortUnits: 'Sắp xếp đơn vị',
  sortByCode: 'Theo mã đơn vị',
  sortByName: 'Theo tên đơn vị',
  filterData: 'Lọc dữ liệu',
  showAllUnits: 'Hiện tất cả đơn vị',
  showUnitsWithData: 'Chỉ hiện đơn vị có dữ liệu',
  showUnitsWithoutData: 'Chỉ hiện đơn vị chưa có dữ liệu',
  updatedAt: 'Cập nhật gần nhất',
  noDate: 'Chưa có',
  analyzingTemplates: 'Đang phân tích tiêu chí từ các biểu mẫu nguồn...',
  unitName: 'Tên đơn vị',
  notConfigured: 'Chưa cấu hình',
  emptyValue: '—',
  emptyRows: 'Không có đơn vị phù hợp với bộ lọc hiện tại.',
  createdCopy: 'Đã tạo bản sao từ biểu trích hiện tại. Hãy lưu để tạo mới.',
  savedSuccess: 'Đã lưu biểu trích báo cáo.',
  deletedSuccess: 'Đã xóa biểu trích.',
  restoredSuccess:
    'Đã khôi phục biểu trích theo phiên bản đã chọn. Hãy lưu để ghi nhận phiên bản mới.',
  loadBlueprintsError: 'Không thể tải danh sách biểu trích.',
  parseCatalogError: 'Không thể phân tích tiêu chí từ biểu mẫu nguồn.',
  restoreVersionPrompt: 'Khôi phục phiên bản đã chọn và thay dự thảo hiện tại?',
  deleteBlueprintPrompt: 'Xóa biểu trích này?',
  saveError: 'Không thể lưu biểu trích.',
  deleteError: 'Không thể xóa biểu trích.',
  column: 'Cột',
  columnName: 'Tên cột',
  previewTitle: 'Xem trước dữ liệu trích',
  previewSubtitle:
    'Hàng dọc là đơn vị thuộc dự án. Mỗi cột lấy dữ liệu từ một giao điểm tiêu chí dọc/ngang.',
  sourceDetailFallback: 'Chưa cấu hình nguồn dữ liệu.',
};

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .trim();

const sanitizeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

const repairLegacyUtf8 = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }
  if (!/[ÃÂÆÄÅá»áº]/.test(value)) {
    return value;
  }
  try {
    const bytes = Uint8Array.from(Array.from(value).map((char) => char.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder('utf-8').decode(bytes);
    return repaired.includes('�') ? value : repaired;
  } catch {
    return value;
  }
};

const compareValues = (
  sortMode: PreviewSortMode,
  left: { unitCode: string; unitName: string },
  right: { unitCode: string; unitName: string },
) => {
  if (sortMode === 'NAME_ASC') {
    return left.unitName.localeCompare(right.unitName, 'vi-VN');
  }
  return left.unitCode.localeCompare(right.unitCode, 'vi-VN');
};

const getProjectScopedUnits = (
  units: ManagedUnit[],
  projectUnitScopeByProjectId: ProjectUnitScope,
  projectId: string,
) => {
  const scopedUnitCodes = projectUnitScopeByProjectId[projectId];
  if (!Array.isArray(scopedUnitCodes) || scopedUnitCodes.length === 0) {
    return units.filter((unit) => !unit.isDeleted);
  }
  return units.filter((unit) => !unit.isDeleted && scopedUnitCodes.includes(unit.code));
};

const createField = (index: number): ExtractReportFieldConfig => ({
  id: globalThis.crypto?.randomUUID?.() || `extract-field-${Date.now()}-${index}`,
  label: `Cột ${index + 1}`,
  templateId: '',
  firstAxis: 'VERTICAL',
  firstCriterionKey: '',
  secondAxis: 'HORIZONTAL',
  secondCriterionKey: '',
});

const createBlueprint = (projectId: string, user: UserProfile | null): ExtractReportBlueprint => ({
  id: globalThis.crypto?.randomUUID?.() || `extract-blueprint-${Date.now()}`,
  projectId,
  name: 'Biểu trích mới',
  description: '',
  fields: [createField(0), createField(1), createField(2)],
  updatedById: user?.id || null,
  updatedByName: user?.displayName || user?.email || null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const cloneBlueprint = (source: ExtractReportBlueprint, user: UserProfile | null): ExtractReportBlueprint => ({
  ...source,
  id: globalThis.crypto?.randomUUID?.() || `extract-blueprint-${Date.now()}`,
  name: `${source.name} (bản sao)`,
  fields: source.fields.map((field, index) => ({
    ...field,
    id: globalThis.crypto?.randomUUID?.() || `${field.id}-copy-${Date.now()}-${index}`,
  })),
  updatedById: user?.id || null,
  updatedByName: user?.displayName || user?.email || null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const filterOptions = (items: ExtractCriterionOption[], term: string) => {
  const keyword = normalizeSearchText(term);
  if (!keyword) {
    return items;
  }
  return items.filter((item) => normalizeSearchText(item.label).includes(keyword));
};

const getVersionLabel = (version: ExtractReportBlueprintVersion) =>
  `Phiên bản ${version.versionNumber} • ${new Date(version.createdAt).toLocaleString('vi-VN')}`;

const getColumnSourceSummary = (column: PreviewColumn) => {
  if (!column.templateName) {
    return TXT.sourceNotConfigured;
  }
  return `${column.templateName} • ${column.verticalLabel || '?'} × ${column.horizontalLabel || '?'}`;
};

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
  const canManage = currentUser?.role === 'admin';
  const [blueprints, setBlueprints] = useState<ExtractReportBlueprint[]>([]);
  const [versions, setVersions] = useState<ExtractReportBlueprintVersion[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [draft, setDraft] = useState<ExtractReportBlueprint | null>(null);
  const [catalogByTemplate, setCatalogByTemplate] = useState<Record<string, TemplateCriterionCatalog>>({});
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ExtractTab>('CONFIG');
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [isLoadingBlueprints, setIsLoadingBlueprints] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'default' | 'error'>('default');
  const [criterionFilters, setCriterionFilters] = useState<Record<string, string>>({});
  const [templateFilters, setTemplateFilters] = useState<Record<string, string>>({});
  const [fieldResetMessages, setFieldResetMessages] = useState<Record<string, string>>({});
  const [previewSortMode, setPreviewSortMode] = useState<PreviewSortMode>('CODE_ASC');
  const [previewFilterMode, setPreviewFilterMode] = useState<PreviewFilterMode>('ALL');
  const deferredDraft = useDeferredValue(draft);

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
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingBlueprints(true);
    listExtractReportBlueprints(selectedProjectId)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setBlueprints(items);
        setExpandedProjectIds((current) => (current.includes(selectedProjectId) ? current : [...current, selectedProjectId]));
        if (items.length > 0) {
          setSelectedBlueprintId(items[0].id);
          setDraft(items[0]);
        } else {
          const initial = createBlueprint(selectedProjectId, currentUser);
          setSelectedBlueprintId(initial.id);
          setDraft(initial);
        }
      })
      .catch((error) => {
        console.error('Extract report blueprints load error:', error);
        if (!cancelled) {
          const initial = createBlueprint(selectedProjectId, currentUser);
          setBlueprints([]);
          setSelectedBlueprintId(initial.id);
          setDraft(initial);
          setStatusTone('error');
          setStatusMessage(error.message || TXT.loadBlueprintsError);
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
  }, [currentUser, selectedProjectId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedBlueprintId || blueprints.every((item) => item.id !== selectedBlueprintId)) {
      setVersions([]);
      setSelectedVersionId('');
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingVersions(true);
    listExtractReportBlueprintVersions(selectedBlueprintId)
      .then((items) => {
        if (!cancelled) {
          setVersions(items);
          setSelectedVersionId(items[0]?.id || '');
        }
      })
      .catch((error) => {
        console.error('Extract report blueprint versions load error:', error);
        if (!cancelled) {
          setVersions([]);
          setSelectedVersionId('');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingVersions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [blueprints, selectedBlueprintId]);

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
          setStatusTone('error');
          setStatusMessage(error.message || TXT.parseCatalogError);
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

  const projectOptions = useMemo(
    () => [...projects].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))),
    [projects],
  );

  const selectedProject = useMemo(
    () => projectOptions.find((project) => project.id === selectedProjectId) || null,
    [projectOptions, selectedProjectId],
  );

  const projectTemplates = useMemo(
    () => templates.filter((template) => template.projectId === selectedProjectId),
    [selectedProjectId, templates],
  );

  const scopedUnits = useMemo(
    () => getProjectScopedUnits(units, projectUnitScopeByProjectId, selectedProjectId),
    [projectUnitScopeByProjectId, selectedProjectId, units],
  );

  const treeProjects = useMemo<TreeProjectNode[]>(() => {
    const searchKeyword = normalizeSearchText(treeSearchTerm);
    return projectOptions
      .map((project) => {
        const projectBlueprints = project.id === selectedProjectId ? blueprints : [];
        if (!searchKeyword) {
          return { project, blueprints: projectBlueprints };
        }
        const projectMatches = normalizeSearchText(project.name).includes(searchKeyword);
        const filtered = projectBlueprints.filter((blueprint) => normalizeSearchText(blueprint.name).includes(searchKeyword));
        if (projectMatches) {
          return { project, blueprints: projectBlueprints };
        }
        if (filtered.length > 0) {
          return { project, blueprints: filtered };
        }
        return null;
      })
      .filter((item): item is TreeProjectNode => Boolean(item));
  }, [blueprints, projectOptions, selectedProjectId, treeSearchTerm]);

  const previewColumns = useMemo<PreviewColumn[]>(() => {
    if (!deferredDraft) {
      return [];
    }
    return deferredDraft.fields.map((field) => {
      const catalog = catalogByTemplate[field.templateId];
      const { verticalCriterion, horizontalCriterion, isValid } = resolveExtractFieldAxes(field, catalog);
      const templateName = projectTemplates.find((template) => template.id === field.templateId)?.name || '';
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
        reason = 'Không xác định được giao điểm dữ liệu hoặc tiêu chí nguồn đã thay đổi.';
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
  }, [catalogByTemplate, deferredDraft, projectTemplates]);

  const validationIssues = useMemo<ValidationIssue[]>(() => {
    if (!draft) {
      return [];
    }
    const issues: ValidationIssue[] = [];
    const duplicateKeys = new Set<string>();

    if (!draft.name.trim()) {
      issues.push({ message: 'Tên biểu trích không được để trống.' });
    }

    draft.fields.forEach((field, index) => {
      const prefix = `Cột ${index + 1}`;
      const previewColumn = previewColumns.find((column) => column.field.id === field.id);
      if (!field.label.trim()) {
        issues.push({ fieldId: field.id, message: `${prefix}: chưa nhập tên cột.` });
      }
      if (!field.templateId) {
        issues.push({ fieldId: field.id, message: `${prefix}: chưa chọn biểu mẫu nguồn.` });
      }
      if (!field.firstCriterionKey || !field.secondCriterionKey) {
        issues.push({ fieldId: field.id, message: `${prefix}: chưa chọn đủ 2 tiêu chí nguồn.` });
      }
      if (field.firstAxis === field.secondAxis) {
        issues.push({ fieldId: field.id, message: `${prefix}: hai tiêu chí phải gồm 1 dọc và 1 ngang.` });
      }
      if (previewColumn && !previewColumn.isValid) {
        issues.push({ fieldId: field.id, message: `${prefix}: ${previewColumn.reason || TXT.invalidSource}` });
      }
      const duplicateKey = [field.templateId, field.firstAxis, field.firstCriterionKey, field.secondAxis, field.secondCriterionKey].join('::');
      if (field.templateId && field.firstCriterionKey && field.secondCriterionKey) {
        if (duplicateKeys.has(duplicateKey)) {
          issues.push({ fieldId: field.id, message: `${prefix}: trùng cấu hình nguồn với cột khác.` });
        } else {
          duplicateKeys.add(duplicateKey);
        }
      }
    });

    return issues;
  }, [draft, previewColumns]);

  const driftColumns = useMemo(() => previewColumns.filter((column) => !column.isValid), [previewColumns]);

  const previewRows = useMemo(() => {
    const rows = scopedUnits.map((unit) => {
      const values = previewColumns.map((column) => {
        if (!deferredDraft || !column.isValid) {
          return '';
        }
        const catalog = catalogByTemplate[column.field.templateId];
        const { verticalCriterion, horizontalCriterion } = resolveExtractFieldAxes(column.field, catalog);
        if (!verticalCriterion || !horizontalCriterion || typeof horizontalCriterion.valueIndex !== 'number') {
          return '';
        }
        const templateRows = data[column.field.templateId] || [];
        const matchingRow = templateRows.find(
          (row) => row.unitCode === unit.code && row.year === selectedYear && row.sourceRow === verticalCriterion.sourceRow,
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
        hasAnyData: values.some((value) => value !== ''),
      };
    });

    const filteredRows =
      previewFilterMode === 'ALL'
        ? rows
        : rows.filter((row) => (previewFilterMode === 'HAS_DATA' ? row.hasAnyData : !row.hasAnyData));
    return filteredRows.sort((left, right) => compareValues(previewSortMode, left, right));
  }, [catalogByTemplate, data, deferredDraft, previewColumns, previewFilterMode, previewSortMode, scopedUnits, selectedYear]);

  const persistBlueprint = async (blueprint: ExtractReportBlueprint, successMessage: string) => {
    const preparedBlueprint: ExtractReportBlueprint = {
      ...blueprint,
      projectId: selectedProjectId,
      updatedById: currentUser?.id || null,
      updatedByName: currentUser?.displayName || currentUser?.email || null,
      updatedAt: new Date().toISOString(),
    };

    await upsertExtractReportBlueprint(preparedBlueprint);
    const nextVersionNumber = (versions[0]?.versionNumber || 0) + 1;
    await appendExtractReportBlueprintVersion({
      id: globalThis.crypto?.randomUUID?.() || `extract-report-version-${Date.now()}`,
      blueprintId: preparedBlueprint.id,
      versionNumber: nextVersionNumber,
      name: preparedBlueprint.name,
      description: preparedBlueprint.description,
      fields: preparedBlueprint.fields,
      createdById: preparedBlueprint.updatedById || null,
      createdByName: preparedBlueprint.updatedByName || null,
      createdAt: new Date().toISOString(),
    });

    const refreshedBlueprints = await listExtractReportBlueprints(selectedProjectId);
    const refreshedVersions = await listExtractReportBlueprintVersions(preparedBlueprint.id);
    setBlueprints(refreshedBlueprints);
    setVersions(refreshedVersions);
    const savedBlueprint = refreshedBlueprints.find((item) => item.id === preparedBlueprint.id) || preparedBlueprint;
    setSelectedBlueprintId(savedBlueprint.id);
    setSelectedVersionId(refreshedVersions[0]?.id || '');
    setDraft(savedBlueprint);
    setStatusTone('default');
    setStatusMessage(successMessage);
  };

  const handleCreateBlueprint = () => {
    if (!selectedProjectId) {
      return;
    }
    const next = createBlueprint(selectedProjectId, currentUser);
    setSelectedBlueprintId(next.id);
    setDraft(next);
    setVersions([]);
    setSelectedVersionId('');
    setStatusMessage(null);
    setFieldResetMessages({});
    setActiveTab('CONFIG');
  };

  const handleDuplicateBlueprint = () => {
    if (!draft) {
      return;
    }
    const next = cloneBlueprint(draft, currentUser);
    setSelectedBlueprintId(next.id);
    setDraft(next);
    setVersions([]);
    setSelectedVersionId('');
    setStatusTone('default');
    setStatusMessage(TXT.createdCopy);
    setActiveTab('CONFIG');
  };

  const handleSelectBlueprint = (blueprint: ExtractReportBlueprint) => {
    setSelectedBlueprintId(blueprint.id);
    setDraft(blueprint);
    setStatusMessage(null);
    setFieldResetMessages({});
  };

  const handleFieldChange = (fieldId: string, patch: Partial<ExtractReportFieldConfig>) => {
    const isTemplateChanged = Object.prototype.hasOwnProperty.call(patch, 'templateId');
    const clearsResetMessage =
      Object.prototype.hasOwnProperty.call(patch, 'firstCriterionKey') ||
      Object.prototype.hasOwnProperty.call(patch, 'secondCriterionKey');

    setDraft((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) =>
              field.id === fieldId
                ? {
                    ...field,
                    ...patch,
                    ...(isTemplateChanged ? { firstCriterionKey: '', secondCriterionKey: '' } : {}),
                  }
                : field,
            ),
          }
        : current,
    );

    if (isTemplateChanged) {
      setFieldResetMessages((current) => ({ ...current, [fieldId]: TXT.sourceReset }));
    } else if (clearsResetMessage) {
      setFieldResetMessages((current) => {
        const next = { ...current };
        delete next[fieldId];
        return next;
      });
    }
  };

  const handleAddField = () => {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: [...current.fields, createField(current.fields.length)],
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
    if (!draft || !canManage || validationIssues.length > 0) {
      return;
    }
    try {
      await persistBlueprint(draft, TXT.savedSuccess);
    } catch (error) {
      setStatusTone('error');
      setStatusMessage(error instanceof Error ? error.message : TXT.saveError);
    }
  };

  const handleDeleteBlueprint = async () => {
    if (!draft || !canManage) {
      return;
    }
    if (!window.confirm(TXT.deleteBlueprintPrompt)) {
      return;
    }
    try {
      if (blueprints.some((item) => item.id === draft.id)) {
        await deleteExtractReportBlueprint(draft.id);
      }
      const refreshedBlueprints = await listExtractReportBlueprints(selectedProjectId);
      setBlueprints(refreshedBlueprints);
      if (refreshedBlueprints.length > 0) {
        setSelectedBlueprintId(refreshedBlueprints[0].id);
        setDraft(refreshedBlueprints[0]);
      } else {
        const initial = createBlueprint(selectedProjectId, currentUser);
        setSelectedBlueprintId(initial.id);
        setDraft(initial);
      }
      setVersions([]);
      setSelectedVersionId('');
      setStatusTone('default');
      setStatusMessage(TXT.deletedSuccess);
    } catch (error) {
      setStatusTone('error');
      setStatusMessage(error instanceof Error ? error.message : TXT.deleteError);
    }
  };

  const handleRestoreVersion = () => {
    if (!draft || !selectedVersionId || !canManage) {
      return;
    }
    const version = versions.find((item) => item.id === selectedVersionId);
    if (!version) {
      return;
    }
    if (!window.confirm(TXT.restoreVersionPrompt)) {
      return;
    }
    setDraft({
      ...draft,
      name: version.name,
      description: version.description,
      fields: version.fields.map((field, index) => ({
        ...field,
        id: globalThis.crypto?.randomUUID?.() || `${field.id}-restore-${Date.now()}-${index}`,
      })),
      updatedById: currentUser?.id || null,
      updatedByName: currentUser?.displayName || currentUser?.email || null,
      updatedAt: new Date().toISOString(),
    });
    setFieldResetMessages({});
    setStatusTone('default');
    setStatusMessage(TXT.restoredSuccess);
    setActiveTab('CONFIG');
  };

  const handleExportPreview = () => {
    if (!draft) {
      return;
    }
    const metadataRows = [
      ['Biểu trích', draft.name],
      ['Dự án', selectedProject?.name || ''],
      ['Năm', selectedYear],
      ['Xuất lúc', new Date().toLocaleString('vi-VN')],
    ];
    const headerRow = [TXT.unitName, ...previewColumns.map((column) => column.title)];
    const sourceRow = [
      '',
      ...previewColumns.map((column) =>
        column.templateName ? getColumnSourceSummary(column) : column.reason || TXT.notConfigured,
      ),
    ];
    const bodyRows = previewRows.map((row) => [row.unitName, ...row.values]);
    const worksheet = XLSX.utils.aoa_to_sheet([...metadataRows, [], headerRow, sourceRow, ...bodyRows]);
    (worksheet as { [key: string]: unknown })['!freeze'] = {
      xSplit: 1,
      ySplit: metadataRows.length + 2,
      topLeftCell: 'B7',
      activePane: 'bottomRight',
      state: 'frozen',
    };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sanitizeFileName(draft.name || 'trich-bao-cao').slice(0, 31) || 'trich-bao-cao',
    );
    XLSX.writeFile(
      workbook,
      `${sanitizeFileName(draft.name || 'trich-bao-cao') || 'trich-bao-cao'}-${selectedYear}.xlsx`,
    );
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
    );
  };

  const inputClassName = 'mt-1 w-full border-b border-[var(--line)] bg-transparent px-0 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]';
  const selectClassName = 'mt-1 w-full border-b border-[var(--line)] bg-transparent px-0 py-2 text-sm text-[var(--ink)] outline-none';
  const filterInputClassName = 'w-full bg-transparent px-0 py-1 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]';
  const sectionLabelClassName = 'inline-block border-b border-[var(--primary)] pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]';
  const tabClassName = (tab: ExtractTab) =>
    `rounded-full border px-4 py-2 text-sm font-semibold transition ${
      activeTab === tab
        ? 'border-[rgba(37,99,84,0.25)] bg-[rgba(37,99,84,0.08)] text-[rgb(37,99,84)]'
        : 'border-[rgba(145,13,18,0.14)] bg-white text-[var(--primary)] hover:border-[rgba(145,13,18,0.28)]'
    }`;

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="page-title">{TXT.pageTitle}</h2>
          <p className="page-subtitle mt-2 max-w-3xl text-sm">{TXT.pageSubtitle}</p>
        </div>
      </div>

      {statusMessage && (
        <div className={`mt-4 rounded-[18px] border px-4 py-3 text-sm ${statusTone === 'error' ? 'border-[rgba(145,13,18,0.18)] bg-[rgba(145,13,18,0.05)] text-[var(--primary)]' : 'border-[rgba(37,99,84,0.18)] bg-[rgba(37,99,84,0.06)] text-[rgb(37,99,84)]'}`}>
          {statusMessage}
        </div>
      )}

      {driftColumns.length > 0 && (
        <div className="mt-4 rounded-[18px] border border-[rgba(145,13,18,0.18)] bg-[rgba(145,13,18,0.05)] px-4 py-3 text-sm text-[var(--primary)]">
          <div className="font-semibold">{TXT.driftTitle}</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {driftColumns.map((column) => (
              <li key={column.field.id}>
                {column.title}: {column.reason || TXT.invalidSource}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="panel-card rounded-[28px] p-4 md:p-5">
          <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
            <Search size={15} className="text-[var(--ink-soft)]" />
            <input
              type="text"
              value={treeSearchTerm}
              onChange={(event) => setTreeSearchTerm(event.target.value)}
              placeholder={TXT.searchTree}
              className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
            />
          </div>

          <div className="mt-4 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {treeProjects.length === 0 ? (
              <div className="text-sm text-[var(--ink-soft)]">{TXT.emptyTree}</div>
            ) : (
              <div className="space-y-3">
                {treeProjects.map(({ project, blueprints: projectBlueprints }) => {
                  const isExpanded = expandedProjectIds.includes(project.id);
                  return (
                    <div key={project.id} className="border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject(project.id);
                          toggleProject(project.id);
                        }}
                        className={`flex w-full items-center gap-2 text-left text-sm font-semibold ${project.id === selectedProjectId ? 'text-[var(--primary)]' : 'text-[var(--ink)]'}`}
                      >
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span className="truncate">{project.name}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2 pl-6">
                          {projectBlueprints.length === 0 ? (
                            <div className="text-sm text-[var(--ink-soft)]">{TXT.emptyBlueprints}</div>
                          ) : (
                            projectBlueprints.map((blueprint) => (
                              <button
                                key={blueprint.id}
                                type="button"
                                onClick={() => {
                                  onSelectProject(project.id);
                                  handleSelectBlueprint(blueprint);
                                }}
                                className={`block w-full truncate border-l pl-3 text-left text-sm ${blueprint.id === selectedBlueprintId ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--ink-soft)] hover:border-[var(--line)] hover:text-[var(--ink)]'}`}
                              >
                                {blueprint.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          <div className="panel-card rounded-[28px] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setActiveTab('CONFIG')} className={tabClassName('CONFIG')}>{TXT.configTab}</button>
                <button type="button" onClick={() => setActiveTab('PREVIEW')} className={tabClassName('PREVIEW')}>{TXT.previewTab}</button>
                <button type="button" onClick={() => setActiveTab('VERSIONS')} className={tabClassName('VERSIONS')}>{TXT.versionsTab}</button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canManage && (
                  <>
                    <button type="button" onClick={handleCreateBlueprint} className="secondary-btn flex items-center gap-2">
                      <Plus size={15} />
                      {TXT.createNew}
                    </button>
                    <button type="button" onClick={handleDuplicateBlueprint} className="secondary-btn flex items-center gap-2" disabled={!draft}>
                      <Copy size={15} />
                      {TXT.duplicate}
                    </button>
                    <button type="button" onClick={handleSaveBlueprint} className="primary-btn flex items-center gap-2" disabled={!draft || validationIssues.length > 0}>
                      <Save size={15} />
                      {TXT.saveBlueprint}
                    </button>
                    <button type="button" onClick={handleDeleteBlueprint} className="secondary-btn flex items-center gap-2" disabled={!draft}>
                      <Trash2 size={15} />
                      {TXT.delete}
                    </button>
                  </>
                )}
                <button type="button" onClick={handleExportPreview} className="secondary-btn flex items-center gap-2">
                  <Download size={15} />
                  {TXT.exportExcel}
                </button>
              </div>
            </div>
          </div>

          {activeTab === 'CONFIG' && (
            <section className="panel-card rounded-[28px] p-5 md:p-6">
              {!draft ? (
                <div className="text-sm text-[var(--ink-soft)]">{TXT.emptyBlueprints}</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.1fr_0.35fr]">
                    <label className="block">
                      <span className={sectionLabelClassName}>{TXT.blueprintName}</span>
                      <input type="text" value={draft.name} onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))} className={inputClassName} />
                    </label>
                    <label className="block">
                      <span className={sectionLabelClassName}>{TXT.description}</span>
                      <input type="text" value={draft.description} onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))} className={inputClassName} />
                    </label>
                    <label className="block min-w-[120px]">
                      <span className={sectionLabelClassName}>{TXT.year}</span>
                      <select value={selectedYear} onChange={(event) => onSelectedYearChange(event.target.value)} className={selectClassName}>
                        {['2022', '2023', '2024', '2025', '2026'].map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="mt-5">
                    <h3 className={sectionLabelClassName}>{TXT.columnsTitle}</h3>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">{TXT.columnsSubtitle}</p>
                  </div>

                  {validationIssues.length > 0 && (
                    <div className="mt-3 rounded-[18px] border border-[rgba(145,13,18,0.18)] bg-[rgba(145,13,18,0.05)] px-4 py-3">
                      <div className="text-sm font-semibold text-[var(--primary)]">{TXT.validationTitle}</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--primary)]">
                        {validationIssues.map((issue, index) => <li key={`${issue.fieldId || 'general'}-${index}`}>{issue.message}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 flex justify-end">
                    {canManage && <button type="button" onClick={handleAddField} className="secondary-btn flex items-center gap-2"><Plus size={15} />{TXT.addColumn}</button>}
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
                      const filteredTemplates = projectTemplates.filter((template) => normalizeSearchText(template.name).includes(normalizeSearchText(templateFilter)));
                      const firstCollection = field.firstAxis === 'VERTICAL' ? catalog?.vertical || [] : catalog?.horizontal || [];
                      const secondCollection = field.secondAxis === 'VERTICAL' ? catalog?.vertical || [] : catalog?.horizontal || [];
                      const firstOptions = filterOptions(firstCollection, firstFilter);
                      const secondOptions = filterOptions(secondCollection, secondFilter);
                      const previewColumn = previewColumns.find((column) => column.field.id === field.id);

                      return (
                        <div key={field.id} className="border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-[var(--ink)]">{TXT.column} {index + 1}</div>
                            {canManage && draft.fields.length > 1 && <button type="button" onClick={() => handleDeleteField(field.id)} className="text-sm text-[var(--ink-soft)] transition hover:text-[var(--primary)]"><Trash2 size={16} /></button>}
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 xl:grid-cols-[0.72fr_0.95fr_1.05fr_1.05fr]">
                            <label className="block"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">{TXT.columnName}</span><input type="text" value={field.label} onChange={(event) => handleFieldChange(field.id, { label: event.target.value })} className={inputClassName} /></label>
                            <label className="block"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">{TXT.sourceTemplate}</span><div className="mt-1 flex items-center gap-2 border-b border-[var(--line)] pb-1"><Search size={14} className="shrink-0 text-[var(--ink-soft)]" /><input type="text" value={templateFilter} onChange={(event) => setTemplateFilters((current) => ({ ...current, [templateFilterKey]: event.target.value }))} placeholder={TXT.searchTemplate} className={filterInputClassName} /></div><select value={field.templateId} onChange={(event) => handleFieldChange(field.id, { templateId: event.target.value })} className={selectClassName}><option value="">{TXT.chooseTemplate}</option>{filteredTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                            <div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">{TXT.sourceCriterion1}</div><select value={field.firstAxis} onChange={(event) => handleFieldChange(field.id, { firstAxis: event.target.value as ExtractCriterionAxis, firstCriterionKey: '' })} className={selectClassName}><option value="VERTICAL">{TXT.fromVertical}</option><option value="HORIZONTAL">{TXT.fromHorizontal}</option></select><div className="mt-1 flex items-center gap-2 border-b border-[var(--line)] pb-1"><Search size={14} className="shrink-0 text-[var(--ink-soft)]" /><input type="text" value={firstFilter} onChange={(event) => setCriterionFilters((current) => ({ ...current, [firstFilterKey]: event.target.value }))} placeholder={TXT.searchCriterion} className={filterInputClassName} /></div><select value={field.firstCriterionKey} onChange={(event) => handleFieldChange(field.id, { firstCriterionKey: event.target.value })} className={selectClassName}><option value="">{TXT.chooseCriterion}</option>{firstOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div>
                            <div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">{TXT.sourceCriterion2}</div><select value={field.secondAxis} onChange={(event) => handleFieldChange(field.id, { secondAxis: event.target.value as ExtractCriterionAxis, secondCriterionKey: '' })} className={selectClassName}><option value="VERTICAL">{TXT.fromVertical}</option><option value="HORIZONTAL">{TXT.fromHorizontal}</option></select><div className="mt-1 flex items-center gap-2 border-b border-[var(--line)] pb-1"><Search size={14} className="shrink-0 text-[var(--ink-soft)]" /><input type="text" value={secondFilter} onChange={(event) => setCriterionFilters((current) => ({ ...current, [secondFilterKey]: event.target.value }))} placeholder={TXT.searchCriterion} className={filterInputClassName} /></div><select value={field.secondCriterionKey} onChange={(event) => handleFieldChange(field.id, { secondCriterionKey: event.target.value })} className={selectClassName}><option value="">{TXT.chooseCriterion}</option>{secondOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div>
                          </div>

                          {fieldResetMessages[field.id] && <div className="mt-2 text-sm text-[var(--ink-soft)]">{fieldResetMessages[field.id]}</div>}
                          {previewColumn && <div className="mt-2 text-sm"><div className="font-medium text-[var(--ink)]">{previewColumn.title}</div><div className="mt-1 text-[var(--ink-soft)]">{getColumnSourceSummary(previewColumn)}</div>{!previewColumn.isValid && previewColumn.reason && <div className="mt-1 text-[var(--primary)]">{previewColumn.reason}</div>}</div>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === 'PREVIEW' && (
            <section className="panel-card rounded-[28px] p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--ink)]">{TXT.previewTitle}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{TXT.previewSubtitle}</p>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-[var(--ink-soft)]">
                  <label className="block min-w-[150px]"><span className={sectionLabelClassName}>{TXT.sortUnits}</span><select value={previewSortMode} onChange={(event) => setPreviewSortMode(event.target.value as PreviewSortMode)} className={selectClassName}><option value="CODE_ASC">{TXT.sortByCode}</option><option value="NAME_ASC">{TXT.sortByName}</option></select></label>
                  <label className="block min-w-[170px]"><span className={sectionLabelClassName}>{TXT.filterData}</span><select value={previewFilterMode} onChange={(event) => setPreviewFilterMode(event.target.value as PreviewFilterMode)} className={selectClassName}><option value="ALL">{TXT.showAllUnits}</option><option value="HAS_DATA">{TXT.showUnitsWithData}</option><option value="NO_DATA">{TXT.showUnitsWithoutData}</option></select></label>
                </div>
              </div>

              <div className="mt-3 text-sm text-[var(--ink-soft)]">
                {previewRows.length} đơn vị hiển thị • {previewColumns.length} cột • {TXT.updatedAt}:{' '}
                {draft?.updatedAt ? new Date(draft.updatedAt).toLocaleString('vi-VN') : TXT.noDate}
                {draft?.updatedByName ? ` • ${repairLegacyUtf8(draft.updatedByName)}` : ''}
              </div>

              {isLoadingCatalog ? (
                <div className="mt-4 text-sm text-[var(--ink-soft)]">{TXT.analyzingTemplates}</div>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-[24px] border border-[var(--line)]">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-[rgba(145,13,18,0.05)]">
                      <tr>
                        <th className="sticky left-0 z-20 border-b border-[var(--line)] bg-[rgba(145,13,18,0.05)] px-4 py-3 text-left font-semibold text-[var(--ink)]">{TXT.unitName}</th>
                        {previewColumns.map((column) => (
                          <th key={column.field.id} className="border-b border-[var(--line)] px-4 py-3 text-left font-semibold text-[var(--ink)]" title={column.templateName ? getColumnSourceSummary(column) : column.reason || column.title}>
                            <div>{column.title}</div>
                            <div className="mt-1 text-[11px] font-normal text-[var(--ink-soft)]">{column.templateName ? getColumnSourceSummary(column) : column.reason || TXT.notConfigured}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.length === 0 ? (
                        <tr><td colSpan={previewColumns.length + 1} className="px-4 py-6 text-center text-sm text-[var(--ink-soft)]">{TXT.emptyRows}</td></tr>
                      ) : (
                        previewRows.map((row) => (
                          <tr key={row.unitCode} className="odd:bg-white even:bg-[rgba(145,13,18,0.02)]">
                            <td className="sticky left-0 z-10 border-b border-[var(--line)] bg-inherit px-4 py-3 text-[var(--ink)]">{row.unitName}</td>
                            {row.values.map((value, index) => <td key={`${row.unitCode}-${index}`} className="border-b border-[var(--line)] px-4 py-3 text-[var(--ink)]">{value || TXT.emptyValue}</td>)}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'VERSIONS' && (
            <section className="panel-card rounded-[28px] p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--ink)]">{TXT.versionHistory}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">Theo dõi các lần lưu và khôi phục cấu hình biểu trích.</p>
                </div>
                {canManage && <button type="button" onClick={handleRestoreVersion} className="secondary-btn flex items-center gap-2" disabled={!selectedVersionId}><RotateCcw size={15} />{TXT.restore}</button>}
              </div>

              <div className="mt-4 space-y-3">
                {isLoadingVersions ? (
                  <div className="text-sm text-[var(--ink-soft)]">{TXT.loading}</div>
                ) : versions.length === 0 ? (
                  <div className="text-sm text-[var(--ink-soft)]">{TXT.noSavedVersions}</div>
                ) : (
                  versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setSelectedVersionId(version.id)}
                      className={`w-full rounded-[18px] border px-4 py-3 text-left transition ${selectedVersionId === version.id ? 'border-[rgba(145,13,18,0.22)] bg-[rgba(145,13,18,0.05)]' : 'border-[var(--line)] bg-white hover:border-[rgba(145,13,18,0.18)]'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[var(--ink)]">{getVersionLabel(version)}</div>
                          <div className="mt-1 text-sm text-[var(--ink-soft)]">{version.description || 'Không có mô tả.'}</div>
                        </div>
                        <div className="text-sm text-[var(--ink-soft)]">{repairLegacyUtf8(version.createdByName) || 'Không rõ người cập nhật'}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}

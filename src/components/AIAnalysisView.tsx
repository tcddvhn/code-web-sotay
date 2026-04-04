import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Download, FileText, History, Lightbulb, RefreshCcw, Sparkles } from 'lucide-react';
import { FormTemplate, ManagedUnit, Project } from '../types';
import { YEARS } from '../constants';
import {
  createAIAnalysisReport,
  fetchAIAnalysisProjectSummary,
  fetchAIAnalysisScopeSummary,
  fetchAIAnalysisTemplateSummary,
  listRecentAIAnalysisReports,
} from '../aiAnalysisStore';
import {
  AIAnalysisOutput,
  AIAnalysisScope,
  AIAnalysisType,
  AIReportLength,
  AIWritingTone,
  buildAIAnalysisInput,
  generateAIAnalysisOutput,
} from '../aiAnalysisEngine';

const GEMINI_API_KEY_STORAGE_KEY = 'sotay_gemini_api_key';

const ANALYSIS_TYPE_OPTIONS: { value: AIAnalysisType; label: string }[] = [
  { value: 'QUICK', label: 'Tóm tắt nhanh' },
  { value: 'FULL', label: 'Phân tích đầy đủ' },
  { value: 'YEAR_COMPARE', label: 'So sánh theo năm' },
  { value: 'PROJECT_COMPARE', label: 'So sánh giữa dự án' },
  { value: 'ANOMALY', label: 'Phân tích bất thường' },
  { value: 'LEADERSHIP', label: 'Báo cáo lãnh đạo' },
];

const WRITING_TONE_OPTIONS: { value: AIWritingTone; label: string }[] = [
  { value: 'ADMIN', label: 'Hành chính' },
  { value: 'OPERATIONS', label: 'Điều hành' },
  { value: 'DEEP', label: 'Phân tích chuyên sâu' },
];

const REPORT_LENGTH_OPTIONS: { value: AIReportLength; label: string }[] = [
  { value: 'SHORT', label: 'Ngắn' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'LONG', label: 'Dài' },
];

const SCOPE_OPTIONS: { value: AIAnalysisScope; label: string }[] = [
  { value: 'ALL', label: 'Toàn bộ dữ liệu đã chọn' },
  { value: 'BY_TEMPLATE', label: 'Theo biểu' },
  { value: 'BY_UNIT', label: 'Theo đơn vị' },
  { value: 'BY_PROJECT_COMPARE', label: 'So sánh giữa dự án' },
];

const CONTENT_OPTIONS = [
  'Tổng quan số liệu',
  'Điểm nổi bật',
  'Đơn vị chậm cập nhật',
  'So sánh giữa các dự án',
  'So sánh theo năm',
  'Kiến nghị / đề xuất',
];

const MOCK_PREVIEW_SECTIONS = [
  {
    id: 'summary',
    title: '1. Tóm tắt điều hành',
    body:
      'Báo cáo AI sẽ tóm lược tình hình tiếp nhận dữ liệu theo các dự án và năm được chọn, nhấn mạnh những biến động chính, chênh lệch tiến độ và nhóm đơn vị cần ưu tiên theo dõi.',
  },
  {
    id: 'main-metrics',
    title: '2. Số liệu chính',
    body:
      'Khu vực này sẽ hiển thị các số liệu tổng hợp quan trọng như số đơn vị đã tiếp nhận, tỷ lệ hoàn thành, số biểu đã có dữ liệu và xu hướng thay đổi so với kỳ trước hoặc giữa các dự án.',
  },
  {
    id: 'highlights',
    title: '3. Nhận xét nổi bật',
    body:
      'AI sẽ nêu các điểm nổi bật dựa trên dữ liệu đã chọn, ví dụ dự án có tốc độ hoàn thành cao, biểu mẫu có tỷ lệ thiếu dữ liệu lớn hoặc các khối số liệu có biến động bất thường.',
  },
  {
    id: 'risks',
    title: '4. Đơn vị cần lưu ý',
    body:
      'Mục này sẽ tập trung vào các đơn vị chậm cập nhật, thiếu nhiều biểu hoặc có số liệu bất thường cần kiểm tra lại trước khi tổng hợp báo cáo chính thức.',
  },
  {
    id: 'recommendations',
    title: '5. Kiến nghị',
    body:
      'Hệ thống sẽ đề xuất các hướng xử lý ưu tiên như đôn đốc nhóm đơn vị chậm, rà soát các biểu có tỷ lệ thiếu dữ liệu cao hoặc ưu tiên kiểm tra những chỉ số biến động mạnh.',
  },
];

const MOCK_HISTORY = [
  {
    id: 'history_1',
    name: 'Phân tích tổng quan quý I/2026',
    createdAt: '08:30 04/04/2026',
    createdBy: 'Lê Đình Kiên',
  },
  {
    id: 'history_2',
    name: 'So sánh tiến độ các dự án đang hoạt động',
    createdAt: '15:10 03/04/2026',
    createdBy: 'Trần Thị Kiều Anh',
  },
];

type ScopeSummary = {
  project_count: number;
  template_count: number;
  unit_count: number;
  cell_count: number;
  total_value: number;
  distinct_source_rows: number;
} | null;

type ProjectSummaryRow = {
  project_id: string;
  project_name: string;
  unit_count: number;
  template_count: number;
  cell_count: number;
  total_value: number;
  avg_value: number;
};

type TemplateSummaryRow = {
  template_id: string;
  template_name: string;
  project_id: string;
  project_name: string;
  unit_count: number;
  cell_count: number;
  total_value: number;
  avg_value: number;
};

function toggleInArray<T>(items: T[], item: T) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

export function AIAnalysisView({
  projects,
  templates,
  units,
  currentUser,
}: {
  projects: Project[];
  templates: FormTemplate[];
  units: ManagedUnit[];
  currentUser?: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
}) {
  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'ACTIVE'),
    [projects],
  );

  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState(YEARS[0] || '2026');
  const [selectedScope, setSelectedScope] = useState<AIAnalysisScope>('ALL');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedUnitCodes, setSelectedUnitCodes] = useState<string[]>([]);
  const [analysisType, setAnalysisType] = useState<AIAnalysisType>('FULL');
  const [writingTone, setWritingTone] = useState<AIWritingTone>('ADMIN');
  const [reportLength, setReportLength] = useState<AIReportLength>('MEDIUM');
  const [selectedContent, setSelectedContent] = useState<string[]>([
    'Tổng quan số liệu',
    'Điểm nổi bật',
    'Kiến nghị / đề xuất',
  ]);
  const [extraPrompt, setExtraPrompt] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
  });
  const [scopeSummary, setScopeSummary] = useState<ScopeSummary>(null);
  const [projectSummary, setProjectSummary] = useState<ProjectSummaryRow[]>([]);
  const [templateSummary, setTemplateSummary] = useState<TemplateSummaryRow[]>([]);
  const [recentHistory, setRecentHistory] = useState(MOCK_HISTORY);
  const [summaryError, setSummaryError] = useState('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisOutput | null>(null);
  const [aiInputSnapshot, setAIInputSnapshot] = useState<Record<string, unknown> | null>(null);
  const [generationError, setGenerationError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);

  const configuredGeminiApiKey = ((import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined) || '';
  const resolvedGeminiApiKey = geminiApiKey.trim() || configuredGeminiApiKey.trim();

  const relatedTemplates = useMemo(() => {
    if (selectedProjectIds.length === 0) {
      return [];
    }

    return templates.filter((template) => selectedProjectIds.includes(template.projectId));
  }, [selectedProjectIds, templates]);

  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedProjectIds.includes(project.id)),
    [projects, selectedProjectIds],
  );

  const selectedTemplates = useMemo(
    () => relatedTemplates.filter((template) => selectedTemplateIds.includes(template.id)),
    [relatedTemplates, selectedTemplateIds],
  );

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const selectedUnits = useMemo(
    () => units.filter((unit) => selectedUnitCodes.includes(unit.code)),
    [selectedUnitCodes, units],
  );

  useEffect(() => {
    setSelectedTemplateIds((current) =>
      current.filter((templateId) => relatedTemplates.some((template) => template.id === templateId)),
    );
  }, [relatedTemplates]);

  const summary = useMemo(() => {
    if (scopeSummary) {
      return {
        projectCount: scopeSummary.project_count || 0,
        templateCount: scopeSummary.template_count || 0,
        unitCount: scopeSummary.unit_count || 0,
        rowCount: scopeSummary.distinct_source_rows || 0,
        cellCount: scopeSummary.cell_count || 0,
        totalValue: scopeSummary.total_value || 0,
      };
    }

    const projectCount = selectedProjects.length;
    const templateCount =
      selectedScope === 'BY_TEMPLATE' ? selectedTemplates.length : relatedTemplates.length;
    const unitCount = selectedScope === 'BY_UNIT' ? selectedUnits.length : units.length;
    const simulatedRows = Math.max(projectCount, 1) * Math.max(templateCount || 1, 1) * 132;

    return {
      projectCount,
      templateCount,
      unitCount,
      rowCount: simulatedRows,
      cellCount: simulatedRows * 8,
      totalValue: 0,
    };
  }, [
    relatedTemplates.length,
    scopeSummary,
    selectedProjects.length,
    selectedScope,
    selectedTemplates.length,
    selectedUnits.length,
    units.length,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (geminiApiKey.trim()) {
      window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, geminiApiKey.trim());
      return;
    }

    window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  }, [geminiApiKey]);

  useEffect(() => {
    let disposed = false;

    if (selectedProjectIds.length === 0 || !selectedYear) {
      setScopeSummary(null);
      setProjectSummary([]);
      setTemplateSummary([]);
      setSummaryError('');
      return undefined;
    }

    const loadSummary = async () => {
      setIsSummaryLoading(true);
      setSummaryError('');

      try {
        const params = {
          projectIds: selectedProjectIds,
          years: [selectedYear],
          templateIds: selectedScope === 'BY_TEMPLATE' ? selectedTemplateIds : undefined,
          unitCodes: selectedScope === 'BY_UNIT' ? selectedUnitCodes : undefined,
        };

        const [scope, projectsData, templatesData, history] = await Promise.all([
          fetchAIAnalysisScopeSummary(params),
          fetchAIAnalysisProjectSummary(params),
          fetchAIAnalysisTemplateSummary(params),
          listRecentAIAnalysisReports(10),
        ]);

        if (disposed) {
          return;
        }

        setScopeSummary(scope as ScopeSummary);
        setProjectSummary((projectsData || []) as ProjectSummaryRow[]);
        setTemplateSummary((templatesData || []) as TemplateSummaryRow[]);
        setRecentHistory(
          (history || []).map((item, index) => ({
            id: item.id || `history_fallback_${index}`,
            name:
              item.scopeSnapshot?.reportTitle?.toString() ||
              `${item.analysisType} - ${item.years?.join(', ') || selectedYear}`,
            createdAt: item.createdAt
              ? new Date(item.createdAt).toLocaleString('vi-VN')
              : 'Chưa rõ thời gian',
            createdBy:
              item.createdBy?.displayName ||
              item.createdBy?.email ||
              'Người dùng hệ thống',
          })),
        );
      } catch (error) {
        if (disposed) {
          return;
        }
        console.warn('Không thể tải tổng hợp dữ liệu cho Phân tích AI:', error);
        setScopeSummary(null);
        setProjectSummary([]);
        setTemplateSummary([]);
        setSummaryError(
          'Chưa lấy được dữ liệu phân tích thật. Giao diện đang hiển thị ước tính cho tới khi lớp summary sẵn sàng.',
        );
      } finally {
        if (!disposed) {
          setIsSummaryLoading(false);
        }
      }
    };

    void loadSummary();

    return () => {
      disposed = true;
    };
  }, [selectedProjectIds, selectedYear, selectedScope, selectedTemplateIds, selectedUnitCodes]);

  const canGenerate = selectedProjectIds.length > 0;
  const isLargeScope = summary.projectCount >= 4 || summary.templateCount >= 10 || summary.rowCount >= 5000;

  const handleGenerate = async () => {
    if (!canGenerate) {
      return;
    }

    if (!resolvedGeminiApiKey) {
      setGenerationError('Chưa có khóa Gemini. Hãy dán API key vào ô cấu hình AI trước khi tạo phân tích.');
      return;
    }

    setIsGenerating(true);
    setGenerationError('');

    try {
      const aiInput = await buildAIAnalysisInput({
        projectIds: selectedProjectIds,
        year: selectedYear,
        scope: selectedScope,
        selectedTemplateIds,
        selectedUnitCodes,
        analysisType,
        writingTone,
        reportLength,
        requestedSections: selectedContent,
        extraPrompt,
        projects,
        templates,
        units,
      });

      const aiOutput = await generateAIAnalysisOutput({
        apiKey: resolvedGeminiApiKey,
        input: aiInput,
      });

      setAIInputSnapshot(aiInput);
      setAnalysisResult(aiOutput);
      window.setTimeout(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);

      try {
        await createAIAnalysisReport({
          createdBy: currentUser || null,
          projectIds: selectedProjectIds,
          years: [selectedYear],
          scope: selectedScope,
          analysisType,
          writingTone,
          reportLength,
          selectedTemplateIds,
          selectedUnitCodes,
          requestedSections: selectedContent,
          extraPrompt,
          scopeSnapshot: {
            reportTitle: aiOutput.title,
            projectNames: selectedProjects.map((project) => project.name),
            year: selectedYear,
            scope: selectedScope,
          },
          aiInput,
          aiOutput,
          status: 'READY',
        });

        const history = await listRecentAIAnalysisReports(10);
        setRecentHistory(
          (history || []).map((item, index) => ({
            id: item.id || `history_fallback_${index}`,
            name:
              item.scopeSnapshot?.reportTitle?.toString() ||
              `${item.analysisType} - ${item.years?.join(', ') || selectedYear}`,
            createdAt: item.createdAt
              ? new Date(item.createdAt).toLocaleString('vi-VN')
              : 'Chưa rõ thời gian',
            createdBy:
              item.createdBy?.displayName ||
              item.createdBy?.email ||
              'Người dùng hệ thống',
          })),
        );
      } catch (historyError) {
        console.warn('Không thể lưu lịch sử báo cáo AI:', historyError);
      }
    } catch (error) {
      console.error('AI analysis generation error:', error);
      setGenerationError(error instanceof Error ? error.message : 'Không thể tạo phân tích AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <header className="mb-8">
        <div className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="surface-tag inline-flex items-center gap-2">
                <Bot size={14} />
                Module mới
              </div>
              <h2 className="page-title mt-4">PHÂN TÍCH AI</h2>
              <p className="page-subtitle mt-3 max-w-4xl text-sm">
                Chọn nhiều dự án, cấu hình loại phân tích và tạo báo cáo AI từ lớp dữ liệu phân tích đã được đồng
                bộ từ hệ thống hiện hành.
              </p>
            </div>
            <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--ink-soft)]">
              Giai đoạn hiện tại: Summary thật + AI preview thật, DOCX sẽ triển khai ở pha sau
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-8">
        <section className="panel-card rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="col-header">1. Phạm vi phân tích</p>
              <h3 className="section-title mt-2">Chọn dữ liệu cần AI xử lý</h3>
              <p className="page-subtitle mt-2 text-sm">
                Có thể chọn nhiều dự án để phục vụ phân tích toàn cục hoặc so sánh chéo giữa các dự án.
              </p>
            </div>
            {isLargeScope && (
              <div className="rounded-full border border-[rgba(179,15,20,0.18)] bg-[rgba(179,15,20,0.08)] px-4 py-2 text-xs font-semibold text-[var(--primary-dark)]">
                Phạm vi phân tích lớn, thời gian xử lý có thể lâu hơn
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_320px]">
            <div className="space-y-6">
              <div className="panel-soft rounded-[24px] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="col-header">Dự án</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProjectIds(activeProjects.map((project) => project.id))}
                      className="secondary-btn px-4 py-2 text-[10px]"
                    >
                      Chọn tất cả dự án đang hoạt động
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProjectIds([])}
                      className="secondary-btn px-4 py-2 text-[10px]"
                    >
                      Bỏ chọn tất cả
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {activeProjects.map((project) => {
                    const isActive = selectedProjectIds.includes(project.id);
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() =>
                          setSelectedProjectIds((current) => {
                            if (current.includes(project.id)) {
                              return current.filter((item) => item !== project.id);
                            }
                            return [...current, project.id];
                          })
                        }
                        className={`rounded-[22px] border px-4 py-3 text-left transition-all ${
                          isActive
                            ? 'border-[var(--primary-dark)] bg-[rgba(179,15,20,0.08)] shadow-[0_12px_30px_rgba(179,15,20,0.10)]'
                            : 'border-[var(--line)] bg-white hover:border-[var(--gold)]'
                        }`}
                      >
                        <p className="text-sm font-bold text-[var(--ink)]">{project.name}</p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          {project.description || 'Chưa có mô tả dự án.'}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--ink-soft)]">
                  <span>Đang chọn {selectedProjectIds.length} dự án</span>
                  {selectedProjects.map((project) => (
                    <span
                      key={`selected_${project.id}`}
                      className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[11px] text-[var(--ink)]"
                    >
                      {project.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="panel-soft rounded-[24px] p-5">
                  <p className="col-header mb-3">Năm</p>
                  <select
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(event.target.value)}
                    className="field-select text-sm font-bold"
                  >
                    {YEARS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="panel-soft rounded-[24px] p-5 md:col-span-2">
                  <p className="col-header mb-3">Phạm vi</p>
                  <div className="flex flex-wrap gap-2">
                    {SCOPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedScope(option.value)}
                        className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-all ${
                          selectedScope === option.value
                            ? 'border-[var(--primary-dark)] bg-[rgba(179,15,20,0.08)] text-[var(--primary-dark)]'
                            : 'border-[var(--line)] bg-white text-[var(--ink-soft)]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {selectedScope === 'BY_TEMPLATE' && (
                <div className="panel-soft rounded-[24px] p-5">
                  <p className="col-header mb-3">Biểu mẫu</p>
                  <p className="mb-4 text-sm text-[var(--ink-soft)]">
                    Hệ thống đang gom toàn bộ biểu mẫu thuộc các dự án đã chọn để bạn lọc đúng phạm vi cần phân tích.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {relatedTemplates.map((template) => {
                      const isSelected = selectedTemplateIds.includes(template.id);
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setSelectedTemplateIds((current) => toggleInArray(current, template.id))}
                          className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-all ${
                            isSelected
                              ? 'border-[var(--primary-dark)] bg-[rgba(179,15,20,0.08)] text-[var(--primary-dark)]'
                              : 'border-[var(--line)] bg-white text-[var(--ink-soft)]'
                          }`}
                          title={`${template.name} • ${projectNameById.get(template.projectId) || 'Dự án không xác định'}`}
                        >
                          {template.name}
                          <span className="ml-2 normal-case tracking-normal text-[11px] font-semibold opacity-80">
                            ({projectNameById.get(template.projectId) || 'Dự án'})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedScope === 'BY_UNIT' && (
                <div className="panel-soft rounded-[24px] p-5">
                  <p className="col-header mb-3">Đơn vị</p>
                  <div className="flex max-h-[220px] flex-wrap gap-2 overflow-auto">
                    {units.map((unit) => {
                      const isSelected = selectedUnitCodes.includes(unit.code);
                      return (
                        <button
                          key={unit.code}
                          type="button"
                          onClick={() => setSelectedUnitCodes((current) => toggleInArray(current, unit.code))}
                          className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-all ${
                            isSelected
                              ? 'border-[var(--primary-dark)] bg-[rgba(179,15,20,0.08)] text-[var(--primary-dark)]'
                              : 'border-[var(--line)] bg-white text-[var(--ink-soft)]'
                          }`}
                        >
                          {unit.code} - {unit.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <aside className="panel-soft rounded-[24px] p-5">
              <p className="col-header">Tóm tắt phạm vi</p>
              {isSummaryLoading && (
                <p className="mt-3 text-xs font-semibold text-[var(--ink-soft)]">Đang tổng hợp dữ liệu thật...</p>
              )}
              {summaryError && (
                <p className="mt-3 text-xs font-semibold text-[var(--primary-dark)]">{summaryError}</p>
              )}
              <div className="mt-4 space-y-2 text-sm text-[var(--ink)]">
                <p>- Dự án đang chọn: <span className="font-bold">{selectedProjects.length}</span></p>
                <p>- Dự án có dữ liệu trong phạm vi: <span className="font-bold">{summary.projectCount}</span></p>
                <p>- Năm phân tích: <span className="font-bold">{selectedYear}</span></p>
                <p>- Biểu mẫu liên quan: <span className="font-bold">{summary.templateCount}</span></p>
                <p>- Đơn vị có dữ liệu: <span className="font-bold">{summary.unitCount}</span></p>
                <p>- Tổng số dòng tổng hợp ước tính: <span className="font-bold">{summary.rowCount.toLocaleString('vi-VN')}</span></p>
                <p>- Tổng số ô dữ liệu: <span className="font-bold">{summary.cellCount.toLocaleString('vi-VN')}</span></p>
                {summary.totalValue > 0 && (
                  <p>- Tổng giá trị cộng dồn: <span className="font-bold">{summary.totalValue.toLocaleString('vi-VN')}</span></p>
                )}
              </div>

              {selectedProjects.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedProjects.map((project) => (
                    <span
                      key={project.id}
                      className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--ink)]"
                    >
                      {project.name}
                    </span>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </section>

        <section className="panel-card rounded-[28px] p-6 md:p-8">
          <div>
            <p className="col-header">2. Cấu hình phân tích</p>
            <h3 className="section-title mt-2">Thiết lập cách AI soạn báo cáo</h3>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="panel-soft rounded-[24px] p-5">
              <p className="col-header mb-3">Loại phân tích</p>
              <div className="space-y-2">
                {ANALYSIS_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAnalysisType(option.value)}
                    className={`flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left transition-all ${
                      analysisType === option.value
                        ? 'border-[var(--primary-dark)] bg-[rgba(179,15,20,0.08)]'
                        : 'border-[var(--line)] bg-white'
                    }`}
                  >
                    <span className="text-sm font-semibold text-[var(--ink)]">{option.label}</span>
                    {analysisType === option.value && <Sparkles size={16} className="text-[var(--primary-dark)]" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6 xl:col-span-2">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="panel-soft rounded-[24px] p-5">
                  <p className="col-header mb-3">Giọng văn</p>
                  <div className="flex flex-wrap gap-2">
                    {WRITING_TONE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setWritingTone(option.value)}
                        className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-all ${
                          writingTone === option.value
                            ? 'border-[var(--primary-dark)] bg-[rgba(179,15,20,0.08)] text-[var(--primary-dark)]'
                            : 'border-[var(--line)] bg-white text-[var(--ink-soft)]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel-soft rounded-[24px] p-5">
                  <p className="col-header mb-3">Độ dài báo cáo</p>
                  <div className="flex flex-wrap gap-2">
                    {REPORT_LENGTH_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setReportLength(option.value)}
                        className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-all ${
                          reportLength === option.value
                            ? 'border-[var(--primary-dark)] bg-[rgba(179,15,20,0.08)] text-[var(--primary-dark)]'
                            : 'border-[var(--line)] bg-white text-[var(--ink-soft)]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="panel-soft rounded-[24px] p-5">
                <p className="col-header mb-3">Nội dung cần có</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {CONTENT_OPTIONS.map((option) => {
                    const checked = selectedContent.includes(option);
                    return (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center gap-3 rounded-[18px] border px-4 py-3 transition-all ${
                          checked ? 'border-[var(--primary-dark)] bg-[rgba(179,15,20,0.06)]' : 'border-[var(--line)] bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedContent((current) => toggleInArray(current, option))}
                          className="h-4 w-4 rounded border-[var(--line)]"
                        />
                        <span className="text-sm font-semibold text-[var(--ink)]">{option}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="panel-soft rounded-[24px] p-5">
                <p className="col-header mb-3">Yêu cầu thêm</p>
                <textarea
                  value={extraPrompt}
                  onChange={(event) => setExtraPrompt(event.target.value)}
                  className="field-input min-h-[120px] resize-y py-4 text-sm"
                  placeholder="Ví dụ: ưu tiên phân tích những dự án có tỷ lệ hoàn thành thấp và nhấn mạnh những biểu mẫu còn thiếu nhiều dữ liệu."
                />
              </div>

              <div className="panel-soft rounded-[24px] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="col-header">Khóa Gemini</p>
                  <span className="text-xs font-semibold text-[var(--ink-soft)]">
                    {resolvedGeminiApiKey ? 'Đã sẵn sàng gọi AI' : 'Chưa có API key'}
                  </span>
                </div>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                  className="field-input mt-3 py-3 text-sm"
                  placeholder="Dán Gemini API key nếu không dùng biến môi trường"
                />
                <p className="mt-3 text-xs text-[var(--ink-soft)]">
                  Ưu tiên khóa bạn dán tại đây. Nếu để trống, hệ thống sẽ thử dùng `VITE_GEMINI_API_KEY`.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canGenerate || isGenerating}
              onClick={() => void handleGenerate()}
              className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating ? 'Đang tạo phân tích AI...' : 'Tạo phân tích AI'}
            </button>
            {!canGenerate && (
              <p className="text-sm text-[var(--ink-soft)]">Chọn ít nhất một dự án để bắt đầu phân tích.</p>
            )}
            {generationError && (
              <p className="text-sm font-semibold text-[var(--primary-dark)]">{generationError}</p>
            )}
          </div>
        </section>

        <section ref={previewSectionRef} className="grid grid-cols-1 gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="panel-card rounded-[28px] p-6">
              <div className="flex items-center gap-2">
                <Lightbulb size={18} className="text-[var(--primary-dark)]" />
                <h3 className="section-title text-[1.05rem]">Phiên phân tích</h3>
              </div>
              <div className="mt-4 space-y-2 text-sm text-[var(--ink)]">
                <p>- Loại phân tích: <span className="font-semibold">{ANALYSIS_TYPE_OPTIONS.find((item) => item.value === analysisType)?.label}</span></p>
                <p>- Giọng văn: <span className="font-semibold">{WRITING_TONE_OPTIONS.find((item) => item.value === writingTone)?.label}</span></p>
                <p>- Độ dài: <span className="font-semibold">{REPORT_LENGTH_OPTIONS.find((item) => item.value === reportLength)?.label}</span></p>
              </div>
            </div>

            <div className="panel-card rounded-[28px] p-6">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[var(--primary-dark)]" />
                <h3 className="section-title text-[1.05rem]">Mục lục báo cáo</h3>
              </div>
              <div className="mt-4 space-y-2">
                {MOCK_PREVIEW_SECTIONS.map((section) => (
                  <div key={section.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                    {section.title}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-card rounded-[28px] p-6">
              <div className="flex items-center gap-2">
                <History size={18} className="text-[var(--primary-dark)]" />
                <h3 className="section-title text-[1.05rem]">Lịch sử báo cáo gần đây</h3>
              </div>
              <div className="mt-4 space-y-3">
                {recentHistory.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--ink)]">{item.name}</p>
                    <p className="mt-1 text-xs text-[var(--ink-soft)]">
                      {item.createdAt} • {item.createdBy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="panel-card rounded-[28px] p-6 md:p-8">
            <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="col-header">3. Preview kết quả</p>
                <h3 className="section-title mt-2">Bản xem trước báo cáo phân tích AI</h3>
                <p className="page-subtitle mt-2 text-sm">
                  Khung này sẽ hiển thị kết quả phân tích thật sau khi gọi Gemini trên lớp summary đã chọn.
                </p>
                {analysisResult && (
                  <p className="mt-3 text-sm font-semibold text-[var(--primary-dark)]">
                    Báo cáo đã được tạo và hiển thị ngay tại phần này.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating || !canGenerate}
                  className="secondary-btn px-4 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RefreshCcw size={14} />
                  Tạo lại
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnalysisResult(null);
                    setAIInputSnapshot(null);
                    setGenerationError('');
                  }}
                  className="secondary-btn px-4 py-2 text-[11px]"
                >
                  <Sparkles size={14} />
                  Sửa yêu cầu
                </button>
                <button type="button" disabled className="primary-btn px-4 py-2 text-[11px] opacity-50 cursor-not-allowed">
                  <Download size={14} />
                  Xuất DOCX (sắp có)
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-[var(--line)] bg-[var(--surface-soft)] px-5 py-4 text-sm text-[var(--ink)]">
              <p>- Dự án đang chọn: <span className="font-semibold">{selectedProjects.length}</span></p>
              <p>- Dự án có dữ liệu trong phạm vi: <span className="font-semibold">{summary.projectCount}</span></p>
              <p>- Năm phân tích: <span className="font-semibold">{selectedYear}</span></p>
              <p>- Biểu mẫu liên quan: <span className="font-semibold">{summary.templateCount}</span></p>
              <p>- Đơn vị có dữ liệu: <span className="font-semibold">{summary.unitCount}</span></p>
              <p>- Tổng số dòng tổng hợp: <span className="font-semibold">{summary.rowCount.toLocaleString('vi-VN')}</span></p>
              {aiInputSnapshot && (
                <p>- Phiên này dùng dữ liệu thật từ lớp `analysis_cells` và các summary RPC đã chọn.</p>
              )}
            </div>

            {projectSummary.length > 0 && (
              <section className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                <h4 className="text-lg font-black text-[var(--primary-dark)]">Tổng hợp theo dự án</h4>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {projectSummary.map((item) => (
                    <div key={item.project_id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4">
                      <p className="text-sm font-bold text-[var(--ink)]">{item.project_name}</p>
                      <div className="mt-2 space-y-1 text-xs text-[var(--ink-soft)]">
                        <p>- Đơn vị có dữ liệu: <span className="font-semibold text-[var(--ink)]">{item.unit_count}</span></p>
                        <p>- Biểu mẫu có dữ liệu: <span className="font-semibold text-[var(--ink)]">{item.template_count}</span></p>
                        <p>- Ô dữ liệu: <span className="font-semibold text-[var(--ink)]">{Number(item.cell_count || 0).toLocaleString('vi-VN')}</span></p>
                        <p>- Tổng giá trị: <span className="font-semibold text-[var(--ink)]">{Number(item.total_value || 0).toLocaleString('vi-VN')}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedScope === 'BY_TEMPLATE' && templateSummary.length > 0 && (
              <section className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                <h4 className="text-lg font-black text-[var(--primary-dark)]">Tổng hợp theo biểu</h4>
                <div className="mt-4 space-y-3">
                  {templateSummary.map((item) => (
                    <div key={`${item.project_id}_${item.template_id}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4">
                      <p className="text-sm font-bold text-[var(--ink)]">
                        {item.template_name}
                        <span className="ml-2 text-xs font-semibold text-[var(--ink-soft)]">({item.project_name})</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--ink-soft)]">
                        <span>Đơn vị: <strong className="text-[var(--ink)]">{item.unit_count}</strong></span>
                        <span>Ô dữ liệu: <strong className="text-[var(--ink)]">{Number(item.cell_count || 0).toLocaleString('vi-VN')}</strong></span>
                        <span>Tổng giá trị: <strong className="text-[var(--ink)]">{Number(item.total_value || 0).toLocaleString('vi-VN')}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-6 space-y-5">
              {analysisResult ? (
                <>
                  <section className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                    <h4 className="text-lg font-black text-[var(--primary-dark)]">{analysisResult.title}</h4>
                    <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{analysisResult.executiveSummary}</p>
                  </section>

                  <section className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                    <h4 className="text-lg font-black text-[var(--primary-dark)]">Điểm chính</h4>
                    <div className="mt-3 space-y-3">
                      {analysisResult.keyFindings.map((item, index) => (
                        <p key={`${index}_${item}`} className="text-sm leading-7 text-[var(--ink)]">
                          - {item}
                        </p>
                      ))}
                    </div>
                  </section>

                  {analysisResult.projectHighlights.length > 0 && (
                    <section className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                      <h4 className="text-lg font-black text-[var(--primary-dark)]">Nhận xét theo dự án</h4>
                      <div className="mt-4 space-y-4">
                        {analysisResult.projectHighlights.map((item) => (
                          <div key={`${item.projectName}_${item.summary}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4">
                            <p className="text-sm font-bold text-[var(--ink)]">{item.projectName}</p>
                            <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{item.summary}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {analysisResult.riskItems.length > 0 && (
                    <section className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                      <h4 className="text-lg font-black text-[var(--primary-dark)]">Đơn vị / điểm cần lưu ý</h4>
                      <div className="mt-4 space-y-4">
                        {analysisResult.riskItems.map((item) => (
                          <div key={`${item.title}_${item.detail}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4">
                            <p className="text-sm font-bold text-[var(--ink)]">{item.title}</p>
                            <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {analysisResult.recommendations.length > 0 && (
                    <section className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                      <h4 className="text-lg font-black text-[var(--primary-dark)]">Kiến nghị</h4>
                      <div className="mt-3 space-y-3">
                        {analysisResult.recommendations.map((item, index) => (
                          <p key={`${index}_${item}`} className="text-sm leading-7 text-[var(--ink)]">
                            - {item}
                          </p>
                        ))}
                      </div>
                    </section>
                  )}

                  {analysisResult.appendixTables.map((table) => (
                    <section key={table.title} className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                      <h4 className="text-lg font-black text-[var(--primary-dark)]">{table.title}</h4>
                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                          <thead>
                            <tr>
                              {table.headers.map((header) => (
                                <th key={header} className="border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-left font-bold text-[var(--ink)]">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.map((row, rowIndex) => (
                              <tr key={`${table.title}_${rowIndex}`}>
                                {row.map((cell, cellIndex) => (
                                  <td key={`${rowIndex}_${cellIndex}`} className="border border-[var(--line)] px-3 py-2 text-[var(--ink)]">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </>
              ) : (
                MOCK_PREVIEW_SECTIONS.map((section) => (
                  <section key={section.id} className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                    <h4 className="text-lg font-black text-[var(--primary-dark)]">{section.title}</h4>
                    <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{section.body}</p>
                  </section>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

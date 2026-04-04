import React, { useMemo, useState } from 'react';
import { Bot, Download, FileText, History, Lightbulb, RefreshCcw, Sparkles } from 'lucide-react';
import { FormTemplate, ManagedUnit, Project } from '../types';
import { YEARS } from '../constants';

type AnalysisScope = 'ALL' | 'BY_TEMPLATE' | 'BY_UNIT' | 'BY_PROJECT_COMPARE';
type AnalysisType =
  | 'QUICK'
  | 'FULL'
  | 'YEAR_COMPARE'
  | 'PROJECT_COMPARE'
  | 'ANOMALY'
  | 'LEADERSHIP';
type WritingTone = 'ADMIN' | 'OPERATIONS' | 'DEEP';
type ReportLength = 'SHORT' | 'MEDIUM' | 'LONG';

const ANALYSIS_TYPE_OPTIONS: { value: AnalysisType; label: string }[] = [
  { value: 'QUICK', label: 'Tóm tắt nhanh' },
  { value: 'FULL', label: 'Phân tích đầy đủ' },
  { value: 'YEAR_COMPARE', label: 'So sánh theo năm' },
  { value: 'PROJECT_COMPARE', label: 'So sánh giữa dự án' },
  { value: 'ANOMALY', label: 'Phân tích bất thường' },
  { value: 'LEADERSHIP', label: 'Báo cáo lãnh đạo' },
];

const WRITING_TONE_OPTIONS: { value: WritingTone; label: string }[] = [
  { value: 'ADMIN', label: 'Hành chính' },
  { value: 'OPERATIONS', label: 'Điều hành' },
  { value: 'DEEP', label: 'Phân tích chuyên sâu' },
];

const REPORT_LENGTH_OPTIONS: { value: ReportLength; label: string }[] = [
  { value: 'SHORT', label: 'Ngắn' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'LONG', label: 'Dài' },
];

const SCOPE_OPTIONS: { value: AnalysisScope; label: string }[] = [
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

function toggleInArray<T>(items: T[], item: T) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

export function AIAnalysisView({
  projects,
  templates,
  units,
}: {
  projects: Project[];
  templates: FormTemplate[];
  units: ManagedUnit[];
}) {
  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'ACTIVE'),
    [projects],
  );

  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    activeProjects.slice(0, Math.min(2, activeProjects.length)).map((project) => project.id),
  );
  const [selectedYear, setSelectedYear] = useState(YEARS[0] || '2026');
  const [selectedScope, setSelectedScope] = useState<AnalysisScope>('ALL');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedUnitCodes, setSelectedUnitCodes] = useState<string[]>([]);
  const [analysisType, setAnalysisType] = useState<AnalysisType>('FULL');
  const [writingTone, setWritingTone] = useState<WritingTone>('ADMIN');
  const [reportLength, setReportLength] = useState<ReportLength>('MEDIUM');
  const [selectedContent, setSelectedContent] = useState<string[]>([
    'Tổng quan số liệu',
    'Điểm nổi bật',
    'Kiến nghị / đề xuất',
  ]);
  const [extraPrompt, setExtraPrompt] = useState('');

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

  const selectedUnits = useMemo(
    () => units.filter((unit) => selectedUnitCodes.includes(unit.code)),
    [selectedUnitCodes, units],
  );

  const summary = useMemo(() => {
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
    };
  }, [relatedTemplates.length, selectedProjects.length, selectedScope, selectedTemplates.length, selectedUnits.length, units.length]);

  const canGenerate = selectedProjectIds.length > 0;
  const isLargeScope = summary.projectCount >= 4 || summary.templateCount >= 10 || summary.rowCount >= 5000;

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
                Chọn nhiều dự án, cấu hình loại phân tích và xem trước báo cáo AI trước khi triển khai phần
                xử lý dữ liệu, sinh nội dung và xuất DOCX chuẩn văn phòng.
              </p>
            </div>
            <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--ink-soft)]">
              Giai đoạn hiện tại: Dựng giao diện và chốt trải nghiệm người dùng
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
                          setSelectedProjectIds((current) =>
                            current.includes(project.id)
                              ? current.filter((item) => item !== project.id)
                              : [...current, project.id],
                          )
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
                        >
                          {template.name}
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
              <div className="mt-4 space-y-2 text-sm text-[var(--ink)]">
                <p>- Dự án đã chọn: <span className="font-bold">{summary.projectCount}</span></p>
                <p>- Năm phân tích: <span className="font-bold">{selectedYear}</span></p>
                <p>- Biểu mẫu liên quan: <span className="font-bold">{summary.templateCount}</span></p>
                <p>- Đơn vị có dữ liệu: <span className="font-bold">{summary.unitCount}</span></p>
                <p>- Tổng số dòng tổng hợp ước tính: <span className="font-bold">{summary.rowCount.toLocaleString('vi-VN')}</span></p>
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
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canGenerate}
              className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
            >
              Tạo phân tích AI
            </button>
            {!canGenerate && (
              <p className="text-sm text-[var(--ink-soft)]">Chọn ít nhất một dự án để bắt đầu phân tích.</p>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
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
                {MOCK_HISTORY.map((item) => (
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
                  Đây là khung preview mẫu để duyệt trải nghiệm đọc và xuất báo cáo trước khi nối AI thật.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="secondary-btn px-4 py-2 text-[11px]">
                  <RefreshCcw size={14} />
                  Tạo lại
                </button>
                <button type="button" className="secondary-btn px-4 py-2 text-[11px]">
                  <Sparkles size={14} />
                  Sửa yêu cầu
                </button>
                <button type="button" className="primary-btn px-4 py-2 text-[11px]">
                  <Download size={14} />
                  Xuất DOCX
                </button>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-[var(--line)] bg-[var(--surface-soft)] px-5 py-4 text-sm text-[var(--ink)]">
              <p>- Dự án đã chọn: <span className="font-semibold">{summary.projectCount}</span></p>
              <p>- Năm phân tích: <span className="font-semibold">{selectedYear}</span></p>
              <p>- Biểu mẫu liên quan: <span className="font-semibold">{summary.templateCount}</span></p>
              <p>- Đơn vị có dữ liệu: <span className="font-semibold">{summary.unitCount}</span></p>
            </div>

            <div className="mt-6 space-y-5">
              {MOCK_PREVIEW_SECTIONS.map((section) => (
                <section key={section.id} className="rounded-[24px] border border-[var(--line)] bg-white px-5 py-5">
                  <h4 className="text-lg font-black text-[var(--primary-dark)]">{section.title}</h4>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{section.body}</p>
                </section>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

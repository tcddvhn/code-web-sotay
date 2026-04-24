import { GoogleGenAI, Type } from '@google/genai';
import {
  AnalysisCellRecord,
  AIIndicatorSummary,
  AIReportBlueprintContent,
  fetchAIAnalysisProjectSummary,
  fetchAIAnalysisScopeSummary,
  ScopeSummaryLike,
  SummaryRowLike,
  fetchAIAnalysisTemplateSummary,
  listAnalysisCellsByScope,
} from './aiAnalysisStore';
import { FormTemplate, ManagedUnit, Project } from './types';

export type AIAnalysisScope = 'ALL' | 'BY_TEMPLATE' | 'BY_UNIT' | 'BY_PROJECT_COMPARE';
export type AIAnalysisType =
  | 'QUICK'
  | 'FULL'
  | 'YEAR_COMPARE'
  | 'PROJECT_COMPARE'
  | 'ANOMALY'
  | 'LEADERSHIP';
export type AIWritingTone = 'ADMIN' | 'OPERATIONS' | 'DEEP';
export type AIReportLength = 'SHORT' | 'MEDIUM' | 'LONG';

export type AIAnalysisBuildParams = {
  projectIds: string[];
  year: string;
  scope: AIAnalysisScope;
  analysisLevel?: 'CITY' | 'UNITS';
  selectedTemplateIds?: string[];
  selectedUnitCodes?: string[];
  analysisType: AIAnalysisType;
  writingTone: AIWritingTone;
  reportLength: AIReportLength;
  requestedSections: string[];
  extraPrompt?: string;
  projects: Project[];
  templates: FormTemplate[];
  units: ManagedUnit[];
  summaryOverride?: ScopeSummaryLike | null;
  projectSummariesOverride?: SummaryRowLike[];
  templateSummariesOverride?: SummaryRowLike[];
  indicatorSummariesOverride?: AIIndicatorSummary[];
  reportBlueprint?: AIReportBlueprintContent | null;
};

export type AIAnalysisOutput = {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  projectHighlights: { projectName: string; summary: string }[];
  riskItems: { title: string; detail: string }[];
  recommendations: string[];
  blueprintSections: { title: string; content: string }[];
  appendixTables: { title: string; headers: string[]; rows: string[][] }[];
};

type AIGenerationProgress = {
  label: string;
  percent?: number;
};

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferPreviousYear(year: string) {
  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) {
    return null;
  }
  return String(numericYear - 1);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function parseRetryDelayMs(error: unknown) {
  if (!(error instanceof Error)) {
    return 6000;
  }

  const retryMatch = error.message.match(/retry in ([\d.]+)s/i);
  if (retryMatch) {
    return Math.max(1500, Math.ceil(Number(retryMatch[1]) * 1000));
  }

  const detailMatch = error.message.match(/"retryDelay":"(\d+)s"/i);
  if (detailMatch) {
    return Math.max(1500, Number(detailMatch[1]) * 1000);
  }

  return 6000;
}

function isTransientGeminiError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toUpperCase();
  return (
    message.includes('503') ||
    message.includes('UNAVAILABLE') ||
    message.includes('HIGH DEMAND') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('429') ||
    message.includes('OVERLOAD')
  );
}

export function isRetryableAIModelError(error: unknown) {
  return isTransientGeminiError(error);
}

function toPlainStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function buildScopeTitle(scope: Record<string, unknown>) {
  const projectNames = toPlainStringList(scope.projectNames);
  const year = typeof scope.year === 'string' ? scope.year : '';
  const level = scope.analysisLevel === 'UNITS' ? 'chi tiết 132 đơn vị' : 'cấp Đảng bộ Thành phố';

  if (projectNames.length === 1) {
    return `Báo cáo phân tích ${level} - ${projectNames[0]}${year ? ` năm ${year}` : ''}`;
  }

  if (projectNames.length > 1) {
    return `Báo cáo phân tích ${level} - ${projectNames.length} dự án${year ? ` năm ${year}` : ''}`;
  }

  return `Báo cáo phân tích ${level}${year ? ` năm ${year}` : ''}`;
}

function formatIndicatorLine(indicator: AIIndicatorSummary) {
  const label =
    indicator.indicatorLabel ||
    [indicator.rowLabel, indicator.columnLabel].filter(Boolean).join(' - ') ||
    indicator.indicatorKey;

  const totalValue = Number(indicator.totalValue || 0).toLocaleString('vi-VN');
  const unitCount = Number(indicator.nonZeroUnitCount || 0).toLocaleString('vi-VN');
  return `${label}: tổng giá trị ${totalValue}, có số liệu tại ${unitCount} đơn vị.`;
}

function buildBlueprintSectionContent(kind: string, context: {
  summary: Record<string, unknown>;
  projectSummaries: Record<string, unknown>[];
  indicatorSummaries: AIIndicatorSummary[];
  anomalies: { title: string; detail: string }[];
  recommendations: string[];
}) {
  const totalCells = Number(context.summary.cell_count || 0).toLocaleString('vi-VN');
  const totalUnits = Number(context.summary.unit_count || 0).toLocaleString('vi-VN');
  const totalTemplates = Number(context.summary.template_count || 0).toLocaleString('vi-VN');
  const topIndicators = context.indicatorSummaries.slice(0, 3).map(formatIndicatorLine);
  const topProjects = context.projectSummaries
    .slice(0, 3)
    .map((item) => {
      const projectName = String(item.project_name || 'Dự án');
      const cellCount = Number(item.cell_count || 0).toLocaleString('vi-VN');
      const totalValue = Number(item.total_value || 0).toLocaleString('vi-VN');
      return `${projectName}: ${cellCount} ô dữ liệu, tổng giá trị ${totalValue}.`;
    });

  switch (kind) {
    case 'opening':
      return `Phạm vi phân tích hiện có ${totalUnits} đơn vị phát sinh dữ liệu, ${totalTemplates} biểu mẫu liên quan và ${totalCells} ô dữ liệu đã được tổng hợp. Đây là bản báo cáo dự phòng được dựng tự động từ dữ liệu thật của hệ thống trong lúc dịch vụ AI đang quá tải.`;
    case 'metrics_commentary':
      return topIndicators.length > 0
        ? topIndicators.join(' ')
        : 'Hiện chưa trích được nhóm tiêu chí nổi bật để diễn giải sâu hơn.';
    case 'risks':
      return context.anomalies.length > 0
        ? context.anomalies.slice(0, 3).map((item) => `${item.title}: ${item.detail}`).join(' ')
        : 'Chưa phát hiện bất thường nổi bật từ lớp dữ liệu đã tổng hợp cho phạm vi đang chọn.';
    case 'recommendations':
      return context.recommendations.join(' ');
    default:
      if (topProjects.length > 0) {
        return topProjects.join(' ');
      }
      return 'Nội dung mục này đang dùng bản dựng dự phòng từ dữ liệu tổng hợp của hệ thống.';
  }
}

export function buildFallbackAIAnalysisOutput(input: Record<string, unknown>): AIAnalysisOutput {
  const scope = ((input.scope as Record<string, unknown>) || {});
  const summary = ((input.summary as Record<string, unknown>) || {});
  const projectSummaries = Array.isArray(input.projectSummaries)
    ? (input.projectSummaries as Record<string, unknown>[])
    : [];
  const indicatorSummaries = Array.isArray(input.indicatorSummaries)
    ? (input.indicatorSummaries as AIIndicatorSummary[])
    : [];
  const anomalies = Array.isArray(input.anomalies)
    ? (input.anomalies as { title: string; detail: string }[])
    : [];
  const blueprint = (input.reportBlueprint as AIReportBlueprintContent | null) || buildDefaultBlueprint('MEDIUM');
  const appendixTables = Array.isArray(input.appendixTables)
    ? (input.appendixTables as AIAnalysisOutput['appendixTables'])
    : [];

  const totalProjects = Number(summary.project_count || 0).toLocaleString('vi-VN');
  const totalTemplates = Number(summary.template_count || 0).toLocaleString('vi-VN');
  const totalUnits = Number(summary.unit_count || 0).toLocaleString('vi-VN');
  const totalCells = Number(summary.cell_count || 0).toLocaleString('vi-VN');
  const totalValue = Number(summary.total_value || 0).toLocaleString('vi-VN');

  const keyFindings = [
    `Phạm vi đang chọn có ${totalProjects} dự án, ${totalTemplates} biểu mẫu và ${totalUnits} đơn vị phát sinh dữ liệu.`,
    `Tổng số ô dữ liệu đã dùng để phân tích là ${totalCells}, với tổng giá trị cộng dồn ${totalValue}.`,
    ...indicatorSummaries.slice(0, 3).map(formatIndicatorLine),
  ].filter(Boolean);

  const projectHighlights = projectSummaries.slice(0, 5).map((item) => ({
    projectName: String(item.project_name || 'Dự án'),
    summary: `${String(item.project_name || 'Dự án')} hiện có ${Number(item.unit_count || 0).toLocaleString('vi-VN')} đơn vị, ${Number(item.template_count || 0).toLocaleString('vi-VN')} biểu mẫu, ${Number(item.cell_count || 0).toLocaleString('vi-VN')} ô dữ liệu và tổng giá trị ${Number(item.total_value || 0).toLocaleString('vi-VN')}.`,
  }));

  const recommendations = [
    'Tiếp tục rà soát các tiêu chí đang có biến động lớn hoặc chênh lệch đáng kể giữa các dự án.',
    'Ưu tiên kiểm tra lại những biểu mẫu hoặc đơn vị có tỷ lệ ô bằng 0 cao trước khi dùng cho báo cáo chính thức.',
    'Sau khi dịch vụ AI ổn định, có thể tạo lại báo cáo để nhận được phần diễn giải sâu hơn bằng ngôn ngữ tự nhiên.',
  ];

  return {
    title: buildScopeTitle(scope),
    executiveSummary: `Hệ thống đã dựng bản báo cáo dự phòng từ dữ liệu thật do dịch vụ Gemini đang quá tải tạm thời. Phạm vi hiện có ${totalProjects} dự án, ${totalUnits} đơn vị, ${totalTemplates} biểu mẫu và ${totalCells} ô dữ liệu; tổng giá trị ghi nhận là ${totalValue}.`,
    keyFindings,
    projectHighlights,
    riskItems:
      anomalies.length > 0
        ? anomalies.slice(0, 5)
        : [
            {
              title: 'Dịch vụ AI tạm thời quá tải',
              detail:
                'Nội dung hiện tại được dựng theo chế độ dự phòng từ số liệu tổng hợp thật. Bạn vẫn có thể rà soát, chỉnh sửa và xuất DOCX ngay.',
            },
          ],
    recommendations,
    blueprintSections: (blueprint.sections || []).map((section) => ({
      title: section.title,
      content: buildBlueprintSectionContent(section.kind, {
        summary,
        projectSummaries,
        indicatorSummaries,
        anomalies,
        recommendations,
      }),
    })),
    appendixTables,
  };
}

function deriveAnomalies(cells: AnalysisCellRecord[]) {
  const unitStats = new Map<
    string,
    { unitName: string; totalCells: number; zeroCells: number; totalValue: number }
  >();

  cells.forEach((cell) => {
    const current = unitStats.get(cell.unitCode) || {
      unitName: cell.unitName,
      totalCells: 0,
      zeroCells: 0,
      totalValue: 0,
    };

    current.totalCells += 1;
    current.totalValue += toFiniteNumber(cell.value);
    if (toFiniteNumber(cell.value) === 0) {
      current.zeroCells += 1;
    }

    unitStats.set(cell.unitCode, current);
  });

  return Array.from(unitStats.entries())
    .map(([unitCode, stats]) => ({
      unitCode,
      unitName: stats.unitName,
      zeroRatio: stats.totalCells > 0 ? stats.zeroCells / stats.totalCells : 0,
      totalCells: stats.totalCells,
      totalValue: stats.totalValue,
    }))
    .filter((item) => item.totalCells >= 8)
    .sort((left, right) => {
      if (right.zeroRatio !== left.zeroRatio) {
        return right.zeroRatio - left.zeroRatio;
      }
      return left.totalValue - right.totalValue;
    })
    .slice(0, 5)
    .map((item) => ({
      title: `${item.unitName} có tỷ lệ ô bằng 0 cao`,
      detail: `${item.unitName} (${item.unitCode}) có ${Math.round(
        item.zeroRatio * 100,
      )}% ô dữ liệu bằng 0 trên tổng ${item.totalCells} ô đã đồng bộ cho phạm vi đang phân tích.`,
    }));
}

function buildAppendixTables({
  projectSummary,
  templateSummary,
}: {
  projectSummary: any[];
  templateSummary: any[];
}) {
  const tables: AIAnalysisOutput['appendixTables'] = [];

  if (projectSummary.length > 0) {
    tables.push({
      title: 'Bảng tóm tắt theo dự án',
      headers: ['Dự án', 'Đơn vị', 'Biểu mẫu', 'Ô dữ liệu', 'Tổng giá trị'],
      rows: projectSummary.map((item) => [
        item.project_name || '',
        String(item.unit_count || 0),
        String(item.template_count || 0),
        String(Number(item.cell_count || 0).toLocaleString('vi-VN')),
        String(Number(item.total_value || 0).toLocaleString('vi-VN')),
      ]),
    });
  }

  if (templateSummary.length > 0) {
    tables.push({
      title: 'Bảng tóm tắt theo biểu mẫu',
      headers: ['Biểu mẫu', 'Dự án', 'Đơn vị', 'Ô dữ liệu', 'Tổng giá trị'],
      rows: templateSummary.slice(0, 12).map((item) => [
        item.template_name || '',
        item.project_name || '',
        String(item.unit_count || 0),
        String(Number(item.cell_count || 0).toLocaleString('vi-VN')),
        String(Number(item.total_value || 0).toLocaleString('vi-VN')),
      ]),
    });
  }

  return tables;
}

function buildDefaultBlueprint(reportLength: AIReportLength): AIReportBlueprintContent {
  return {
    name: 'Khung báo cáo hành chính mặc định',
    preferredTone: 'Hành chính',
    writingRules: [
      'Viết rõ ràng, chặt chẽ, không suy diễn vượt dữ liệu.',
      'Ưu tiên nêu biến động theo tiêu chí và dự án.',
    ],
    requiredTables: reportLength === 'LONG' ? ['Bảng tổng hợp theo dự án', 'Bảng tổng hợp theo tiêu chí'] : [],
    sections: [
      {
        id: 'opening',
        title: 'I. Đánh giá chung',
        kind: 'opening',
        instructions: 'Tóm tắt bối cảnh, phạm vi dữ liệu và nhận định chung.',
      },
      {
        id: 'results',
        title: 'II. Kết quả nổi bật theo tiêu chí',
        kind: 'metrics_commentary',
        instructions: 'Phân tích các tiêu chí chính, nêu số liệu và xu hướng nổi bật.',
      },
      {
        id: 'issues',
        title: 'III. Hạn chế, tồn tại',
        kind: 'risks',
        instructions: 'Nêu các điểm bất thường, tiêu chí yếu hoặc đơn vị cần lưu ý.',
      },
      {
        id: 'solutions',
        title: 'IV. Kiến nghị, đề xuất',
        kind: 'recommendations',
        instructions: 'Đề xuất giải pháp hoặc hướng xử lý tiếp theo.',
      },
    ],
  };
}

function guessMimeType(fileName: string, fileType?: string) {
  if (fileType?.trim()) {
    return fileType;
  }
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  if (normalized.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (normalized.endsWith('.doc')) return 'application/msword';
  if (normalized.endsWith('.txt')) return 'text/plain';
  if (normalized.endsWith('.md')) return 'text/markdown';
  return 'application/octet-stream';
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function generateStructuredJson<T>({
  ai,
  promptParts,
  responseSchema,
  onProgress,
  initialLabel,
}: {
  ai: GoogleGenAI;
  promptParts: unknown[];
  responseSchema: Record<string, unknown>;
  onProgress?: (progress: AIGenerationProgress) => void;
  initialLabel: string;
}) {
  const responseConfig = {
    responseMimeType: 'application/json',
    responseSchema,
  };
  const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview'];
  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex += 1) {
    const model = candidateModels[modelIndex]!;
    onProgress?.({
      label: modelIndex === 0 ? initialLabel : `Đang chuyển sang model dự phòng ${model}`,
      percent: 80 + modelIndex * 5,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: promptParts as any,
          config: responseConfig as any,
        });

        if (!response.text?.trim()) {
          throw new Error('Gemini không trả về nội dung hợp lệ.');
        }

        onProgress?.({
          label: `Đã nhận phản hồi từ ${model}, đang hoàn thiện kết quả`,
          percent: 94,
        });
        return JSON.parse(response.text) as T;
      } catch (error) {
        lastError = error;
        if (!isTransientGeminiError(error)) {
          throw error;
        }

        const isLastAttemptOnModel = attempt === 2;
        const isLastModel = modelIndex === candidateModels.length - 1;
        if (isLastAttemptOnModel && isLastModel) {
          break;
        }
        if (isLastAttemptOnModel) {
          onProgress?.({
            label: `${model} đang quá tải, chuyển sang model dự phòng tiếp theo`,
            percent: 84 + modelIndex * 5,
          });
          break;
        }

        const retryDelayMs = parseRetryDelayMs(error);
        onProgress?.({
          label: `${model} đang quá tải, chờ ${Math.ceil(retryDelayMs / 1000)} giây để thử lại lần ${attempt + 2}`,
          percent: 82 + modelIndex * 5,
        });
        await sleep(retryDelayMs);
      }
    }
  }

  if (isTransientGeminiError(lastError)) {
    throw new Error(
      'Gemini đang quá tải tạm thời (503/UNAVAILABLE). Hệ thống đã tự thử lại và chuyển model dự phòng nhưng vẫn chưa thành công. Vui lòng thử lại sau ít phút.',
    );
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Không thể tạo nội dung AI do chưa nhận được phản hồi hợp lệ từ Gemini.');
}

export async function buildAIAnalysisInput(params: AIAnalysisBuildParams) {
  const rpcParams = {
    projectIds: params.projectIds,
    years: [params.year],
    templateIds: params.scope === 'BY_TEMPLATE' ? params.selectedTemplateIds : undefined,
    unitCodes: params.scope === 'BY_UNIT' ? params.selectedUnitCodes : undefined,
  };

  const shouldReadScopedCells =
    params.analysisLevel === 'UNITS' &&
    (params.analysisType === 'ANOMALY' ||
      params.analysisType === 'FULL' ||
      params.requestedSections.includes('Đơn vị chậm cập nhật'));

  const [scopeSummary, projectSummary, templateSummary, scopedCells] = await Promise.all([
    fetchAIAnalysisScopeSummary(rpcParams),
    fetchAIAnalysisProjectSummary(rpcParams),
    fetchAIAnalysisTemplateSummary(rpcParams),
    shouldReadScopedCells
      ? listAnalysisCellsByScope({
          ...rpcParams,
          limit: 4000,
        })
      : Promise.resolve([]),
  ]);

  const effectiveScopeSummary =
    params.summaryOverride && Number(params.summaryOverride.cell_count || 0) > 0
      ? params.summaryOverride
      : scopeSummary || {};
  const effectiveProjectSummary =
    params.projectSummariesOverride && params.projectSummariesOverride.length > 0
      ? params.projectSummariesOverride
      : projectSummary || [];
  const effectiveTemplateSummary =
    params.templateSummariesOverride && params.templateSummariesOverride.length > 0
      ? params.templateSummariesOverride
      : templateSummary || [];

  const previousYear = inferPreviousYear(params.year);
  let yearComparison: Record<string, unknown> | null = null;

  if (
    previousYear &&
    (params.analysisType === 'YEAR_COMPARE' || params.requestedSections.includes('So sánh theo năm'))
  ) {
    try {
      const [currentScope, previousScope] = await Promise.all([
        fetchAIAnalysisScopeSummary({ ...rpcParams, years: [params.year] }),
        fetchAIAnalysisScopeSummary({ ...rpcParams, years: [previousYear] }),
      ]);

      yearComparison = {
        currentYear: params.year,
        previousYear,
        currentScope,
        previousScope,
        cellDelta:
          toFiniteNumber((currentScope as any)?.cell_count) -
          toFiniteNumber((previousScope as any)?.cell_count),
        valueDelta:
          toFiniteNumber((currentScope as any)?.total_value) -
          toFiniteNumber((previousScope as any)?.total_value),
      };
    } catch (error) {
      yearComparison = {
        currentYear: params.year,
        previousYear,
        note: 'Không lấy được dữ liệu năm trước để so sánh tự động.',
      };
    }
  }

  const anomalies = deriveAnomalies(scopedCells);
  const effectiveBlueprint = params.reportBlueprint || buildDefaultBlueprint(params.reportLength);
  const effectiveIndicatorSummaries =
    params.indicatorSummariesOverride && params.indicatorSummariesOverride.length > 0
      ? params.indicatorSummariesOverride
      : [];

  return {
    scope: {
      projectIds: params.projectIds,
      projectNames: params.projects
        .filter((project) => params.projectIds.includes(project.id))
        .map((project) => project.name),
      year: params.year,
      scope: params.scope,
      selectedTemplateIds: params.selectedTemplateIds || [],
      selectedTemplateNames: params.templates
        .filter((template) => (params.selectedTemplateIds || []).includes(template.id))
        .map((template) => template.name),
      selectedUnitCodes: params.selectedUnitCodes || [],
      selectedUnitNames: params.units
        .filter((unit) => (params.selectedUnitCodes || []).includes(unit.code))
        .map((unit) => unit.name),
      analysisType: params.analysisType,
      analysisLevel: params.analysisLevel || 'CITY',
      writingTone: params.writingTone,
      reportLength: params.reportLength,
      requestedSections: params.requestedSections,
      extraPrompt: params.extraPrompt || '',
    },
    reportBlueprint: effectiveBlueprint,
    summary: effectiveScopeSummary,
    projectSummaries: effectiveProjectSummary,
    templateSummaries: effectiveTemplateSummary,
    indicatorSummaries: effectiveIndicatorSummaries,
    yearComparison,
    anomalies,
    appendixTables: buildAppendixTables({
      projectSummary: effectiveProjectSummary as any[],
      templateSummary: effectiveTemplateSummary as any[],
    }),
  };
}

export async function generateAIAnalysisOutput({
  apiKey,
  input,
  onProgress,
}: {
  apiKey: string;
  input: Record<string, unknown>;
  onProgress?: (progress: AIGenerationProgress) => void;
}) {
  if (!apiKey.trim()) {
    throw new Error('Chưa có khóa Gemini để tạo phân tích AI.');
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const prompt = [
    'Bạn là chuyên gia phân tích dữ liệu hành chính nhà nước.',
    'Nhiệm vụ: đọc JSON đầu vào và tạo báo cáo phân tích bằng tiếng Việt theo đúng khung mẫu báo cáo nếu có.',
    'Nguyên tắc:',
    '- Chỉ sử dụng dữ liệu có trong JSON đầu vào.',
    '- Không bịa số liệu.',
    '- Ưu tiên nhận xét theo tiêu chí (row_label + column_label), không chỉ nêu số ô hay số dòng.',
    '- Nếu có reportBlueprint thì phải bám đúng tinh thần, giọng văn và các mục của blueprint.',
    '- Nếu dữ liệu chưa đủ để kết luận mạnh, phải nói rõ là cần rà soát thêm.',
    '',
    'JSON đầu vào:',
    JSON.stringify(input, null, 2),
  ].join('\n');

  return generateStructuredJson<AIAnalysisOutput>({
    ai,
    promptParts: [{ text: prompt }],
    onProgress,
    initialLabel: 'Đang gọi Gemini để soạn báo cáo',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        executiveSummary: { type: Type.STRING },
        keyFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
        projectHighlights: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              projectName: { type: Type.STRING },
              summary: { type: Type.STRING },
            },
            required: ['projectName', 'summary'],
          },
        },
        riskItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              detail: { type: Type.STRING },
            },
            required: ['title', 'detail'],
          },
        },
        recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
        blueprintSections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
            },
            required: ['title', 'content'],
          },
        },
        appendixTables: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              headers: { type: Type.ARRAY, items: { type: Type.STRING } },
              rows: {
                type: Type.ARRAY,
                items: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
            },
            required: ['title', 'headers', 'rows'],
          },
        },
      },
      required: [
        'title',
        'executiveSummary',
        'keyFindings',
        'projectHighlights',
        'riskItems',
        'recommendations',
        'blueprintSections',
        'appendixTables',
      ],
    },
  });
}

export async function extractReportBlueprintFromSample({
  apiKey,
  file,
  preferredName,
  onProgress,
}: {
  apiKey: string;
  file: File;
  preferredName?: string;
  onProgress?: (progress: AIGenerationProgress) => void;
}) {
  if (!apiKey.trim()) {
    throw new Error('Chưa có khóa Gemini để đọc báo cáo mẫu.');
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  const mimeType = guessMimeType(file.name, file.type);
  const base64Data = await fileToBase64(file);

  const instruction = [
    'Bạn là chuyên gia đọc mẫu báo cáo hành chính nhà nước.',
    'Nhiệm vụ: đọc file báo cáo mẫu và trích ra một blueprint có cấu trúc để hệ thống có thể viết lại báo cáo mới theo đúng tinh thần của mẫu.',
    'Nguyên tắc:',
    '- Bám đúng văn phong, chương mục và cách tổ chức nội dung của báo cáo mẫu.',
    '- Nếu không đọc được toàn bộ, vẫn phải trích ra khung gần đúng nhất.',
    '- Viết kết quả bằng tiếng Việt.',
    preferredName ? `- Tên blueprint ưu tiên: ${preferredName}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return generateStructuredJson<AIReportBlueprintContent>({
    ai,
    onProgress,
    initialLabel: 'Đang đọc báo cáo mẫu để tạo blueprint',
    promptParts: [
      { text: instruction },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ],
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        preferredTone: { type: Type.STRING },
        writingRules: { type: Type.ARRAY, items: { type: Type.STRING } },
        requiredTables: { type: Type.ARRAY, items: { type: Type.STRING } },
        sections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              kind: { type: Type.STRING },
              instructions: { type: Type.STRING },
            },
            required: ['id', 'title', 'kind', 'instructions'],
          },
        },
      },
      required: ['name', 'preferredTone', 'writingRules', 'requiredTables', 'sections'],
    },
  });
}

import { GoogleGenAI, Type } from '@google/genai';
import {
  AnalysisCellRecord,
  fetchAIAnalysisProjectSummary,
  fetchAIAnalysisScopeSummary,
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
};

export type AIAnalysisOutput = {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  projectHighlights: { projectName: string; summary: string }[];
  riskItems: { title: string; detail: string }[];
  recommendations: string[];
  appendixTables: { title: string; headers: string[]; rows: string[][] }[];
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

export async function buildAIAnalysisInput(params: AIAnalysisBuildParams) {
  const rpcParams = {
    projectIds: params.projectIds,
    years: [params.year],
    templateIds: params.scope === 'BY_TEMPLATE' ? params.selectedTemplateIds : undefined,
    unitCodes: params.scope === 'BY_UNIT' ? params.selectedUnitCodes : undefined,
  };

  const [scopeSummary, projectSummary, templateSummary, scopedCells] = await Promise.all([
    fetchAIAnalysisScopeSummary(rpcParams),
    fetchAIAnalysisProjectSummary(rpcParams),
    fetchAIAnalysisTemplateSummary(rpcParams),
    listAnalysisCellsByScope({
      ...rpcParams,
      limit: 20000,
    }),
  ]);

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
      writingTone: params.writingTone,
      reportLength: params.reportLength,
      requestedSections: params.requestedSections,
      extraPrompt: params.extraPrompt || '',
    },
    summary: scopeSummary || {},
    projectSummaries: projectSummary || [],
    templateSummaries: templateSummary || [],
    yearComparison,
    anomalies,
    appendixTables: buildAppendixTables({
      projectSummary: projectSummary || [],
      templateSummary: templateSummary || [],
    }),
  };
}

export async function generateAIAnalysisOutput({
  apiKey,
  input,
}: {
  apiKey: string;
  input: Record<string, unknown>;
}) {
  if (!apiKey.trim()) {
    throw new Error('Chưa có khóa Gemini để tạo phân tích AI.');
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const prompt = [
    'Bạn là chuyên gia phân tích dữ liệu hành chính nhà nước.',
    'Nhiệm vụ: đọc JSON đầu vào và tạo báo cáo phân tích bằng tiếng Việt.',
    'Nguyên tắc:',
    '- Chỉ sử dụng dữ liệu có trong JSON đầu vào.',
    '- Không bịa số liệu.',
    '- Văn phong rõ ràng, chặt chẽ, phù hợp báo cáo hành chính.',
    '- Nếu dữ liệu chưa đủ để kết luận mạnh, phải nói rõ là cần rà soát thêm.',
    '',
    'JSON đầu vào:',
    JSON.stringify(input, null, 2),
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
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
          'appendixTables',
        ],
      },
    },
  });

  return JSON.parse(response.text) as AIAnalysisOutput;
}

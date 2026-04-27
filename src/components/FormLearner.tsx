import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from '@google/genai';
import { AlertCircle, Brain, CheckCircle, Eye, FileSpreadsheet, Loader2, Lock, Maximize2, Minimize2, Plus, RotateCcw, Save, Trash2, Unlock, X } from 'lucide-react';
import { uploadFile } from '../supabase';
import { FormTemplate, HeaderLayout, Project, TemplateBlockConfig } from '../types';
import { columnLetterToIndex } from '../utils/columnUtils';
import { completeSheetSignatureFromWorksheet, expandColumnSelection, expandRowSelection } from '../utils/workbookUtils';
import { listTemplates as listTemplatesFromSupabase, upsertTemplate } from '../supabaseStore';

type Mode = 'AI' | 'MANUAL';

type ManualFormBlock = {
  id: string;
  name: string;
  headerStartRow: number;
  headerEndRow: number;
  headerStartCol: string;
  headerEndCol: string;
  labelColumnStart: string;
  labelColumnEnd: string;
  primaryLabelColumn: string;
  dataColumns: string;
  columnHeaders: string;
  specialRows: string;
  startRow: number;
  endRow: number;
};

type ManualSetupView = 'QUICK' | 'ADVANCED';

type ManualWorksheetPreview = {
  startCol: number;
  headers: string[];
  rows: Array<{
    rowNumber: number;
    cells: string[];
  }>;
};

type ManualPreviewSelectionMode = 'LABEL' | 'HEADER' | 'DATA' | 'SKIP_ROWS';

type ManualPreviewSelectionPoint = {
  rowNumber: number;
  columnLetter: string;
};

type ManualPreviewAppliedSection = ManualPreviewSelectionMode | null;

const GEMINI_API_KEY_STORAGE_KEY = 'sotay_gemini_api_key';
const STORAGE_OPERATION_TIMEOUT_MS = 25000;
const MAX_AI_SHEETS_PER_RUN = 3;

function buildManualBlockId() {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultManualBlock(): ManualFormBlock {
  return {
    id: buildManualBlockId(),
    name: '',
    headerStartRow: 1,
    headerEndRow: 1,
    headerStartCol: 'A',
    headerEndCol: 'A',
    labelColumnStart: 'A',
    labelColumnEnd: 'A',
    primaryLabelColumn: 'A',
    dataColumns: '',
    columnHeaders: '',
    specialRows: '',
    startRow: 1,
    endRow: 1,
  };
}

function createPresetB2Blocks(): ManualFormBlock[] {
  return [
    {
      id: buildManualBlockId(),
      name: 'Khối 1',
      headerStartRow: 7,
      headerEndRow: 9,
      headerStartCol: 'A',
      headerEndCol: 'I',
      labelColumnStart: 'A',
      labelColumnEnd: 'A',
      primaryLabelColumn: 'A',
      dataColumns: 'B-I',
      columnHeaders: '',
      specialRows: '',
      startRow: 10,
      endRow: 10,
    },
    {
      id: buildManualBlockId(),
      name: 'Khối 2',
      headerStartRow: 11,
      headerEndRow: 13,
      headerStartCol: 'A',
      headerEndCol: 'I',
      labelColumnStart: 'A',
      labelColumnEnd: 'A',
      primaryLabelColumn: 'A',
      dataColumns: 'B-I',
      columnHeaders: '',
      specialRows: '',
      startRow: 14,
      endRow: 14,
    },
    {
      id: buildManualBlockId(),
      name: 'Khối 3',
      headerStartRow: 15,
      headerEndRow: 17,
      headerStartCol: 'A',
      headerEndCol: 'I',
      labelColumnStart: 'A',
      labelColumnEnd: 'A',
      primaryLabelColumn: 'A',
      dataColumns: 'B-I',
      columnHeaders: '',
      specialRows: '',
      startRow: 18,
      endRow: 18,
    },
  ];
}

const DEFAULT_MANUAL_FORM = {
  name: '',
  sheetName: '',
  labelColumn: 'A',
  labelColumnStart: 'A',
  labelColumnEnd: 'A',
  primaryLabelColumn: 'A',
  dataColumns: '',
  specialRows: '',
  columnHeaders: '',
  startRow: 1,
  endRow: 200,
  verticalHeaderStartRow: 1,
  verticalHeaderEndRow: 1,
  horizontalHeaderStartRow: 1,
  horizontalHeaderEndRow: 1,
  signatureStartRow: 1,
  signatureEndRow: 1,
  signatureStartCol: 'A',
  signatureEndCol: 'A',
  enableAdvancedStructure: false,
  blocks: [] as ManualFormBlock[],
};

function buildTemplateId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeColumnValue(value: string) {
  return value.trim().toUpperCase();
}

function normalizeSheetSignatureDraft(signature: {
  headerStartRow: number;
  headerEndRow: number;
  headerStartCol: string;
  headerEndCol: string;
}) {
  return {
    headerStartRow: Number(signature.headerStartRow),
    headerEndRow: Number(signature.headerEndRow),
    headerStartCol: normalizeColumnValue(signature.headerStartCol || 'A'),
    headerEndCol: normalizeColumnValue(signature.headerEndCol || signature.headerStartCol || 'A'),
  };
}

function normalizeTemplateBlocks(blocks: ManualFormBlock[]) {
  return blocks
    .map((block) => {
      const normalizedDataColumns = expandColumnSelection(block.dataColumns);
      const normalizedSpecialRows = expandRowSelection(block.specialRows);
      const normalizedColumnHeaders = block.columnHeaders
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        id: block.id || buildManualBlockId(),
        name: block.name.trim() || `Khối ${blocks.indexOf(block) + 1}`,
        labelColumnStart: normalizeColumnValue(block.labelColumnStart || 'A'),
        labelColumnEnd: normalizeColumnValue(block.labelColumnEnd || block.labelColumnStart || 'A'),
        primaryLabelColumn: normalizeColumnValue(block.primaryLabelColumn || block.labelColumnStart || 'A'),
        dataColumns: normalizedDataColumns,
        columnHeaders: normalizedColumnHeaders.length > 0 ? normalizedColumnHeaders : undefined,
        startRow: Number(block.startRow),
        endRow: Number(block.endRow),
        specialRows: normalizedSpecialRows,
        headerLayout: {
          startRow: Number(block.headerStartRow),
          endRow: Number(block.headerEndRow),
          startCol: Math.max(1, columnLetterToIndex(normalizeColumnValue(block.headerStartCol || 'A'))),
          endCol: Math.max(1, columnLetterToIndex(normalizeColumnValue(block.headerEndCol || block.headerStartCol || 'A'))),
          cells: [],
          merges: [],
        },
      } satisfies TemplateBlockConfig;
    })
    .filter((block) => block.dataColumns.length > 0);
}

function buildColumnRangeLabel(start: string, end: string) {
  const normalizedStart = normalizeColumnValue(start || 'A');
  const normalizedEnd = normalizeColumnValue(end || normalizedStart);
  return normalizedStart === normalizedEnd ? normalizedStart : `${normalizedStart}-${normalizedEnd}`;
}

function buildReadableDataColumnsLabel(dataColumns: string) {
  const normalizedColumns = expandColumnSelection(dataColumns);
  if (normalizedColumns.length === 0) {
    return 'chưa chọn cột dữ liệu';
  }
  return normalizedColumns.join(', ');
}

function buildColumnRangeSelection(startColumn: string, endColumn: string) {
  const startIndex = columnLetterToIndex(normalizeColumnValue(startColumn));
  const endIndex = columnLetterToIndex(normalizeColumnValue(endColumn));
  const minIndex = Math.min(startIndex, endIndex);
  const maxIndex = Math.max(startIndex, endIndex);
  const startLabel = XLSX.utils.encode_col(minIndex - 1);
  const endLabel = XLSX.utils.encode_col(maxIndex - 1);
  return startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`;
}

function compressRowNumbers(rows: number[]) {
  const sortedRows = Array.from(new Set(rows.filter((value) => Number.isFinite(value) && value > 0))).sort((a, b) => a - b);
  if (sortedRows.length === 0) {
    return '';
  }

  const ranges: string[] = [];
  let rangeStart = sortedRows[0];
  let previous = sortedRows[0];

  for (let index = 1; index < sortedRows.length; index += 1) {
    const current = sortedRows[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
    rangeStart = current;
    previous = current;
  }

  ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
  return ranges.join(',');
}

function cloneManualFormState(form: typeof DEFAULT_MANUAL_FORM): typeof DEFAULT_MANUAL_FORM {
  return {
    ...form,
    blocks: form.blocks.map((block) => ({ ...block })),
  };
}

function buildManualSummaryLines(form: typeof DEFAULT_MANUAL_FORM) {
  const lines: string[] = [];

  if (!form.sheetName) {
    lines.push('Bước đầu tiên là tải file mẫu và chọn đúng tên sheet cần đọc.');
    return lines;
  }

  lines.push(
    `Hệ thống sẽ đọc sheet ${form.sheetName}, lấy tên tiêu chí từ cột ${buildColumnRangeLabel(form.labelColumnStart, form.labelColumnEnd)}, dùng cột ${normalizeColumnValue(form.primaryLabelColumn || form.labelColumnStart || 'A')} làm tên tiêu chí chính.`,
  );
  lines.push(
    `Tiêu đề ngang được đọc từ dòng ${form.horizontalHeaderStartRow} đến dòng ${form.horizontalHeaderEndRow}; vùng số liệu đọc ở cột ${buildReadableDataColumnsLabel(form.dataColumns)} từ dòng ${form.startRow} đến dòng ${form.endRow}.`,
  );

  if (form.specialRows.trim()) {
    lines.push(`Các dòng đặc biệt đang bỏ qua khi tổng hợp: ${form.specialRows.trim()}.`);
  }

  if (form.enableAdvancedStructure && form.blocks.length > 0) {
    lines.push(`Sheet này đang bật cấu hình nâng cao với ${form.blocks.length} khối tiêu đề - dữ liệu độc lập.`);
  }

  return lines;
}

function buildWorksheetPreview(worksheet: XLSX.WorkSheet, form: typeof DEFAULT_MANUAL_FORM): ManualWorksheetPreview | null {
  const rangeRef = worksheet['!ref'];
  if (!rangeRef) {
    return null;
  }

  const usedRange = XLSX.utils.decode_range(rangeRef);
  const columnIndexes = new Set<number>([
    Math.max(0, columnLetterToIndex(normalizeColumnValue(form.labelColumnStart || 'A')) - 1),
    Math.max(0, columnLetterToIndex(normalizeColumnValue(form.labelColumnEnd || form.labelColumnStart || 'A')) - 1),
    Math.max(0, columnLetterToIndex(normalizeColumnValue(form.primaryLabelColumn || form.labelColumnStart || 'A')) - 1),
  ]);

  expandColumnSelection(form.dataColumns).forEach((column) => {
    columnIndexes.add(Math.max(0, columnLetterToIndex(column) - 1));
  });

  let maxRow = Math.max(
    form.verticalHeaderEndRow,
    form.horizontalHeaderEndRow,
    form.endRow,
    form.signatureEndRow,
    1,
  );

  if (form.enableAdvancedStructure && form.blocks.length > 0) {
    form.blocks.forEach((block) => {
      columnIndexes.add(Math.max(0, columnLetterToIndex(normalizeColumnValue(block.labelColumnStart || 'A')) - 1));
      columnIndexes.add(Math.max(0, columnLetterToIndex(normalizeColumnValue(block.labelColumnEnd || block.labelColumnStart || 'A')) - 1));
      columnIndexes.add(Math.max(0, columnLetterToIndex(normalizeColumnValue(block.primaryLabelColumn || block.labelColumnStart || 'A')) - 1));
      columnIndexes.add(Math.max(0, columnLetterToIndex(normalizeColumnValue(block.headerStartCol || 'A')) - 1));
      columnIndexes.add(Math.max(0, columnLetterToIndex(normalizeColumnValue(block.headerEndCol || block.headerStartCol || 'A')) - 1));
      expandColumnSelection(block.dataColumns).forEach((column) => {
        columnIndexes.add(Math.max(0, columnLetterToIndex(column) - 1));
      });
      maxRow = Math.max(maxRow, block.headerEndRow, block.endRow);
    });
  }

  const derivedStartCol = Math.max(0, Math.min(...Array.from(columnIndexes.values())));
  const derivedEndCol = Math.max(
    derivedStartCol,
    Math.min(
      usedRange.e.c,
      Math.max(...Array.from(columnIndexes.values()), derivedStartCol + 7) + 1,
    ),
  );
  const startCol = Math.max(0, Math.min(derivedStartCol, usedRange.s.c));
  const endCol = Math.min(Math.max(startCol + 7, derivedEndCol), usedRange.e.c, startCol + 11);
  const startRow = Math.max(1, Math.min(form.horizontalHeaderStartRow, form.verticalHeaderStartRow, form.startRow, form.signatureStartRow, maxRow));
  const endRow = Math.min(Math.max(startRow + 9, maxRow + 1), usedRange.e.r + 1, startRow + 17);

  const headers: string[] = [];
  for (let c = startCol; c <= endCol; c += 1) {
    headers.push(XLSX.utils.encode_col(c));
  }

  const rows: ManualWorksheetPreview['rows'] = [];
  for (let r = startRow; r <= endRow; r += 1) {
    const cells: string[] = [];
    for (let c = startCol; c <= endCol; c += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: r - 1, c })];
      const value = cell?.w ?? cell?.v;
      cells.push(value === undefined || value === null ? '' : String(value));
    }
    rows.push({ rowNumber: r, cells });
  }

  return {
    startCol,
    headers,
    rows,
  };
}

function FieldHelpBadge({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[10px] font-bold text-[var(--ink-soft)]"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function parseRetryDelayMs(error: unknown) {
  if (!(error instanceof Error)) {
    return 40000;
  }

  const retryMatch = error.message.match(/retry in ([\d.]+)s/i);
  if (retryMatch) {
    return Math.ceil(Number(retryMatch[1]) * 1000);
  }

  const detailMatch = error.message.match(/"retryDelay":"(\d+)s"/i);
  if (detailMatch) {
    return Number(detailMatch[1]) * 1000;
  }

  return 40000;
}

function isQuotaExceededError(error: unknown) {
  return error instanceof Error && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'));
}

export function FormLearner({
  projects,
  selectedProjectId,
  onSelectProject,
  onDeleteTemplate,
  onTemplatesChanged,
}: {
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onDeleteTemplate: (template: FormTemplate) => Promise<boolean>;
  onTemplatesChanged?: (projectId: string) => Promise<void>;
}) {
  const project = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );
  const [mode, setMode] = useState<Mode>('AI');
  const [file, setFile] = useState<File | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualSetupView, setManualSetupView] = useState<ManualSetupView>('QUICK');
  const [manualWorkbook, setManualWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [aiSheetNames, setAiSheetNames] = useState<string[]>([]);
  const [selectedAiSheetNames, setSelectedAiSheetNames] = useState<string[]>([]);
  const [isLearning, setIsLearning] = useState(false);
  const [learnedTemplates, setLearnedTemplates] = useState<FormTemplate[]>([]);
  const [confirmedTemplates, setConfirmedTemplates] = useState<Record<string, boolean>>({});
  const [headerRanges, setHeaderRanges] = useState<Record<string, { startRow: number; endRow: number; startCol: string; endCol: string }>>({});
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualTemplates, setManualTemplates] = useState<FormTemplate[]>([]);
  const [manualSheetNames, setManualSheetNames] = useState<string[]>([]);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [attachingTemplateId, setAttachingTemplateId] = useState<string | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);
  const [saveProgressLabel, setSaveProgressLabel] = useState<string | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isManualPreviewModalOpen, setIsManualPreviewModalOpen] = useState(false);
  const [isManualPreviewExpanded, setIsManualPreviewExpanded] = useState(false);
  const [manualWorksheetPreview, setManualWorksheetPreview] = useState<ManualWorksheetPreview | null>(null);
  const [isManualPreviewLoading, setIsManualPreviewLoading] = useState(false);
  const [manualPreviewSelectionMode, setManualPreviewSelectionMode] = useState<ManualPreviewSelectionMode>('LABEL');
  const [manualPreviewSelectionStart, setManualPreviewSelectionStart] = useState<ManualPreviewSelectionPoint | null>(null);
  const [manualPreviewSelectionCurrent, setManualPreviewSelectionCurrent] = useState<ManualPreviewSelectionPoint | null>(null);
  const [isManualPreviewDragging, setIsManualPreviewDragging] = useState(false);
  const [manualPreviewActionMessage, setManualPreviewActionMessage] = useState<string | null>(null);
  const [manualPreviewUndoStack, setManualPreviewUndoStack] = useState<Array<typeof DEFAULT_MANUAL_FORM>>([]);
  const [manualPreviewLastAppliedSection, setManualPreviewLastAppliedSection] = useState<ManualPreviewAppliedSection>(null);
  const [isDesktopPreviewViewport, setIsDesktopPreviewViewport] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024,
  );
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
  });
  const [manualForm, setManualForm] = useState(DEFAULT_MANUAL_FORM);
  const configuredGeminiApiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  const resolvedGeminiApiKey = geminiApiKey.trim() || configuredGeminiApiKey;
  const geminiKeySource = geminiApiKey.trim()
    ? 'Đang dùng khóa bạn nhập tại trình duyệt'
    : configuredGeminiApiKey
      ? 'Đã có key từ cấu hình hệ thống'
      : 'Chưa có key Gemini trong cấu hình';

  const updateManualBlock = (blockId: string, updates: Partial<ManualFormBlock>) => {
    setManualForm((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) => (block.id === blockId ? { ...block, ...updates } : block)),
    }));
  };

  const addManualBlock = () => {
    setManualSetupView('ADVANCED');
    setManualForm((prev) => ({
      ...prev,
      enableAdvancedStructure: true,
      blocks: [...prev.blocks, createDefaultManualBlock()],
    }));
  };

  const removeManualBlock = (blockId: string) => {
    setManualForm((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((block) => block.id !== blockId),
    }));
  };

  const updateStoredTemplateBlock = (templateId: string, blockId: string, updates: Partial<TemplateBlockConfig>) => {
    setManualTemplates((prev) =>
      prev.map((template) => {
        if (template.id !== templateId) {
          return template;
        }

        return {
          ...template,
          columnMapping: {
            ...template.columnMapping,
            blocks: (template.columnMapping.blocks || []).map((block) =>
              block.id === blockId ? { ...block, ...updates } : block,
            ),
          },
        };
      }),
    );
  };

  const addStoredTemplateBlock = (templateId: string) => {
    setManualTemplates((prev) =>
      prev.map((template) => {
        if (template.id !== templateId) {
          return template;
        }

        const nextBlock: TemplateBlockConfig = {
          id: buildManualBlockId(),
          name: `Khối ${(template.columnMapping.blocks || []).length + 1}`,
          labelColumnStart: template.columnMapping.labelColumnStart || template.columnMapping.labelColumn || 'A',
          labelColumnEnd: template.columnMapping.labelColumnEnd || template.columnMapping.labelColumn || 'A',
          primaryLabelColumn: template.columnMapping.primaryLabelColumn || template.columnMapping.labelColumn || 'A',
          dataColumns: [...template.columnMapping.dataColumns],
          startRow: template.columnMapping.startRow,
          endRow: template.columnMapping.endRow,
          specialRows: [],
          headerLayout: template.headerLayout
            ? { ...template.headerLayout, cells: [], merges: [] }
            : {
                startRow: template.columnMapping.startRow,
                endRow: Math.max(template.columnMapping.startRow, template.columnMapping.startRow + 2),
                startCol: Math.max(1, columnLetterToIndex(template.columnMapping.labelColumnStart || template.columnMapping.labelColumn || 'A')),
                endCol: Math.max(
                  1,
                  columnLetterToIndex(
                    template.columnMapping.dataColumns[template.columnMapping.dataColumns.length - 1] ||
                      template.columnMapping.labelColumnEnd ||
                      template.columnMapping.labelColumn ||
                      'A',
                  ),
                ),
                cells: [],
                merges: [],
              },
        };

        return {
          ...template,
          columnMapping: {
            ...template.columnMapping,
            blocks: [...(template.columnMapping.blocks || []), nextBlock],
          },
        };
      }),
    );
  };

  const removeStoredTemplateBlock = (templateId: string, blockId: string) => {
    setManualTemplates((prev) =>
      prev.map((template) => {
        if (template.id !== templateId) {
          return template;
        }

        return {
          ...template,
          columnMapping: {
            ...template.columnMapping,
            blocks: (template.columnMapping.blocks || []).filter((block) => block.id !== blockId),
          },
        };
      }),
    );
  };

  const applyManualPreset = (preset: 'B1' | 'B2') => {
    if (preset === 'B1') {
      setManualSetupView('QUICK');
      setManualForm((prev) => ({
        ...prev,
        name: prev.name || 'Biểu B1',
        labelColumn: 'B',
        labelColumnStart: 'A',
        labelColumnEnd: 'B',
        primaryLabelColumn: 'B',
        dataColumns: 'C-E',
        columnHeaders: '',
        startRow: 9,
        endRow: 19,
        verticalHeaderStartRow: 9,
        verticalHeaderEndRow: 19,
        horizontalHeaderStartRow: 7,
        horizontalHeaderEndRow: 8,
        enableAdvancedStructure: false,
        blocks: [],
      }));
      setNotice('Đã điền sẵn cấu hình tham khảo cho sheet B1. Bạn kiểm tra lại tên sheet và lưu khi thấy đúng.');
      setError(null);
      return;
    }

    setManualSetupView('ADVANCED');
    setManualForm((prev) => ({
      ...prev,
      name: prev.name || 'Biểu B2',
      labelColumn: 'A',
      labelColumnStart: 'A',
      labelColumnEnd: 'A',
      primaryLabelColumn: 'A',
      dataColumns: 'B-I',
      columnHeaders: '',
      startRow: 10,
      endRow: 18,
      verticalHeaderStartRow: 10,
      verticalHeaderEndRow: 18,
      horizontalHeaderStartRow: 7,
      horizontalHeaderEndRow: 17,
      enableAdvancedStructure: true,
      blocks: createPresetB2Blocks(),
    }));
    setNotice('Đã điền sẵn cấu hình tham khảo cho sheet B2 với 3 khối tiêu đề - dữ liệu độc lập. Bạn kiểm tra lại tên sheet trước khi lưu.');
    setError(null);
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const applyMatch = () => setIsDesktopPreviewViewport(mediaQuery.matches);
    applyMatch();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', applyMatch);
      return () => mediaQuery.removeEventListener('change', applyMatch);
    }

    mediaQuery.addListener(applyMatch);
    return () => mediaQuery.removeListener(applyMatch);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    if (!file) {
      setAiSheetNames([]);
      setSelectedAiSheetNames([]);
      return undefined;
    }

    file
      .arrayBuffer()
      .then((buffer) => {
        if (isCancelled) {
          return;
        }

        const workbook = XLSX.read(buffer, { type: 'array' });
        const nextSheetNames = workbook.SheetNames.filter(Boolean).slice(0, 20);
        setAiSheetNames(nextSheetNames);
        setSelectedAiSheetNames((prev) => {
          const stillValid = prev.filter((sheetName) => nextSheetNames.includes(sheetName));
          return stillValid.length > 0 ? stillValid : nextSheetNames.slice(0, 1);
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setAiSheetNames([]);
          setSelectedAiSheetNames([]);
          setError('Không thể đọc danh sách sheet từ file mẫu AI.');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (!project?.id) {
      setManualTemplates([]);
      return undefined;
    }

    let cancelled = false;
    listTemplatesFromSupabase(project.id)
      .then((list) => {
        if (!cancelled) {
          setManualTemplates(list);
        }
      })
      .catch((error) => {
        console.error('Load templates from Supabase error:', error);
        if (!cancelled) {
          setManualTemplates([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project?.id]);

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
    setFile(null);
    setManualFile(null);
    setManualSetupView('QUICK');
    setAiSheetNames([]);
    setSelectedAiSheetNames([]);
    setLearnedTemplates([]);
    setConfirmedTemplates({});
    setHeaderRanges({});
    setConfirmAll(false);
    setError(null);
    setNotice(null);
    setManualForm(DEFAULT_MANUAL_FORM);
    setIsManualPreviewModalOpen(false);
    setIsManualPreviewExpanded(false);
    setManualWorksheetPreview(null);
    setManualPreviewSelectionStart(null);
    setManualPreviewSelectionCurrent(null);
    setIsManualPreviewDragging(false);
    setManualPreviewActionMessage(null);
    setManualPreviewUndoStack([]);
    setManualPreviewLastAppliedSection(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (learnedTemplates.length === 0) {
      setPreviewTemplateId(null);
      setPreviewRows([]);
      return;
    }
    if (!previewTemplateId || !learnedTemplates.some((tpl) => tpl.id === previewTemplateId)) {
      setPreviewTemplateId(learnedTemplates[0].id);
    }
  }, [learnedTemplates, previewTemplateId]);

  useEffect(() => {
    let isCancelled = false;

    if (!manualFile) {
      setManualSheetNames([]);
      setManualWorkbook(null);
      setManualForm((prev) => ({ ...prev, sheetName: '' }));
      return undefined;
    }

    manualFile
      .arrayBuffer()
      .then((buffer) => {
        if (isCancelled) {
          return;
        }

        const workbook = XLSX.read(buffer, { type: 'array' });
        const nextSheetNames = workbook.SheetNames.filter(Boolean);
        setManualWorkbook(workbook);
        setManualSheetNames(nextSheetNames);
        setManualForm((prev) => ({
          ...prev,
          sheetName: nextSheetNames.includes(prev.sheetName) ? prev.sheetName : nextSheetNames[0] || '',
        }));
      })
      .catch(() => {
        if (!isCancelled) {
          setManualWorkbook(null);
          setManualSheetNames([]);
          setError('Không thể đọc danh sách sheet từ file mẫu thủ công.');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [manualFile]);

  useEffect(() => {
    let isCancelled = false;

    if (!isManualPreviewModalOpen || !manualWorkbook || !manualForm.sheetName) {
      setManualWorksheetPreview(null);
      setIsManualPreviewLoading(false);
      return undefined;
    }

    setIsManualPreviewLoading(true);

    window.requestAnimationFrame(() => {
      if (isCancelled) {
        return;
      }

      const worksheet = manualWorkbook.Sheets[manualForm.sheetName];
      if (!worksheet) {
        setManualWorksheetPreview(null);
        setIsManualPreviewLoading(false);
        return;
      }

      setManualWorksheetPreview(buildWorksheetPreview(worksheet, manualForm));
      setIsManualPreviewLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [isManualPreviewModalOpen, manualWorkbook, manualForm]);

  useEffect(() => {
    if (isManualPreviewModalOpen) {
      return;
    }

    clearManualPreviewSelectionDraft();
    setManualPreviewActionMessage(null);
  }, [isManualPreviewModalOpen]);

  const existingNames = useMemo(
    () => new Set(manualTemplates.map((tpl) => tpl.name.trim().toLowerCase()).filter(Boolean)),
    [manualTemplates],
  );

  const manualSummaryLines = useMemo(() => buildManualSummaryLines(manualForm), [manualForm]);

  const manualReadinessChecks = useMemo(() => {
    const dataColumns = expandColumnSelection(manualForm.dataColumns);
    return [
      {
        label: 'Đã chọn dự án và tải file mẫu Excel',
        ready: Boolean(project?.id && manualFile),
        hint: 'Cần có file mẫu để hệ thống đọc sheet và hỗ trợ preview vùng dữ liệu.',
      },
      {
        label: 'Đã đặt tên biểu mẫu và chọn đúng sheet',
        ready: Boolean(manualForm.name.trim() && manualForm.sheetName.trim()),
        hint: 'Tên biểu mẫu và tên sheet là 2 thông tin bắt buộc trước khi tạo.',
      },
      {
        label: 'Vùng số liệu hợp lệ',
        ready: dataColumns.length > 0 && Number(manualForm.endRow) >= Number(manualForm.startRow),
        hint: 'Các cột số liệu phải đúng định dạng và dòng kết thúc không được nhỏ hơn dòng bắt đầu.',
      },
      {
        label: 'Vùng tiêu chí dọc và ngang hợp lệ',
        ready:
          Number(manualForm.verticalHeaderEndRow) >= Number(manualForm.verticalHeaderStartRow) &&
          Number(manualForm.horizontalHeaderEndRow) >= Number(manualForm.horizontalHeaderStartRow),
        hint: 'Nếu chọn sai khoảng dòng tiêu chí, biểu sẽ dễ đọc lệch vùng.',
      },
      {
        label: 'Tên biểu mẫu chưa bị trùng trong dự án',
        ready: manualForm.name.trim() ? !existingNames.has(manualForm.name.trim().toLowerCase()) : true,
        hint: 'Nếu trùng tên với biểu đã có, hệ thống sẽ không cho tạo mới.',
      },
    ];
  }, [existingNames, manualFile, manualForm, project?.id]);

  const previewLegend = useMemo(() => {
    const items = [
      { label: 'Tiêu chí dọc', className: 'bg-sky-50 text-sky-700 border-sky-200' },
      { label: 'Tiêu đề ngang', className: 'bg-amber-50 text-amber-700 border-amber-200' },
      { label: 'Vùng dữ liệu', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      { label: 'Dòng bỏ qua', className: 'bg-slate-50 text-slate-700 border-slate-200' },
    ];

    if (manualForm.enableAdvancedStructure) {
      items.push({ label: 'Khối nâng cao', className: 'bg-rose-50 text-rose-700 border-rose-200' });
    }

    return items;
  }, [manualForm.enableAdvancedStructure]);

  const manualPreviewConfig = useMemo(() => {
    const labelColumns = new Set(
      Array.from(
        { length: Math.max(1, columnLetterToIndex(normalizeColumnValue(manualForm.labelColumnEnd || manualForm.labelColumnStart || 'A')) - columnLetterToIndex(normalizeColumnValue(manualForm.labelColumnStart || 'A')) + 1) },
        (_, index) => XLSX.utils.encode_col(columnLetterToIndex(normalizeColumnValue(manualForm.labelColumnStart || 'A')) - 1 + index),
      ),
    );
    const dataColumns = new Set(expandColumnSelection(manualForm.dataColumns));
    const blockRanges = manualForm.enableAdvancedStructure
      ? manualForm.blocks.map((block) => ({
          startRow: block.startRow,
          endRow: block.endRow,
          headerStartRow: block.headerStartRow,
          headerEndRow: block.headerEndRow,
          labelColumns: new Set(
            Array.from(
              { length: Math.max(1, columnLetterToIndex(normalizeColumnValue(block.labelColumnEnd || block.labelColumnStart || 'A')) - columnLetterToIndex(normalizeColumnValue(block.labelColumnStart || 'A')) + 1) },
              (_, index) => XLSX.utils.encode_col(columnLetterToIndex(normalizeColumnValue(block.labelColumnStart || 'A')) - 1 + index),
            ),
          ),
          dataColumns: new Set(expandColumnSelection(block.dataColumns)),
        }))
      : [];

    return {
      labelColumns,
      dataColumns,
      specialRows: new Set(expandRowSelection(manualForm.specialRows)),
      horizontalHeaderStartRow: manualForm.horizontalHeaderStartRow,
      horizontalHeaderEndRow: manualForm.horizontalHeaderEndRow,
      startRow: manualForm.startRow,
      endRow: manualForm.endRow,
      blockRanges,
    };
  }, [manualForm]);

  const canUseManualPreviewSelection = isDesktopPreviewViewport && manualSetupView === 'QUICK' && !manualForm.enableAdvancedStructure;

  const manualPreviewSelectionRect = useMemo(() => {
    if (!manualPreviewSelectionStart || !manualPreviewSelectionCurrent) {
      return null;
    }

    const startColumnIndex = columnLetterToIndex(manualPreviewSelectionStart.columnLetter);
    const endColumnIndex = columnLetterToIndex(manualPreviewSelectionCurrent.columnLetter);

    return {
      startRow: Math.min(manualPreviewSelectionStart.rowNumber, manualPreviewSelectionCurrent.rowNumber),
      endRow: Math.max(manualPreviewSelectionStart.rowNumber, manualPreviewSelectionCurrent.rowNumber),
      startColIndex: Math.min(startColumnIndex, endColumnIndex),
      endColIndex: Math.max(startColumnIndex, endColumnIndex),
    };
  }, [manualPreviewSelectionCurrent, manualPreviewSelectionStart]);

  const manualPreviewSelectionModeLabel = useMemo(() => {
    switch (manualPreviewSelectionMode) {
      case 'LABEL':
        return 'Tiêu chí dọc';
      case 'HEADER':
        return 'Tiêu đề ngang';
      case 'DATA':
        return 'Vùng dữ liệu';
      case 'SKIP_ROWS':
        return 'Dòng bỏ qua';
      default:
        return '';
    }
  }, [manualPreviewSelectionMode]);

  const manualPreviewSelectionHint = useMemo(() => {
    if (!canUseManualPreviewSelection) {
      return 'Chọn trực tiếp bằng chuột hiện chỉ hỗ trợ trên desktop và chỉ áp dụng cho Thiết lập nhanh.';
    }

    switch (manualPreviewSelectionMode) {
      case 'LABEL':
        return 'Kéo chuột trên bảng để chọn vùng cột tên chỉ tiêu. Hệ thống sẽ tự điền cột tiêu chí, cột hiển thị chính và khoảng dòng.';
      case 'HEADER':
        return 'Kéo chuột trên vùng tiêu đề ngang để hệ thống tự điền dòng bắt đầu và dòng kết thúc của tiêu đề ngang.';
      case 'DATA':
        return 'Kéo chuột trên vùng số liệu để hệ thống tự điền cột dữ liệu cùng khoảng dòng bắt đầu - kết thúc.';
      case 'SKIP_ROWS':
        return 'Bấm vào ô số dòng bên trái để thêm hoặc bỏ dòng đó khỏi danh sách Dòng bỏ qua.';
      default:
        return '';
    }
  }, [canUseManualPreviewSelection, manualPreviewSelectionMode]);

  const clearManualPreviewSelectionDraft = () => {
    setManualPreviewSelectionStart(null);
    setManualPreviewSelectionCurrent(null);
    setIsManualPreviewDragging(false);
  };

  const handleManualPreviewModeChange = (nextMode: ManualPreviewSelectionMode) => {
    setManualPreviewSelectionMode(nextMode);
    clearManualPreviewSelectionDraft();
    setManualPreviewActionMessage(null);
  };

  const pushManualPreviewUndoSnapshot = () => {
    setManualPreviewUndoStack((prev) => [...prev.slice(-9), cloneManualFormState(manualForm)]);
  };

  const handleUndoManualPreviewSelection = () => {
    setManualPreviewUndoStack((prev) => {
      if (prev.length === 0) {
        return prev;
      }

      const nextStack = [...prev];
      const previousForm = nextStack.pop();
      if (previousForm) {
        setManualForm(cloneManualFormState(previousForm));
        setManualPreviewLastAppliedSection(null);
        setManualPreviewActionMessage('Đã hoàn tác lần chọn gần nhất và dựng lại preview theo cấu hình trước đó.');
      }
      return nextStack;
    });
    clearManualPreviewSelectionDraft();
  };

  const getManualSectionHighlightClass = (section: ManualPreviewAppliedSection) =>
    manualPreviewLastAppliedSection === section
      ? 'ring-2 ring-[rgba(217,159,43,0.55)] shadow-[0_0_0_3px_rgba(217,159,43,0.12)]'
      : '';

  const handleResetManualConfiguration = () => {
    setManualSetupView('QUICK');
    setManualForm((prev) => ({
      ...cloneManualFormState(DEFAULT_MANUAL_FORM),
      sheetName: prev.sheetName,
    }));
    setManualPreviewUndoStack([]);
    setManualPreviewLastAppliedSection(null);
    clearManualPreviewSelectionDraft();
    setManualPreviewActionMessage(null);
    setError(null);
    setNotice('Đã xóa cấu hình hiện tại và đưa biểu mẫu về trạng thái khởi đầu, vẫn giữ file mẫu và sheet đang chọn để bạn thiết lập lại nhanh hơn.');
  };

  const toggleManualSpecialRow = (rowNumber: number) => {
    const nextRows = expandRowSelection(manualForm.specialRows);
    const existing = new Set(nextRows);

    if (existing.has(rowNumber)) {
      pushManualPreviewUndoSnapshot();
      existing.delete(rowNumber);
      setManualForm((prev) => ({ ...prev, specialRows: compressRowNumbers(Array.from(existing)) }));
      setManualPreviewLastAppliedSection('SKIP_ROWS');
      setManualPreviewActionMessage(`Đã bỏ dòng ${rowNumber} khỏi danh sách dòng bỏ qua. Preview đã dựng lại theo cấu hình mới.`);
      return;
    }

    pushManualPreviewUndoSnapshot();
    existing.add(rowNumber);
    setManualForm((prev) => ({ ...prev, specialRows: compressRowNumbers(Array.from(existing)) }));
    setManualPreviewLastAppliedSection('SKIP_ROWS');
    setManualPreviewActionMessage(`Đã thêm dòng ${rowNumber} vào danh sách dòng bỏ qua. Preview đã dựng lại theo cấu hình mới.`);
  };

  const applyManualPreviewSelection = () => {
    if (!manualPreviewSelectionRect || !canUseManualPreviewSelection) {
      clearManualPreviewSelectionDraft();
      return;
    }

    const startColumnLetter = XLSX.utils.encode_col(manualPreviewSelectionRect.startColIndex - 1);
    const endColumnLetter = XLSX.utils.encode_col(manualPreviewSelectionRect.endColIndex - 1);

    if (manualPreviewSelectionMode === 'LABEL') {
      const labelRange = buildColumnRangeSelection(startColumnLetter, endColumnLetter);
      pushManualPreviewUndoSnapshot();
      setManualForm((prev) => ({
        ...prev,
        labelColumn: endColumnLetter,
        labelColumnStart: startColumnLetter,
        labelColumnEnd: endColumnLetter,
        primaryLabelColumn: endColumnLetter,
        verticalHeaderStartRow: manualPreviewSelectionRect.startRow,
        verticalHeaderEndRow: manualPreviewSelectionRect.endRow,
      }));
      setManualPreviewLastAppliedSection('LABEL');
      setManualPreviewActionMessage(
        `Đã cập nhật tiêu chí dọc: cột ${labelRange}, dòng ${manualPreviewSelectionRect.startRow}-${manualPreviewSelectionRect.endRow}. Cột hiển thị chính tạm lấy là ${endColumnLetter}. Preview đã dựng lại theo cấu hình mới.`,
      );
      clearManualPreviewSelectionDraft();
      return;
    }

    if (manualPreviewSelectionMode === 'HEADER') {
      pushManualPreviewUndoSnapshot();
      setManualForm((prev) => ({
        ...prev,
        horizontalHeaderStartRow: manualPreviewSelectionRect.startRow,
        horizontalHeaderEndRow: manualPreviewSelectionRect.endRow,
      }));
      setManualPreviewLastAppliedSection('HEADER');
      setManualPreviewActionMessage(
        `Đã cập nhật tiêu đề ngang: dòng ${manualPreviewSelectionRect.startRow}-${manualPreviewSelectionRect.endRow}. Preview đã dựng lại theo cấu hình mới.`,
      );
      clearManualPreviewSelectionDraft();
      return;
    }

    if (manualPreviewSelectionMode === 'DATA') {
      const dataRange = buildColumnRangeSelection(startColumnLetter, endColumnLetter);
      pushManualPreviewUndoSnapshot();
      setManualForm((prev) => ({
        ...prev,
        dataColumns: dataRange,
        startRow: manualPreviewSelectionRect.startRow,
        endRow: manualPreviewSelectionRect.endRow,
      }));
      setManualPreviewLastAppliedSection('DATA');
      setManualPreviewActionMessage(
        `Đã cập nhật vùng dữ liệu: cột ${dataRange}, dòng ${manualPreviewSelectionRect.startRow}-${manualPreviewSelectionRect.endRow}. Preview đã dựng lại theo cấu hình mới.`,
      );
      clearManualPreviewSelectionDraft();
      return;
    }

    clearManualPreviewSelectionDraft();
  };

  useEffect(() => {
    if (!isManualPreviewDragging) {
      return undefined;
    }

    const handleMouseUp = () => {
      setIsManualPreviewDragging(false);
      applyManualPreviewSelection();
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [applyManualPreviewSelection, isManualPreviewDragging]);

  const getManualPreviewCellTone = (rowNumber: number, columnLetter: string) => {
    if (manualPreviewConfig.specialRows.has(rowNumber)) {
      return 'bg-slate-50 ring-1 ring-inset ring-slate-200';
    }

    for (const block of manualPreviewConfig.blockRanges) {
      const inBlockHeader = rowNumber >= block.headerStartRow && rowNumber <= block.headerEndRow;
      const inBlockData = rowNumber >= block.startRow && rowNumber <= block.endRow;
      if ((inBlockHeader || inBlockData) && (block.labelColumns.has(columnLetter) || block.dataColumns.has(columnLetter))) {
        return 'bg-rose-50 ring-1 ring-inset ring-rose-200';
      }
    }

    if (
      rowNumber >= manualPreviewConfig.startRow &&
      rowNumber <= manualPreviewConfig.endRow &&
      manualPreviewConfig.dataColumns.has(columnLetter)
    ) {
      return 'bg-emerald-50 ring-1 ring-inset ring-emerald-200';
    }

    if (
      rowNumber >= manualPreviewConfig.horizontalHeaderStartRow &&
      rowNumber <= manualPreviewConfig.horizontalHeaderEndRow &&
      (manualPreviewConfig.dataColumns.has(columnLetter) || manualPreviewConfig.labelColumns.has(columnLetter))
    ) {
      return 'bg-amber-50 ring-1 ring-inset ring-amber-200';
    }

    if (manualPreviewConfig.labelColumns.has(columnLetter)) {
      return 'bg-sky-50 ring-1 ring-inset ring-sky-200';
    }

    return 'bg-white';
  };

  const getManualPreviewSelectionTone = (rowNumber: number, columnLetter: string) => {
    if (!manualPreviewSelectionRect || manualPreviewSelectionMode === 'SKIP_ROWS') {
      return '';
    }

    const columnIndex = columnLetterToIndex(columnLetter);
    const isWithinSelection =
      rowNumber >= manualPreviewSelectionRect.startRow &&
      rowNumber <= manualPreviewSelectionRect.endRow &&
      columnIndex >= manualPreviewSelectionRect.startColIndex &&
      columnIndex <= manualPreviewSelectionRect.endColIndex;

    if (!isWithinSelection) {
      return '';
    }

    switch (manualPreviewSelectionMode) {
      case 'LABEL':
        return 'bg-sky-100/90 shadow-[inset_0_0_0_2px_rgba(2,132,199,0.6)]';
      case 'HEADER':
        return 'bg-amber-100/90 shadow-[inset_0_0_0_2px_rgba(217,119,6,0.6)]';
      case 'DATA':
        return 'bg-emerald-100/90 shadow-[inset_0_0_0_2px_rgba(5,150,105,0.6)]';
      default:
        return '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(null);
      setNotice(null);
    }
  };

  const handleManualFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setManualFile(e.target.files[0]);
      setError(null);
      setNotice(null);
    }
  };

  const toggleAiSheet = (sheetName: string) => {
    setSelectedAiSheetNames((prev) => {
      if (prev.includes(sheetName)) {
        return prev.filter((item) => item !== sheetName);
      }

      if (prev.length >= MAX_AI_SHEETS_PER_RUN) {
        setError(`Mỗi lần AI chỉ nên học tối đa ${MAX_AI_SHEETS_PER_RUN} sheet để tránh vượt quota Gemini.`);
        setNotice(null);
        return prev;
      }

      setError(null);
      return [...prev, sheetName];
    });
  };

  const selectAllAiSheets = () => {
    const limitedSheets = aiSheetNames.slice(0, MAX_AI_SHEETS_PER_RUN);
    setSelectedAiSheetNames(limitedSheets);
    if (aiSheetNames.length > MAX_AI_SHEETS_PER_RUN) {
      setError(`Hệ thống chỉ chọn ${MAX_AI_SHEETS_PER_RUN} sheet đầu tiên để tránh vượt quota Gemini.`);
      setNotice(null);
      return;
    }
    setError(null);
  };

  const clearAllAiSheets = () => {
    setSelectedAiSheetNames([]);
    setError(null);
  };

  const buildHeaderLayout = (
    worksheet: XLSX.WorkSheet,
    startRow: number,
    endRow: number,
    startColLetter: string,
    endColLetter: string,
  ): HeaderLayout => {
    const startCol = columnLetterToIndex(startColLetter);
    const endCol = columnLetterToIndex(endColLetter);
    const cells: HeaderLayout['cells'] = [];
    for (let r = startRow; r <= endRow; r += 1) {
      for (let c = startCol; c <= endCol; c += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
        const value = cell?.v ?? cell?.w;
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          cells.push({ row: r, col: c, value: String(value).trim() });
        }
      }
    }

    const merges = (worksheet['!merges'] || [])
      .map((merge: any) => ({
        startRow: merge.s.r + 1,
        startCol: merge.s.c + 1,
        endRow: merge.e.r + 1,
        endCol: merge.e.c + 1,
      }))
      .filter(
        (merge: any) =>
          merge.endRow >= startRow &&
          merge.startRow <= endRow &&
          merge.endCol >= startCol &&
          merge.startCol <= endCol,
      );

    return {
      startRow,
      endRow,
      startCol,
      endCol,
      cells,
      merges,
    };
  };

  const resolveHeaderRange = (template: FormTemplate) => {
    const range = headerRanges[template.id];
    if (range) {
      return range;
    }

    if (template.headerLayout) {
      return {
        startRow: template.headerLayout.startRow,
        endRow: template.headerLayout.endRow,
        startCol: XLSX.utils.encode_col(template.headerLayout.startCol - 1),
        endCol: XLSX.utils.encode_col(template.headerLayout.endCol - 1),
      };
    }

    return {
      startRow: template.columnMapping.startRow,
      endRow: Math.max(template.columnMapping.startRow, template.columnMapping.startRow + 4),
      startCol: template.columnMapping.labelColumnStart || template.columnMapping.labelColumn,
      endCol: template.columnMapping.dataColumns[template.columnMapping.dataColumns.length - 1] || template.columnMapping.labelColumn,
    };
  };

  const buildTemplateWithHeaderLayout = (template: FormTemplate, workbook: XLSX.WorkBook) => {
    const worksheet = workbook.Sheets[template.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) {
      return template;
    }

    const range = resolveHeaderRange(template);
    const nextSignature = completeSheetSignatureFromWorksheet(worksheet, template.columnMapping.sheetSignature);
    return {
      ...template,
      headerLayout: buildHeaderLayout(
        worksheet,
        range.startRow,
        range.endRow,
        range.startCol.toUpperCase(),
        range.endCol.toUpperCase(),
      ),
      columnMapping: {
        ...template.columnMapping,
        ...(nextSignature ? { sheetSignature: nextSignature } : {}),
      },
    };
  };

  const uploadSourceWorkbook = async (sourceFile: File) => {
    if (!project?.id) {
      throw new Error('Vui lòng chọn dự án trước khi lưu biểu mẫu.');
    }

    const uploadResult = await withTimeout(
      uploadFile(sourceFile, {
        folder: `project_templates/${project.id}`,
        fileName: sourceFile.name,
        contentType: sourceFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      STORAGE_OPERATION_TIMEOUT_MS,
      'Quá thời gian tải file mẫu lên Supabase Storage. Hãy kiểm tra đăng nhập hoặc kết nối mạng.',
    );

    return {
      sourceWorkbookName: sourceFile.name,
      sourceWorkbookPath: uploadResult.path,
      sourceWorkbookUrl: uploadResult.publicUrl,
    };
  };

  const getNextManualSheetName = (currentSheetName: string, nextTemplate?: FormTemplate) => {
    const takenSheetNames = new Set(
      [...manualTemplates, ...(nextTemplate ? [nextTemplate] : [])].map((template) => template.sheetName).filter(Boolean),
    );
    const currentIndex = manualSheetNames.findIndex((sheetName) => sheetName === currentSheetName);
    const remainingAfterCurrent = manualSheetNames.slice(currentIndex + 1).find((sheetName) => !takenSheetNames.has(sheetName));

    if (remainingAfterCurrent) {
      return remainingAfterCurrent;
    }

    return manualSheetNames.find((sheetName) => !takenSheetNames.has(sheetName)) || currentSheetName;
  };

  const updateStoredTemplate = (id: string, updates: Partial<FormTemplate>) => {
    setManualTemplates((prev) => prev.map((template) => (template.id === id ? { ...template, ...updates } : template)));
  };

  const updateStoredTemplateMapping = (id: string, updates: Partial<FormTemplate['columnMapping']>) => {
    setManualTemplates((prev) =>
      prev.map((template) =>
        template.id === id
          ? {
              ...template,
              columnMapping: {
                ...template.columnMapping,
                ...updates,
              },
            }
          : template,
      ),
    );
  };

  const updateStoredTemplateHeader = (
    id: string,
    updates: Partial<Pick<HeaderLayout, 'startRow' | 'endRow' | 'startCol' | 'endCol'>>,
  ) => {
    setManualTemplates((prev) =>
      prev.map((template) => {
        if (template.id !== id) {
          return template;
        }

        const currentHeaderLayout =
          template.headerLayout ||
          ({
            startRow: template.columnMapping.startRow,
            endRow: Math.max(template.columnMapping.startRow, template.columnMapping.startRow + 4),
            startCol: columnLetterToIndex(template.columnMapping.labelColumnStart || template.columnMapping.labelColumn),
            endCol: columnLetterToIndex(
              template.columnMapping.dataColumns[template.columnMapping.dataColumns.length - 1] ||
                template.columnMapping.labelColumn,
            ),
            cells: [],
            merges: [],
          } satisfies HeaderLayout);

        return {
          ...template,
          headerLayout: {
            ...currentHeaderLayout,
            ...updates,
          },
        };
      }),
    );
  };

  const validateTemplateDraft = (template: FormTemplate, excludeTemplateId?: string) => {
    if (!template.name.trim() || !template.sheetName.trim()) {
      return 'Tên biểu mẫu và tên sheet không được để trống.';
    }

    const duplicateName = manualTemplates.find(
      (item) => item.id !== excludeTemplateId && item.name.trim().toLowerCase() === template.name.trim().toLowerCase(),
    );
    if (duplicateName) {
      return 'Tên biểu mẫu đã tồn tại trong dự án này.';
    }

    if (template.columnMapping.endRow < template.columnMapping.startRow) {
      return 'Vùng dữ liệu phải có hàng kết thúc lớn hơn hoặc bằng hàng bắt đầu.';
    }

    if (!template.columnMapping.labelColumn.trim()) {
      return 'Cột tiêu chí dọc không được để trống.';
    }

    if (
      template.columnMapping.labelColumnStart &&
      template.columnMapping.labelColumnEnd &&
      columnLetterToIndex(template.columnMapping.labelColumnEnd) < columnLetterToIndex(template.columnMapping.labelColumnStart)
    ) {
      return 'Vùng tiêu chí dọc nâng cao không hợp lệ.';
    }

    if (!template.columnMapping.dataColumns || template.columnMapping.dataColumns.length === 0) {
      return 'Vui lòng khai báo ít nhất một cột dữ liệu.';
    }

    if (
      (template.columnMapping.specialRows || []).some(
        (row) => row < template.columnMapping.startRow || row > template.columnMapping.endRow,
      )
    ) {
      return 'Dòng đặc biệt phải nằm trong vùng dữ liệu đã khai báo.';
    }

    if (template.headerLayout && template.headerLayout.endRow < template.headerLayout.startRow) {
      return 'Vùng tiêu đề phải có dòng kết thúc lớn hơn hoặc bằng dòng bắt đầu.';
    }

    if (template.columnMapping.sheetSignature) {
      const signature = template.columnMapping.sheetSignature;
      if (signature.headerEndRow < signature.headerStartRow) {
        return 'Chỉ số khóa của sheet phải có dòng cuối lớn hơn hoặc bằng dòng đầu.';
      }

      if (columnLetterToIndex(signature.headerEndCol) < columnLetterToIndex(signature.headerStartCol)) {
        return 'Chỉ số khóa của sheet phải có cột cuối lớn hơn hoặc bằng cột đầu.';
      }
    }

    if (
      template.headerLayout &&
      (template.headerLayout.startCol <= 0 || template.headerLayout.endCol <= 0 || template.headerLayout.endCol < template.headerLayout.startCol)
    ) {
      return 'Cột bắt đầu và cột kết thúc của vùng tiêu đề không hợp lệ.';
    }

    if ((template.columnMapping.blocks || []).some((block) => block.endRow < block.startRow)) {
      return 'Có khối dữ liệu có dòng kết thúc nhỏ hơn dòng bắt đầu.';
    }

    return null;
  };

  const saveStoredTemplate = async (template: FormTemplate) => {
    setSavingTemplateId(template.id);
    const normalizedTemplate: FormTemplate = {
      ...template,
      name: template.name.trim(),
      sheetName: template.sheetName.trim(),
      columnHeaders: template.columnHeaders.map((value) => value.trim()).filter(Boolean),
      columnMapping: {
        ...template.columnMapping,
        labelColumn: normalizeColumnValue(template.columnMapping.labelColumn),
        labelColumnStart: template.columnMapping.labelColumnStart
          ? normalizeColumnValue(template.columnMapping.labelColumnStart)
          : undefined,
        labelColumnEnd: template.columnMapping.labelColumnEnd
          ? normalizeColumnValue(template.columnMapping.labelColumnEnd)
          : undefined,
        primaryLabelColumn: template.columnMapping.primaryLabelColumn
          ? normalizeColumnValue(template.columnMapping.primaryLabelColumn)
          : undefined,
        dataColumns: expandColumnSelection(template.columnMapping.dataColumns.join(',')),
        specialRows: expandRowSelection((template.columnMapping.specialRows || []).join(',')),
        sheetSignature: template.columnMapping.sheetSignature
          ? normalizeSheetSignatureDraft(template.columnMapping.sheetSignature)
          : undefined,
        blocks: (template.columnMapping.blocks || []).map((block, index) => ({
          ...block,
          id: block.id || buildManualBlockId(),
          name: block.name.trim() || `Khối ${index + 1}`,
          labelColumnStart: normalizeColumnValue(block.labelColumnStart),
          labelColumnEnd: normalizeColumnValue(block.labelColumnEnd),
          primaryLabelColumn: normalizeColumnValue(block.primaryLabelColumn),
          dataColumns: expandColumnSelection((block.dataColumns || []).join(',')),
          specialRows: expandRowSelection((block.specialRows || []).join(',')),
          columnHeaders: (block.columnHeaders || []).map((value) => value.trim()).filter(Boolean),
        })),
      },
    };

    const validationError = validateTemplateDraft(normalizedTemplate, template.id);
    if (validationError) {
      setError(validationError);
      setNotice(null);
      setSavingTemplateId(null);
      return;
    }

    try {
      let templateToSave = normalizedTemplate;
      if (normalizedTemplate.sourceWorkbookUrl) {
        try {
          const response = await fetch(normalizedTemplate.sourceWorkbookUrl);
          if (response.ok) {
            const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
            templateToSave = buildTemplateWithHeaderLayout(normalizedTemplate, workbook);
          }
        } catch (workbookError) {
          console.warn('Không thể đọc lại workbook mẫu khi lưu chỉnh sửa biểu mẫu:', workbookError);
        }
      }

      await upsertTemplate({
        ...templateToSave,
        updatedAt: new Date().toISOString(),
      });
      if (project?.id) {
        const nextTemplates = await listTemplatesFromSupabase(project.id);
        setManualTemplates(nextTemplates);
        await onTemplatesChanged?.(project.id);
      }

      setError(null);
      setNotice(`Đã cập nhật biểu mẫu "${templateToSave.name}".`);
    } catch (err) {
      console.error('Save template error:', err);
      setError(err instanceof Error ? err.message : 'Không thể lưu chỉnh sửa biểu mẫu.');
      setNotice(null);
    } finally {
      setSavingTemplateId(null);
    }
  };

  const toggleTemplatePublished = async (template: FormTemplate) => {
    try {
      const nextPublished = !template.isPublished;
      await upsertTemplate({
        ...template,
        isPublished: nextPublished,
        updatedAt: new Date().toISOString(),
      });
      if (project?.id) {
        const nextTemplates = await listTemplatesFromSupabase(project.id);
        setManualTemplates(nextTemplates);
        await onTemplatesChanged?.(project.id);
      }
      setError(null);
      setNotice(
        nextPublished
          ? `Đã chốt biểu mẫu "${template.name}". Biểu này có thể dùng để tiếp nhận dữ liệu.`
          : `Đã mở lại biểu mẫu "${template.name}" để tiếp tục chỉnh sửa.`,
      );
    } catch (err) {
      console.error('Toggle template publish error:', err);
      setError(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái chốt biểu mẫu.');
      setNotice(null);
    }
  };

  const handleDeleteStoredTemplate = async (template: FormTemplate) => {
    const warningMessage = [
      `Bạn có chắc chắn xóa biểu mẫu "${template.name}" không?`,
      '',
      'Cảnh báo: thao tác này sẽ xóa luôn toàn bộ dữ liệu đã tiếp nhận, các bản xuất liên quan đến sheet này và không thể hoàn tác.',
    ].join('\n');

    const confirmed = window.confirm(warningMessage);
    if (!confirmed) {
      return;
    }

    setDeletingTemplateId(template.id);
    try {
      const deleted = await onDeleteTemplate(template);
      if (!deleted) {
        setError('Không thể xóa biểu mẫu này. Vui lòng kiểm tra quyền, dữ liệu liên quan hoặc policy của Supabase.');
        setNotice(null);
        return;
      }
      if (project?.id) {
        const nextTemplates = await listTemplatesFromSupabase(project.id);
        setManualTemplates(nextTemplates);
        await onTemplatesChanged?.(project.id);
      }

      setError(null);
      setNotice(`Đã xóa biểu mẫu "${template.name}" và toàn bộ dữ liệu liên quan của sheet này.`);
    } catch (error) {
      console.error('Delete stored template error:', error);
      setError(error instanceof Error ? error.message : 'Không thể xóa biểu mẫu này.');
      setNotice(null);
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const attachWorkbookToTemplate = async (template: FormTemplate) => {
    if (!manualFile) {
      setError('Vui lòng chọn file mẫu trước khi gắn lại file gốc cho biểu.');
      setNotice(null);
      return;
    }

    setAttachingTemplateId(template.id);
    setSaveProgressLabel('Đang gắn lại file mẫu gốc...');
    setError(null);
    setNotice(null);

    try {
      const data = await manualFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const workbookMetadata = await uploadSourceWorkbook(manualFile);
      const templateWithLayout = buildTemplateWithHeaderLayout(template, workbook);

      await upsertTemplate({
        ...template,
        ...workbookMetadata,
        headerLayout: templateWithLayout.headerLayout || template.headerLayout,
        updatedAt: new Date().toISOString(),
      });
      if (project?.id) {
        const nextTemplates = await listTemplatesFromSupabase(project.id);
        setManualTemplates(nextTemplates);
        await onTemplatesChanged?.(project.id);
      }

      setNotice(`Đã gắn lại file mẫu gốc cho biểu "${template.name}".`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Không thể gắn lại file mẫu gốc cho biểu. Hãy kiểm tra Supabase Storage.',
      );
    } finally {
      setAttachingTemplateId(null);
      setSaveProgressLabel(null);
    }
  };

  const learnForm = async () => {
    if (!project?.id || !file) return;
    if (selectedAiSheetNames.length === 0) {
      setError('Vui lòng chọn ít nhất một sheet để AI học biểu mẫu.');
      setNotice(null);
      return;
    }
    if (selectedAiSheetNames.length > MAX_AI_SHEETS_PER_RUN) {
      setError(`Mỗi lần AI chỉ hỗ trợ tối đa ${MAX_AI_SHEETS_PER_RUN} sheet để tránh vượt quota Gemini.`);
      setNotice(null);
      return;
    }
    setIsLearning(true);
    setError(null);
    setNotice(null);
    setLearnedTemplates([]);
    setSaveProgressLabel('Đang đọc file mẫu AI...');

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetNames = workbook.SheetNames.filter((sheetName) => selectedAiSheetNames.includes(sheetName));
          if (!resolvedGeminiApiKey) {
            throw new Error('Chưa có khóa Gemini. Hãy dán API key Gemini vào ô cấu hình AI trước khi phân tích.');
          }

          if (sheetNames.length === 0) {
            throw new Error('Không tìm thấy sheet đã chọn trong file mẫu. Hãy tải lại file và chọn lại sheet.');
          }

          const ai = new GoogleGenAI({ apiKey: resolvedGeminiApiKey });
          const results: FormTemplate[] = [];

          for (let index = 0; index < sheetNames.length; index += 1) {
            const sheetName = sheetNames[index];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 'A', range: 0, defval: '' }).slice(0, 15);
            const rowsJson = JSON.stringify(rows, null, 2);

            const prompt = [
              `Phân tích cấu trúc biểu mẫu báo cáo Excel từ 15 hàng đầu của sheet "${sheetName}":`,
              rowsJson,
              '',
              'Trả về JSON chính xác:',
              '1. labelColumn: Cột chứa tiêu chí (thường là "B" hoặc "A").',
              '2. dataColumns: Danh sách cột chứa số liệu (ví dụ: ["C", "D", "E"]).',
              '3. columnHeaders: Tên tiêu đề tương ứng của dataColumns.',
              '4. startRow: Hàng bắt đầu có dữ liệu số (1-indexed).',
              '5. endRow: Hàng kết thúc (mặc định 1000).',
              '6. name: Tên biểu mẫu (ví dụ: "Biểu mẫu 1B").',
              '',
              'Yêu cầu JSON:',
              '{',
              '  "labelColumn": "string",',
              '  "dataColumns": ["string"],',
              '  "columnHeaders": ["string"],',
              '  "startRow": number,',
              '  "endRow": number,',
              '  "name": "string"',
              '}',
            ].join('\n');

            setSaveProgressLabel(`Đang phân tích sheet ${index + 1}/${sheetNames.length}: ${sheetName}`);

            let response;
            let retriedAfterQuota = false;
            try {
              response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      labelColumn: { type: Type.STRING },
                      dataColumns: { type: Type.ARRAY, items: { type: Type.STRING } },
                      columnHeaders: { type: Type.ARRAY, items: { type: Type.STRING } },
                      startRow: { type: Type.INTEGER },
                      endRow: { type: Type.INTEGER },
                      name: { type: Type.STRING },
                    },
                    required: ['labelColumn', 'dataColumns', 'columnHeaders', 'startRow', 'endRow', 'name'],
                  },
                },
              });
            } catch (generationError) {
              if (!isQuotaExceededError(generationError)) {
                throw generationError;
              }

              retriedAfterQuota = true;
              const retryDelayMs = parseRetryDelayMs(generationError);
              setSaveProgressLabel(
                `Gemini đang quá hạn mức, chờ ${Math.ceil(retryDelayMs / 1000)} giây để thử lại sheet ${sheetName}...`,
              );
              await sleep(retryDelayMs);

              response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      labelColumn: { type: Type.STRING },
                      dataColumns: { type: Type.ARRAY, items: { type: Type.STRING } },
                      columnHeaders: { type: Type.ARRAY, items: { type: Type.STRING } },
                      startRow: { type: Type.INTEGER },
                      endRow: { type: Type.INTEGER },
                      name: { type: Type.STRING },
                    },
                    required: ['labelColumn', 'dataColumns', 'columnHeaders', 'startRow', 'endRow', 'name'],
                  },
                },
              });
            }

            const result = JSON.parse(response.text);
            results.push({
              id: buildTemplateId(),
              projectId: selectedProjectId,
              name: result.name,
              sheetName: sheetName,
              isPublished: false,
              columnHeaders: result.columnHeaders,
              columnMapping: {
                labelColumn: result.labelColumn,
                dataColumns: result.dataColumns,
                startRow: result.startRow,
                endRow: result.endRow,
              },
              mode: 'AI',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as FormTemplate);

            if (index < sheetNames.length - 1) {
              await sleep(retriedAfterQuota ? 2500 : 1500);
            }
          }

          const validTemplates = results.filter((t) => t !== null);
          if (validTemplates.length === 0) {
            throw new Error('AI không thể nhận diện được cấu trúc nào từ các sheet.');
          }

          setLearnedTemplates(validTemplates);
          const nextConfirm: Record<string, boolean> = {};
          const nextHeaderRanges: Record<string, { startRow: number; endRow: number; startCol: string; endCol: string }> = {};
          validTemplates.forEach((tpl) => {
            nextConfirm[tpl.id] = false;
            nextHeaderRanges[tpl.id] = {
              startRow: tpl.columnMapping.startRow,
              endRow: tpl.columnMapping.startRow + 4,
              startCol: tpl.columnMapping.labelColumn,
              endCol: tpl.columnMapping.dataColumns[tpl.columnMapping.dataColumns.length - 1] || tpl.columnMapping.labelColumn,
            };
          });
          setConfirmedTemplates(nextConfirm);
          setHeaderRanges(nextHeaderRanges);
          setConfirmAll(false);
          setSaveProgressLabel(null);
          setIsLearning(false);
        } catch (innerErr) {
          setError(innerErr instanceof Error ? innerErr.message : 'Lỗi xử lý file.');
          setSaveProgressLabel(null);
          setIsLearning(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('Không thể đọc file Excel này.');
      setSaveProgressLabel(null);
      setIsLearning(false);
    }
  };

  const saveTemplates = async (templatesToSave: FormTemplate[], sourceFile?: File) => {
    if (templatesToSave.length === 0) return;
    setIsSavingTemplates(true);
    setSaveProgressLabel(sourceFile ? 'Đang xử lý file mẫu...' : 'Đang lưu biểu mẫu...');
    try {
      let templatesWithLayout = templatesToSave;
      let workbookMetadata:
        | {
            sourceWorkbookName: string;
            sourceWorkbookPath: string;
            sourceWorkbookUrl: string;
          }
          | null = null;
      let storageWarning: string | null = null;

      if (sourceFile) {
        setSaveProgressLabel('Đang đọc file mẫu...');
        const data = await sourceFile.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        templatesWithLayout = templatesToSave.map((tpl) => buildTemplateWithHeaderLayout(tpl, workbook));

        try {
          setSaveProgressLabel('Đang tải file mẫu lên hệ thống...');
          workbookMetadata = await uploadSourceWorkbook(sourceFile);
        } catch (storageError) {
          storageWarning =
            storageError instanceof Error
              ? storageError.message
              : 'Không thể tải file mẫu lên Supabase Storage.';
        }
      }

      setSaveProgressLabel('Đang lưu cấu hình biểu mẫu...');
      const promises = templatesWithLayout.map((tpl) =>
        upsertTemplate({
          ...tpl,
          ...(workbookMetadata || {}),
          isPublished: tpl.isPublished ?? false,
          updatedAt: new Date().toISOString(),
        }),
      );
      await Promise.all(promises);
      if (project?.id) {
        const nextTemplates = await listTemplatesFromSupabase(project.id);
        setManualTemplates(nextTemplates);
        await onTemplatesChanged?.(project.id);
      }
      setLearnedTemplates([]);
      setError(null);
      setNotice(
        storageWarning
          ? `Đã lưu ${templatesWithLayout.length} biểu mẫu ở trạng thái nháp, nhưng chưa tải được file mẫu gốc lên Supabase Storage. Hệ thống vẫn lưu cấu hình biểu mẫu để bạn tiếp tục dùng. Chi tiết: ${storageWarning}`
          : `Đã lưu ${templatesWithLayout.length} biểu mẫu ở trạng thái nháp. Bạn có thể xem trước trong Báo cáo và chốt từng biểu khi sẵn sàng tiếp nhận dữ liệu.`,
      );
    } catch (err) {
      console.error('Save templates error:', err);
      throw err instanceof Error ? err : new Error('Không thể lưu biểu mẫu.');
    } finally {
      setIsSavingTemplates(false);
      setSaveProgressLabel(null);
    }
  };

  const updateTemplate = (id: string, updates: Partial<FormTemplate>) => {
    setLearnedTemplates((prev) => prev.map((tpl) => (tpl.id === id ? { ...tpl, ...updates } : tpl)));
  };

  const updateTemplateMapping = (id: string, updates: Partial<FormTemplate['columnMapping']>) => {
    setLearnedTemplates((prev) =>
      prev.map((tpl) =>
        tpl.id === id ? { ...tpl, columnMapping: { ...tpl.columnMapping, ...updates } } : tpl,
      ),
    );
  };

  const toggleConfirmAll = (checked: boolean) => {
    setConfirmAll(checked);
    const nextConfirm: Record<string, boolean> = {};
    learnedTemplates.forEach((tpl) => {
      nextConfirm[tpl.id] = checked;
    });
    setConfirmedTemplates(nextConfirm);
  };

  const allConfirmed = learnedTemplates.length > 0 && learnedTemplates.every((tpl) => confirmedTemplates[tpl.id]);

  useEffect(() => {
    let cancelled = false;

    const renderPreview = async () => {
      if (!file || !previewTemplateId) {
        setPreviewRows([]);
        return;
      }

      const template = learnedTemplates.find((tpl) => tpl.id === previewTemplateId);
      if (!template) {
        setPreviewRows([]);
        return;
      }

      setIsPreviewLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        if (cancelled) return;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const worksheet = workbook.Sheets[template.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
        if (!worksheet) {
          setPreviewRows([]);
          return;
        }

        const range = headerRanges[template.id] || {
          startRow: template.columnMapping.startRow,
          endRow: template.columnMapping.startRow,
          startCol: template.columnMapping.labelColumn,
          endCol: template.columnMapping.dataColumns[template.columnMapping.dataColumns.length - 1] || template.columnMapping.labelColumn,
        };

        const firstColIndex = columnLetterToIndex(range.startCol);
        const lastColIndex = columnLetterToIndex(range.endCol);
        if (firstColIndex <= 0 || lastColIndex <= 0) {
          setPreviewRows([]);
          return;
        }

        const startCol = Math.min(firstColIndex, lastColIndex) - 1;
        const endCol = Math.max(firstColIndex, lastColIndex) - 1;
        const startRow = Math.max(1, range.startRow) - 1;
        const previewEndRow = Math.max(range.endRow + 8, template.columnMapping.startRow + 6) - 1;

        const sheetRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
        const boundedEndRow = Math.min(sheetRange.e.r, previewEndRow);
        const rows: string[][] = [];

        for (let r = startRow; r <= boundedEndRow; r += 1) {
          const line: string[] = [];
          for (let c = startCol; c <= endCol; c += 1) {
            const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
            const value = cell?.w ?? cell?.v ?? '';
            line.push(String(value).trim());
          }
          rows.push(line);
        }

        if (!cancelled) {
          setPreviewRows(rows);
        }
      } catch (previewError) {
        if (!cancelled) {
          console.error('Preview template error:', previewError);
          setPreviewRows([]);
        }
      } finally {
        if (!cancelled) {
          setIsPreviewLoading(false);
        }
      }
    };

    renderPreview();
    return () => {
      cancelled = true;
    };
  }, [file, headerRanges, learnedTemplates, previewTemplateId]);

  const handleManualCreate = async () => {
    setIsCreatingManual(true);
    if (!project?.id) {
      setError('Vui lòng chọn dự án trước khi tạo biểu mẫu.');
      setNotice(null);
      setIsCreatingManual(false);
      return;
    }

    if (!manualFile) {
      setError('Vui lòng tải file mẫu để phần mềm đọc danh sách sheet trước.');
      setNotice(null);
      setIsCreatingManual(false);
      return;
    }

    if (!manualForm.name || !manualForm.sheetName || !manualForm.dataColumns) {
      setError('Vui lòng nhập đầy đủ thông tin template.');
      setNotice(null);
      setIsCreatingManual(false);
      return;
    }

    if (existingNames.has(manualForm.name.trim().toLowerCase())) {
      setError('Tên template đã tồn tại trong dự án này.');
      setNotice(null);
      setIsCreatingManual(false);
      return;
    }

    if (Number(manualForm.endRow) < Number(manualForm.startRow)) {
      setError('Vùng dữ liệu phải có hàng kết thúc lớn hơn hoặc bằng hàng bắt đầu.');
      setNotice(null);
      setIsCreatingManual(false);
      return;
    }

    if (Number(manualForm.verticalHeaderEndRow) < Number(manualForm.verticalHeaderStartRow)) {
      setError('Tiêu chí dọc phải có dòng kết thúc lớn hơn hoặc bằng dòng bắt đầu.');
      setNotice(null);
      setIsCreatingManual(false);
      return;
    }

    if (Number(manualForm.horizontalHeaderEndRow) < Number(manualForm.horizontalHeaderStartRow)) {
      setError('Tiêu chí ngang phải có dòng kết thúc lớn hơn hoặc bằng dòng bắt đầu.');
      setNotice(null);
      setIsCreatingManual(false);
      return;
    }

    const dataColumns = expandColumnSelection(manualForm.dataColumns);
    const specialRows = expandRowSelection(manualForm.specialRows);
    const blocks = manualForm.enableAdvancedStructure ? normalizeTemplateBlocks(manualForm.blocks) : [];
    if (dataColumns.length === 0) {
      setError('Vùng cột dữ liệu không hợp lệ. Ví dụ đúng: A-C, F hoặc B,D,G.');
      setNotice(null);
      setIsCreatingManual(false);
      return;
    }

    const columnHeaders = manualForm.columnHeaders
      ? manualForm.columnHeaders.split(',').map((c) => c.trim()).filter(Boolean)
      : dataColumns.map((_, i) => `Cột ${i + 1}`);

    const newTemplate: FormTemplate = {
      id: buildTemplateId(),
      projectId: selectedProjectId,
      name: manualForm.name,
      sheetName: manualForm.sheetName,
      isPublished: false,
      columnHeaders,
      columnMapping: {
        labelColumn: normalizeColumnValue(manualForm.labelColumn),
        labelColumnStart: normalizeColumnValue(manualForm.labelColumnStart || manualForm.labelColumn),
        labelColumnEnd: normalizeColumnValue(manualForm.labelColumnEnd || manualForm.labelColumn),
        primaryLabelColumn: normalizeColumnValue(manualForm.primaryLabelColumn || manualForm.labelColumn),
        dataColumns,
        startRow: Number(manualForm.startRow),
        endRow: Number(manualForm.endRow),
        specialRows,
        sheetSignature: normalizeSheetSignatureDraft({
          headerStartRow: Number(manualForm.signatureStartRow),
          headerEndRow: Number(manualForm.signatureEndRow),
          headerStartCol: manualForm.signatureStartCol,
          headerEndCol: manualForm.signatureEndCol,
        }),
        blocks,
      },
      mode: 'MANUAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      let templateToSave = newTemplate;
      const data = await manualFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[newTemplate.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
      if (worksheet) {
        templateToSave = {
          ...newTemplate,
          headerLayout: buildHeaderLayout(
            worksheet,
            Math.min(Number(manualForm.verticalHeaderStartRow), Number(manualForm.horizontalHeaderStartRow)),
            Math.max(Number(manualForm.verticalHeaderEndRow), Number(manualForm.horizontalHeaderEndRow)),
            (manualForm.labelColumnStart || manualForm.labelColumn).toUpperCase(),
            dataColumns[dataColumns.length - 1] || manualForm.labelColumn.toUpperCase(),
          ),
        };
      }

      await saveTemplates([templateToSave], manualFile);
      const nextSheetName = getNextManualSheetName(manualForm.sheetName, templateToSave);
      setManualForm((prev) => ({
        ...DEFAULT_MANUAL_FORM,
        labelColumn: prev.labelColumn,
        labelColumnStart: prev.labelColumnStart,
        labelColumnEnd: prev.labelColumnEnd,
        primaryLabelColumn: prev.primaryLabelColumn,
        dataColumns: prev.dataColumns,
        specialRows: prev.specialRows,
        startRow: prev.startRow,
        endRow: prev.endRow,
        verticalHeaderStartRow: prev.verticalHeaderStartRow,
        verticalHeaderEndRow: prev.verticalHeaderEndRow,
        horizontalHeaderStartRow: prev.horizontalHeaderStartRow,
        horizontalHeaderEndRow: prev.horizontalHeaderEndRow,
        signatureStartRow: prev.signatureStartRow,
        signatureEndRow: prev.signatureEndRow,
        signatureStartCol: prev.signatureStartCol,
        signatureEndCol: prev.signatureEndCol,
        enableAdvancedStructure: prev.enableAdvancedStructure,
        blocks: prev.enableAdvancedStructure ? prev.blocks : [],
        sheetName: nextSheetName,
      }));
      setError(null);
      setNotice(
        nextSheetName && nextSheetName !== manualForm.sheetName
          ? `Đã lưu biểu "${templateToSave.name}". Hệ thống đã chuyển sang sheet tiếp theo: ${nextSheetName}.`
          : `Đã lưu biểu "${templateToSave.name}". Bạn có thể tiếp tục chỉnh hoặc chốt biểu ngay bên dưới.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể tạo biểu mẫu. Vui lòng kiểm tra lại file mẫu và quyền lưu trữ.');
      setNotice(null);
    } finally {
      setIsCreatingManual(false);
    }
  };

  const handleOpenManualPreview = () => {
    if (!manualFile || !manualWorkbook) {
      setError('Vui lòng tải file mẫu trước khi xem trước biểu.');
      setNotice(null);
      return;
    }

    if (!manualForm.sheetName.trim()) {
      setError('Vui lòng chọn đúng sheet trước khi xem trước biểu.');
      setNotice(null);
      return;
    }

    setError(null);
    setIsManualPreviewExpanded(false);
    clearManualPreviewSelectionDraft();
    setManualPreviewActionMessage(null);
    setManualPreviewUndoStack([]);
    setIsManualPreviewModalOpen(true);
  };

  const handleConfirmManualPreviewSelection = () => {
    setError(null);
    setNotice(
      'Đã áp các thông số vừa chọn từ cửa sổ xem trước vào phần thiết lập biểu mẫu. Kiểm tra lại rồi bấm "Tạo biểu mẫu" để lưu thành biểu chính thức.',
    );
    setIsManualPreviewModalOpen(false);
    setIsManualPreviewExpanded(false);
    clearManualPreviewSelectionDraft();
    setManualPreviewActionMessage(null);
    setManualPreviewUndoStack([]);
  };

  const canConfirmManualPreviewSelection = manualPreviewUndoStack.length > 0 || Boolean(manualPreviewActionMessage);

  const manualPreviewPanelStyle = isManualPreviewExpanded
    ? { width: 'calc(100vw - 16px)', height: '96vh' }
    : isDesktopPreviewViewport
      ? {
          width: 'min(1440px, calc(100vw - 32px))',
          height: '92vh',
          resize: 'both' as const,
          minWidth: '980px',
          minHeight: '640px',
          maxWidth: 'calc(100vw - 16px)',
          maxHeight: '96vh',
        }
      : { width: '100%', height: '92vh' };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h2 className="page-title">Quản lý biểu mẫu</h2>
        <p className="page-subtitle mt-2 text-sm">
          Chọn dự án, tải file mẫu, chọn sheet và thiết lập thông số cho từng biểu trước khi chốt.
        </p>
      </div>

      <div className="mb-6 panel-card rounded-[24px] p-5">
        <label className="col-header mb-2 block">Dự án đang thiết lập</label>
        <select
          value={selectedProjectId}
          onChange={(event) => onSelectProject(event.target.value)}
          className="field-select"
        >
          {projects.length === 0 && <option value="">-- Chưa có dự án --</option>}
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <p className="mt-3 text-xs text-[var(--ink-soft)]">
          {project ? project.description || project.name : 'Hãy chọn dự án trước khi thao tác với biểu mẫu.'}
        </p>
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={() => setMode('AI')} className={mode === 'AI' ? 'primary-btn' : 'secondary-btn'}>
          Học biểu mẫu bằng AI
        </button>
        <button onClick={() => setMode('MANUAL')} className={mode === 'MANUAL' ? 'primary-btn' : 'secondary-btn'}>
          Thiết lập thủ công
        </button>
      </div>

      {mode === 'AI' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
          <div className="panel-card rounded-[24px] p-8 text-center">
            <FileSpreadsheet className="mx-auto mb-4 text-[var(--primary)] opacity-40" size={52} />
            <h3 className="section-title mb-3">Tải lên File Mẫu (Template)</h3>
            <p className="page-subtitle text-xs">Hệ thống sẽ dùng AI để học cấu trúc của file này.</p>

            <div className="mx-auto mt-6 max-w-xl rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-left">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                Khóa Gemini
                <input
                  type="password"
                  className="field-input mt-2"
                  placeholder="Dán API key Gemini nếu máy chưa có cấu hình sẵn"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                />
              </label>
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                Hệ thống ưu tiên khóa bạn nhập tại đây, sau đó mới dùng `VITE_GEMINI_API_KEY` nếu có sẵn.
                Nếu không có khóa Gemini hợp lệ thì chức năng AI sẽ không thể chạy.
              </p>
              <div
                className={`mt-3 rounded-2xl border px-3 py-2 text-xs font-medium ${
                  resolvedGeminiApiKey
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}
              >
                {geminiKeySource}
              </div>
            </div>

            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
              id="template-upload"
              disabled={!project}
            />
            <label
              htmlFor="template-upload"
              className={`primary-btn mt-6 inline-flex items-center gap-2 ${!project ? 'pointer-events-none opacity-40' : ''}`}
            >
              {file ? file.name : 'Chọn file mẫu'}
            </label>

            {file && aiSheetNames.length > 0 && (
              <div className="mx-auto mt-6 max-w-xl rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-left">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                    Danh sách sheet để AI học
                  </p>
                  <span className="text-xs text-[var(--ink-soft)]">
                    Đã chọn {selectedAiSheetNames.length}/{aiSheetNames.length}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-soft)]">
                  AI chỉ phân tích những sheet bạn chọn bên dưới, không tự học toàn bộ workbook nữa. Mỗi lần chỉ nên học tối đa {MAX_AI_SHEETS_PER_RUN} sheet.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={selectAllAiSheets} className="secondary-btn">
                    Chọn tối đa {MAX_AI_SHEETS_PER_RUN} sheet đầu
                  </button>
                  <button type="button" onClick={clearAllAiSheets} className="secondary-btn">
                    Bỏ chọn tất cả
                  </button>
                </div>
                <div className="mt-3 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1">
                  {aiSheetNames.map((sheetName) => (
                    <label
                      key={sheetName}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
                    >
                      <span className="truncate">{sheetName}</span>
                      <input
                        type="checkbox"
                        checked={selectedAiSheetNames.includes(sheetName)}
                        onChange={() => toggleAiSheet(sheetName)}
                        className="theme-checkbox h-4 w-4"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {file && learnedTemplates.length === 0 && !isLearning && (
            <button onClick={learnForm} className="primary-btn w-full flex items-center justify-center gap-3">
              <Brain size={18} />
              Bắt đầu phân tích bằng AI
            </button>
          )}

          {isLearning && (
            <div className="panel-card rounded-[24px] p-8 text-center">
              <Loader2 className="mx-auto mb-4 animate-spin" size={40} />
              <h3 className="section-title">AI đang học biểu mẫu...</h3>
            </div>
          )}

          {error && (
            <div className="panel-card rounded-[20px] p-4 border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
              <AlertCircle size={18} />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}

          {notice && (
            <div className="panel-card rounded-[20px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 flex items-center gap-2">
              <CheckCircle size={18} />
              <p className="text-xs font-medium">{notice}</p>
            </div>
          )}

          {learnedTemplates.length > 0 && (
            <div className="panel-card rounded-[24px] p-6">
              <div className="flex items-center gap-3 mb-4 text-[var(--success)]">
                <CheckCircle size={20} />
                <h3 className="section-title">AI đã tìm thấy {learnedTemplates.length} biểu mẫu</h3>
              </div>

              <label className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                <input
                  type="checkbox"
                  checked={confirmAll}
                  onChange={(e) => toggleConfirmAll(e.target.checked)}
                  className="theme-checkbox h-3.5 w-3.5"
                />
                Tôi đã kiểm tra và xác nhận tất cả biểu mẫu
              </label>

              <div className="space-y-3">
                {learnedTemplates.map((tpl) => (
                  <div key={tpl.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                    {(() => {
                      const range = headerRanges[tpl.id] || {
                        startRow: tpl.columnMapping.startRow,
                        endRow: tpl.columnMapping.startRow,
                        startCol: tpl.columnMapping.labelColumn,
                        endCol: tpl.columnMapping.dataColumns[tpl.columnMapping.dataColumns.length - 1] || tpl.columnMapping.labelColumn,
                      };
                      return (
                        <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-sm text-[var(--ink)]">{tpl.name} (Sheet: {tpl.sheetName})</p>
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        <input
                          type="checkbox"
                          checked={!!confirmedTemplates[tpl.id]}
                          onChange={(e) => setConfirmedTemplates({ ...confirmedTemplates, [tpl.id]: e.target.checked })}
                          className="theme-checkbox h-3.5 w-3.5"
                        />
                        Đã xác nhận
                      </label>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        Tên biểu mẫu
                        <input
                          className="field-input mt-2"
                          value={tpl.name}
                          onChange={(e) => updateTemplate(tpl.id, { name: e.target.value })}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        Sheet
                        <input
                          className="field-input mt-2"
                          value={tpl.sheetName}
                          onChange={(e) => updateTemplate(tpl.id, { sheetName: e.target.value })}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        Cột tiêu chí
                        <input
                          className="field-input mt-2"
                          value={tpl.columnMapping.labelColumn}
                          onChange={(e) => updateTemplateMapping(tpl.id, { labelColumn: e.target.value })}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        Cột dữ liệu (C,D,E)
                        <input
                          className="field-input mt-2"
                          value={tpl.columnMapping.dataColumns.join(', ')}
                          onChange={(e) =>
                            updateTemplateMapping(tpl.id, {
                              dataColumns: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        Hàng bắt đầu
                        <input
                          type="number"
                          className="field-input mt-2"
                          value={tpl.columnMapping.startRow}
                          onChange={(e) => updateTemplateMapping(tpl.id, { startRow: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        Hàng kết thúc
                        <input
                          type="number"
                          className="field-input mt-2"
                          value={tpl.columnMapping.endRow}
                          onChange={(e) => updateTemplateMapping(tpl.id, { endRow: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-2">
                        Tiêu đề cột (phân cách bằng dấu phẩy)
                        <input
                          className="field-input mt-2"
                          value={tpl.columnHeaders.join(', ')}
                          onChange={(e) =>
                            updateTemplate(tpl.id, {
                              columnHeaders: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <div className="md:col-span-2">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          Vùng tiêu đề (bao gồm cột tiêu chí + cột số liệu)
                        </p>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
                          <input
                            type="number"
                            className="field-input"
                            placeholder="Hàng bắt đầu"
                            value={range.startRow}
                            onChange={(e) =>
                              setHeaderRanges((prev) => ({
                                ...prev,
                                [tpl.id]: { ...range, startRow: Number(e.target.value) },
                              }))
                            }
                          />
                          <input
                            type="number"
                            className="field-input"
                            placeholder="Hàng kết thúc"
                            value={range.endRow}
                            onChange={(e) =>
                              setHeaderRanges((prev) => ({
                                ...prev,
                                [tpl.id]: { ...range, endRow: Number(e.target.value) },
                              }))
                            }
                          />
                          <input
                            className="field-input"
                            placeholder="Cột bắt đầu (VD: A)"
                            value={range.startCol}
                            onChange={(e) =>
                              setHeaderRanges((prev) => ({
                                ...prev,
                                [tpl.id]: { ...range, startCol: e.target.value.toUpperCase() },
                              }))
                            }
                          />
                          <input
                            className="field-input"
                            placeholder="Cột kết thúc (VD: S)"
                            value={range.endCol}
                            onChange={(e) =>
                              setHeaderRanges((prev) => ({
                                ...prev,
                                [tpl.id]: { ...range, endCol: e.target.value.toUpperCase() },
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={async () => {
                    if (!file) {
                      setError('Vui lòng tải lên file mẫu để lấy tiêu đề.');
                      return;
                    }
                    const invalidRange = learnedTemplates.find((tpl) => {
                      const range = headerRanges[tpl.id];
                      if (!range) return true;
                      if (!range.startCol || !range.endCol) return true;
                      if (range.startRow <= 0 || range.endRow <= 0) return true;
                      if (range.endRow < range.startRow) return true;
                      return false;
                    });
                    if (invalidRange) {
                      setError('Vui lòng nhập đúng vùng tiêu đề cho tất cả biểu mẫu.');
                      return;
                    }
                    try {
                      await saveTemplates(learnedTemplates, file);
                    } catch (saveError) {
                      setError(
                        saveError instanceof Error
                          ? saveError.message
                          : 'Không thể lưu biểu mẫu. Vui lòng kiểm tra lại cấu hình lưu trữ.',
                      );
                    }
                  }}
                  className="primary-btn flex-1"
                  disabled={!allConfirmed || isSavingTemplates}
                >
                  {isSavingTemplates ? saveProgressLabel || 'Đang lưu biểu mẫu...' : 'Lưu tất cả biểu mẫu'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!previewTemplateId && learnedTemplates.length > 0) {
                      setPreviewTemplateId(learnedTemplates[0].id);
                    }
                    setIsPreviewModalOpen(true);
                  }}
                  className="secondary-btn flex items-center gap-2"
                  disabled={learnedTemplates.length === 0}
                >
                  <Eye size={16} />
                  Xem biểu mẫu
                </button>
                <button onClick={() => setLearnedTemplates([])} className="secondary-btn">
                  Hủy
                </button>
              </div>
            </div>
          )}
          </div>

          <div className="panel-card rounded-[24px] p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="section-title text-base">Xem trước biểu mẫu</h3>
              <span className="text-xs text-[var(--ink-soft)]">Preview theo file AI đã tải</span>
            </div>

            {learnedTemplates.length > 0 && (
              <div className="mt-4">
                <label className="col-header mb-2 block">Biểu mẫu cần xem</label>
                <select
                  value={previewTemplateId || ''}
                  onChange={(event) => setPreviewTemplateId(event.target.value)}
                  className="field-select"
                >
                  {learnedTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.sheetName})
                    </option>
                  ))}
                </select>
              </div>
            )}

          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
            {learnedTemplates.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">
                Sau khi AI học biểu, bấm <strong>Xem biểu mẫu</strong> để mở cửa sổ xem chi tiết với không gian rộng hơn.
              </p>
            ) : isPreviewLoading ? (
              <div className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
                <Loader2 size={16} className="animate-spin" />
                Đang tải giao diện biểu mẫu...
              </div>
            ) : (
              <p className="text-sm font-semibold text-[var(--ink)]">
                Preview hiện tại chỉ hiển thị trong cửa sổ mới; bấm “Xem biểu mẫu” để xem toàn bộ bảng.
              </p>
            )}
          </div>
          </div>
        </div>
      )}

      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[rgba(15,15,15,0.75)] p-4">
          <div className="panel-card flex w-full max-w-6xl flex-col overflow-hidden rounded-[30px] shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-4">
              <div>
                <div className="surface-tag">{learnedTemplates.find((tpl) => tpl.id === previewTemplateId)?.name || 'Preview biểu mẫu'}</div>
                <h3 className="section-title mt-2 text-lg">Preview biểu mẫu</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="secondary-btn flex items-center gap-2"
              >
                <X size={16} />
                Đóng
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {isPreviewLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
                  <Loader2 size={16} className="animate-spin" />
                  Đang tải preview...
                </div>
              ) : previewRows.length > 0 ? (
                <div className="min-w-full overflow-x-auto">
                  <table className="min-w-[720px] border-collapse border border-[var(--line)] text-xs">
                    <tbody>
                      {previewRows.map((row, rowIndex) => (
                        <tr key={`preview-row-modal-${rowIndex}`} className="border-b border-[var(--line)]">
                          {row.map((cell, cellIndex) => (
                            <td
                              key={`preview-cell-modal-${rowIndex}-${cellIndex}`}
                              className={`min-w-[100px] border-r border-b border-[var(--line)] px-2 py-1.5 align-top ${
                                rowIndex < 3 ? 'font-semibold text-[var(--primary-dark)]' : 'text-[var(--ink)]'
                              }`}
                            >
                              {cell || '\u00A0'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">
                  Không có dữ liệu preview. Hãy kiểm tra lại sheet và vùng header.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {isManualPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[rgba(15,15,15,0.75)] p-3 md:p-4">
          <div
            className="panel-card flex w-full max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[28px] shadow-xl transition-all"
            style={manualPreviewPanelStyle}
          >
            <div className="flex flex-col gap-3 border-b border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
              <div>
                <div className="surface-tag">{manualForm.name || 'Preview biểu mẫu thủ công'}</div>
                <h3 className="section-title mt-2 text-lg">Xem trước biểu mẫu</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
                  Popup này dùng để soi biểu rõ hơn và, với Thiết lập nhanh trên desktop, có thể kéo chọn trực tiếp để điền thông số xuống form.
                </p>
              </div>
              <div className="flex items-center gap-2 self-end md:self-auto">
                {manualForm.sheetName && (
                  <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                    {manualForm.sheetName}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsManualPreviewExpanded((prev) => !prev)}
                  className="secondary-btn inline-flex items-center gap-2"
                >
                  {isManualPreviewExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  {isManualPreviewExpanded ? 'Thu gọn' : 'Phóng to'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsManualPreviewModalOpen(false);
                    setIsManualPreviewExpanded(false);
                    clearManualPreviewSelectionDraft();
                    setManualPreviewActionMessage(null);
                    setManualPreviewUndoStack([]);
                  }}
                  className="secondary-btn inline-flex items-center gap-2"
                >
                  <X size={16} />
                  Đóng
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  {manualSetupView === 'QUICK' ? 'Thiết lập nhanh' : 'Thiết lập nâng cao'}
                </span>
                <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                  {manualReadinessChecks.filter((item) => item.ready).length}/{manualReadinessChecks.length} mục đã sẵn sàng
                </span>
                {manualForm.enableAdvancedStructure && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-700">
                    {manualForm.blocks.length} khối nâng cao
                  </span>
                )}
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {previewLegend.map((item) => (
                  <span
                    key={`manual-preview-legend-modal-${item.label}`}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${item.className}`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>

              {canUseManualPreviewSelection ? (
                <div className="mb-4 rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {([
                          ['LABEL', 'Chọn tiêu chí dọc'],
                          ['HEADER', 'Chọn tiêu đề ngang'],
                          ['DATA', 'Chọn vùng dữ liệu'],
                          ['SKIP_ROWS', 'Chọn dòng bỏ qua'],
                        ] as Array<[ManualPreviewSelectionMode, string]>).map(([modeKey, label]) => (
                          <button
                            key={modeKey}
                            type="button"
                            onClick={() => handleManualPreviewModeChange(modeKey)}
                            className={manualPreviewSelectionMode === modeKey ? 'primary-btn' : 'secondary-btn'}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleUndoManualPreviewSelection}
                          className="secondary-btn"
                          disabled={manualPreviewUndoStack.length === 0}
                        >
                          Hoàn tác lần chọn gần nhất
                        </button>
                      </div>
                    </div>
                    <div className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
                      Đang chọn: {manualPreviewSelectionModeLabel}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{manualPreviewSelectionHint}</p>
                  {manualPreviewActionMessage && (
                    <div className="mt-3 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium leading-5 text-emerald-700">
                      {manualPreviewActionMessage}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-4 rounded-[18px] border border-[var(--line)] bg-[rgba(179,15,20,0.04)] px-4 py-4 text-sm leading-6 text-[var(--ink)]">
                  {manualPreviewSelectionHint}
                </div>
              )}

              <div className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white">
                {isManualPreviewLoading ? (
                  <div className="flex h-[65vh] items-center justify-center text-sm text-[var(--ink-soft)]">
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Đang dựng preview từ file mẫu...
                  </div>
                ) : manualWorksheetPreview ? (
                  <div className="max-h-[65vh] overflow-auto">
                    <table className="min-w-full border-collapse text-xs md:text-[12px]">
                      <thead className="sticky top-0 z-10 bg-[var(--surface-soft)]">
                        <tr>
                          <th className="border-b border-r border-[var(--line)] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                            Dòng
                          </th>
                          {manualWorksheetPreview.headers.map((header) => (
                            <th
                              key={`manual-preview-modal-header-${header}`}
                              className="border-b border-r border-[var(--line)] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {manualWorksheetPreview.rows.map((row) => (
                          <tr key={`manual-preview-modal-row-${row.rowNumber}`}>
                            <td
                              className={`border-b border-r border-[var(--line)] bg-[var(--surface-soft)] px-2 py-2 text-center text-[10px] font-bold text-[var(--ink-soft)] ${
                                canUseManualPreviewSelection && manualPreviewSelectionMode === 'SKIP_ROWS'
                                  ? 'cursor-pointer transition hover:bg-slate-100'
                                  : ''
                              } ${manualPreviewConfig.specialRows.has(row.rowNumber) ? 'bg-slate-100 text-slate-700' : ''}`}
                              onClick={() => {
                                if (canUseManualPreviewSelection && manualPreviewSelectionMode === 'SKIP_ROWS') {
                                  toggleManualSpecialRow(row.rowNumber);
                                }
                              }}
                            >
                              {row.rowNumber}
                            </td>
                            {row.cells.map((cell, cellIndex) => {
                              const columnLetter = XLSX.utils.encode_col(manualWorksheetPreview.startCol + cellIndex);
                              return (
                                <td
                                  key={`manual-preview-modal-cell-${row.rowNumber}-${columnLetter}`}
                                  onMouseDown={(event) => {
                                    if (!canUseManualPreviewSelection || manualPreviewSelectionMode === 'SKIP_ROWS') {
                                      return;
                                    }
                                    event.preventDefault();
                                    setManualPreviewSelectionStart({ rowNumber: row.rowNumber, columnLetter });
                                    setManualPreviewSelectionCurrent({ rowNumber: row.rowNumber, columnLetter });
                                    setIsManualPreviewDragging(true);
                                    setManualPreviewActionMessage(null);
                                  }}
                                  onMouseEnter={() => {
                                    if (!canUseManualPreviewSelection || !isManualPreviewDragging || manualPreviewSelectionMode === 'SKIP_ROWS') {
                                      return;
                                    }
                                    setManualPreviewSelectionCurrent({ rowNumber: row.rowNumber, columnLetter });
                                  }}
                                  className={`min-w-[110px] border-b border-r border-[var(--line)] px-3 py-2 align-top text-[11px] text-[var(--ink)] md:min-w-[132px] md:text-[12px] ${
                                    canUseManualPreviewSelection && manualPreviewSelectionMode !== 'SKIP_ROWS' ? 'cursor-crosshair select-none' : ''
                                  } ${getManualPreviewCellTone(row.rowNumber, columnLetter)} ${getManualPreviewSelectionTone(row.rowNumber, columnLetter)}`}
                                >
                                  {cell || '\u00A0'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex h-[65vh] items-center justify-center px-4 text-center text-sm text-[var(--ink-soft)]">
                    Hãy tải file mẫu và chọn đúng sheet để xem trước biểu mẫu.
                  </div>
                )}
              </div>
              {isDesktopPreviewViewport && !isManualPreviewExpanded && (
                <div className="mt-3 hidden items-center justify-end md:flex">
                  <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                    Kéo góc phải dưới để mở rộng cửa sổ
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 md:px-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-[12px] leading-5 text-[var(--ink-soft)]">
                  Sau khi chọn đúng vùng trong preview, bấm <strong>Lưu thông số vào thiết lập</strong> để xác nhận và quay lại form.
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmManualPreviewSelection}
                    disabled={!canUseManualPreviewSelection || !canConfirmManualPreviewSelection}
                    className="primary-btn inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Save size={15} />
                    Lưu thông số vào thiết lập
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'MANUAL' && (
        <div className="w-full space-y-6">
          <div className="panel-card rounded-[24px] p-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="section-title">Tạo biểu mẫu thủ công</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                  Chúng ta sẽ đi theo đúng 3 bước cơ bản: chọn sheet, xác định vùng tiêu chí, rồi xác định vùng số liệu.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyManualPreset('B1')} className="secondary-btn">
                  Điền nhanh B1
                </button>
                <button type="button" onClick={() => applyManualPreset('B2')} className="secondary-btn">
                  Điền nhanh B2
                </button>
                <button type="button" onClick={handleOpenManualPreview} className="secondary-btn inline-flex items-center gap-2">
                  <Eye size={14} />
                  Xem trước biểu
                </button>
                <button type="button" onClick={handleResetManualConfiguration} className="secondary-btn inline-flex items-center gap-2">
                  <RotateCcw size={14} />
                  Xóa cấu hình
                </button>
              </div>
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setManualSetupView('QUICK')}
                className={manualSetupView === 'QUICK' ? 'primary-btn' : 'secondary-btn'}
              >
                Thiết lập nhanh
              </button>
              <button
                type="button"
                onClick={() => setManualSetupView('ADVANCED')}
                className={manualSetupView === 'ADVANCED' ? 'primary-btn' : 'secondary-btn'}
              >
                Thiết lập nâng cao
              </button>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
                {manualSetupView === 'QUICK'
                  ? 'Dành cho người mới làm quen với việc cấu hình biểu'
                  : 'Hiện thêm khối dữ liệu, chỉ số khóa và các cấu hình sâu'}
              </span>
            </div>

            <div className="mb-5 rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">Mẹo thiết lập 3 bước</p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-[16px] bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--ink)]">Bước 1. Chọn đúng sheet</p>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--ink-soft)]">
                    Tải file mẫu gốc, rồi chọn đúng sheet đang chứa biểu cần cấu hình.
                  </p>
                </div>
                <div className="rounded-[16px] bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--ink)]">Bước 2. Đánh dấu vùng tiêu chí</p>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--ink-soft)]">
                    Xác định cột tên chỉ tiêu và các dòng tiêu đề ngang để hệ thống hiểu đúng cấu trúc biểu.
                  </p>
                </div>
                <div className="rounded-[16px] bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--ink)]">Bước 3. Chốt vùng số liệu</p>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--ink-soft)]">
                    Chỉ chọn những cột và dòng thật sự chứa số cần tổng hợp, sau đó xem lại phần kiểm tra nhanh bên dưới.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-5 rounded-[18px] border border-[var(--line)] bg-white px-4 py-4">
              {manualSetupView === 'QUICK' ? (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">Ví dụ nhanh kiểu B1</p>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    Một biểu có 1 bảng liên tục, 1 vùng tiêu đề ngang và 1 vùng số liệu.
                  </p>
                  <div className="space-y-1 text-[12px] leading-5 text-[var(--ink-soft)]">
                    <p>- Tên chỉ tiêu thường nằm ở cột A hoặc A-B.</p>
                    <p>- Các cột số liệu thường chạy liên tục như B-E hoặc C-I.</p>
                    <p>- Người mới nên bắt đầu từ chế độ này để khai báo nhanh một biểu cơ bản.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">Ví dụ kiểu B2 / nhiều khối</p>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    Một sheet có nhiều cụm tiêu đề và nhiều cụm số liệu tách biệt trong cùng trang.
                  </p>
                  <div className="space-y-1 text-[12px] leading-5 text-[var(--ink-soft)]">
                    <p>- Mỗi cụm sẽ khai báo thành một khối tiêu đề - dữ liệu riêng.</p>
                    <p>- Thường dùng khi biểu có Khối 1, Khối 2, Khối 3 xếp nối tiếp nhau theo chiều dọc.</p>
                    <p>- Nếu file nhìn như nhiều bảng nhỏ ghép trong một sheet, hãy dùng chế độ này.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px] xl:col-start-1">
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Tên biểu mẫu
                      <input
                        className="field-input mt-2"
                        placeholder="Ví dụ: Biểu B1 - Công tác phát triển đảng viên"
                        value={manualForm.name}
                        onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                      />
                    </label>
                    <p className="mt-2 text-[12px] leading-5 text-[var(--ink-soft)]">
                      Hãy đặt tên theo cách người nhập liệu dễ nhận ra ngay biểu nào đang dùng.
                    </p>
                  </div>
                  <div className="panel-soft rounded-[18px] p-4">
                    <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      File mẫu để đọc sheet
                    </p>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleManualFileChange}
                      className="field-input"
                      disabled={!project}
                    />
                    {manualFile && (
                      <p className="mt-2 text-xs text-[var(--ink-soft)]">Đang dùng: {manualFile.name}</p>
                    )}
                    <p className="mt-2 text-[11px] leading-5 text-[var(--ink-soft)]">
                      Tải đúng file Excel gốc để chúng ta chọn sheet và soi vùng tiêu đề cho chính xác.
                    </p>
                  </div>
                </div>

                <div className="rounded-[18px] border border-[var(--line)] bg-[rgba(179,15,20,0.04)] px-4 py-4 xl:col-start-2 xl:row-start-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    Hệ thống đang hiểu cấu hình này như sau
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink)]">
                    {manualSummaryLines.map((line, index) => (
                      <p key={`manual-summary-${index}`}>- {line}</p>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:col-start-2 xl:row-start-2 xl:grid-cols-1">
                  <div className="rounded-[18px] border border-[var(--line)] bg-white px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Hiểu nhanh 1
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--ink)]">Tiêu chí dọc là gì?</p>
                    <p className="mt-2 text-[12px] leading-5 text-[var(--ink-soft)]">
                      Đây là cột hoặc nhóm cột ghi tên chỉ tiêu, ví dụ tên hạng mục, tên nội dung, tên đối tượng cần thống kê.
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[var(--line)] bg-white px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Hiểu nhanh 2
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--ink)]">Tiêu chí ngang là gì?</p>
                    <p className="mt-2 text-[12px] leading-5 text-[var(--ink-soft)]">
                      Đây là phần tiêu đề phía trên các cột số liệu, ví dụ Tổng số, Nam, Nữ, Tăng, Giảm...
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[var(--line)] bg-white px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Hiểu nhanh 3
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--ink)]">Vùng dữ liệu là gì?</p>
                    <p className="mt-2 text-[12px] leading-5 text-[var(--ink-soft)]">
                      Đây là khu vực chứa các con số thực tế cần tổng hợp. Chỉ những ô nằm trong vùng này mới được hệ thống đọc.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 xl:col-start-1 xl:row-span-3 xl:mt-0">
                  <div className="panel-soft rounded-[18px] p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                      <div>
                        <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          Tên sheet
                        </p>
                        <select
                          value={manualForm.sheetName}
                          onChange={(e) => setManualForm({ ...manualForm, sheetName: e.target.value })}
                          className="field-select"
                          disabled={manualSheetNames.length === 0}
                        >
                          <option value="">{manualSheetNames.length > 0 ? '-- Chọn sheet --' : 'Hãy tải file mẫu trước'}</option>
                          {manualSheetNames.map((sheetName) => (
                            <option key={sheetName} value={sheetName}>
                              {sheetName}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-[11px] leading-5 text-[var(--ink-soft)]">
                          Chỉ chọn đúng sheet chứa biểu cần thiết lập. Nếu file có nhiều sheet, mỗi sheet sẽ tạo thành một biểu riêng.
                        </p>
                      </div>
                      <div>
                        <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          Tên cột hiển thị trên báo cáo (tùy chọn)
                        </p>
                        <input
                          className="field-input"
                          placeholder="Ví dụ: Tổng số, Thành lập mới, Giải thể"
                          value={manualForm.columnHeaders}
                          onChange={(e) => setManualForm({ ...manualForm, columnHeaders: e.target.value })}
                        />
                        <p className="mt-2 text-[11px] leading-5 text-[var(--ink-soft)]">
                          Nếu bạn muốn đổi tên cột khi hiển thị báo cáo, nhập theo thứ tự cột dữ liệu, cách nhau bằng dấu phẩy.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className={`panel-soft rounded-[18px] p-4 ${getManualSectionHighlightClass('LABEL')}`}>
                      <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        1. Tiêu chí dọc
                      </p>
                      <div className="space-y-2.5 text-[14px] font-semibold text-[var(--ink)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Cột tên tiêu chí:</span>
                          <input
                            className="field-input h-11 min-w-[110px] flex-1 text-[15px] font-semibold"
                            placeholder="VD: A"
                            value={manualForm.labelColumn}
                            onChange={(e) => setManualForm({ ...manualForm, labelColumn: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Cột tiêu chí dọc từ:</span>
                          <input
                            className="field-input h-11 w-[92px] text-[15px] font-semibold"
                            placeholder="A"
                            value={manualForm.labelColumnStart}
                            onChange={(e) => setManualForm({ ...manualForm, labelColumnStart: e.target.value.toUpperCase() })}
                          />
                          <span className="text-[15px] font-bold text-[var(--ink-soft)]">-</span>
                          <input
                            className="field-input h-11 w-[92px] text-[15px] font-semibold"
                            placeholder="B"
                            value={manualForm.labelColumnEnd}
                            onChange={(e) => setManualForm({ ...manualForm, labelColumnEnd: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Cột hiển thị chính:</span>
                          <FieldHelpBadge text="Đây là cột hệ thống sẽ dùng làm tên chỉ tiêu chính khi hiển thị ra báo cáo hoặc danh sách dữ liệu." />
                          <input
                            className="field-input h-11 min-w-[110px] flex-1 text-[15px] font-semibold"
                            placeholder="VD: B"
                            value={manualForm.primaryLabelColumn}
                            onChange={(e) => setManualForm({ ...manualForm, primaryLabelColumn: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Bắt đầu từ dòng:</span>
                          <input
                            className="field-input h-11 w-[110px] text-[15px] font-semibold"
                            type="number"
                            value={manualForm.verticalHeaderStartRow}
                            onChange={(e) =>
                              setManualForm({ ...manualForm, verticalHeaderStartRow: Number(e.target.value) })
                            }
                          />
                          <span className="min-w-[140px] pl-1">- Kết thúc ở dòng:</span>
                          <input
                            className="field-input h-11 w-[110px] text-[15px] font-semibold"
                            type="number"
                            value={manualForm.verticalHeaderEndRow}
                            onChange={(e) =>
                              setManualForm({ ...manualForm, verticalHeaderEndRow: Number(e.target.value) })
                            }
                          />
                        </div>
                        <p className="pt-1 text-[12px] font-medium leading-5 text-[var(--ink-soft)]">
                          Dùng cho biểu như <strong>B1</strong> khi tiêu chí dọc trải trên nhiều cột, ví dụ
                          <code className="mx-1">A:B</code> nhưng tên tiêu chí chính nằm ở <code>B</code>.
                        </p>
                        <p className="text-[11px] leading-5 text-[var(--ink-soft)]">
                          Nếu chưa chắc, hãy bấm <strong>Xem trước biểu</strong>; vùng xanh lam trong cửa sổ preview là nơi hệ thống đang hiểu là cột tên chỉ tiêu.
                        </p>
                      </div>
                    </div>

                    <div className={`panel-soft rounded-[18px] p-4 ${getManualSectionHighlightClass('HEADER')}`}>
                      <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        2. Tiêu chí ngang
                      </p>
                      <div className="space-y-2.5 text-[14px] font-semibold text-[var(--ink)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Bắt đầu từ dòng:</span>
                          <input
                            className="field-input h-11 w-[120px] text-[15px] font-semibold"
                            type="number"
                            value={manualForm.horizontalHeaderStartRow}
                            onChange={(e) =>
                              setManualForm({ ...manualForm, horizontalHeaderStartRow: Number(e.target.value) })
                            }
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Kết thúc ở dòng:</span>
                          <input
                            className="field-input h-11 w-[120px] text-[15px] font-semibold"
                            type="number"
                            value={manualForm.horizontalHeaderEndRow}
                            onChange={(e) =>
                              setManualForm({ ...manualForm, horizontalHeaderEndRow: Number(e.target.value) })
                            }
                          />
                        </div>
                        <p className="pt-1 text-[12px] font-medium leading-5 text-[var(--ink-soft)]">
                          Nhập đúng vùng tiêu đề ngang để hệ thống vẽ lại khung biểu giống file Excel gốc.
                        </p>
                        <p className="text-[11px] leading-5 text-[var(--ink-soft)]">
                          Ví dụ biểu có 2 dòng tiêu đề thì nhập từ dòng đầu tiêu đề đến dòng cuối tiêu đề, không nhập sang phần số liệu.
                        </p>
                      </div>
                    </div>

                    <div
                      className={`panel-soft rounded-[18px] p-4 ${
                        manualPreviewLastAppliedSection === 'DATA' || manualPreviewLastAppliedSection === 'SKIP_ROWS'
                          ? 'ring-2 ring-[rgba(217,159,43,0.55)] shadow-[0_0_0_3px_rgba(217,159,43,0.12)]'
                          : ''
                      }`}
                    >
                      <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        3. Vùng lấy dữ liệu
                      </p>
                      <div className="space-y-2.5 text-[14px] font-semibold text-[var(--ink)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Các cột chứa số liệu:</span>
                          <input
                            className="field-input h-11 min-w-[180px] flex-1 text-[15px] font-semibold"
                            placeholder="VD: A-C, F hoặc B,D,G"
                            value={manualForm.dataColumns}
                            onChange={(e) => setManualForm({ ...manualForm, dataColumns: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Dòng bỏ qua:</span>
                          <FieldHelpBadge text="Dùng khi trong vùng số liệu có các dòng ghi chú, dòng cộng phụ hoặc dòng không muốn hệ thống đọc vào kết quả tổng hợp." />
                          <input
                            className="field-input h-11 min-w-[180px] flex-1 text-[15px] font-semibold"
                            placeholder="VD: 34 hoặc 34,56-58"
                            value={manualForm.specialRows}
                            onChange={(e) => setManualForm({ ...manualForm, specialRows: e.target.value })}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[148px]">- Bắt đầu từ dòng:</span>
                          <input
                            className="field-input h-11 w-[110px] text-[15px] font-semibold"
                            type="number"
                            value={manualForm.startRow}
                            onChange={(e) => setManualForm({ ...manualForm, startRow: Number(e.target.value) })}
                          />
                          <span className="min-w-[140px] pl-1">- Kết thúc ở dòng:</span>
                          <input
                            className="field-input h-11 w-[110px] text-[15px] font-semibold"
                            type="number"
                            value={manualForm.endRow}
                            onChange={(e) => setManualForm({ ...manualForm, endRow: Number(e.target.value) })}
                          />
                        </div>
                        <p className="text-[11px] leading-5 text-[var(--ink-soft)]">
                          Vùng dữ liệu là nơi chứa số cần tổng hợp. Hệ thống sẽ đọc đúng các cột đã khai báo trong khoảng dòng này.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {manualSetupView === 'ADVANCED' ? (
                  <>
                    <div className="mt-4 panel-soft rounded-[18px] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        4. Cấu hình nâng cao theo khối tiêu đề - dữ liệu
                      </p>
                      <p className="mt-2 text-[11px] leading-5 text-[var(--ink-soft)]">
                        Dùng cho biểu như <strong>B2</strong> khi trong cùng một sheet có nhiều vùng tiêu đề ngang và nhiều vùng số liệu độc lập.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
                      <input
                        type="checkbox"
                        checked={manualForm.enableAdvancedStructure}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setManualSetupView('ADVANCED');
                          }
                          setManualForm((prev) => ({
                            ...prev,
                            enableAdvancedStructure: e.target.checked,
                            blocks: e.target.checked && prev.blocks.length === 0 ? [createDefaultManualBlock()] : prev.blocks,
                          }));
                        }}
                      />
                      Bật cấu hình nhiều khối tiêu đề - dữ liệu
                    </label>
                  </div>

                  {manualForm.enableAdvancedStructure && (
                    <div className="mt-4 space-y-4">
                      {manualForm.blocks.map((block, index) => (
                        <div key={block.id} className="rounded-[18px] border border-[var(--line)] bg-white p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-[var(--ink)]">Khối {index + 1}</p>
                              <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                                Mỗi khối là một cụm tiêu đề và số liệu riêng. Dùng khi cùng một sheet có nhiều bảng nhỏ tách biệt trong cùng một trang.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeManualBlock(block.id)}
                              className="secondary-btn inline-flex items-center gap-2 text-[var(--primary)]"
                            >
                              <Trash2 size={14} />
                              Xóa khối tiêu đề - dữ liệu
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Tên khối
                              <input
                                className="field-input mt-2"
                                value={block.name}
                                onChange={(e) => updateManualBlock(block.id, { name: e.target.value })}
                                placeholder="Ví dụ: Khối 1"
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Cột dữ liệu
                              <input
                                className="field-input mt-2"
                                value={block.dataColumns}
                                onChange={(e) => updateManualBlock(block.id, { dataColumns: e.target.value.toUpperCase() })}
                                placeholder="VD: B-I hoặc C,D,E"
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Tiêu đề trên bắt đầu từ dòng
                              <input
                                type="number"
                                className="field-input mt-2"
                                value={block.headerStartRow}
                                onChange={(e) => updateManualBlock(block.id, { headerStartRow: Number(e.target.value) })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Tiêu đề dưới kết thúc ở dòng
                              <input
                                type="number"
                                className="field-input mt-2"
                                value={block.headerEndRow}
                                onChange={(e) => updateManualBlock(block.id, { headerEndRow: Number(e.target.value) })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Tiêu đề ngang bắt đầu từ cột
                              <input
                                className="field-input mt-2"
                                value={block.headerStartCol}
                                onChange={(e) => updateManualBlock(block.id, { headerStartCol: e.target.value.toUpperCase() })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Tiêu đề ngang kết thúc ở cột
                              <input
                                className="field-input mt-2"
                                value={block.headerEndCol}
                                onChange={(e) => updateManualBlock(block.id, { headerEndCol: e.target.value.toUpperCase() })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Cột tiêu chí dọc bắt đầu
                              <input
                                className="field-input mt-2"
                                value={block.labelColumnStart}
                                onChange={(e) => updateManualBlock(block.id, { labelColumnStart: e.target.value.toUpperCase() })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Cột tiêu chí dọc kết thúc
                              <input
                                className="field-input mt-2"
                                value={block.labelColumnEnd}
                                onChange={(e) => updateManualBlock(block.id, { labelColumnEnd: e.target.value.toUpperCase() })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Cột hiển thị tên tiêu chí chính
                              <input
                                className="field-input mt-2"
                                value={block.primaryLabelColumn}
                                onChange={(e) => updateManualBlock(block.id, { primaryLabelColumn: e.target.value.toUpperCase() })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Dòng chứa số liệu bắt đầu
                              <input
                                type="number"
                                className="field-input mt-2"
                                value={block.startRow}
                                onChange={(e) => updateManualBlock(block.id, { startRow: Number(e.target.value) })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Dòng chứa số liệu kết thúc
                              <input
                                type="number"
                                className="field-input mt-2"
                                value={block.endRow}
                                onChange={(e) => updateManualBlock(block.id, { endRow: Number(e.target.value) })}
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                              Dòng bỏ qua khi tổng hợp
                              <input
                                className="field-input mt-2"
                                value={block.specialRows}
                                onChange={(e) => updateManualBlock(block.id, { specialRows: e.target.value })}
                                placeholder="VD: 34 hoặc 34,56-58"
                              />
                            </label>
                            <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-2">
                              Tên cột hiển thị của khối (tùy chọn)
                              <input
                                className="field-input mt-2"
                                value={block.columnHeaders}
                                onChange={(e) => updateManualBlock(block.id, { columnHeaders: e.target.value })}
                                placeholder="VD: Tổng số, Nam, Nữ"
                              />
                            </label>
                          </div>
                        </div>
                      ))}

                      <button type="button" onClick={addManualBlock} className="secondary-btn inline-flex items-center gap-2">
                        <Plus size={14} />
                        Thêm khối tiêu đề - dữ liệu
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 panel-soft rounded-[18px] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          Chỉ số khóa nhận diện sheet
                        </p>
                        <FieldHelpBadge text="Đây là vùng hệ thống dùng để đối chiếu xem file người dùng nộp lên có đúng cấu trúc của biểu mẫu đã thiết lập hay không." />
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-[var(--ink-soft)]">
                        Hệ thống dùng hàng đầu, hàng cuối và số dòng ở giữa để kiểm tra file tiếp nhận có đúng mẫu hay không.
                      </p>
                    </div>
                    <div className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      Số dòng giữa: {Math.max(0, Number(manualForm.signatureEndRow) - Number(manualForm.signatureStartRow) - 1)}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <input
                      type="number"
                      className="field-input"
                      placeholder="Dòng đầu"
                      value={manualForm.signatureStartRow}
                      onChange={(e) => setManualForm({ ...manualForm, signatureStartRow: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      className="field-input"
                      placeholder="Dòng cuối"
                      value={manualForm.signatureEndRow}
                      onChange={(e) => setManualForm({ ...manualForm, signatureEndRow: Number(e.target.value) })}
                    />
                    <input
                      className="field-input"
                      placeholder="Cột đầu"
                      value={manualForm.signatureStartCol}
                      onChange={(e) => setManualForm({ ...manualForm, signatureStartCol: e.target.value.toUpperCase() })}
                    />
                    <input
                      className="field-input"
                      placeholder="Cột cuối"
                      value={manualForm.signatureEndCol}
                      onChange={(e) => setManualForm({ ...manualForm, signatureEndCol: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-[18px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--ink-soft)]">
                    Nếu sheet có nhiều vùng tiêu đề hoặc nhiều vùng số liệu tách biệt như <strong>B2</strong>, hãy chuyển sang <strong>Thiết lập nâng cao</strong> để khai báo khối tiêu đề - dữ liệu và chỉ số khóa nhận diện.
                  </div>
                )}
            </div>

            <div className="mt-6 rounded-[18px] border border-[var(--line)] bg-white px-4 py-4 xl:col-start-2 xl:mt-0">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">Kiểm tra nhanh cấu hình</p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--ink-soft)]">
                    Trước khi bấm tạo biểu mẫu, hãy xem còn mục nào chưa sẵn sàng.
                  </p>
                </div>
                <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
                  {manualReadinessChecks.filter((item) => item.ready).length}/{manualReadinessChecks.length} mục đã sẵn sàng
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {manualReadinessChecks.map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-[16px] border px-4 py-3 ${
                      item.ready
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-amber-200 bg-amber-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {item.ready ? (
                        <CheckCircle size={16} className="mt-0.5 text-emerald-600" />
                      ) : (
                        <AlertCircle size={16} className="mt-0.5 text-amber-600" />
                      )}
                      <div>
                        <p className={`text-sm font-semibold ${item.ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {item.label}
                        </p>
                        <p className={`mt-1 text-[12px] leading-5 ${item.ready ? 'text-emerald-700/80' : 'text-amber-700/80'}`}>
                          {item.hint}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

              <button
                onClick={handleManualCreate}
                disabled={!project || isCreatingManual || isSavingTemplates}
                className="primary-btn mt-6 flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} />
                {isCreatingManual || isSavingTemplates ? saveProgressLabel || 'Đang tạo biểu mẫu...' : 'Tạo biểu mẫu'}
              </button>

            {error && (
              <div className="mt-4 panel-card rounded-[18px] p-3 border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
                <AlertCircle size={16} />
                <p className="text-xs font-medium">{error}</p>
              </div>
            )}

            {notice && (
              <div className="mt-4 panel-card rounded-[18px] border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 flex items-center gap-2">
                <CheckCircle size={16} />
                <p className="text-xs font-medium">{notice}</p>
              </div>
            )}
          </div>

          <div className="panel-card rounded-[24px] p-6">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="section-title">Danh sách biểu mẫu đã tạo</h3>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Có thể sửa trực tiếp sau khi lưu. Chỉ khi bấm chốt biểu thì biểu đó mới được dùng ở mục Tiếp nhận dữ liệu.
                </p>
              </div>
              <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                Đã lưu {manualTemplates.length} biểu
              </div>
            </div>
            <div className="space-y-3">
              {manualTemplates.map((tpl) => (
                <div key={tpl.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--ink)]">{tpl.name || 'Biểu chưa đặt tên'}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                            tpl.isPublished
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {tpl.isPublished ? 'Đã chốt mẫu' : 'Đang là nháp'}
                        </span>
                        <span className="rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          {tpl.mode}
                        </span>
                        {!tpl.sourceWorkbookPath && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                            Chưa có file mẫu gốc
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">
                        Sheet: {tpl.sheetName} | File mẫu: {tpl.sourceWorkbookName || 'Chưa lưu file mẫu'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => saveStoredTemplate(tpl)}
                        disabled={savingTemplateId === tpl.id}
                        className="secondary-btn inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Save size={14} />
                        {savingTemplateId === tpl.id ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
                      </button>
                      <button
                        onClick={() => attachWorkbookToTemplate(tpl)}
                        disabled={!manualFile || attachingTemplateId === tpl.id}
                        className="secondary-btn inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <FileSpreadsheet size={14} />
                        {attachingTemplateId === tpl.id ? 'Đang gắn file...' : 'Gắn file mẫu gốc'}
                      </button>
                      <button
                        onClick={() => toggleTemplatePublished(tpl)}
                        disabled={savingTemplateId === tpl.id || deletingTemplateId === tpl.id}
                        className="primary-btn inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {tpl.isPublished ? <Unlock size={14} /> : <Lock size={14} />}
                        {tpl.isPublished ? 'Mở chốt' : 'Chốt biểu'}
                      </button>
                      <button
                        onClick={() => handleDeleteStoredTemplate(tpl)}
                        disabled={deletingTemplateId === tpl.id}
                        className="secondary-btn inline-flex items-center gap-2 text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                        {deletingTemplateId === tpl.id ? 'Đang xóa...' : 'Xóa biểu'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Tên biểu mẫu
                      <input
                        className="field-input mt-2"
                        value={tpl.name}
                        onChange={(e) => updateStoredTemplate(tpl.id, { name: e.target.value })}
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Tên sheet
                      <input
                        className="field-input mt-2"
                        value={tpl.sheetName}
                        onChange={(e) => updateStoredTemplate(tpl.id, { sheetName: e.target.value })}
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Cột tiêu chí dọc
                      <input
                        className="field-input mt-2"
                        value={tpl.columnMapping.labelColumn}
                        onChange={(e) => updateStoredTemplateMapping(tpl.id, { labelColumn: e.target.value.toUpperCase() })}
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Cột tiêu chí bắt đầu
                      <input
                        className="field-input mt-2"
                        value={tpl.columnMapping.labelColumnStart || tpl.columnMapping.labelColumn}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, { labelColumnStart: e.target.value.toUpperCase() })
                        }
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Cột tiêu chí kết thúc
                      <input
                        className="field-input mt-2"
                        value={tpl.columnMapping.labelColumnEnd || tpl.columnMapping.labelColumn}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, { labelColumnEnd: e.target.value.toUpperCase() })
                        }
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Cột chứa tên tiêu chí chính
                      <input
                        className="field-input mt-2"
                        value={tpl.columnMapping.primaryLabelColumn || tpl.columnMapping.labelColumn}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, { primaryLabelColumn: e.target.value.toUpperCase() })
                        }
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Cột dữ liệu
                      <input
                        className="field-input mt-2"
                        value={tpl.columnMapping.dataColumns.join(', ')}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, {
                            dataColumns: expandColumnSelection(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Dòng bắt đầu dữ liệu
                      <input
                        type="number"
                        className="field-input mt-2"
                        value={tpl.columnMapping.startRow}
                        onChange={(e) => updateStoredTemplateMapping(tpl.id, { startRow: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Dòng kết thúc dữ liệu
                      <input
                        type="number"
                        className="field-input mt-2"
                        value={tpl.columnMapping.endRow}
                        onChange={(e) => updateStoredTemplateMapping(tpl.id, { endRow: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-2">
                      Dòng đặc biệt bỏ qua khi tổng hợp
                      <input
                        className="field-input mt-2"
                        placeholder="VD: 34 hoặc 34,56-58"
                        value={(tpl.columnMapping.specialRows || []).join(', ')}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, {
                            specialRows: expandRowSelection(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-2">
                      Tiêu đề cột ngang (phân cách bằng dấu phẩy)
                      <input
                        className="field-input mt-2"
                        value={tpl.columnHeaders.join(', ')}
                        onChange={(e) =>
                          updateStoredTemplate(tpl.id, {
                            columnHeaders: e.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-white/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          Chỉ số khóa nhận diện sheet
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-[var(--ink-soft)]">
                          Thiết lập hàng đầu, hàng cuối và vùng cột để kiểm tra file tiếp nhận đúng mẫu. Hệ thống tự đọc file mẫu gốc khi bạn bấm lưu.
                        </p>
                      </div>
                      <div className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        Số dòng giữa:{' '}
                        {Math.max(
                          0,
                          Number(tpl.columnMapping.sheetSignature?.headerEndRow || 1) -
                            Number(tpl.columnMapping.sheetSignature?.headerStartRow || 1) -
                            1,
                        )}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <input
                        type="number"
                        className="field-input"
                        placeholder="Dòng đầu"
                        value={tpl.columnMapping.sheetSignature?.headerStartRow || 1}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, {
                            sheetSignature: normalizeSheetSignatureDraft({
                              headerStartRow: Number(e.target.value),
                              headerEndRow: tpl.columnMapping.sheetSignature?.headerEndRow || 1,
                              headerStartCol: tpl.columnMapping.sheetSignature?.headerStartCol || 'A',
                              headerEndCol: tpl.columnMapping.sheetSignature?.headerEndCol || 'A',
                            }),
                          })
                        }
                      />
                      <input
                        type="number"
                        className="field-input"
                        placeholder="Dòng cuối"
                        value={tpl.columnMapping.sheetSignature?.headerEndRow || 1}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, {
                            sheetSignature: normalizeSheetSignatureDraft({
                              headerStartRow: tpl.columnMapping.sheetSignature?.headerStartRow || 1,
                              headerEndRow: Number(e.target.value),
                              headerStartCol: tpl.columnMapping.sheetSignature?.headerStartCol || 'A',
                              headerEndCol: tpl.columnMapping.sheetSignature?.headerEndCol || 'A',
                            }),
                          })
                        }
                      />
                      <input
                        className="field-input"
                        placeholder="Cột đầu"
                        value={tpl.columnMapping.sheetSignature?.headerStartCol || 'A'}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, {
                            sheetSignature: normalizeSheetSignatureDraft({
                              headerStartRow: tpl.columnMapping.sheetSignature?.headerStartRow || 1,
                              headerEndRow: tpl.columnMapping.sheetSignature?.headerEndRow || 1,
                              headerStartCol: e.target.value.toUpperCase(),
                              headerEndCol: tpl.columnMapping.sheetSignature?.headerEndCol || 'A',
                            }),
                          })
                        }
                      />
                      <input
                        className="field-input"
                        placeholder="Cột cuối"
                        value={tpl.columnMapping.sheetSignature?.headerEndCol || 'A'}
                        onChange={(e) =>
                          updateStoredTemplateMapping(tpl.id, {
                            sheetSignature: normalizeSheetSignatureDraft({
                              headerStartRow: tpl.columnMapping.sheetSignature?.headerStartRow || 1,
                              headerEndRow: tpl.columnMapping.sheetSignature?.headerEndRow || 1,
                              headerStartCol: tpl.columnMapping.sheetSignature?.headerStartCol || 'A',
                              headerEndCol: e.target.value.toUpperCase(),
                            }),
                          })
                        }
                      />
                    </div>
                    {tpl.columnMapping.sheetSignature?.startRowText || tpl.columnMapping.sheetSignature?.endRowText ? (
                      <div className="mt-3 space-y-1 text-[11px] text-[var(--ink-soft)]">
                        <p>Hàng đầu đã lưu: {tpl.columnMapping.sheetSignature?.startRowText || '(trống)'}</p>
                        <p>Hàng cuối đã lưu: {tpl.columnMapping.sheetSignature?.endRowText || '(trống)'}</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-[var(--ink-soft)]">
                        Chưa lưu giá trị đối chiếu. Sau khi nhập các thông số này, bấm <strong>Lưu chỉnh sửa</strong> để hệ thống đọc file mẫu gốc và ghi lại chỉ số khóa.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-white/70 p-4">
                    <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          Cấu hình khối tiêu đề - dữ liệu
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-[var(--ink-soft)]">
                          Dùng cho các biểu nhiều vùng tiêu đề và vùng số liệu độc lập như B2.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addStoredTemplateBlock(tpl.id)}
                        className="secondary-btn inline-flex items-center gap-2"
                      >
                        <Plus size={14} />
                        Thêm khối tiêu đề - dữ liệu
                      </button>
                    </div>

                    {(tpl.columnMapping.blocks || []).length > 0 ? (
                      <div className="space-y-4">
                        {(tpl.columnMapping.blocks || []).map((block, index) => (
                          <div key={block.id} className="rounded-[16px] border border-[var(--line)] bg-white p-4">
                            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <p className="text-sm font-semibold text-[var(--ink)]">Khối {index + 1}</p>
                              <button
                                type="button"
                                onClick={() => removeStoredTemplateBlock(tpl.id, block.id)}
                                className="secondary-btn inline-flex items-center gap-2 text-[var(--primary)]"
                              >
                                <Trash2 size={14} />
                                Xóa khối tiêu đề - dữ liệu
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Tên khối
                                <input
                                  className="field-input mt-2"
                                  value={block.name}
                                  onChange={(e) => updateStoredTemplateBlock(tpl.id, block.id, { name: e.target.value })}
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Cột dữ liệu
                                <input
                                  className="field-input mt-2"
                                  value={block.dataColumns.join(', ')}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, { dataColumns: expandColumnSelection(e.target.value) })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Tiêu đề trên bắt đầu từ dòng
                                <input
                                  type="number"
                                  className="field-input mt-2"
                                  value={block.headerLayout?.startRow || block.startRow}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, {
                                      headerLayout: {
                                        ...(block.headerLayout || {
                                          startRow: block.startRow,
                                          endRow: block.startRow,
                                          startCol: 1,
                                          endCol: 1,
                                          cells: [],
                                          merges: [],
                                        }),
                                        startRow: Number(e.target.value),
                                      },
                                    })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Tiêu đề dưới kết thúc ở dòng
                                <input
                                  type="number"
                                  className="field-input mt-2"
                                  value={block.headerLayout?.endRow || block.endRow}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, {
                                      headerLayout: {
                                        ...(block.headerLayout || {
                                          startRow: block.startRow,
                                          endRow: block.endRow,
                                          startCol: 1,
                                          endCol: 1,
                                          cells: [],
                                          merges: [],
                                        }),
                                        endRow: Number(e.target.value),
                                      },
                                    })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Tiêu đề ngang bắt đầu từ cột
                                <input
                                  className="field-input mt-2"
                                  value={block.headerLayout ? XLSX.utils.encode_col(block.headerLayout.startCol - 1) : 'A'}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, {
                                      headerLayout: {
                                        ...(block.headerLayout || {
                                          startRow: block.startRow,
                                          endRow: block.endRow,
                                          startCol: 1,
                                          endCol: 1,
                                          cells: [],
                                          merges: [],
                                        }),
                                        startCol: Math.max(1, columnLetterToIndex(e.target.value.toUpperCase())),
                                      },
                                    })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Tiêu đề ngang kết thúc ở cột
                                <input
                                  className="field-input mt-2"
                                  value={block.headerLayout ? XLSX.utils.encode_col(block.headerLayout.endCol - 1) : 'A'}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, {
                                      headerLayout: {
                                        ...(block.headerLayout || {
                                          startRow: block.startRow,
                                          endRow: block.endRow,
                                          startCol: 1,
                                          endCol: 1,
                                          cells: [],
                                          merges: [],
                                        }),
                                        endCol: Math.max(1, columnLetterToIndex(e.target.value.toUpperCase())),
                                      },
                                    })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Cột tiêu chí dọc bắt đầu
                                <input
                                  className="field-input mt-2"
                                  value={block.labelColumnStart}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, { labelColumnStart: e.target.value.toUpperCase() })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Cột tiêu chí dọc kết thúc
                                <input
                                  className="field-input mt-2"
                                  value={block.labelColumnEnd}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, { labelColumnEnd: e.target.value.toUpperCase() })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Cột chứa tên tiêu chí chính
                                <input
                                  className="field-input mt-2"
                                  value={block.primaryLabelColumn}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, { primaryLabelColumn: e.target.value.toUpperCase() })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Dòng chứa số liệu bắt đầu
                                <input
                                  type="number"
                                  className="field-input mt-2"
                                  value={block.startRow}
                                  onChange={(e) => updateStoredTemplateBlock(tpl.id, block.id, { startRow: Number(e.target.value) })}
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Dòng chứa số liệu kết thúc
                                <input
                                  type="number"
                                  className="field-input mt-2"
                                  value={block.endRow}
                                  onChange={(e) => updateStoredTemplateBlock(tpl.id, block.id, { endRow: Number(e.target.value) })}
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                                Dòng đặc biệt bỏ qua khi tổng hợp
                                <input
                                  className="field-input mt-2"
                                  value={(block.specialRows || []).join(', ')}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, { specialRows: expandRowSelection(e.target.value) })
                                  }
                                />
                              </label>
                              <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-2">
                                Tên cột hiển thị của khối
                                <input
                                  className="field-input mt-2"
                                  value={(block.columnHeaders || []).join(', ')}
                                  onChange={(e) =>
                                    updateStoredTemplateBlock(tpl.id, block.id, {
                                      columnHeaders: e.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                                    })
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[16px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--ink-soft)]">
                        Chưa có khối tiêu đề - dữ liệu nào. Chỉ cần dùng khi sheet có nhiều vùng tiêu đề hoặc nhiều vùng số liệu độc lập.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-white/70 p-4">
                    <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      Vùng header đang dùng để xem trước và xuất đúng mẫu
                    </p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <input
                        type="number"
                        className="field-input"
                        placeholder="Dòng đầu"
                        value={tpl.headerLayout?.startRow || tpl.columnMapping.startRow}
                        onChange={(e) => updateStoredTemplateHeader(tpl.id, { startRow: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        className="field-input"
                        placeholder="Dòng cuối"
                        value={tpl.headerLayout?.endRow || tpl.columnMapping.startRow}
                        onChange={(e) => updateStoredTemplateHeader(tpl.id, { endRow: Number(e.target.value) })}
                      />
                      <input
                        className="field-input"
                        placeholder="Cột đầu"
                        value={tpl.headerLayout ? XLSX.utils.encode_col(tpl.headerLayout.startCol - 1) : tpl.columnMapping.labelColumn}
                        onChange={(e) =>
                          updateStoredTemplateHeader(tpl.id, {
                            startCol: Math.max(1, columnLetterToIndex(e.target.value.toUpperCase())),
                          })
                        }
                      />
                      <input
                        className="field-input"
                        placeholder="Cột cuối"
                        value={
                          tpl.headerLayout
                            ? XLSX.utils.encode_col(tpl.headerLayout.endCol - 1)
                            : tpl.columnMapping.dataColumns[tpl.columnMapping.dataColumns.length - 1] || tpl.columnMapping.labelColumn
                        }
                        onChange={(e) =>
                          updateStoredTemplateHeader(tpl.id, {
                            endCol: Math.max(1, columnLetterToIndex(e.target.value.toUpperCase())),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
              {manualTemplates.length === 0 && (
                <p className="text-xs text-[var(--ink-soft)]">Chưa có biểu mẫu nào.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

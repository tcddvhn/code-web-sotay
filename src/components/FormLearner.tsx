import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from '@google/genai';
import { AlertCircle, Brain, CheckCircle, Eye, FileSpreadsheet, Loader2, Lock, Plus, Save, Trash2, Unlock, X } from 'lucide-react';
import { uploadFile } from '../supabase';
import { FormTemplate, HeaderLayout, Project } from '../types';
import { columnLetterToIndex } from '../utils/columnUtils';
import { expandColumnSelection } from '../utils/workbookUtils';
import { listTemplates as listTemplatesFromSupabase, upsertTemplate } from '../supabaseStore';

type Mode = 'AI' | 'MANUAL';

const GEMINI_API_KEY_STORAGE_KEY = 'sotay_gemini_api_key';
const STORAGE_OPERATION_TIMEOUT_MS = 25000;
const MAX_AI_SHEETS_PER_RUN = 3;
const DEFAULT_MANUAL_FORM = {
  name: '',
  sheetName: '',
  labelColumn: 'A',
  dataColumns: '',
  columnHeaders: '',
  startRow: 1,
  endRow: 200,
  verticalHeaderStartRow: 1,
  verticalHeaderEndRow: 1,
  horizontalHeaderStartRow: 1,
  horizontalHeaderEndRow: 1,
};

function buildTemplateId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
}: {
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onDeleteTemplate: (template: FormTemplate) => Promise<boolean>;
}) {
  const project = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );
  const [mode, setMode] = useState<Mode>('AI');
  const [file, setFile] = useState<File | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
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
    setAiSheetNames([]);
    setSelectedAiSheetNames([]);
    setLearnedTemplates([]);
    setConfirmedTemplates({});
    setHeaderRanges({});
    setConfirmAll(false);
    setError(null);
    setNotice(null);
    setManualForm(DEFAULT_MANUAL_FORM);
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
        setManualSheetNames(nextSheetNames);
        setManualForm((prev) => ({
          ...prev,
          sheetName: nextSheetNames.includes(prev.sheetName) ? prev.sheetName : nextSheetNames[0] || '',
        }));
      })
      .catch(() => {
        if (!isCancelled) {
          setManualSheetNames([]);
          setError('Không thể đọc danh sách sheet từ file mẫu thủ công.');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [manualFile]);

  const existingNames = useMemo(
    () => new Set(manualTemplates.map((tpl) => tpl.name.trim().toLowerCase()).filter(Boolean)),
    [manualTemplates],
  );

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
      startCol: template.columnMapping.labelColumn,
      endCol: template.columnMapping.dataColumns[template.columnMapping.dataColumns.length - 1] || template.columnMapping.labelColumn,
    };
  };

  const buildTemplateWithHeaderLayout = (template: FormTemplate, workbook: XLSX.WorkBook) => {
    const worksheet = workbook.Sheets[template.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) {
      return template;
    }

    const range = resolveHeaderRange(template);
    return {
      ...template,
      headerLayout: buildHeaderLayout(
        worksheet,
        range.startRow,
        range.endRow,
        range.startCol.toUpperCase(),
        range.endCol.toUpperCase(),
      ),
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
            startCol: columnLetterToIndex(template.columnMapping.labelColumn),
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

    if (!template.columnMapping.dataColumns || template.columnMapping.dataColumns.length === 0) {
      return 'Vui lòng khai báo ít nhất một cột dữ liệu.';
    }

    if (template.headerLayout && template.headerLayout.endRow < template.headerLayout.startRow) {
      return 'Vùng tiêu đề phải có dòng kết thúc lớn hơn hoặc bằng dòng bắt đầu.';
    }

    if (
      template.headerLayout &&
      (template.headerLayout.startCol <= 0 || template.headerLayout.endCol <= 0 || template.headerLayout.endCol < template.headerLayout.startCol)
    ) {
      return 'Cột bắt đầu và cột kết thúc của vùng tiêu đề không hợp lệ.';
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
        labelColumn: template.columnMapping.labelColumn.trim().toUpperCase(),
        dataColumns: expandColumnSelection(template.columnMapping.dataColumns.join(',')),
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
        setManualTemplates(await listTemplatesFromSupabase(project.id));
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
        setManualTemplates(await listTemplatesFromSupabase(project.id));
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
        setManualTemplates(await listTemplatesFromSupabase(project.id));
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
        setManualTemplates(await listTemplatesFromSupabase(project.id));
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
        labelColumn: manualForm.labelColumn.toUpperCase(),
        dataColumns,
        startRow: Number(manualForm.startRow),
        endRow: Number(manualForm.endRow),
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
            manualForm.labelColumn.toUpperCase(),
            dataColumns[dataColumns.length - 1] || manualForm.labelColumn.toUpperCase(),
          ),
        };
      }

      await saveTemplates([templateToSave], manualFile);
      const nextSheetName = getNextManualSheetName(manualForm.sheetName, templateToSave);
      setManualForm((prev) => ({
        ...DEFAULT_MANUAL_FORM,
        labelColumn: prev.labelColumn,
        dataColumns: prev.dataColumns,
        startRow: prev.startRow,
        endRow: prev.endRow,
        verticalHeaderStartRow: prev.verticalHeaderStartRow,
        verticalHeaderEndRow: prev.verticalHeaderEndRow,
        horizontalHeaderStartRow: prev.horizontalHeaderStartRow,
        horizontalHeaderEndRow: prev.horizontalHeaderEndRow,
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

      {mode === 'MANUAL' && (
        <div className="grid max-w-6xl grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
          <div className="panel-card rounded-[24px] p-6">
            <h3 className="section-title mb-4">Tạo biểu mẫu thủ công</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
              <input
                className="field-input"
                placeholder="Tên biểu mẫu"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
              />
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
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4">
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
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="panel-soft rounded-[18px] p-4">
                  <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    1. Tiêu chí dọc
                  </p>
                  <div className="space-y-3">
                    <input
                      className="field-input"
                      placeholder="Cột tiêu chí dọc (VD: A)"
                      value={manualForm.labelColumn}
                      onChange={(e) => setManualForm({ ...manualForm, labelColumn: e.target.value.toUpperCase() })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="field-input"
                        type="number"
                        placeholder="Dòng bắt đầu tiêu đề"
                        value={manualForm.verticalHeaderStartRow}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, verticalHeaderStartRow: Number(e.target.value) })
                        }
                      />
                      <input
                        className="field-input"
                        type="number"
                        placeholder="Dòng kết thúc tiêu đề"
                        value={manualForm.verticalHeaderEndRow}
                        onChange={(e) =>
                          setManualForm({ ...manualForm, verticalHeaderEndRow: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="panel-soft rounded-[18px] p-4">
                  <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    2. Tiêu chí ngang
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className="field-input"
                      type="number"
                      placeholder="Dòng bắt đầu tiêu đề"
                      value={manualForm.horizontalHeaderStartRow}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, horizontalHeaderStartRow: Number(e.target.value) })
                      }
                    />
                    <input
                      className="field-input"
                      type="number"
                      placeholder="Dòng kết thúc tiêu đề"
                      value={manualForm.horizontalHeaderEndRow}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, horizontalHeaderEndRow: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="panel-soft rounded-[18px] p-4">
                  <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    3. Vùng lấy dữ liệu
                  </p>
                  <div className="space-y-3">
                    <input
                      className="field-input"
                      placeholder="Cột dữ liệu (VD: A-C, F hoặc B,D,G)"
                      value={manualForm.dataColumns}
                      onChange={(e) => setManualForm({ ...manualForm, dataColumns: e.target.value.toUpperCase() })}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="field-input"
                        type="number"
                        placeholder="Dòng bắt đầu dữ liệu"
                        value={manualForm.startRow}
                        onChange={(e) => setManualForm({ ...manualForm, startRow: Number(e.target.value) })}
                      />
                      <input
                        className="field-input"
                        type="number"
                        placeholder="Dòng kết thúc dữ liệu"
                        value={manualForm.endRow}
                        onChange={(e) => setManualForm({ ...manualForm, endRow: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
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

          <div className="panel-card h-fit rounded-[24px] p-6 xl:sticky xl:top-6">
            <h3 className="section-title">Hướng dẫn thiết lập</h3>
            <div className="mt-4 space-y-4 text-sm leading-6 text-[var(--ink-soft)]">
              <p>
                <strong className="text-[var(--ink)]">1. Tải file mẫu</strong> để hệ thống đọc danh sách sheet thực tế trong workbook.
              </p>
              <p>
                <strong className="text-[var(--ink)]">2. Chọn đúng sheet</strong> tương ứng với biểu bạn muốn cấu hình. Mỗi biểu nên gắn với một sheet riêng.
              </p>
              <p>
                <strong className="text-[var(--ink)]">3. Tiêu chí dọc</strong> là cột chứa tên chỉ tiêu hoặc dòng mô tả, ví dụ `A` hoặc `B`.
              </p>
              <p>
                <strong className="text-[var(--ink)]">4. Tiêu chí ngang</strong> là phần đầu bảng nhiều tầng. Hãy nhập đúng hàng bắt đầu và hàng kết thúc của vùng header để báo cáo dựng lại giống file Excel.
              </p>
              <p>
                <strong className="text-[var(--ink)]">5. Vùng lấy dữ liệu</strong> là các cột số liệu thật sự cần tổng hợp, ví dụ `C-H` hoặc `B,D,G`.
              </p>
              <p>
                <strong className="text-[var(--ink)]">6. Sau khi tạo xong</strong>, biểu sẽ lưu ở trạng thái nháp. Bạn nên rà lại, xem thử ở mục báo cáo, rồi mới bấm chốt biểu để đưa vào tiếp nhận dữ liệu.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from '@google/genai';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, query, where } from 'firebase/firestore';
import { AlertCircle, Brain, CheckCircle, FileSpreadsheet, Loader2, Plus } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { FormTemplate, HeaderLayout, Project } from '../types';
import { columnLetterToIndex } from '../utils/columnUtils';

type Mode = 'AI' | 'MANUAL';

export function FormLearner({ project }: { project: Project }) {
  const [mode, setMode] = useState<Mode>('AI');
  const [file, setFile] = useState<File | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [learnedTemplates, setLearnedTemplates] = useState<FormTemplate[]>([]);
  const [confirmedTemplates, setConfirmedTemplates] = useState<Record<string, boolean>>({});
  const [headerRanges, setHeaderRanges] = useState<Record<string, { startRow: number; endRow: number; startCol: string; endCol: string }>>({});
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualTemplates, setManualTemplates] = useState<FormTemplate[]>([]);
  const [manualForm, setManualForm] = useState({
    name: '',
    sheetName: '',
    labelColumn: 'A',
    dataColumns: '',
    columnHeaders: '',
    startRow: 1,
    endRow: 200,
    headerStartRow: 1,
    headerEndRow: 1,
    headerStartCol: 'A',
    headerEndCol: 'A',
  });

  useEffect(() => {
    const q = query(collection(db, 'templates'), where('projectId', '==', project.id));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as FormTemplate));
        setManualTemplates(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'templates'),
    );
    return () => unsubscribe();
  }, [project.id]);

  const existingNames = useMemo(() => new Set(manualTemplates.map((tpl) => tpl.name)), [manualTemplates]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleManualFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setManualFile(e.target.files[0]);
    }
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

  const learnForm = async () => {
    if (!file) return;
    setIsLearning(true);
    setError(null);
    setLearnedTemplates([]);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetNames = workbook.SheetNames.slice(0, 10);

          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const analysisPromises = sheetNames.map(async (sheetName) => {
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

            const response = await ai.models.generateContent({
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

            const result = JSON.parse(response.text);
            return {
              id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              projectId: project.id,
              name: result.name,
              sheetName: sheetName,
              columnHeaders: result.columnHeaders,
              columnMapping: {
                labelColumn: result.labelColumn,
                dataColumns: result.dataColumns,
                startRow: result.startRow,
                endRow: result.endRow,
              },
              mode: 'AI',
              createdAt: serverTimestamp(),
            } as FormTemplate;
          });

          const results = await Promise.all(analysisPromises);
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
          setIsLearning(false);
        } catch (innerErr) {
          setError(innerErr instanceof Error ? innerErr.message : 'Lỗi xử lý file.');
          setIsLearning(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('Không thể đọc file Excel này.');
      setIsLearning(false);
    }
  };

  const saveTemplates = async (templatesToSave: FormTemplate[], sourceFile?: File) => {
    if (templatesToSave.length === 0) return;
    try {
      let templatesWithLayout = templatesToSave;
      if (sourceFile) {
        const data = await sourceFile.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        templatesWithLayout = templatesToSave.map((tpl) => {
          const range = headerRanges[tpl.id];
          if (!range) return tpl;
          const worksheet = workbook.Sheets[tpl.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
          if (!worksheet) return tpl;
          const headerLayout = buildHeaderLayout(
            worksheet,
            range.startRow,
            range.endRow,
            range.startCol,
            range.endCol,
          );
          return { ...tpl, headerLayout };
        });
      }
      const promises = templatesWithLayout.map((tpl) => setDoc(doc(db, 'templates', tpl.id), tpl));
      await Promise.all(promises);
      setLearnedTemplates([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'templates');
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

  const handleManualCreate = async () => {
    if (!manualForm.name || !manualForm.sheetName || !manualForm.dataColumns) {
      setError('Vui lòng nhập đầy đủ thông tin template.');
      return;
    }

    if (existingNames.has(manualForm.name)) {
      setError('Tên template đã tồn tại trong dự án này.');
      return;
    }

    if (manualFile) {
      if (!manualForm.headerStartCol || !manualForm.headerEndCol) {
        setError('Vui lòng nhập vùng tiêu đề để hệ thống vẽ đúng biểu mẫu.');
        return;
      }
      if (Number(manualForm.headerEndRow) < Number(manualForm.headerStartRow)) {
        setError('Hàng kết thúc của vùng tiêu đề phải lớn hơn hoặc bằng hàng bắt đầu.');
        return;
      }
    }

    const dataColumns = manualForm.dataColumns.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    const columnHeaders = manualForm.columnHeaders
      ? manualForm.columnHeaders.split(',').map((c) => c.trim()).filter(Boolean)
      : dataColumns.map((_, i) => `Cột ${i + 1}`);

    const newTemplate: FormTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      projectId: project.id,
      name: manualForm.name,
      sheetName: manualForm.sheetName,
      columnHeaders,
      columnMapping: {
        labelColumn: manualForm.labelColumn.toUpperCase(),
        dataColumns,
        startRow: Number(manualForm.startRow),
        endRow: Number(manualForm.endRow),
      },
      mode: 'MANUAL',
      createdAt: serverTimestamp(),
    };

    let templateToSave = newTemplate;
    if (manualFile) {
      const data = await manualFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[newTemplate.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
      if (worksheet) {
        templateToSave = {
          ...newTemplate,
          headerLayout: buildHeaderLayout(
            worksheet,
            Number(manualForm.headerStartRow),
            Number(manualForm.headerEndRow),
            manualForm.headerStartCol,
            manualForm.headerEndCol,
          ),
        };
      }
    }

    await saveTemplates([templateToSave]);
    setManualForm({
      name: '',
      sheetName: '',
      labelColumn: 'A',
      dataColumns: '',
      columnHeaders: '',
      startRow: 1,
      endRow: 200,
      headerStartRow: 1,
      headerEndRow: 1,
      headerStartCol: 'A',
      headerEndCol: 'A',
    });
    setManualFile(null);
    setError(null);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h2 className="page-title">Quản lý biểu mẫu</h2>
        <p className="page-subtitle mt-2 text-sm">Dự án: <span className="font-bold">{project.name}</span></p>
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
        <div className="max-w-3xl space-y-6">
          <div className="panel-card rounded-[24px] p-8 text-center">
            <FileSpreadsheet className="mx-auto mb-4 text-[var(--primary)] opacity-40" size={52} />
            <h3 className="section-title mb-3">Tải lên File Mẫu (Template)</h3>
            <p className="page-subtitle text-xs">Hệ thống sẽ dùng AI để học cấu trúc của file này.</p>

            <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" id="template-upload" />
            <label htmlFor="template-upload" className="primary-btn mt-6 inline-flex items-center gap-2">
              {file ? file.name : 'Chọn file mẫu'}
            </label>
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

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
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
                    saveTemplates(learnedTemplates, file);
                  }}
                  className="primary-btn flex-1"
                  disabled={!allConfirmed}
                >
                  Lưu tất cả biểu mẫu
                </button>
                <button onClick={() => setLearnedTemplates([])} className="secondary-btn">
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'MANUAL' && (
        <div className="max-w-4xl space-y-6">
          <div className="panel-card rounded-[24px] p-6">
            <h3 className="section-title mb-4">Tạo biểu mẫu thủ công</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                className="field-input"
                placeholder="Tên biểu mẫu"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Tên sheet (VD: 1B)"
                value={manualForm.sheetName}
                onChange={(e) => setManualForm({ ...manualForm, sheetName: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Cột tiêu chí (VD: B)"
                value={manualForm.labelColumn}
                onChange={(e) => setManualForm({ ...manualForm, labelColumn: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Cột dữ liệu (VD: C,D,E)"
                value={manualForm.dataColumns}
                onChange={(e) => setManualForm({ ...manualForm, dataColumns: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Tiêu đề cột (VD: Tổng số, Thành lập)"
                value={manualForm.columnHeaders}
                onChange={(e) => setManualForm({ ...manualForm, columnHeaders: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="field-input"
                  type="number"
                  placeholder="Hàng bắt đầu"
                  value={manualForm.startRow}
                  onChange={(e) => setManualForm({ ...manualForm, startRow: Number(e.target.value) })}
                />
                <input
                  className="field-input"
                  type="number"
                  placeholder="Hàng kết thúc"
                  value={manualForm.endRow}
                  onChange={(e) => setManualForm({ ...manualForm, endRow: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="panel-soft rounded-[18px] p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] mb-2">
                  File mẫu để lấy tiêu đề (khuyến nghị)
                </p>
                <input type="file" accept=".xlsx,.xls" onChange={handleManualFileChange} className="field-input" />
                {manualFile && (
                  <p className="mt-2 text-xs text-[var(--ink-soft)]">Đang dùng: {manualFile.name}</p>
                )}
              </div>
              <div className="panel-soft rounded-[18px] p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] mb-2">
                  Vùng tiêu đề (bao gồm cột tiêu chí + cột số liệu)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="field-input"
                    type="number"
                    placeholder="Hàng bắt đầu"
                    value={manualForm.headerStartRow}
                    onChange={(e) => setManualForm({ ...manualForm, headerStartRow: Number(e.target.value) })}
                  />
                  <input
                    className="field-input"
                    type="number"
                    placeholder="Hàng kết thúc"
                    value={manualForm.headerEndRow}
                    onChange={(e) => setManualForm({ ...manualForm, headerEndRow: Number(e.target.value) })}
                  />
                  <input
                    className="field-input"
                    placeholder="Cột bắt đầu (VD: A)"
                    value={manualForm.headerStartCol}
                    onChange={(e) => setManualForm({ ...manualForm, headerStartCol: e.target.value.toUpperCase() })}
                  />
                  <input
                    className="field-input"
                    placeholder="Cột kết thúc (VD: S)"
                    value={manualForm.headerEndCol}
                    onChange={(e) => setManualForm({ ...manualForm, headerEndCol: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
            </div>

            <button onClick={handleManualCreate} className="primary-btn mt-6 flex items-center gap-2">
              <Plus size={16} />
              Tạo biểu mẫu
            </button>

            {error && (
              <div className="mt-4 panel-card rounded-[18px] p-3 border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
                <AlertCircle size={16} />
                <p className="text-xs font-medium">{error}</p>
              </div>
            )}
          </div>

          <div className="panel-card rounded-[24px] p-6">
            <h3 className="section-title mb-4">Danh sách biểu mẫu đã tạo</h3>
            <div className="space-y-3">
              {manualTemplates.map((tpl) => (
                <div key={tpl.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">{tpl.name}</p>
                  <p className="text-xs text-[var(--ink-soft)] mt-1">
                    Sheet: {tpl.sheetName} | Cột tiêu chí: {tpl.columnMapping.labelColumn} | Dữ liệu: {tpl.columnMapping.dataColumns.join(', ')}
                  </p>
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







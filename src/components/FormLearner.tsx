import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from '@google/genai';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, query, where } from 'firebase/firestore';
import { AlertCircle, Brain, CheckCircle, FileSpreadsheet, Loader2, Plus } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { FormTemplate, Project } from '../types';

type Mode = 'AI' | 'MANUAL';

export function FormLearner({ project }: { project: Project }) {
  const [mode, setMode] = useState<Mode>('AI');
  const [file, setFile] = useState<File | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [learnedTemplates, setLearnedTemplates] = useState<FormTemplate[]>([]);
  const [confirmedTemplates, setConfirmedTemplates] = useState<Record<string, boolean>>({});
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

            const prompt = `
              PhÃ¢n tÃ­ch cáº¥u trÃºc biá»ƒu máº«u bÃ¡o cÃ¡o Excel tá»« 15 hÃ ng Ä‘áº§u cá»§a sheet "${sheetName}":
              ${rowsJson}

              Tráº£ vá» JSON chÃ­nh xÃ¡c:
              1. labelColumn: Cá»™t chá»©a tiÃªu chÃ­ (thÆ°á»ng lÃ  "B" hoáº·c "A").
              2. dataColumns: Danh sÃ¡ch cá»™t chá»©a sá»‘ liá»‡u (vÃ­ dá»¥: ["C", "D", "E"]).
              3. columnHeaders: TÃªn tiÃªu Ä‘á» tÆ°Æ¡ng á»©ng cá»§a dataColumns.
              4. startRow: HÃ ng báº¯t Ä‘áº§u cÃ³ dá»¯ liá»‡u sá»‘ (1-indexed).
              5. endRow: HÃ ng káº¿t thÃºc (máº·c Ä‘á»‹nh 1000).
              6. name: TÃªn biá»ƒu máº«u (vÃ­ dá»¥: "Biá»ƒu máº«u 1B").

              YÃªu cáº§u JSON:
              {
                "labelColumn": "string",
                "dataColumns": ["string"],
                "columnHeaders": ["string"],
                "startRow": number,
                "endRow": number,
                "name": "string"
              }
            `;

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
            throw new Error('AI khÃ´ng thá»ƒ nháº­n diá»‡n Ä‘Æ°á»£c cáº¥u trÃºc nÃ o tá»« cÃ¡c sheet.');
          }

          setLearnedTemplates(validTemplates);
          const nextConfirm: Record<string, boolean> = {};
          validTemplates.forEach((tpl) => {
            nextConfirm[tpl.id] = false;
          });
          setConfirmedTemplates(nextConfirm);
          setConfirmAll(false);
          setIsLearning(false);
        } catch (innerErr) {
          setError(innerErr instanceof Error ? innerErr.message : 'Lá»—i xá»­ lÃ½ file.');
          setIsLearning(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('KhÃ´ng thá»ƒ Ä‘á»c file Excel nÃ y.');
      setIsLearning(false);
    }
  };

  const saveTemplates = async (templatesToSave: FormTemplate[]) => {
    if (templatesToSave.length === 0) return;
    try {
      const promises = templatesToSave.map((tpl) => setDoc(doc(db, 'templates', tpl.id), tpl));
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
      setError('Vui lÃ²ng nháº­p Ä‘áº§y Ä‘á»§ thÃ´ng tin template.');
      return;
    }

    if (existingNames.has(manualForm.name)) {
      setError('TÃªn template Ä‘Ã£ tá»“n táº¡i trong dá»± Ã¡n nÃ y.');
      return;
    }

    const dataColumns = manualForm.dataColumns.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    const columnHeaders = manualForm.columnHeaders
      ? manualForm.columnHeaders.split(',').map((c) => c.trim()).filter(Boolean)
      : dataColumns.map((_, i) => `Cá»™t ${i + 1}`);

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

    await saveTemplates([newTemplate]);
    setManualForm({ name: '', sheetName: '', labelColumn: 'A', dataColumns: '', columnHeaders: '', startRow: 1, endRow: 200 });
    setError(null);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h2 className="page-title">Quáº£n lÃ½ biá»ƒu máº«u</h2>
        <p className="page-subtitle mt-2 text-sm">Dá»± Ã¡n: <span className="font-bold">{project.name}</span></p>
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={() => setMode('AI')} className={mode === 'AI' ? 'primary-btn' : 'secondary-btn'}>
          Há»c biá»ƒu máº«u báº±ng AI
        </button>
        <button onClick={() => setMode('MANUAL')} className={mode === 'MANUAL' ? 'primary-btn' : 'secondary-btn'}>
          Thiáº¿t láº­p thá»§ cÃ´ng
        </button>
      </div>

      {mode === 'AI' && (
        <div className="max-w-3xl space-y-6">
          <div className="panel-card rounded-[24px] p-8 text-center">
            <FileSpreadsheet className="mx-auto mb-4 text-[var(--primary)] opacity-40" size={52} />
            <h3 className="section-title mb-3">Táº£i lÃªn File Máº«u (Template)</h3>
            <p className="page-subtitle text-xs">Há»‡ thá»‘ng sáº½ dÃ¹ng AI Ä‘á»ƒ há»c cáº¥u trÃºc cá»§a file nÃ y.</p>

            <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" id="template-upload" />
            <label htmlFor="template-upload" className="primary-btn mt-6 inline-flex items-center gap-2">
              {file ? file.name : 'Chá»n file máº«u'}
            </label>
          </div>

          {file && learnedTemplates.length === 0 && !isLearning && (
            <button onClick={learnForm} className="primary-btn w-full flex items-center justify-center gap-3">
              <Brain size={18} />
              Báº¯t Ä‘áº§u phÃ¢n tÃ­ch báº±ng AI
            </button>
          )}

          {isLearning && (
            <div className="panel-card rounded-[24px] p-8 text-center">
              <Loader2 className="mx-auto mb-4 animate-spin" size={40} />
              <h3 className="section-title">AI Ä‘ang há»c biá»ƒu máº«u...</h3>
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
                <h3 className="section-title">AI Ä‘Ã£ tÃ¬m tháº¥y {learnedTemplates.length} biá»ƒu máº«u</h3>
              </div>

              <label className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                <input
                  type="checkbox"
                  checked={confirmAll}
                  onChange={(e) => toggleConfirmAll(e.target.checked)}
                  className="theme-checkbox h-3.5 w-3.5"
                />
                TÃ´i Ä‘Ã£ kiá»ƒm tra vÃ  xÃ¡c nháº­n táº¥t cáº£ biá»ƒu
              </label>

              <div className="space-y-3">
                {learnedTemplates.map((tpl) => (
                  <div key={tpl.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-sm text-[var(--ink)]">{tpl.name} (Sheet: {tpl.sheetName})</p>
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        <input
                          type="checkbox"
                          checked={!!confirmedTemplates[tpl.id]}
                          onChange={(e) => setConfirmedTemplates({ ...confirmedTemplates, [tpl.id]: e.target.checked })}
                          className="theme-checkbox h-3.5 w-3.5"
                        />
                        ÄÃ£ xÃ¡c nháº­n
                      </label>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        TÃªn biá»ƒu máº«u
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
                        Cá»™t tiÃªu chÃ­
                        <input
                          className="field-input mt-2"
                          value={tpl.columnMapping.labelColumn}
                          onChange={(e) => updateTemplateMapping(tpl.id, { labelColumn: e.target.value })}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        Cá»™t dá»¯ liá»‡u (C,D,E)
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
                        HÃ ng báº¯t Ä‘áº§u
                        <input
                          type="number"
                          className="field-input mt-2"
                          value={tpl.columnMapping.startRow}
                          onChange={(e) => updateTemplateMapping(tpl.id, { startRow: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                        HÃ ng káº¿t thÃºc
                        <input
                          type="number"
                          className="field-input mt-2"
                          value={tpl.columnMapping.endRow}
                          onChange={(e) => updateTemplateMapping(tpl.id, { endRow: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] md:col-span-2">
                        TiÃªu Ä‘á» cá»™t (phÃ¢n cÃ¡ch báº±ng dÃ¢áº¥u pháº©y)
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
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex gap-3">
                <button onClick={() => saveTemplates(learnedTemplates)} className="primary-btn flex-1" disabled={!allConfirmed}>
                  LÆ°u táº¥t cáº£ biá»ƒu máº«u
                </button>
                <button onClick={() => setLearnedTemplates([])} className="secondary-btn">
                  Há»§y
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'MANUAL' && (
        <div className="max-w-4xl space-y-6">
          <div className="panel-card rounded-[24px] p-6">
            <h3 className="section-title mb-4">Táº¡o biá»ƒu máº«u thá»§ cÃ´ng</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                className="field-input"
                placeholder="TÃªn biá»ƒu máº«u"
                value={manualForm.name}
                onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="TÃªn sheet (VD: 1B)"
                value={manualForm.sheetName}
                onChange={(e) => setManualForm({ ...manualForm, sheetName: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Cá»™t tiÃªu chÃ­ (VD: B)"
                value={manualForm.labelColumn}
                onChange={(e) => setManualForm({ ...manualForm, labelColumn: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="Cá»™t dá»¯ liá»‡u (VD: C,D,E)"
                value={manualForm.dataColumns}
                onChange={(e) => setManualForm({ ...manualForm, dataColumns: e.target.value })}
              />
              <input
                className="field-input"
                placeholder="TiÃªu Ä‘á» cá»™t (VD: Tá»•ng sá»‘, ThÃ nh láº­p)"
                value={manualForm.columnHeaders}
                onChange={(e) => setManualForm({ ...manualForm, columnHeaders: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="field-input"
                  type="number"
                  placeholder="HÃ ng báº¯t Ä‘áº§u"
                  value={manualForm.startRow}
                  onChange={(e) => setManualForm({ ...manualForm, startRow: Number(e.target.value) })}
                />
                <input
                  className="field-input"
                  type="number"
                  placeholder="HÃ ng káº¿t thÃºc"
                  value={manualForm.endRow}
                  onChange={(e) => setManualForm({ ...manualForm, endRow: Number(e.target.value) })}
                />
              </div>
            </div>

            <button onClick={handleManualCreate} className="primary-btn mt-6 flex items-center gap-2">
              <Plus size={16} />
              Táº¡o biá»ƒu máº«u
            </button>

            {error && (
              <div className="mt-4 panel-card rounded-[18px] p-3 border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
                <AlertCircle size={16} />
                <p className="text-xs font-medium">{error}</p>
              </div>
            )}
          </div>

          <div className="panel-card rounded-[24px] p-6">
            <h3 className="section-title mb-4">Danh sÃ¡ch biá»ƒu máº«u Ä‘Ã£ táº¡o</h3>
            <div className="space-y-3">
              {manualTemplates.map((tpl) => (
                <div key={tpl.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">{tpl.name}</p>
                  <p className="text-xs text-[var(--ink-soft)] mt-1">
                    Sheet: {tpl.sheetName} | Cá»™t tiÃªu chÃ­: {tpl.columnMapping.labelColumn} | Dá»¯ liá»‡u: {tpl.columnMapping.dataColumns.join(', ')}
                  </p>
                </div>
              ))}
              {manualTemplates.length === 0 && (
                <p className="text-xs text-[var(--ink-soft)]">ChÆ°a cÃ³ biá»ƒu máº«u nÃ o.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

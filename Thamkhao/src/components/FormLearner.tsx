import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from "@google/genai";
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Project, FormTemplate } from '../types';
import { Brain, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export function FormLearner({ project, onComplete }: { project: Project, onComplete: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [learnedTemplates, setLearnedTemplates] = useState<FormTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

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

    console.log("B?t d?u d?c file Excel...");
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // L?c b? c�c sheet ?n ho?c sheet h? th?ng n?u c?n
          const sheetNames = workbook.SheetNames.slice(0, 10); // Gi?i h?n t?i da 10 sheet d? tr�nh qu� t?i
          console.log(`T�m th?y ${sheetNames.length} sheet c?n ph�n t�ch:`, sheetNames);

          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

          const analysisPromises = sheetNames.map(async (sheetName) => {
            console.log(`Dang g?i sheet "${sheetName}" cho AI ph�n t�ch...`);
            const sheet = workbook.Sheets[sheetName];
            
            // Ch? l?y 15 h�ng d?u v� 10 c?t d?u d? AI d? h�nh dung c?u tr�c m� kh�ng b? qu� t?i
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 'A', range: 0, defval: '' }).slice(0, 15);
            const rowsJson = JSON.stringify(rows, null, 2);

            const prompt = `
              Ph�n t�ch c?u tr�c bi?u m?u b�o c�o Excel t? 15 h�ng d?u c?a sheet "${sheetName}":
              ${rowsJson}

              Tr? v? JSON ch�nh x�c:
              1. labelColumn: C?t ch?a ti�u ch� (thu?ng l� "B" ho?c "A").
              2. dataColumns: Danh s�ch c?t ch?a s? li?u (v� d?: ["C", "D", "E"]).
              3. columnHeaders: T�n ti�u d? tuong ?ng c?a dataColumns. H�y l?y d�ng text trong file (v� d?: ["T?ng s?", "Th�nh l?p m?i"]).
              4. startRow: H�ng b?t d?u c� d? li?u s? (1-indexed).
              5. endRow: H�ng k?t th�c (m?c d?nh 1000).
              6. name: T�n bi?u m?u (v� d?: "Bi?u m?u 1B").

              Y�u c?u JSON:
              {
                "labelColumn": "string",
                "dataColumns": ["string"],
                "columnHeaders": ["string"],
                "startRow": number,
                "endRow": number,
                "name": "string"
              }
            `;

            try {
              const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      labelColumn: { type: Type.STRING },
                      dataColumns: { type: Type.ARRAY, items: { type: Type.STRING } },
                      columnHeaders: { type: Type.ARRAY, items: { type: Type.STRING } },
                      startRow: { type: Type.INTEGER },
                      endRow: { type: Type.INTEGER },
                      name: { type: Type.STRING }
                    },
                    required: ["labelColumn", "dataColumns", "columnHeaders", "startRow", "endRow", "name"]
                  }
                }
              });

              const result = JSON.parse(response.text);
              console.log(`AI d� ph�n t�ch xong sheet "${sheetName}":`, result);
              
              return {
                id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                projectId: project.id,
                name: result.name,
                sheetName: sheetName,
                columnHeaders: result.columnHeaders,
                columnMapping: {
                  labelColumn: result.labelColumn,
                  dataColumns: result.dataColumns,
                  startRow: result.startRow,
                  endRow: result.endRow
                },
                createdAt: serverTimestamp()
              } as FormTemplate;
            } catch (err) {
              console.error(`L?i khi ph�n t�ch sheet "${sheetName}":`, err);
              return null;
            }
          });

          const results = await Promise.all(analysisPromises);
          const validTemplates = results.filter((t): t is FormTemplate => t !== null);

          if (validTemplates.length === 0) {
            throw new Error("AI kh�ng th? nh?n di?n du?c c?u tr�c n�o t? c�c sheet.");
          }

          setLearnedTemplates(validTemplates);
          setIsLearning(false);
          console.log("Ho�n t?t ph�n t�ch to�n b? file.");
        } catch (innerErr) {
          console.error("L?i x? l� d? li?u:", innerErr);
          setError(innerErr instanceof Error ? innerErr.message : "L?i x? l� file.");
          setIsLearning(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("L?i d?c file:", err);
      setError("Kh�ng th? d?c file Excel n�y.");
      setIsLearning(false);
    }
  };

  const saveTemplates = async () => {
    if (learnedTemplates.length === 0) return;
    try {
      const promises = learnedTemplates.map(tpl => setDoc(doc(db, 'templates', tpl.id), tpl));
      await Promise.all(promises);
      onComplete();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'templates');
    }
  };

  return (
    <div className="p-8">
      <div className="mb-12">
        <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">D?y h? th?ng Bi?u m?u m?i</h2>
        <p className="text-sm opacity-60 mt-2">D? �n: <span className="font-bold">{project.name}</span></p>
      </div>

      <div className="max-w-3xl space-y-8">
        <div className="p-12 border-2 border-dashed border-black bg-white/50 text-center">
          <FileSpreadsheet className="mx-auto mb-4 opacity-20" size={64} />
          <h3 className="text-xl font-bold mb-4">T?i l�n File M?u (Template)</h3>
          <p className="text-xs opacity-50 mb-8 uppercase tracking-widest">H? th?ng s? d�ng AI d? h?c c?u tr�c c?a file n�y</p>
          
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            onChange={handleFileChange}
            className="hidden" 
            id="template-upload"
          />
          <label 
            htmlFor="template-upload"
            className="px-8 py-4 bg-black text-white text-xs font-bold uppercase tracking-widest cursor-pointer hover:scale-105 transition-transform inline-block"
          >
            {file ? file.name : 'Ch?n file m?u'}
          </label>
        </div>

        {file && learnedTemplates.length === 0 && !isLearning && (
          <button 
            onClick={learnForm}
            className="w-full py-6 bg-blue-600 text-white text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 transition-colors"
          >
            <Brain size={20} />
            B?t d?u ph�n t�ch b?ng AI
          </button>
        )}

        {isLearning && (
          <div className="p-12 border border-black bg-white text-center">
            <Loader2 className="mx-auto mb-4 animate-spin" size={48} />
            <h3 className="text-xl font-bold italic font-serif">AI dang h?c c�c bi?u m?u...</h3>
            <p className="text-[10px] uppercase tracking-widest opacity-50 mt-2">Vui l�ng d?i trong gi�y l�t</p>
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-50 border border-red-200 text-red-600 flex items-center gap-3">
            <AlertCircle size={20} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {learnedTemplates.length > 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3 mb-6 text-green-600">
              <CheckCircle size={24} />
              <h3 className="text-xl font-bold uppercase tracking-tighter italic font-serif">AI d� t�m th?y {learnedTemplates.length} bi?u m?u!</h3>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {learnedTemplates.map((tpl, idx) => (
                <div key={idx} className="p-6 border border-black bg-white">
                  <h4 className="font-bold text-lg mb-4 border-b border-black pb-2">{tpl.name} (Sheet: {tpl.sheetName})</h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                    <div className="flex justify-between border-b border-black/5 py-1">
                      <span className="opacity-50">C?t ti�u ch�:</span>
                      <span className="font-mono font-bold">{tpl.columnMapping.labelColumn}</span>
                    </div>
                    <div className="flex justify-between border-b border-black/5 py-1">
                      <span className="opacity-50">H�ng b?t d?u:</span>
                      <span className="font-mono font-bold">{tpl.columnMapping.startRow}</span>
                    </div>
                    <div className="col-span-2 mt-2">
                      <span className="opacity-50 block mb-1">Ti�u d? c?t (ngang):</span>
                      <div className="flex flex-wrap gap-2">
                        {tpl.columnHeaders.map((h, i) => (
                          <span key={i} className="px-2 py-1 bg-gray-100 border border-black/10 text-[10px]">{h}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 pt-6">
              <button onClick={saveTemplates} className="flex-1 py-4 bg-black text-white text-xs font-bold uppercase tracking-widest">Luu t?t c? bi?u m?u</button>
              <button onClick={() => setLearnedTemplates([])} className="px-8 py-4 border border-black text-xs font-bold uppercase tracking-widest">H?y & Th? l?i</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


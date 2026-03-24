import React, { useEffect, useMemo, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UNITS } from '../constants';
import { UserProfile } from '../types';

interface UnitAssignmentsProps {
  projectId: string;
  users: UserProfile[];
  assignments: Record<string, string[]>;
}

export function UnitAssignments({ projectId, users, assignments }: UnitAssignmentsProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [unitFilter, setUnitFilter] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  useEffect(() => {
    setSelectedUnits(assignments[selectedUserId] || []);
  }, [assignments, selectedUserId]);
  const filteredUnits = useMemo(() => {
    const lower = unitFilter.trim().toLowerCase();
    if (!lower) return UNITS;
    return UNITS.filter((u) => u.name.toLowerCase().includes(lower) || u.code.toLowerCase().includes(lower));
  }, [unitFilter]);

  const toggleUnit = (code: string) => {
    const next = new Set(selectedUnits);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    const nextArr = Array.from(next);
    setSelectedUnits(nextArr);
  };

  const saveAssignments = async () => {
    if (!selectedUserId) return;
    const user = users.find((u) => u.id === selectedUserId);
    try {
      await setDoc(doc(db, 'assignments', `${projectId}_${selectedUserId}`), {
        projectId,
        userId: selectedUserId,
        email: user?.email || null,
        displayName: user?.displayName || null,
        unitCodes: selectedUnits,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'assignments');
    }
  };

  return (
    <div className="panel-card rounded-[24px] p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="section-title">Ph�n c�ng theo d�i don v?</h3>
          <p className="page-subtitle mt-2 text-sm">Admin g�n don v? cho t?ng ngu?i theo d�i trong d? �n hi?n t?i.</p>
        </div>
        <button onClick={saveAssignments} className="primary-btn">Luu ph�n c�ng</button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        <div className="panel-soft rounded-[20px] p-4">
          <label className="col-header block mb-2">Ch?n ngu?i theo d�i</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="field-select text-sm font-bold"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.displayName || user.email}</option>
            ))}
          </select>

          <label className="col-header block mt-4 mb-2">T�m don v?</label>
          <input
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="field-input"
            placeholder="Nh?p m� ho?c t�n don v?"
          />
        </div>

        <div className="max-h-[320px] overflow-auto rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
          <div className="grid grid-cols-1 gap-2">
            {filteredUnits.map((unit) => {
              const checked = selectedUnits.includes(unit.code);
              return (
                <label key={unit.code} className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUnit(unit.code)}
                    className="theme-checkbox h-3.5 w-3.5"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">{unit.name}</p>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


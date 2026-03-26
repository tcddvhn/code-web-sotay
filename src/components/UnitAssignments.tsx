import React, { useEffect, useMemo, useState } from 'react';
import { AssignmentUser, ManagedUnit } from '../types';

interface UnitAssignmentsProps {
  projectId: string;
  units: ManagedUnit[];
  users: AssignmentUser[];
  assignments: Record<string, string[]>;
  onSaveAssignments: (assigneeKey: string, unitCodes: string[]) => Promise<void>;
}

export function UnitAssignments({ projectId, units, users, assignments, onSaveAssignments }: UnitAssignmentsProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [unitFilter, setUnitFilter] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (users.length > 0 && !users.find((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  useEffect(() => {
    setSelectedUnits(assignments[selectedUserId] || []);
  }, [assignments, selectedUserId]);

  const assignedElsewhere = useMemo(() => {
    const hidden = new Set<string>();
    Object.entries(assignments).forEach(([assigneeKey, unitCodes]) => {
      if (assigneeKey === selectedUserId) return;
      unitCodes.forEach((unitCode) => hidden.add(unitCode));
    });
    return hidden;
  }, [assignments, selectedUserId]);

  const filteredUnits = useMemo(() => {
    const lower = unitFilter.trim().toLowerCase();
    const source = units.filter(
      (unit) => selectedUnits.includes(unit.code) || !assignedElsewhere.has(unit.code),
    );
    if (!lower) return source;
    return source.filter((u) => u.name.toLowerCase().includes(lower) || u.code.toLowerCase().includes(lower));
  }, [assignedElsewhere, selectedUnits, unitFilter, units]);

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
    setIsSaving(true);
    try {
      await onSaveAssignments(selectedUserId, selectedUnits);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="panel-card rounded-[24px] p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="section-title">Phân công theo dõi đơn vị</h3>
          <p className="page-subtitle mt-2 text-sm">
            Admin gán đơn vị cho 8 tài khoản đã cấp quyền. Đơn vị đã giao cho người khác sẽ tự ẩn khỏi danh sách chọn.
          </p>
        </div>
        <button
          onClick={saveAssignments}
          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!selectedUserId || isSaving}
        >
          {isSaving ? 'Đang lưu...' : 'Lưu phân công'}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        <div className="panel-soft rounded-[20px] p-4">
          <label className="col-header block mb-2">Chọn người theo dõi</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="field-select text-sm font-bold"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.displayName || user.email}</option>
            ))}
          </select>

          <label className="col-header block mt-4 mb-2">Tìm đơn vị</label>
          <input
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="field-input"
            placeholder="Nhập mã hoặc tên đơn vị"
          />
          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            Dự án: <span className="font-semibold">{projectId}</span>
          </p>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">
            Đang hiện {filteredUnits.length}/{units.length} đơn vị khả dụng.
          </p>
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

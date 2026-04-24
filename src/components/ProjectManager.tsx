import React, { useMemo, useState } from 'react';
import { CheckCircle, Clock, FolderOpen, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Department, ManagedUnit, Project } from '../types';

type CreateProjectPayload = {
  name: string;
  description: string;
  unitCodes: string[];
  ownerDepartmentId?: string | null;
};

type UpdateProjectPayload = {
  name: string;
  description: string;
  ownerDepartmentId?: string | null;
};

export function ProjectManager({
  projects,
  units,
  departments,
  currentDepartmentId,
  isAdmin,
  onSelectProject,
  onDeleteProject,
  onCreateProject,
  onUpdateProject,
  onToggleProjectStatus,
}: {
  projects: Project[];
  units: ManagedUnit[];
  departments: Department[];
  currentDepartmentId?: string | null;
  isAdmin: boolean;
  onSelectProject: (project: Project) => void;
  onDeleteProject: (project: Project) => Promise<boolean>;
  onCreateProject: (payload: CreateProjectPayload) => Promise<Project>;
  onUpdateProject: (project: Project, payload: UpdateProjectPayload) => Promise<Project>;
  onToggleProjectStatus: (project: Project) => Promise<Project>;
}) {
  const activeUnits = useMemo(() => units.filter((unit) => !unit.isDeleted), [units]);
  const activeDepartments = useMemo(
    () => departments.filter((department) => department.isActive).sort((left, right) => left.sortOrder - right.sortOrder),
    [departments],
  );
  const departmentById = useMemo(
    () =>
      departments.reduce<Record<string, Department>>((accumulator, department) => {
        accumulator[department.id] = department;
        return accumulator;
      }, {}),
    [departments],
  );
  const defaultUnitCodes = useMemo(() => activeUnits.map((unit) => unit.code), [activeUnits]);
  const defaultDepartmentId = currentDepartmentId || activeDepartments[0]?.id || '';

  const [isAdding, setIsAdding] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', ownerDepartmentId: defaultDepartmentId });
  const [newProjectUnitCodes, setNewProjectUnitCodes] = useState<string[]>(defaultUnitCodes);
  const [unitSearch, setUnitSearch] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [updatingProjectId, setUpdatingProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectDraft, setEditingProjectDraft] = useState({
    name: '',
    description: '',
    ownerDepartmentId: '',
  });
  const [message, setMessage] = useState<string | null>(null);

  const normalizedUnitSearch = unitSearch.trim().toLocaleLowerCase('vi');
  const filteredUnits = useMemo(() => {
    if (!normalizedUnitSearch) {
      return activeUnits;
    }
    return activeUnits.filter((unit) => {
      const normalizedName = unit.name.toLocaleLowerCase('vi');
      const normalizedCode = unit.code.toLocaleLowerCase('vi');
      return normalizedName.includes(normalizedUnitSearch) || normalizedCode.includes(normalizedUnitSearch);
    });
  }, [activeUnits, normalizedUnitSearch]);

  const resetCreateDraft = () => {
    setNewProject({
      name: '',
      description: '',
      ownerDepartmentId: currentDepartmentId || activeDepartments[0]?.id || '',
    });
    setNewProjectUnitCodes(defaultUnitCodes);
    setUnitSearch('');
  };

  const openAddProject = () => {
    setIsAdding(true);
    setMessage(null);
    resetCreateDraft();
  };

  const closeAddProject = () => {
    setIsAdding(false);
    resetCreateDraft();
  };

  const toggleProjectUnit = (unitCode: string) => {
    setNewProjectUnitCodes((previous) =>
      previous.includes(unitCode) ? previous.filter((code) => code !== unitCode) : [...previous, unitCode],
    );
  };

  const handleAddProject = async () => {
    if (!newProject.name.trim()) {
      setMessage('Vui lòng nhập tên dự án trước khi lưu.');
      return;
    }

    if (!newProjectUnitCodes.length) {
      setMessage('Vui lòng chọn ít nhất một đơn vị thực hiện dự án.');
      return;
    }

    if (!(currentDepartmentId || newProject.ownerDepartmentId)) {
      setMessage('Vui lòng chọn phòng ban chủ quản cho dự án.');
      return;
    }

    setIsSavingProject(true);
    setMessage(null);
    try {
      const project = await onCreateProject({
        name: newProject.name.trim(),
        description: newProject.description.trim(),
        unitCodes: newProjectUnitCodes,
        ownerDepartmentId: currentDepartmentId || newProject.ownerDepartmentId,
      });
      onSelectProject(project);
      closeAddProject();
      setMessage(`Đã lưu dự án "${project.name}".`);
    } catch (error) {
      console.error('Create project error:', error);
      setMessage(error instanceof Error ? error.message : 'Không thể lưu dự án mới.');
    } finally {
      setIsSavingProject(false);
    }
  };

  const toggleStatus = async (project: Project) => {
    setUpdatingProjectId(project.id);
    try {
      const updated = await onToggleProjectStatus(project);
      setMessage(`Đã cập nhật trạng thái dự án "${updated.name}".`);
    } catch (error) {
      console.error('Update project status error:', error);
      setMessage(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái dự án.');
    } finally {
      setUpdatingProjectId(null);
    }
  };

  const startEditingProject = (project: Project) => {
    setEditingProjectId(project.id);
    setEditingProjectDraft({
      name: project.name,
      description: project.description || '',
      ownerDepartmentId: project.ownerDepartmentId || currentDepartmentId || activeDepartments[0]?.id || '',
    });
    setMessage(null);
  };

  const cancelEditingProject = () => {
    setEditingProjectId(null);
    setEditingProjectDraft({ name: '', description: '', ownerDepartmentId: '' });
  };

  const saveProjectChanges = async (project: Project) => {
    if (!editingProjectDraft.name.trim()) {
      setMessage('Vui lòng nhập tên dự án trước khi lưu chỉnh sửa.');
      return;
    }

    setUpdatingProjectId(project.id);
    setMessage(null);
    try {
      const updated = await onUpdateProject(project, {
        name: editingProjectDraft.name.trim(),
        description: editingProjectDraft.description.trim(),
        ownerDepartmentId: isAdmin ? editingProjectDraft.ownerDepartmentId : project.ownerDepartmentId,
      });
      setMessage(`Đã cập nhật dự án "${updated.name}".`);
      cancelEditingProject();
    } catch (error) {
      console.error('Update project error:', error);
      setMessage(error instanceof Error ? error.message : 'Không thể cập nhật dự án.');
    } finally {
      setUpdatingProjectId(null);
    }
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ dữ liệu của dự án "${project.name}"?`)) {
      return;
    }

    setDeletingProjectId(project.id);
    try {
      const deleted = await onDeleteProject(project);
      if (!deleted) {
        setMessage('Không thể xóa dự án này. Hãy kiểm tra quyền và dữ liệu liên quan.');
        return;
      }
      setMessage(`Đã xóa dự án "${project.name}".`);
    } catch (error) {
      console.error('Delete project error:', error);
      setMessage(error instanceof Error ? error.message : 'Không thể xóa dự án.');
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="page-title">Quản lý dự án</h2>
        <button onClick={openAddProject} className="primary-btn flex items-center gap-2">
          <Plus size={16} />
          Tạo dự án mới
        </button>
      </div>

      {message && (
        <div className="mb-6 rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--ink-soft)] shadow-[0_16px_36px_rgba(38,31,18,0.08)]">
          {message}
        </div>
      )}

      {isAdding && (
        <div className="panel-card mb-8 rounded-[24px] p-6">
          <h3 className="section-title mb-4">Thông tin dự án mới</h3>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Tên dự án (ví dụ: Tổng hợp quý 1/2026)"
              value={newProject.name}
              onChange={(event) => setNewProject((previous) => ({ ...previous, name: event.target.value }))}
              className="field-input"
            />
            <textarea
              placeholder="Mô tả chi tiết dự án..."
              value={newProject.description}
              onChange={(event) => setNewProject((previous) => ({ ...previous, description: event.target.value }))}
              className="field-input"
              rows={3}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <p className="col-header mb-2">Phòng ban chủ quản</p>
                {currentDepartmentId && !isAdmin ? (
                  <div className="rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.92)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                    {departmentById[currentDepartmentId]?.name || 'Chưa xác định phòng ban'}
                  </div>
                ) : (
                  <select
                    value={newProject.ownerDepartmentId}
                    onChange={(event) =>
                      setNewProject((previous) => ({ ...previous, ownerDepartmentId: event.target.value }))
                    }
                    className="field-select"
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {activeDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="rounded-[20px] border border-[var(--line)] bg-[rgba(255,255,255,0.9)] p-4">
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                    Danh sách đơn vị thực hiện dự án
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Đã chọn {newProjectUnitCodes.length}/{activeUnits.length} đơn vị. Mặc định toàn bộ đơn vị đang hoạt động được chọn sẵn.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProjectUnitCodes(defaultUnitCodes)}
                    className="secondary-btn !px-4 !py-2 text-xs"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProjectUnitCodes([])}
                    className="secondary-btn !px-4 !py-2 text-xs"
                  >
                    Bỏ chọn tất cả
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={unitSearch}
                onChange={(event) => setUnitSearch(event.target.value)}
                placeholder="Tìm theo mã hoặc tên đơn vị..."
                className="field-input !h-11"
              />

              <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto rounded-[18px] border border-[var(--line)] bg-white p-3">
                {filteredUnits.map((unit) => {
                  const checked = newProjectUnitCodes.includes(unit.code);
                  return (
                    <label
                      key={unit.code}
                      className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-transparent px-3 py-2 transition hover:border-[var(--line)] hover:bg-[rgba(255,248,240,0.7)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProjectUnit(unit.code)}
                        className="mt-1 h-4 w-4 rounded border-[var(--line)] text-[var(--primary)] focus:ring-[var(--primary)]"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--ink)]">{unit.name}</div>
                        <div className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]">{unit.code}</div>
                      </div>
                    </label>
                  );
                })}

                {filteredUnits.length === 0 && (
                  <div className="rounded-[16px] border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--ink-soft)]">
                    Không tìm thấy đơn vị phù hợp.
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddProject}
                disabled={isSavingProject}
                className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSavingProject ? 'Đang lưu...' : 'Lưu dự án'}
              </button>
              <button
                onClick={closeAddProject}
                disabled={isSavingProject}
                className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const ownerDepartment = project.ownerDepartmentId ? departmentById[project.ownerDepartmentId] : null;
          return (
            <div key={project.id} className="panel-card flex flex-col rounded-[24px] p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div
                  className={`status-pill ${project.status === 'ACTIVE' ? 'status-pill-submitted' : 'status-pill-pending'}`}
                >
                  {project.status === 'ACTIVE' ? 'Đang triển khai' : 'Đã hoàn thành'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditingProject(project)}
                    title="Sửa thông tin dự án"
                    disabled={updatingProjectId === project.id || deletingProjectId === project.id}
                    className="disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => toggleStatus(project)}
                    title="Đổi trạng thái"
                    disabled={updatingProjectId === project.id}
                    className="disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {project.status === 'ACTIVE' ? <CheckCircle size={16} /> : <Clock size={16} />}
                  </button>
                  {isAdmin ? (
                    <button
                      onClick={() => deleteProject(project)}
                      className="text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={deletingProjectId === project.id}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              </div>

              {editingProjectId === project.id ? (
                <>
                  <div className="space-y-3">
                    <input
                      type="text"
                      className="field-input"
                      value={editingProjectDraft.name}
                      onChange={(event) =>
                        setEditingProjectDraft((previous) => ({ ...previous, name: event.target.value }))
                      }
                      placeholder="Tên dự án"
                    />
                    <textarea
                      className="field-input"
                      rows={3}
                      value={editingProjectDraft.description}
                      onChange={(event) =>
                        setEditingProjectDraft((previous) => ({ ...previous, description: event.target.value }))
                      }
                      placeholder="Mô tả chi tiết dự án..."
                    />
                    <div>
                      <p className="col-header mb-2">Phòng ban chủ quản</p>
                      {isAdmin ? (
                        <select
                          value={editingProjectDraft.ownerDepartmentId}
                          onChange={(event) =>
                            setEditingProjectDraft((previous) => ({
                              ...previous,
                              ownerDepartmentId: event.target.value,
                            }))
                          }
                          className="field-select h-11 text-sm"
                        >
                          <option value="">-- Chọn phòng ban --</option>
                          {activeDepartments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.92)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                          {ownerDepartment?.name || 'Chưa xác định phòng ban'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => saveProjectChanges(project)}
                      disabled={updatingProjectId === project.id}
                      className="primary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Save size={16} />
                      {updatingProjectId === project.id ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
                    </button>
                    <button
                      onClick={cancelEditingProject}
                      disabled={updatingProjectId === project.id}
                      className="secondary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X size={16} />
                      Hủy
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="mb-2 text-xl font-semibold text-[var(--ink)]">{project.name}</h3>
                  <p className="text-xs text-[var(--ink-soft)]">{project.description || 'Không có mô tả.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                      {ownerDepartment?.name || 'Chưa gán phòng ban'}
                    </span>
                  </div>
                  <button
                    onClick={() => onSelectProject(project)}
                    className="secondary-btn mt-6 flex items-center justify-center gap-2"
                  >
                    <FolderOpen size={16} />
                    Truy cập dự án
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

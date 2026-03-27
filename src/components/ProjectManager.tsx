import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle, Clock, FolderOpen } from 'lucide-react';
import { Project } from '../types';

export function ProjectManager({
  projects,
  onSelectProject,
  onDeleteProject,
  onCreateProject,
  onToggleProjectStatus,
}: {
  projects: Project[];
  onSelectProject: (p: Project) => void;
  onDeleteProject: (project: Project) => Promise<boolean>;
  onCreateProject: (payload: { name: string; description: string }) => Promise<Project>;
  onToggleProjectStatus: (project: Project) => Promise<Project>;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [updatingProjectId, setUpdatingProjectId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAddProject = async () => {
    if (!newProject.name.trim()) {
      setMessage('Vui lòng nhập tên dự án trước khi lưu.');
      return;
    }

    setIsSavingProject(true);
    setMessage(null);
    try {
      const project = await onCreateProject({
        name: newProject.name.trim(),
        description: newProject.description.trim(),
      });
      onSelectProject(project);
      setIsAdding(false);
      setNewProject({ name: '', description: '' });
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

  const deleteProject = async (project: Project) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa toàn bộ dữ liệu của dự án "${project.name}"?`)) return;
    setDeletingProjectId(project.id);
    try {
      const deleted = await onDeleteProject(project);
      if (!deleted) {
        setMessage('Không thể xóa dự án này. Hãy kiểm tra quyền và dữ liệu liên quan.');
        return;
      }
      setMessage(`Đã xóa dự án "${project.name}".`);
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="page-title">Quản lý Dự án</h2>
        <button onClick={() => setIsAdding(true)} className="primary-btn flex items-center gap-2">
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
              onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              className="field-input"
            />
            <textarea
              placeholder="Mô tả chi tiết dự án..."
              value={newProject.description}
              onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              className="field-input"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={handleAddProject}
                disabled={isSavingProject}
                className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSavingProject ? 'Đang lưu...' : 'Lưu dự án'}
              </button>
              <button
                onClick={() => setIsAdding(false)}
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
        {projects.map((project) => (
          <div key={project.id} className="panel-card flex flex-col rounded-[24px] p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className={`status-pill ${project.status === 'ACTIVE' ? 'status-pill-submitted' : 'status-pill-pending'}`}>
                {project.status === 'ACTIVE' ? 'Đang triển khai' : 'Đã hoàn thành'}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleStatus(project)}
                  title="Đổi trạng thái"
                  disabled={updatingProjectId === project.id}
                  className="disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {project.status === 'ACTIVE' ? <CheckCircle size={16} /> : <Clock size={16} />}
                </button>
                <button
                  onClick={() => deleteProject(project)}
                  className="text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={deletingProjectId === project.id}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <h3 className="mb-2 text-xl font-semibold text-[var(--ink)]">{project.name}</h3>
            <p className="flex-1 text-xs text-[var(--ink-soft)]">{project.description || 'Không có mô tả.'}</p>
            <button
              onClick={() => onSelectProject(project)}
              className="secondary-btn mt-6 flex items-center justify-center gap-2"
            >
              <FolderOpen size={16} />
              Truy cập dự án
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

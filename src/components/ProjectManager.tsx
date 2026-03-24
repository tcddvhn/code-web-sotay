import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { Plus, Trash2, CheckCircle, Clock, FolderOpen } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Project } from '../types';

export function ProjectManager({ onSelectProject }: { onSelectProject: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'projects'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Project));
        setProjects(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'projects'),
    );
    return () => unsubscribe();
  }, []);

  const handleAddProject = async () => {
    if (!newProject.name) return;
    const id = `proj_${Date.now()}`;
    try {
      await setDoc(doc(db, 'projects', id), {
        id,
        name: newProject.name,
        description: newProject.description,
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setIsAdding(false);
      setNewProject({ name: '', description: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    }
  };

  const toggleStatus = async (project: Project) => {
    try {
      await setDoc(doc(db, 'projects', project.id), {
        ...project,
        status: project.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa dự án này?')) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'projects');
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <h2 className="page-title">Quản lý Dự án</h2>
        <button onClick={() => setIsAdding(true)} className="primary-btn flex items-center gap-2">
          <Plus size={16} />
          Tạo dự án mới
        </button>
      </div>

      {isAdding && (
        <div className="panel-card rounded-[24px] p-6 mb-8">
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
              <button onClick={handleAddProject} className="primary-btn">Lưu dự án</button>
              <button onClick={() => setIsAdding(false)} className="secondary-btn">Hủy</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div key={project.id} className="panel-card rounded-[24px] p-6 flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className={`status-pill ${project.status === 'ACTIVE' ? 'status-pill-submitted' : 'status-pill-pending'}`}>
                {project.status === 'ACTIVE' ? 'Đang triển khai' : 'Đã hoàn thành'}
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleStatus(project)} title="Đổi trạng thái">
                  {project.status === 'ACTIVE' ? <CheckCircle size={16} /> : <Clock size={16} />}
                </button>
                <button onClick={() => deleteProject(project.id)} className="text-[var(--primary)]">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <h3 className="text-xl font-semibold text-[var(--ink)] mb-2">{project.name}</h3>
            <p className="text-xs text-[var(--ink-soft)] flex-1">{project.description || 'Không có mô tả.'}</p>
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




import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Project } from '../types';
import { Plus, Trash2, CheckCircle, Clock, FolderOpen } from 'lucide-react';

export function ProjectManager({ onSelectProject }: { onSelectProject: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });
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
        updatedAt: serverTimestamp()
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
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('B?n c� ch?c ch?n mu?n x�a d? �n n�y?')) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'projects');
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-12">
        <h2 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">Qu?n l� D? �n</h2>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform"
        >
          <Plus size={16} />
          T?o d? �n m?i
        </button>
      </div>

      {isAdding && (
        <div className="mb-12 p-8 border border-black bg-white shadow-xl">
          <h3 className="col-header mb-6">Th�ng tin d? �n m?i</h3>
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="T�n d? �n (v� d?: T?ng h?p qu� 1/2026)" 
              value={newProject.name}
              onChange={e => setNewProject({...newProject, name: e.target.value})}
              className="w-full bg-transparent border-b border-black py-3 font-serif text-xl focus:outline-none"
            />
            <textarea 
              placeholder="M� t? chi ti?t d? �n..." 
              value={newProject.description}
              onChange={e => setNewProject({...newProject, description: e.target.value})}
              className="w-full bg-transparent border-b border-black py-3 font-sans text-sm focus:outline-none"
              rows={3}
            />
            <div className="flex gap-4 mt-6">
              <button onClick={handleAddProject} className="px-8 py-3 bg-black text-white text-xs font-bold uppercase tracking-widest">Luu d? �n</button>
              <button onClick={() => setIsAdding(false)} className="px-8 py-3 border border-black text-xs font-bold uppercase tracking-widest">H?y</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {projects.map(project => (
          <div key={project.id} className="border border-black bg-white p-8 flex flex-col group hover:shadow-2xl transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className={`px-3 py-1 text-[8px] font-bold uppercase tracking-widest ${project.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {project.status === 'ACTIVE' ? 'Dang tri?n khai' : 'D� ho�n th�nh'}
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleStatus(project)} title="D?i tr?ng th�i">
                  {project.status === 'ACTIVE' ? <CheckCircle size={16} /> : <Clock size={16} />}
                </button>
                <button onClick={() => deleteProject(project.id)} className="text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <h3 className="text-2xl font-bold tracking-tight mb-2 font-serif italic">{project.name}</h3>
            <p className="text-xs opacity-60 mb-8 flex-1">{project.description || 'Kh�ng c� m� t?.'}</p>
            <button 
              onClick={() => onSelectProject(project)}
              className="w-full py-4 border border-black flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-all"
            >
              <FolderOpen size={16} />
              Truy c?p d? �n
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


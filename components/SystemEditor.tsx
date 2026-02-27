import React from 'react';
import { WeatherSystem } from '../types';
import { X, Trash2 } from 'lucide-react';

interface SystemEditorProps {
  system: WeatherSystem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<WeatherSystem>) => void;
  onDelete: (id: string) => void;
}

export const SystemEditor: React.FC<SystemEditorProps> = ({ system, isOpen, onClose, onUpdate, onDelete }) => {
  if (!isOpen || !system) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto" onClick={onClose} />
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-80 pointer-events-auto relative transform transition-all scale-100 border border-white/50 animate-in fade-in zoom-in duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
            <X size={18} />
        </button>
        
        <h3 className="text-lg font-bold text-slate-800 mb-4">Edit Zone</h3>
        
        <div className="space-y-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                <input 
                    type="text" 
                    value={system.title} 
                    onChange={(e) => onUpdate(system.id, { title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                    autoFocus
                />
            </div>
            
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Theme</label>
                <div className="grid grid-cols-4 gap-2">
                    {['warm', 'cool', 'dark', 'nature'].map(t => (
                        <button
                            key={t}
                            onClick={() => onUpdate(system.id, { theme: t as any })}
                            className={`h-8 rounded-md border-2 transition-all ${system.theme === t ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-transparent hover:scale-105'}`}
                            style={{ 
                                background: t === 'warm' ? '#fed7aa' : t === 'cool' ? '#bae6fd' : t === 'dark' ? '#334155' : '#bbf7d0'
                            }}
                            title={t}
                        />
                    ))}
                </div>
            </div>
            
            <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Size</label>
                 <input 
                    type="range" 
                    min="200" 
                    max="800" 
                    value={system.radius} 
                    onChange={(e) => onUpdate(system.id, { radius: parseInt(e.target.value) })}
                    className="w-full accent-indigo-500"
                 />
            </div>

            <div className="pt-4 border-t mt-4 flex justify-between items-center">
                <button 
                    onClick={() => onDelete(system.id)}
                    className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium px-2 py-1 rounded hover:bg-red-50"
                >
                    <Trash2 size={14} /> Delete
                </button>
                <button onClick={onClose} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold transition-colors">Done</button>
            </div>
        </div>
      </div>
    </div>
  );
};

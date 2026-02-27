import React, { useState, useEffect } from 'react';
import { CloudData, CloudPriority, CloudStatus, CloudType } from '../types';
import { X, Trash2, Save, CloudRain, CloudLightning, Cloud, Circle, MessageCircle, Tag, Droplets, Plus, Image as ImageIcon, BoxSelect } from 'lucide-react';

interface CloudEditorProps {
  cloud: CloudData | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (cloud: CloudData) => void;
  onDelete: (id: string) => void;
}

const TYPE_ICONS: Record<CloudType, React.ReactNode> = {
  cumulus: <Cloud size={18} />,
  thought: <MessageCircle size={18} />,
  nimbus: <Cloud size={18} className="fill-current" />,
  cirrus: <Circle size={18} className="scale-y-50" />,
  storm: <CloudLightning size={18} />,
  stratus: <Cloud size={18} className="scale-y-50 scale-x-150" />,
  lenticular: <Circle size={18} className="scale-y-25 scale-x-125" />,
  mammatus: <CloudRain size={18} className="rotate-180" />,
  fractal: <BoxSelect size={18} />
};

const STATUS_OPTIONS: CloudStatus[] = ['backlog', 'active', 'blocked', 'done'];
const PRIORITY_OPTIONS: CloudPriority[] = ['low', 'medium', 'high'];

export const CloudEditor: React.FC<CloudEditorProps> = ({ cloud, isOpen, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState<Partial<CloudData>>({});
  const [tagInput, setTagInput] = useState('');
  const [raindropInput, setRaindropInput] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'image' | 'plan'>('details');

  useEffect(() => {
    if (cloud) {
      setFormData({ ...cloud });
      setActiveTab('details');
    } else {
      setFormData({
        type: 'cumulus',
        title: '',
        description: '',
        emoji: '☁️',
        color: '#ffffff',
        tags: [],
        subItems: [],
        status: 'backlog',
        priority: 'medium',
        effort: 3,
        impact: 5,
        confidence: 6
      });
      setActiveTab('details');
    }
  }, [cloud, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof CloudData, value: any) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    
    // Live Preview: If editing an existing cloud, save immediately
    if (cloud) {
       onSave(newData as CloudData); 
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              handleChange('imageUrl', reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTags = [...(formData.tags || []), tagInput.trim()];
      handleChange('tags', newTags);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = (formData.tags || []).filter(t => t !== tagToRemove);
    handleChange('tags', newTags);
  };

  const handleAddRaindrop = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ((e.type === 'click' || (e as React.KeyboardEvent).key === 'Enter') && raindropInput.trim()) {
      if (e.type === 'keydown') (e as React.KeyboardEvent).preventDefault();
      const newItems = [...(formData.subItems || []), raindropInput.trim()];
      
      // Update local state and trigger live save
      handleChange('subItems', newItems);
      setRaindropInput('');
    }
  };

  const removeRaindrop = (idx: number) => {
    const newItems = [...(formData.subItems || [])];
    newItems.splice(idx, 1);
    handleChange('subItems', newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title) {
      onSave(formData as CloudData);
      onClose();
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-96 bg-white/95 backdrop-blur-xl shadow-2xl transform transition-transform duration-300 z-50 flex flex-col border-l border-white/50">
      <div className="p-6 flex justify-between items-center border-b border-gray-100">
        <div className="flex gap-4">
             <button 
                type="button"
                onClick={() => setActiveTab('details')}
                className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeTab === 'details' ? 'border-blue-500 text-slate-800' : 'border-transparent text-slate-400'}`}
             >
                 Details
             </button>
             <button 
                type="button"
                onClick={() => setActiveTab('image')}
                className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeTab === 'image' ? 'border-blue-500 text-slate-800' : 'border-transparent text-slate-400'}`}
             >
                 Image
             </button>
             <button
                type="button"
                onClick={() => setActiveTab('plan')}
                className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeTab === 'plan' ? 'border-blue-500 text-slate-800' : 'border-transparent text-slate-400'}`}
             >
                 Plan
             </button>
        </div>
        <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <X size={20} className="text-slate-500" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Type Selection */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Cloud Shape</label>
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(TYPE_ICONS) as CloudType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleChange('type', type)}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all ${
                  formData.type === type 
                    ? 'border-blue-500 bg-blue-50 text-blue-600' 
                    : 'border-transparent hover:bg-slate-100 text-slate-400'
                }`}
                title={type.charAt(0).toUpperCase() + type.slice(1)}
              >
                {TYPE_ICONS[type]}
                <span className="text-[10px] mt-1 capitalize">{type}</span>
              </button>
            ))}
          </div>
        </div>
        
        {activeTab === 'image' && (
            <div className="space-y-4 animate-in fade-in">
                 <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
                     {formData.imageUrl ? (
                         <div className="relative group">
                            <img src={formData.imageUrl} alt="Cloud content" className="w-full h-48 object-contain rounded-md" />
                            <button 
                                type="button"
                                onClick={() => handleChange('imageUrl', undefined)}
                                className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X size={14}/>
                            </button>
                         </div>
                     ) : (
                         <label className="cursor-pointer block">
                             <ImageIcon size={48} className="mx-auto text-slate-300 mb-2"/>
                             <span className="text-sm text-slate-500 font-medium">Click to upload an image</span>
                             <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                         </label>
                     )}
                 </div>
                 <p className="text-xs text-slate-400 text-center">Images will be masked to fit the cloud shape.</p>
            </div>
        )}

        {activeTab === 'details' && (
        <div className="space-y-4 animate-in fade-in">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Title</label>
            <input
              type="text"
              required
              autoFocus={!cloud}
              value={formData.title || ''}
              onChange={(e) => handleChange('title', e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-slate-800 placeholder:text-slate-400 font-medium"
              placeholder="e.g. Website Launch"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Emoji</label>
              <div className="relative">
                  <input
                    type="text"
                    value={formData.emoji || ''}
                    onChange={(e) => handleChange('emoji', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-center bg-white text-slate-800 placeholder:text-slate-400"
                    placeholder="None"
                  />
                  {formData.emoji && (
                      <button type="button" onClick={() => handleChange('emoji', undefined)} className="absolute right-1 top-2.5 text-slate-300 hover:text-slate-500"><X size={12}/></button>
                  )}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Cost / Value</label>
              <input
                type="number"
                value={formData.cost === undefined ? '' : formData.cost}
                onChange={(e) => handleChange('cost', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-800 placeholder:text-slate-400"
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Raindrops (Sub-items) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Raindrops (Sub-tasks)</label>
            <div className="space-y-2 mb-2">
               {formData.subItems?.map((item, i) => (
                 <div key={i} className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 animate-in fade-in slide-in-from-top-1">
                    <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"></div>
                    <span className="text-sm text-slate-700 flex-1 break-words">{item}</span>
                    <button type="button" onClick={() => removeRaindrop(i)} className="text-slate-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                 </div>
               ))}
            </div>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Droplets size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                    type="text"
                    value={raindropInput}
                    onChange={(e) => setRaindropInput(e.target.value)}
                    onKeyDown={handleAddRaindrop}
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-800 placeholder:text-slate-400 text-sm"
                    placeholder="Add a drop (Enter)"
                />
              </div>
              <button 
                type="button" 
                onClick={handleAddRaindrop}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
              >
                <Plus size={20}/>
              </button>
            </div>
          </div>

           {/* Tags */}
           <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.tags?.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-xs font-medium border border-indigo-100">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-indigo-800"><X size={12}/></button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Tag size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-800 placeholder:text-slate-400 text-sm"
                placeholder="Add tags..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Details</label>
            <textarea
              rows={3}
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white text-slate-800 placeholder:text-slate-400"
              placeholder="Add more context..."
            />
          </div>
        </div>
        )}

        {activeTab === 'plan' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={formData.status || 'backlog'}
                  onChange={(e) => handleChange('status', e.target.value as CloudStatus)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-800"
                >
                  {STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Priority</label>
                <select
                  value={formData.priority || 'medium'}
                  onChange={(e) => handleChange('priority', e.target.value as CloudPriority)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-800"
                >
                  {PRIORITY_OPTIONS.map(priority => (
                    <option key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Owner</label>
                <input
                  type="text"
                  value={formData.owner || ''}
                  onChange={(e) => handleChange('owner', e.target.value || undefined)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-800 placeholder:text-slate-400"
                  placeholder="Who owns this?"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate || ''}
                  onChange={(e) => handleChange('dueDate', e.target.value || undefined)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-800"
                />
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-slate-700">Effort</label>
                  <span className="text-xs text-slate-500">{formData.effort ?? 3}/10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.effort ?? 3}
                  onChange={(e) => handleChange('effort', parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-slate-700">Impact</label>
                  <span className="text-xs text-slate-500">{formData.impact ?? 5}/10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.impact ?? 5}
                  onChange={(e) => handleChange('impact', parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-slate-700">Confidence</label>
                  <span className="text-xs text-slate-500">{formData.confidence ?? 6}/10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.confidence ?? 6}
                  onChange={(e) => handleChange('confidence', parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Appearance */}
        <div className="space-y-4 pt-4 border-t border-gray-100">
           <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Cloud Color</label>
            <div className="flex gap-3">
              <input
                type="color"
                value={formData.color || '#ffffff'}
                onChange={(e) => handleChange('color', e.target.value)}
                className="w-10 h-10 rounded-full cursor-pointer border-2 border-white shadow-sm"
              />
              <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-2">
                 {/* Preset Colors */}
                 {['#ffffff', '#f8fafc', '#e0f2fe', '#bae6fd', '#cbd5e1', '#94a3b8', '#fecaca', '#fde68a'].map(c => (
                   <button
                    key={c}
                    type="button"
                    onClick={() => handleChange('color', c)}
                    className="w-8 h-8 rounded-full border border-slate-200 shadow-sm flex-shrink-0"
                    style={{ backgroundColor: c }}
                   />
                 ))}
              </div>
            </div>
          </div>
        </div>

      </form>

      <div className="p-6 border-t border-gray-100 bg-white/50 flex justify-between items-center">
        {cloud && (
          <button 
            onClick={() => onDelete(cloud.id)}
            className="flex items-center gap-2 text-red-500 hover:text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
          >
            <Trash2 size={16} />
            Delete
          </button>
        )}
        <div className="flex gap-3 ml-auto">
           <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors font-medium"
          >
            Close
          </button>
          {!cloud && (
            <button 
                onClick={handleSubmit}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 font-medium"
            >
                <Save size={16} />
                Create
            </button>
          )}
          {/* For existing clouds, changes are saved automatically, no 'Save' button needed, just visual indicator maybe, or keep Close/Delete */}
        </div>
      </div>
    </div>
  );
};

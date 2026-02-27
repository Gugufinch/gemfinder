import React from 'react';
import { WeatherSystem as SystemType } from '../types';

interface WeatherSystemProps {
  data: SystemType;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

const THEME_STYLES = {
  warm: 'from-orange-200/40 to-yellow-100/20 border-orange-300/30 text-orange-900',
  cool: 'from-blue-200/40 to-cyan-100/20 border-blue-300/30 text-blue-900',
  dark: 'from-slate-700/40 to-slate-800/20 border-slate-600/30 text-slate-100',
  nature: 'from-green-200/40 to-emerald-100/20 border-green-300/30 text-green-900',
};

export const WeatherSystem: React.FC<WeatherSystemProps> = ({ data, isSelected, onMouseDown, onDoubleClick }) => {
  const themeClass = THEME_STYLES[data.theme] || THEME_STYLES.cool;

  return (
    <div
      className={`absolute rounded-full border-2 backdrop-blur-[2px] bg-gradient-to-br flex items-center justify-center group cursor-grab active:cursor-grabbing transition-colors system-node ${themeClass}`}
      style={{
        left: data.x,
        top: data.y,
        width: data.radius * 2,
        height: data.radius * 2,
        transform: 'translate(-50%, -50%)',
        zIndex: 0, // Behind clouds
        borderColor: isSelected ? 'rgba(255,255,255,0.8)' : undefined
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
        {/* Animated Inner Ring */}
        <div className="absolute inset-2 border border-dashed border-white/30 rounded-full animate-[spin_60s_linear_infinite]" />
        
        {/* Label on top arc */}
        <div className="absolute top-8 font-bold text-xl opacity-50 group-hover:opacity-100 transition-opacity select-none tracking-widest uppercase pointer-events-none">
            {data.title}
        </div>
        
        {/* Decorative Particles */}
        <div className="absolute inset-0 rounded-full overflow-hidden opacity-30 pointer-events-none">
           {data.theme === 'dark' && <div className="absolute inset-0 bg-slate-900/10"></div>}
        </div>
    </div>
  );
};

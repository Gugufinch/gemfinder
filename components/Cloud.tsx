import React, { useMemo, forwardRef } from 'react';
import { CloudData, CloudStatus } from '../types';
import { CLOUD_SHAPES } from '../constants';

interface CloudProps {
  data: CloudData;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isMotionEnabled?: boolean;
  isAnchored?: boolean; 
  onMouseDown: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
}

const useIds = (id: string) => ({
    grad: `cloud-grad-${id}`,
    clip: `cloud-clip-${id}`
});

const STATUS_STYLES: Record<CloudStatus, string> = {
  backlog: 'bg-slate-500/85 text-white',
  active: 'bg-sky-500/85 text-white',
  blocked: 'bg-rose-500/85 text-white',
  done: 'bg-emerald-500/85 text-white'
};

export const Cloud = forwardRef<HTMLDivElement, CloudProps>(({ 
  data, isSelected, isMultiSelected, isMotionEnabled = true, isAnchored = false,
  onMouseDown, onClick, onDoubleClick, onMouseUp
}, ref) => {
  const shape = CLOUD_SHAPES[data.type] || CLOUD_SHAPES['cumulus'];
  const { grad, clip } = useIds(data.id);
  
  const isDark = data.type === 'storm' || data.type === 'nimbus' || data.type === 'stratus' || data.type === 'fractal';
  const textColor = isDark ? 'text-white' : 'text-slate-800';
  const subTextColor = isDark ? 'text-slate-200' : 'text-slate-500';
  const status = data.status || 'backlog';
  const statusClass = STATUS_STYLES[status];

  const floatDelay = useMemo(() => Math.random() * -5, []);
  
  // Revised Raindrops: Now strictly "dangling charms"
  const raindrops = useMemo(() => {
    if (!data.subItems || data.subItems.length === 0) return null;
    return data.subItems.map((item, i) => {
        const count = data.subItems!.length;
        // Spread wider
        const totalWidth = 80; 
        const startX = 50 - (totalWidth / 2);
        const interval = totalWidth / Math.max(1, count - 1);
        const xPercent = count === 1 ? 50 : startX + (i * interval);
        const length = 40 + (i % 3) * 15; 

        return (
            <div 
                key={i} 
                className="absolute flex flex-col items-center group/drop"
                style={{
                    left: `${xPercent}%`,
                    top: '50%', 
                    height: `${length + 40}px`, 
                    transformOrigin: 'top center',
                    animation: (isMotionEnabled && !isAnchored) ? `sway ${3 + i}s ease-in-out infinite alternate` : 'none',
                    zIndex: -1 
                }}
            >
                {/* String */}
                <div className="w-[1px] bg-slate-400/50 h-full"></div>
                
                {/* Charm */}
                <div className="relative transform transition-transform group-hover/drop:scale-110">
                    <div className="w-6 h-6 rounded-full rounded-tl-none -rotate-45 bg-gradient-to-br from-blue-300 to-blue-500 shadow-md border border-white/40 flex items-center justify-center">
                         <div className="w-2 h-2 bg-white/50 rounded-full blur-[1px] rotate-45"></div>
                    </div>
                    
                    {/* Tooltip style label */}
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-slate-200 text-slate-700 text-[10px] font-medium px-2 py-1 rounded shadow-sm whitespace-nowrap z-50 pointer-events-none">
                        {item}
                    </div>
                </div>
            </div>
        );
    });
  }, [data.subItems, isMotionEnabled, isAnchored]);

  const style: React.CSSProperties = {
      width: shape.baseWidth * 2.5,
      height: shape.baseHeight * 2.5,
      // Initial render position (physics updates this directly via Ref)
      transform: `translate(${data.x}px, ${data.y}px) translate(-50%, -50%)`,
      zIndex: isSelected ? 50 : 10,
      cursor: isSelected ? 'grabbing' : 'grab',
      position: 'absolute',
      top: 0,
      left: 0,
      willChange: 'transform'
  };

  return (
    <div
      ref={ref}
      className="absolute group select-none cloud-node"
      onMouseDown={onMouseDown}
      onClick={onClick}
      onMouseUp={onMouseUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(e);
      }}
      style={style}
    >
      <div 
        className="w-full h-full relative transition-transform duration-300"
        style={{
          animation: !isAnchored && !isSelected ? `float 6s ease-in-out infinite` : 'none',
          animationDelay: `${floatDelay}s`,
          animationPlayState: isMotionEnabled ? 'running' : 'paused'
        }}
      >
        {/* Selection Ring */}
        {isSelected && (
          <div className="absolute inset-[-12px] rounded-full border-2 border-indigo-400 bg-indigo-500/5 border-dashed animate-spin-slow pointer-events-none" />
        )}
        
        {!isSelected && isMultiSelected && (
           <div className="absolute inset-[-8px] rounded-full border-2 border-indigo-400 opacity-60 pointer-events-none" />
        )}

        <div className="absolute inset-0 overflow-visible z-[-1]">
            {raindrops}
        </div>

        {/* Cloud SVG Body */}
        <svg
          viewBox={shape.viewBox}
          className="w-full h-full absolute top-0 left-0 overflow-visible drop-shadow-xl z-10"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <radialGradient id={grad} cx="40%" cy="30%" r="80%" fx="30%" fy="30%">
                <stop offset="0%" stopColor="white" stopOpacity="0.95" />
                <stop offset="100%" stopColor={data.color || '#e2e8f0'} stopOpacity="1" />
            </radialGradient>
            
            <clipPath id={clip}>
                 {shape.circles.map((circle, idx) => (
                    <circle key={idx} cx={circle.cx} cy={circle.cy} r={circle.r} />
                 ))}
            </clipPath>
          </defs>
          
          <g filter="url(#cloud-fluff)">
            {/* Shadow */}
            {shape.circles.map((circle, idx) => (
                 <circle 
                    key={`shadow-${idx}`} 
                    cx={circle.cx + 5} 
                    cy={circle.cy + 5} 
                    r={circle.r} 
                    fill="rgba(0,0,0,0.1)"
                 />
            ))}
            
            {/* Main Body */}
            {shape.circles.map((circle, idx) => (
              <circle 
                key={idx} 
                cx={circle.cx} 
                cy={circle.cy} 
                r={circle.r} 
                fill={`url(#${grad})`}
                style={{
                    animation: isMotionEnabled ? `billow ${3 + (idx % 3)}s ease-in-out infinite alternate` : 'none',
                    animationDelay: `${idx * 0.2}s`,
                    transformOrigin: `${circle.cx}px ${circle.cy}px`
                }}
              />
            ))}

            {/* Image Overlay (Clean Mask) */}
            {data.imageUrl && (
                <g clipPath={`url(#${clip})`}>
                    <image 
                        href={data.imageUrl} 
                        x="10%" y="10%" 
                        width="80%" 
                        height="80%" 
                        preserveAspectRatio="xMidYMid slice"
                        className="opacity-90"
                    />
                </g>
            )}
            
            {/* Rim Light */}
             {shape.circles.map((circle, idx) => (
                 <circle 
                    key={`high-${idx}`} 
                    cx={circle.cx - 3} 
                    cy={circle.cy - 3} 
                    r={circle.r * 0.9} 
                    fill="url(#rim-light)"
                    className="opacity-50 mix-blend-screen"
                 />
            ))}
          </g>
        </svg>

        {/* Content Overlay */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20 pointer-events-none ${textColor}`}>
          <div className="absolute top-7 left-1/2 -translate-x-1/2 flex items-center gap-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}>
              {status}
            </span>
            {data.priority && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-black/15 text-slate-900">
                {data.priority}
              </span>
            )}
          </div>
          {data.emoji && (
            <span className="text-4xl mb-1 filter drop-shadow-sm transform group-hover:scale-110 transition-transform duration-300">
                {data.emoji}
            </span>
          )}
          <h3 className={`font-bold text-sm leading-tight line-clamp-2 max-w-[100%] drop-shadow-sm select-none ${!data.emoji && 'text-lg'} ${data.imageUrl && 'bg-white/80 backdrop-blur-sm rounded px-1'}`}>
            {data.title}
          </h3>
          {data.cost !== undefined && data.cost !== null && data.cost > 0 && (
              <span className={`text-[10px] font-mono mt-1 px-1.5 py-0.5 rounded-full bg-black/10 ${subTextColor} ${data.imageUrl && 'bg-white/80'}`}>
              ${data.cost.toLocaleString()}
              </span>
          )}
          {data.dueDate && (
            <span className={`text-[10px] mt-1 px-1.5 py-0.5 rounded-full bg-white/80 ${subTextColor}`}>
              Due {new Date(data.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

Cloud.displayName = 'Cloud';

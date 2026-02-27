import React, { forwardRef } from 'react';
import { Connection as ConnectionType, CloudData } from '../types';

interface ConnectionProps {
  data: ConnectionType;
  fromCloud?: CloudData;
  toCloud?: CloudData;
  onClick?: () => void;
}

// We forward the ref to the path element so the physics engine can update 'd' attribute directly
export const Connection = forwardRef<SVGPathElement, ConnectionProps>(({ data, fromCloud, toCloud, onClick }, ref) => {
  if (!fromCloud || !toCloud) return null;

  const dx = toCloud.x - fromCloud.x;
  const dy = toCloud.y - fromCloud.y;
  const midX = (fromCloud.x + toCloud.x) / 2;
  const midY = (fromCloud.y + toCloud.y) / 2;

  let pathD = '';
  
  if (data.type === 'lightning') {
      pathD = `M ${fromCloud.x} ${fromCloud.y} L ${toCloud.x} ${toCloud.y}`;

      return (
        <g onClick={onClick} className="cursor-pointer group">
            {/* The main path receives the Ref for physics updates */}
            <path ref={ref} d={pathD} stroke="transparent" strokeWidth="20" fill="none" />
            
            {/* Decorative paths - note: these might lag slightly behind during high-speed drags 
                unless we pass refs to all of them, but usually main path is enough for feedback */}
            <path d={pathD} stroke="#fde047" strokeWidth="6" fill="none" strokeOpacity="0.4" className="animate-pulse hidden sm:block" filter="url(#glow)" />
            <path d={pathD} stroke="#fff" strokeWidth="2" fill="none" className="animate-pulse" />
        </g>
      );
  } 
  else if (data.type === 'rain') {
      pathD = `M ${fromCloud.x} ${fromCloud.y} L ${toCloud.x} ${toCloud.y}`;
      return (
          <g onClick={onClick} className="cursor-pointer group">
             <path ref={ref} d={pathD} stroke="transparent" strokeWidth="20" fill="none" />
             <path 
                d={pathD} 
                stroke="#60a5fa" 
                strokeWidth="2" 
                strokeDasharray="4 8" 
                strokeLinecap="round" 
                fill="none" 
                className="animate-flow-fast opacity-60"
             />
          </g>
      );
  }
  else {
      // Standard Curve
      const curvature = 50; 
      const offset = (fromCloud.x < toCloud.x) ? curvature : -curvature;
      pathD = `M ${fromCloud.x} ${fromCloud.y} Q ${midX} ${midY + offset} ${toCloud.x} ${toCloud.y}`;
      
      return (
        <g onClick={onClick} className="cursor-pointer group">
          <path
            ref={ref}
            d={pathD}
            stroke="transparent"
            strokeWidth="20"
            fill="none"
          />
          <path
            d={pathD}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            className="group-hover:stroke-white/80 transition-colors"
          />
          <path
            d={pathD}
            stroke="#94a3b8"
            strokeWidth="2"
            fill="none"
            strokeDasharray="8 4"
            strokeLinecap="round"
            className="animate-flow"
          />
        </g>
      );
  }
});

Connection.displayName = 'Connection';
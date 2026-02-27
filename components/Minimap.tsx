import React from 'react';
import { CloudData, Viewport } from '../types';

interface MinimapProps {
  clouds: CloudData[];
  viewport: Viewport;
  onNavigate: (x: number, y: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({ clouds, viewport, onNavigate }) => {
  if (clouds.length === 0) return null;

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  clouds.forEach(c => {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  });

  // Add padding
  const padding = 2000; // Increased padding for systems
  minX = Math.min(minX - padding, -1000); 
  minY = Math.min(minY - padding, -1000);
  maxX = Math.max(maxX + padding, 1000); 
  maxY = Math.max(maxY + padding, 1000);
  
  const width = maxX - minX;
  const height = maxY - minY;

  // Normalize viewport
  const vpRect = {
    x: (-viewport.x) / viewport.scale,
    y: (-viewport.y) / viewport.scale,
    w: window.innerWidth / viewport.scale,
    h: window.innerHeight / viewport.scale
  };

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Percentages
    const pctX = clickX / rect.width;
    const pctY = clickY / rect.height;
    
    // World Coords
    const targetWorldX = minX + (pctX * width);
    const targetWorldY = minY + (pctY * height);
    
    onNavigate(targetWorldX, targetWorldY);
  };

  return (
    <div 
      className="absolute bottom-6 right-6 w-48 h-32 bg-white/20 backdrop-blur-md border border-white/30 rounded-lg shadow-xl overflow-hidden z-50 cursor-crosshair hover:bg-white/30 transition-colors"
      onClick={handleClick}
    >
      <div className="relative w-full h-full pointer-events-none">
        {/* Clouds Dots */}
        {clouds.map(c => (
          <div
            key={c.id}
            className="absolute w-1.5 h-1.5 rounded-full bg-white shadow-sm opacity-80"
            style={{
              left: `${((c.x - minX) / width) * 100}%`,
              top: `${((c.y - minY) / height) * 100}%`,
              backgroundColor: c.color || '#fff'
            }}
          />
        ))}

        {/* Viewport Rect */}
        <div 
          className="absolute border-2 border-indigo-400 bg-indigo-500/10"
          style={{
            left: `${((vpRect.x - minX) / width) * 100}%`,
            top: `${((vpRect.y - minY) / height) * 100}%`,
            width: `${Math.min((vpRect.w / width) * 100, 100)}%`,
            height: `${Math.min((vpRect.h / height) * 100, 100)}%`,
          }}
        />
      </div>
    </div>
  );
};

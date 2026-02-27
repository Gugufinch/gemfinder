import React, { useEffect, useRef, useCallback } from 'react';
import { CloudData, Connection } from '../types';

interface PhysicsBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isDragging: boolean;
  mass: number;
}

export const usePhysicsEngine = (
  clouds: CloudData[],
  connections: Connection[],
  cloudRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  connectionRefs: React.MutableRefObject<Map<string, SVGPathElement>>,
  onUpdate: (updates: { id: string; data: Partial<CloudData> }[]) => void,
  isMotionEnabled: boolean
) => {
  const bodies = useRef<Map<string, PhysicsBody>>(new Map());
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const isInteracting = useRef(false);

  // Initialize/Sync bodies with CloudData
  useEffect(() => {
    clouds.forEach(cloud => {
      if (!bodies.current.has(cloud.id)) {
        bodies.current.set(cloud.id, {
          id: cloud.id,
          x: cloud.x,
          y: cloud.y,
          vx: 0,
          vy: 0,
          radius: 70, 
          isDragging: false,
          mass: 1
        });
      } else {
        const body = bodies.current.get(cloud.id)!;
        if (!body.isDragging && !isInteracting.current) {
             if (Math.abs(body.x - cloud.x) > 1 || Math.abs(body.y - cloud.y) > 1) {
                 body.x = cloud.x;
                 body.y = cloud.y;
             }
        }
      }
    });
    
    // Cleanup
    const cloudIds = new Set(clouds.map(c => c.id));
    bodies.current.forEach((_, id) => {
        if (!cloudIds.has(id)) bodies.current.delete(id);
    });
  }, [clouds]);

  const startDrag = useCallback((id: string, x: number, y: number) => {
    isInteracting.current = true;
    const body = bodies.current.get(id);
    if (body) {
      body.isDragging = true;
      body.vx = 0;
      body.vy = 0;
      body.x = x;
      body.y = y;
    }
  }, []);

  const moveDrag = useCallback((id: string, x: number, y: number) => {
    const body = bodies.current.get(id);
    if (body && body.isDragging) {
      const newVx = x - body.x;
      const newVy = y - body.y;
      body.vx = newVx * 0.5; 
      body.vy = newVy * 0.5;
      body.x = x;
      body.y = y;
    }
  }, []);

  const endDrag = useCallback((id: string) => {
    isInteracting.current = false;
    const body = bodies.current.get(id);
    if (body) {
      body.isDragging = false;
      onUpdate([{ id, data: { x: body.x, y: body.y } }]);
    }
  }, [onUpdate]);

  const scatter = useCallback(() => {
      bodies.current.forEach(body => {
          body.vx += (Math.random() - 0.5) * 15;
          body.vy += (Math.random() - 0.5) * 15;
      });
  }, []);

  // Helper to generate path strings matching Connection.tsx logic
  const getPathString = (c: Connection, b1: PhysicsBody, b2: PhysicsBody) => {
      // Simple line for Lightning/Rain in physics loop for performance
      // The React component handles the "jaggedness" via CSS or static render, 
      // but we update the main guide path here.
      if (c.type === 'lightning' || c.type === 'rain') {
          return `M ${b1.x} ${b1.y} L ${b2.x} ${b2.y}`;
      } else {
          // Curve
          const midX = (b1.x + b2.x) / 2;
          const midY = (b1.y + b2.y) / 2;
          const curvature = 50;
          const offset = (b1.x < b2.x) ? curvature : -curvature;
          return `M ${b1.x} ${b1.y} Q ${midX} ${midY + offset} ${b2.x} ${b2.y}`;
      }
  }

  const update = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    lastTimeRef.current = time;

    const friction = 0.92;
    const repulsionStrength = 0.05;

    // 1. Apply Physics
    bodies.current.forEach(body => {
      if (body.isDragging) return;
      if (isMotionEnabled) {
          body.x += body.vx;
          body.y += body.vy;
          body.vx *= friction;
          body.vy *= friction;
          if (Math.abs(body.vx) < 0.01) body.vx = 0;
          if (Math.abs(body.vy) < 0.01) body.vy = 0;
      }
    });

    // 2. Collision Resolution
    const bodyArray = Array.from(bodies.current.values());
    for (let i = 0; i < bodyArray.length; i++) {
      for (let j = i + 1; j < bodyArray.length; j++) {
        const b1 = bodyArray[i];
        const b2 = bodyArray[j];
        if (b1.isDragging && b2.isDragging) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const distSq = dx * dx + dy * dy;
        const minDist = b1.radius + b2.radius;

        if (distSq < minDist * minDist && distSq > 0) {
           const dist = Math.sqrt(distSq);
           const overlap = minDist - dist;
           const force = overlap * repulsionStrength;
           const fx = (dx / dist) * force;
           const fy = (dy / dist) * force;

           if (!b1.isDragging) {
             b1.vx -= fx;
             b1.vy -= fy;
             b1.x -= fx * 0.5;
             b1.y -= fy * 0.5;
           }
           if (!b2.isDragging) {
             b2.vx += fx;
             b2.vy += fy;
             b2.x += fx * 0.5;
             b2.y += fy * 0.5;
           }
        }
      }
    }

    // 3. Render Clouds
    bodies.current.forEach(body => {
      const el = cloudRefs.current.get(body.id);
      if (el) {
        el.style.transform = `translate(${body.x}px, ${body.y}px) translate(-50%, -50%)`;
      }
    });

    // 4. Render Connections (Real-time updates)
    connections.forEach(conn => {
        // We get the reference to the specific SVGPathElement
        const el = connectionRefs.current.get(conn.id);
        const b1 = bodies.current.get(conn.from);
        const b2 = bodies.current.get(conn.to);
        
        if (el && b1 && b2) {
            const d = getPathString(conn, b1, b2);
            el.setAttribute('d', d);
            
            // Optional: If there are sibling paths (like glows) inside a Group, 
            // they won't update here unless we ref them too. 
            // For now, updating the main hit-path/line provides the "connected" feel.
            
            // If the user wants ALL parts of the connection to move, 
            // we'd need to select siblings.
            const parent = el.parentElement;
            if (parent) {
                const children = parent.children;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    if (child.tagName === 'path') {
                        child.setAttribute('d', d);
                    }
                }
            }
        }
    });

    requestRef.current = requestAnimationFrame(update);
  }, [cloudRefs, connectionRefs, isMotionEnabled, connections]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  return {
    startDrag,
    moveDrag,
    endDrag,
    scatter,
    getRealPosition: (id: string) => {
        const b = bodies.current.get(id);
        return b ? { x: b.x, y: b.y } : null;
    }
  };
};
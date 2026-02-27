export type CloudType = 'cumulus' | 'thought' | 'nimbus' | 'cirrus' | 'storm' | 'stratus' | 'lenticular' | 'mammatus' | 'fractal';
export type SkyMode = 'day' | 'sunset' | 'night' | 'stormy' | 'aurora' | 'golden' | 'midnight' | 'mist';
export type CloudStatus = 'backlog' | 'active' | 'blocked' | 'done';
export type CloudPriority = 'low' | 'medium' | 'high';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  type: 'curve' | 'lightning' | 'rain';
}

export interface CloudData {
  id: string;
  type: CloudType;
  title: string;
  description?: string;
  subItems?: string[]; // Raindrops (sub-tasks)
  cost?: number; 
  emoji?: string; // Now Optional
  imageUrl?: string; // New: Image support
  x: number; // Canvas coordinate X
  y: number; // Canvas coordinate Y
  vx?: number; // Velocity X
  vy?: number; // Velocity Y
  color?: string; 
  tags?: string[];
  width?: number;
  height?: number;
  status?: CloudStatus;
  priority?: CloudPriority;
  dueDate?: string;
  owner?: string;
  effort?: number; // 1-10
  impact?: number; // 1-10
  confidence?: number; // 1-10
}

export interface WeatherSystem {
  id: string;
  title: string;
  x: number;
  y: number;
  radius: number;
  theme: 'warm' | 'cool' | 'dark' | 'nature';
}

export interface SkyState {
  clouds: CloudData[];
  systems: WeatherSystem[];
  connections: Connection[];
}

export interface CloudShapeConfig {
  circles: { cx: number; cy: number; r: number }[];
  baseWidth: number;
  baseHeight: number;
  viewBox: string;
}

export const SKY_GRADIENTS: Record<SkyMode, string> = {
  day: 'bg-gradient-to-b from-sky-300 via-sky-100 to-blue-50',
  sunset: 'bg-gradient-to-b from-indigo-500 via-purple-500 to-orange-400',
  night: 'bg-gradient-to-b from-slate-900 via-purple-900 to-slate-800',
  stormy: 'bg-gradient-to-b from-slate-700 via-slate-600 to-slate-800',
  aurora: 'bg-gradient-to-b from-slate-900 via-teal-900 to-purple-900',
  golden: 'bg-gradient-to-b from-amber-400 via-orange-300 to-yellow-100',
  midnight: 'bg-gradient-to-b from-black via-slate-900 to-blue-950',
  mist: 'bg-gradient-to-b from-gray-200 via-slate-200 to-white',
};

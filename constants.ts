import { CloudShapeConfig, CloudType, CloudData, Connection, WeatherSystem } from './types';

export const CLOUD_SHAPES: Record<CloudType, CloudShapeConfig> = {
  cumulus: {
    circles: [
      { cx: 30, cy: 60, r: 25 },
      { cx: 50, cy: 50, r: 30 },
      { cx: 70, cy: 60, r: 25 },
      { cx: 40, cy: 75, r: 20 },
      { cx: 60, cy: 75, r: 20 },
    ],
    baseWidth: 100,
    baseHeight: 80,
    viewBox: "0 0 100 90"
  },
  thought: {
    circles: [
      { cx: 50, cy: 45, r: 35 }, 
      { cx: 80, cy: 80, r: 6 },  
      { cx: 88, cy: 90, r: 4 },  
    ],
    baseWidth: 100,
    baseHeight: 100,
    viewBox: "0 0 100 100"
  },
  nimbus: {
    circles: [
      { cx: 30, cy: 50, r: 30 },
      { cx: 50, cy: 40, r: 35 },
      { cx: 70, cy: 50, r: 30 },
      { cx: 50, cy: 70, r: 30 },
      { cx: 25, cy: 65, r: 25 },
      { cx: 75, cy: 65, r: 25 },
    ],
    baseWidth: 110,
    baseHeight: 100,
    viewBox: "0 0 110 100"
  },
  cirrus: {
    circles: [
      { cx: 20, cy: 50, r: 10 },
      { cx: 40, cy: 45, r: 12 },
      { cx: 60, cy: 50, r: 10 },
      { cx: 80, cy: 45, r: 8 },
      { cx: 100, cy: 50, r: 6 },
    ],
    baseWidth: 120,
    baseHeight: 60,
    viewBox: "0 20 120 60"
  },
  storm: {
    circles: [
      { cx: 30, cy: 40, r: 25 },
      { cx: 55, cy: 30, r: 30 },
      { cx: 80, cy: 40, r: 25 },
      { cx: 20, cy: 60, r: 20 },
      { cx: 45, cy: 65, r: 25 },
      { cx: 70, cy: 65, r: 25 },
      { cx: 90, cy: 60, r: 20 },
    ],
    baseWidth: 110,
    baseHeight: 90,
    viewBox: "0 0 110 100"
  },
  stratus: {
    circles: [
      { cx: 20, cy: 60, r: 15 },
      { cx: 50, cy: 60, r: 18 },
      { cx: 80, cy: 60, r: 15 },
      { cx: 110, cy: 60, r: 18 },
      { cx: 35, cy: 55, r: 15 },
      { cx: 65, cy: 55, r: 15 },
      { cx: 95, cy: 55, r: 15 },
    ],
    baseWidth: 130,
    baseHeight: 60,
    viewBox: "0 30 130 60"
  },
  lenticular: {
    circles: [
       { cx: 60, cy: 50, r: 40 },
       { cx: 60, cy: 45, r: 30 },
       { cx: 60, cy: 55, r: 30 },
    ],
    baseWidth: 120,
    baseHeight: 60,
    viewBox: "10 10 100 80"
  },
  mammatus: {
      circles: [
          { cx: 30, cy: 50, r: 25 },
          { cx: 55, cy: 50, r: 25 },
          { cx: 80, cy: 50, r: 25 },
          // Bumps on bottom
          { cx: 30, cy: 75, r: 15 },
          { cx: 55, cy: 75, r: 15 },
          { cx: 80, cy: 75, r: 15 },
          { cx: 42, cy: 65, r: 15 },
          { cx: 67, cy: 65, r: 15 },
      ],
      baseWidth: 110,
      baseHeight: 100,
      viewBox: "0 20 110 80"
  },
  fractal: {
      circles: [
          { cx: 50, cy: 50, r: 40 },
          { cx: 30, cy: 30, r: 20 },
          { cx: 70, cy: 30, r: 20 },
          { cx: 20, cy: 60, r: 15 },
          { cx: 80, cy: 60, r: 15 },
          { cx: 50, cy: 80, r: 10 },
      ],
      baseWidth: 100,
      baseHeight: 100,
      viewBox: "0 0 100 100"
  }
};

export const INITIAL_DATA: { clouds: CloudData[], connections: Connection[], systems: WeatherSystem[] } = {
  clouds: [
    {
      id: '1',
      type: 'cumulus',
      title: 'Double-click to add',
      description: 'Double click anywhere to create a new idea.',
      cost: 0,
      emoji: '✨',
      x: 0,
      y: 0,
      color: '#ffffff',
      status: 'active',
      priority: 'medium',
      effort: 3,
      impact: 6,
      confidence: 8
    },
    {
      id: '2',
      type: 'thought',
      title: 'Drag to connect',
      description: 'Hold Shift and drag between clouds to link them.',
      cost: 100,
      emoji: '🔗',
      x: 300,
      y: -50,
      color: '#e0f2fe',
      status: 'backlog',
      priority: 'low',
      effort: 2,
      impact: 4,
      confidence: 8
    }
  ],
  connections: [
    { id: 'c1', from: '1', to: '2', type: 'curve' }
  ],
  systems: [
    {
      id: 'sys-1',
      title: 'The Sandbox',
      x: 150,
      y: -25,
      radius: 400,
      theme: 'cool'
    }
  ]
};

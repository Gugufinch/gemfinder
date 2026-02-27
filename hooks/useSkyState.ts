import { useState, useCallback } from 'react';
import { CloudData, Connection, SkyState, WeatherSystem } from '../types';
import { INITIAL_DATA } from '../constants';

export const useSkyState = () => {
  const [sky, setSky] = useState<SkyState>(INITIAL_DATA);
  const [history, setHistory] = useState<SkyState[]>([INITIAL_DATA]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Push to history
  const pushState = useCallback((newState: SkyState) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      if (newHistory.length > 20) newHistory.shift(); // Limit stack
      return [...newHistory, newState];
    });
    setHistoryIndex(prev => Math.min(prev + 1, 19));
    setSky(newState);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setSky(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setSky(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  // Cloud Operations
  const addCloud = useCallback((cloud: CloudData) => {
    pushState({
      ...sky,
      clouds: [...sky.clouds, cloud]
    });
  }, [sky, pushState]);

  const updateCloud = useCallback((id: string, updates: Partial<CloudData>) => {
    pushState({
      ...sky,
      clouds: sky.clouds.map(c => c.id === id ? { ...c, ...updates } : c)
    });
  }, [sky, pushState]);

  const updateClouds = useCallback((updates: {id: string, data: Partial<CloudData>}[]) => {
    pushState({
      ...sky,
      clouds: sky.clouds.map(c => {
        const update = updates.find(u => u.id === c.id);
        return update ? { ...c, ...update.data } : c;
      })
    });
  }, [sky, pushState]);

  const deleteCloud = useCallback((id: string) => {
    pushState({
        ...sky,
      clouds: sky.clouds.filter(c => c.id !== id),
      connections: sky.connections.filter(c => c.from !== id && c.to !== id)
    });
  }, [sky, pushState]);
  
  const deleteClouds = useCallback((ids: string[]) => {
    pushState({
        ...sky,
      clouds: sky.clouds.filter(c => !ids.includes(c.id)),
      connections: sky.connections.filter(c => !ids.includes(c.from) && !ids.includes(c.to))
    });
  }, [sky, pushState]);

  // Connection Operations
  const addConnection = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    const exists = sky.connections.find(c => 
      (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
    );
    if (exists) return;

    const newConn: Connection = {
      id: `conn-${Date.now()}`,
      from: fromId,
      to: toId,
      type: 'lightning'
    };
    pushState({
      ...sky,
      connections: [...sky.connections, newConn]
    });
  }, [sky, pushState]);

  // System Operations
  const addSystem = useCallback((system: WeatherSystem) => {
      pushState({
          ...sky,
          systems: [...(sky.systems || []), system]
      });
  }, [sky, pushState]);
  
  const updateSystem = useCallback((id: string, updates: Partial<WeatherSystem>) => {
      pushState({
          ...sky,
          systems: (sky.systems || []).map(s => s.id === id ? { ...s, ...updates } : s)
      });
  }, [sky, pushState]);

  const deleteSystem = useCallback((id: string) => {
      pushState({
          ...sky,
          systems: (sky.systems || []).filter(s => s.id !== id)
      });
  }, [sky, pushState]);

  const importData = useCallback((data: SkyState) => {
    // Ensure backwards compatibility for files without systems
    const safeData = {
        ...data,
        systems: data.systems || []
    };
    pushState(safeData);
  }, [pushState]);

  return {
    sky,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    addCloud,
    updateCloud,
    updateClouds,
    deleteCloud,
    deleteClouds,
    addConnection,
    addSystem,
    updateSystem,
    deleteSystem,
    importData
  };
};

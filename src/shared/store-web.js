/**
 * Web-compatible store shim.
 * Provides the same interface as the Electron store.js for UI modules.
 * Delegates to the settings-bridge and settings-web for encrypted storage.
 */

import { getSettingsBridge } from '@services/settings-bridge';

// Create a minimal store interface that UI modules can use
const store = {
  // Settings are now handled by the bridge
  getSettings: () => {
    // This is a sync getter for compatibility, but actual settings are async
    // Return defaults - the real async loading happens in bootstrap
    return {
      model: 'gemini-3.5-flash-lite',
      voice: 'es-MX-DaliaNeural',
      rate: -5,
      hasGeminiKey: false,
      hasYoutubeKey: false,
    };
  },

  // Cache for videos/lessons (uses localStorage for now, will be migrated to IndexedDB later)
  getCache: (key) => {
    try {
      const cached = localStorage.getItem('estudiaia-cache-' + key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  },

  putCache: (key, value) => {
    try {
      localStorage.setItem('estudiaia-cache-' + key, value);
    } catch (e) {
      console.warn('[store-web] Cache put failed:', e);
    }
  },

  removeCache: (key) => {
    try {
      localStorage.removeItem('estudiaia-cache-' + key);
    } catch (e) {
      console.warn('[store-web] Cache remove failed:', e);
    }
  },

  // Course/progress tracking
  getState: () => {
    try {
      const state = localStorage.getItem('estudiaia-state');
      return state ? JSON.parse(state) : { course: '7', practiceHistory: [], lessonHistory: [] };
    } catch {
      return { course: '7', practiceHistory: [], lessonHistory: [] };
    }
  },

  setCourse: (course) => {
    try {
      const state = store.getState();
      state.course = course;
      localStorage.setItem('estudiaia-state', JSON.stringify(state));
    } catch (e) {
      console.warn('[store-web] Set course failed:', e);
    }
  },

  recordComplete: (practice) => {
    try {
      const state = store.getState();
      state.practiceHistory = state.practiceHistory || [];
      state.practiceHistory.push({ ...practice, date: Date.now() });
      if (state.practiceHistory.length > 20) state.practiceHistory.shift();
      localStorage.setItem('estudiaia-state', JSON.stringify(state));
    } catch (e) {
      console.warn('[store-web] Record complete failed:', e);
    }
  },

  recordLesson: (lesson) => {
    try {
      const state = store.getState();
      state.lessonHistory = state.lessonHistory || [];
      state.lessonHistory.push({ ...lesson, date: Date.now() });
      if (state.lessonHistory.length > 20) state.lessonHistory.shift();
      localStorage.setItem('estudiaia-state', JSON.stringify(state));
    } catch (e) {
      console.warn('[store-web] Record lesson failed:', e);
    }
  },

  // Warning for migration
  warning: null,
};

// For backward compatibility with code that does `EstudiaStore.createStore(localStorage)`
if (typeof window !== 'undefined') {
  window.EstudiaStore = {
    createStore: () => store,
  };
}

export { store };

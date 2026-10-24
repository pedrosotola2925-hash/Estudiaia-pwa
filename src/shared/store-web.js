/**
 * Web-compatible store shim.
 * Provides the same interface as the Electron store.js for UI modules.
 * Settings live in the PWA preferences store; this shim only keeps the course,
 * practice and lesson history plus the cache.
 */

// Create a minimal store interface that UI modules can use
const store = {
  // Preferences (voice/rate) are handled by the settings bridge; bootstrap loads
  // them asynchronously. Only the cache and study history live here.
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

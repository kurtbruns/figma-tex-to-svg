// Entry point for the UI when served via webpack-dev-server.
// This file contains the logic originally in ui.html's inline <script> block.

import './styles/main.css';
import { PluginFrontend } from './core';

// Initialize the plugin frontend
// Try multiple initialization strategies for maximum compatibility
let pluginFrontend: PluginFrontend;
function initializePlugin() {
  pluginFrontend = new PluginFrontend();
  pluginFrontend.initialize()
    .then(() => {
      // Uncomment the line below to reset plugin to defaults (as if loading for the first time)
      // pluginFrontend.resetToDefaults();
    })
    .catch(console.error);
}

if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    initializePlugin();
  });
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
  // DOM is already loaded, initialize immediately
  initializePlugin();
} else {
  // Fallback to window.onload
  window.onload = () => {
    initializePlugin();
  };
}

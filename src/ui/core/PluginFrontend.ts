/**
 * Plugin frontend - orchestrates all UI components and contains all workflow methods
 */

import { StateStore, AppState } from './StateStore';
import { typesetMath, TypesettingOptions, SubExpressionErrorCallbacks, setSVGColor, applySubExpressionColors, styleErrorNodes } from '../mathRenderer';
import { SubExpressionStyles } from '../components/SubExpressionStyles';
import { RenderOptions, UserPreferences, SubExpressionStyle } from '../types';
import { expandColor, THEME_DEFAULTS, MATHJAX_DEFAULT_FONT_SIZE, DEFAULT_RENDER_OPTIONS } from '../utils';

class PluginFrontend {
  private stateStore!: StateStore; // Initialized in initialize()
  private subExpression: SubExpressionStyles | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private previewInitialized: boolean = false;
  private initializationResolver: ((value: void | PromiseLike<void>) => void) | null = null;
  private isInitializing: boolean = false;
  private pendingReset: boolean = false;

  /**
   * Initialize the plugin frontend
   */
  initialize(): Promise<void> {
    this.isInitializing = true;
    
    // 1. Initialize state store
    this.stateStore = new StateStore();
    
    // 2. Set up initial state from DOM
    this.loadInitialStateFromDOM();
    
    // 3. Initialize components
    this.initializeComponents();
    
    // 4. Set up event handlers
    this.setupEventHandlers();
    
    // 5. Set up message listener
    this.setupMessageListener();
    
    // 6. Set up state subscriptions
    this.setupSubscriptions();
    
    // 7. Wait for initialization data and initial render
    return this.waitForInitializationData()
      .then(() => {
        this.isInitializing = false;
        // Check if reset was requested during initialization
        if (this.pendingReset) {
          this.pendingReset = false;
          this.resetToDefaults();
        } else {
          this.convert();
        }
      })
      .catch((err) => {
        this.isInitializing = false;
        console.error('Error initializing plugin:', err);
        throw err;
      });
  }

  /**
   * Load initial state from DOM
   */
  private loadInitialStateFromDOM(): void {
    // Detect OS theme first
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = mediaQuery.matches;
    const theme = isDark ? 'dark' : 'light';

    const texInput = document.getElementById('input') as HTMLTextAreaElement;
    const displayInput = document.getElementById('display') as HTMLInputElement;
    const fontSizeInput = document.getElementById('font-size') as HTMLInputElement;
    const bgcolorInput = document.getElementById('background-color') as HTMLInputElement;
    const fontcolorInput = document.getElementById('font-color') as HTMLInputElement;

    // Use theme defaults if inputs are empty
    const bgcolorRaw = bgcolorInput?.value.trim() || THEME_DEFAULTS[theme]?.background || THEME_DEFAULTS.dark.background;
    const fontcolorRaw = fontcolorInput?.value.trim() || THEME_DEFAULTS[theme]?.font || THEME_DEFAULTS.dark.font;

    const renderOptions: RenderOptions = {
      tex: texInput?.value.trim() || '',
      display: displayInput?.checked ?? DEFAULT_RENDER_OPTIONS.display,
      fontSize: fontSizeInput ? parseFloat(fontSizeInput.value) : DEFAULT_RENDER_OPTIONS.fontSize,
      backgroundColor: '#' + expandColor(bgcolorRaw),
      fontColor: '#' + expandColor(fontcolorRaw),
      subExpressionStyles: []
    };

    // Set initial state (this will trigger subscriptions, but that's ok)
    this.stateStore.updateState({
      renderOptions,
      theme,
      mode: 'create',
      currentNodeId: null,
      lastRenderedTex: null,
      lastRenderedDisplay: null,
      currentSVGWrapper: null,
      isLoadingNodeData: false,
      draftState: null
    });
  }

  /**
   * Initialize components
   */
  private initializeComponents(): void {
    // Initialize sub-expression styling component
    const subExpressionContainer = document.getElementById('subexpression-styling') as HTMLElement;
    if (subExpressionContainer) {
      const errorCallbacks: SubExpressionErrorCallbacks = {
        showError: (rowIndex, field, message) => this.showSubExpressionError(rowIndex, field, message),
        clearError: (rowIndex, field) => this.clearSubExpressionError(rowIndex, field),
        clearAllErrors: () => this.clearSubExpressionErrors()
      };
      
      this.subExpression = new SubExpressionStyles(
        subExpressionContainer,
        this.stateStore,
        errorCallbacks,
        () => this.convert(),
        () => this.stateStore.getState().theme,
        () => this.updateSubExpressionStylesDirectly()
      );
    }

    // Initialize preview component - expand on first load (HTML starts with it collapsed)
    if (!this.previewInitialized) {
      const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
      const previewOutput = document.getElementById('preview-output') as HTMLDivElement;
      if (previewContainer && previewOutput) {
        previewContainer.classList.add('expanded');
        previewOutput.classList.remove('collapsed');
        this.previewInitialized = true;
      }
    }
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // TeX input
    const texInput = document.getElementById('input') as HTMLTextAreaElement;
    if (texInput) {
      texInput.addEventListener('input', (e) => {
        const state = this.stateStore.getState();
        this.stateStore.updateState({
          renderOptions: {
            ...state.renderOptions,
            tex: (e.target as HTMLTextAreaElement).value
          }
        });
        this.convert();
      });
    }

    // Display checkbox
    const displayInput = document.getElementById('display') as HTMLInputElement;
    if (displayInput) {
      displayInput.addEventListener('change', (e) => {
        const state = this.stateStore.getState();
        this.stateStore.updateState({
          renderOptions: {
            ...state.renderOptions,
            display: (e.target as HTMLInputElement).checked
          }
        });
        this.convert();
      });
    }

    // Font size
    const fontSizeInput = document.getElementById('font-size') as HTMLInputElement;
    if (fontSizeInput) {
      fontSizeInput.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(value)) {
          const state = this.stateStore.getState();
          this.stateStore.updateState({
            renderOptions: {
              ...state.renderOptions,
              fontSize: value
            }
          });
          this.convert();
        }
      });
    }

    // Color inputs
    this.setupColorInputs('background-color');
    this.setupColorInputs('font-color');

    // Place button
    const placeButton = document.getElementById('place') as HTMLButtonElement;
    if (placeButton) {
      placeButton.onclick = () => {
        const data = this.prepareMessageData(false);
        if (!data) {
          console.error('No SVG to embed');
          return;
        }
        // Clear draft state since we're embedding it (it's no longer a draft)
        // Set mode to 'edit' immediately - the node will be created and selected by the backend
        // This ensures that when loadNodeData() is called, mode is already 'edit' and we don't save draftState
        this.stateStore.updateState({ 
          draftState: null,
          mode: 'edit',
          currentNodeId: null // Will be set when the node is created and selected
        });
        // Clear draftState from preferences since we're committing it (embedding)
        this.clearDraftStateFromPreferences();
        (window.parent as Window).postMessage({ pluginMessage: data }, '*');
      };
    }

    // Locate button
    const locateButton = document.getElementById('locate-button') as HTMLButtonElement;
    if (locateButton) {
      locateButton.onclick = () => {
        (window.parent as Window).postMessage({ 
          pluginMessage: { 
            type: 'locateNode'
          } 
        }, '*');
      };
    }

    // Make functions available globally for inline handlers
    (window as any).convert = () => this.convert();
    (window as any).onColorTextChange = (colorId: string) => this.onColorTextChange(colorId);
    (window as any).saveUserPreferences = () => this.saveUserPreferences();
    (window as any).selectAllText = (event: FocusEvent | MouseEvent) => this.selectAllText(event);
    (window as any).togglePreview = () => this.togglePreview();
  }

  /**
   * Set up color input handlers
   */
  private setupColorInputs(colorId: string): void {
    const picker = document.getElementById(colorId + '-picker') as HTMLInputElement;
    const text = document.getElementById(colorId) as HTMLInputElement;
    
    if (!picker || !text) return;

    // When picker changes, update text (without #) and update state
    picker.addEventListener('input', () => {
      const expanded = expandColor(picker.value);
      text.value = expanded;
      const state = this.stateStore.getState();
      const field = colorId === 'background-color' ? 'backgroundColor' : 'fontColor';
      this.stateStore.updateState({
        renderOptions: {
          ...state.renderOptions,
          [field]: '#' + expanded
        }
      });
      this.convert();
    });

    // Sync initial values
    const currentValue = text.value.trim() || picker.value.replace(/^#/, '');
    const expanded = expandColor(currentValue);
    text.value = expanded;
    picker.value = '#' + expanded;
  }

  /**
   * Handle color text input change
   */
  private onColorTextChange(colorId: string): void {
    const picker = document.getElementById(colorId + '-picker') as HTMLInputElement;
    const text = document.getElementById(colorId) as HTMLInputElement;
    if (!picker || !text) return;

    const value = text.value.trim();
    const expanded = expandColor(value);
    
    // Validate: should be 1-6 hex digits
    if (/^[0-9A-Fa-f]{1,6}$/i.test(value)) {
      text.value = expanded.substring(0, 6);
      picker.value = '#' + expanded.substring(0, 6);
      
      const state = this.stateStore.getState();
      const field = colorId === 'background-color' ? 'backgroundColor' : 'fontColor';
      this.stateStore.updateState({
        renderOptions: {
          ...state.renderOptions,
          [field]: '#' + expanded.substring(0, 6)
        }
      });
      this.convert();
    }
  }

  /**
   * Set up state store subscriptions
   */
  private setupSubscriptions(): void {
    // Subscribe to state changes for UI updates (but skip if we're updating from external source)
    let isUpdatingFromState = false;
    this.stateStore.subscribe((state) => {
      if (!isUpdatingFromState) {
        isUpdatingFromState = true;
        this.updateUIFromState(state);
        isUpdatingFromState = false;
      }
    });

    // Subscribe to changes for preference saving (debounced)
    // Only save preferences when in create mode - preferences are defaults for new nodes,
    // not data from editing existing nodes
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    this.stateStore.subscribe((state) => {
      // Only save preferences when in create mode
      // This prevents node data from being saved as preferences when editing
      if (state.mode === 'create') {
        // Always save preferences, including empty states
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          this.saveUserPreferences();
        }, 500);
      }
    });
  }

  /**
   * Update UI from state (only updates DOM, doesn't trigger events)
   */
  private updateUIFromState(state: AppState): void {
    // Update TeX input (only if different to avoid triggering input event)
    const texInput = document.getElementById('input') as HTMLTextAreaElement;
    if (texInput && texInput.value !== state.renderOptions.tex) {
      texInput.value = state.renderOptions.tex;
    }

    // Update display checkbox (only if different)
    const displayInput = document.getElementById('display') as HTMLInputElement;
    if (displayInput && displayInput.checked !== state.renderOptions.display) {
      displayInput.checked = state.renderOptions.display;
    }

    // Update font size (only if different and valid)
    const fontSizeInput = document.getElementById('font-size') as HTMLInputElement;
    if (fontSizeInput && !isNaN(state.renderOptions.fontSize)) {
      const fontSizeString = state.renderOptions.fontSize.toString();
      if (fontSizeInput.value !== fontSizeString) {
        fontSizeInput.value = fontSizeString;
      }
    }

    // Update colors (strip # prefix for text inputs)
    const bgcolorRaw = state.renderOptions.backgroundColor.replace(/^#/, '');
    const bgcolorExpanded = expandColor(bgcolorRaw);
    const bgcolorInput = document.getElementById('background-color') as HTMLInputElement;
    const bgcolorPicker = document.getElementById('background-color-picker') as HTMLInputElement;
    if (bgcolorInput && bgcolorInput.value !== bgcolorExpanded) {
      bgcolorInput.value = bgcolorExpanded;
    }
    if (bgcolorPicker && bgcolorPicker.value !== state.renderOptions.backgroundColor) {
      bgcolorPicker.value = state.renderOptions.backgroundColor;
    }

    const fontcolorRaw = state.renderOptions.fontColor.replace(/^#/, '');
    const fontcolorExpanded = expandColor(fontcolorRaw);
    const fontcolorInput = document.getElementById('font-color') as HTMLInputElement;
    const fontcolorPicker = document.getElementById('font-color-picker') as HTMLInputElement;
    if (fontcolorInput && fontcolorInput.value !== fontcolorExpanded) {
      fontcolorInput.value = fontcolorExpanded;
    }
    if (fontcolorPicker && fontcolorPicker.value !== state.renderOptions.fontColor) {
      fontcolorPicker.value = state.renderOptions.fontColor;
    }

    // Don't change preview visibility automatically - respect user's choice
    // Preview state is only set once during initialization, then controlled by user toggle

    // Update edit mode indicator
    const indicator = document.getElementById('edit-mode-indicator') as HTMLDivElement;
    if (indicator) {
      if (state.mode === 'edit') {
        indicator.classList.add('visible');
      } else {
        indicator.classList.remove('visible');
      }
    }

    // Update place button visibility
    const placeButton = document.getElementById('place') as HTMLButtonElement;
    if (placeButton) {
      if (state.mode === 'create') {
        placeButton.classList.remove('hidden');
      } else {
        placeButton.classList.add('hidden');
      }
    }
  }

  /**
   * Wait for initialization data from backend
   * Waits for the combined initialize message containing preferences, selection, and theme
   */
  private waitForInitializationData(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Store resolver so message listener can call it
      this.initializationResolver = resolve;
      
      // Set up a timeout fallback (1000ms) in case initialization message never arrives
      // This ensures the plugin still initializes even if backend has issues
      setTimeout(() => {
        if (this.initializationResolver === resolve) {
          // Initialization message didn't arrive, use defaults
          console.warn('Initialization message timeout - using defaults');
          this.initializationResolver = null;
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Set up message listener
   */
  private setupMessageListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const message = (event.data as any).pluginMessage || {};
      
      // Handle initialization message (contains preferences, selection, and theme)
      if (message.type === 'initialize') {
        this.handleInitializationMessage(message);
        return;
      }
      
      // Handle theme change (runtime theme changes)
      if (message.theme === 'dark' || message.theme === 'light') {
        this.applyTheme(message.theme);
      }
      
      // Handle reset to defaults
      if (message.type === 'resetToDefaults') {
        this.pendingReset = true;
        // If still initializing, reset will happen after initialization completes
        // Otherwise, reset immediately
        if (!this.isInitializing) {
          this.resetToDefaults();
        }
      }
      
      // Handle node data load (runtime selection changes)
      if (message.type === 'loadNodeData') {
        this.loadNodeData(message);
      }
      
      // Handle clearing node data (runtime selection changes)
      if (message.type === 'clearNodeData') {
        this.switchToCreateMode();
      }
    });
  }

  /**
   * Handle initialization message from backend
   * Processes combined message containing preferences, selection state, and theme
   */
  private handleInitializationMessage(message: any): void {
    // Apply theme first
    if (message.theme === 'dark' || message.theme === 'light') {
      this.applyTheme(message.theme);
    }

    // Handle selection state
    if (message.selection?.hasNode && message.selection.nodeData) {
      // Node is selected - load node data
      this.stateStore.updateState({ isLoadingNodeData: true });
      
      // Save draft state if in create mode (before switching to edit mode)
      // If mode is already 'edit' (e.g., from embedding), don't save draftState
      const currentState = this.stateStore.getState();
      if (currentState.mode === 'create') {
        this.saveDraftState();
      }

      // Load node data
      const options: RenderOptions = {
        tex: message.selection.nodeData.texSource || '',
        display: message.selection.nodeData.renderOptions?.display !== undefined 
          ? message.selection.nodeData.renderOptions.display 
          : DEFAULT_RENDER_OPTIONS.display,
        fontSize: message.selection.nodeData.renderOptions?.fontSize || DEFAULT_RENDER_OPTIONS.fontSize,
        backgroundColor: message.selection.nodeData.renderOptions?.backgroundColor || DEFAULT_RENDER_OPTIONS.backgroundColor,
        fontColor: message.selection.nodeData.renderOptions?.fontColor || DEFAULT_RENDER_OPTIONS.fontColor,
        subExpressionStyles: (message.selection.nodeData.renderOptions?.subExpressionStyles || []).map((style: any) => ({
          expression: style.expression || '',
          color: style.color || '#000000',
          occurrences: style.occurrences
        }))
      };

      this.stateStore.updateState({
        renderOptions: options,
        mode: 'edit',
        currentNodeId: message.selection.nodeData.nodeId,
        isLoadingNodeData: false
      });
    } else {
      // No node selected - load preferences if available
      if (message.userPreferences) {
        // Restore draftState from preferences if it exists (represents create mode work)
        // If draftState doesn't exist, clear tex/subExpressionStyles to avoid loading stale node data
        if (message.userPreferences.draftState) {
          // Restore preferences.draftState to BOTH renderOptions (for display) AND state.draftState (for within-session switching)
          const cleanedPreferences = {
            ...message.userPreferences,
            tex: message.userPreferences.draftState.tex,
            subExpressionStyles: message.userPreferences.draftState.subExpressionStyles.map((s: SubExpressionStyle) => ({ ...s }))
          };
          this.loadUserPreferences(cleanedPreferences);
          
          // Also restore to state.draftState for within-session switching
          // This allows the draft to be preserved if user switches create → edit → create
          // Use the full RenderOptions structure (merge draftState with other renderOptions from preferences)
          const currentState = this.stateStore.getState();
          this.stateStore.updateState({
            draftState: {
              ...currentState.renderOptions,
              tex: message.userPreferences.draftState.tex,
              subExpressionStyles: message.userPreferences.draftState.subExpressionStyles.map((s: SubExpressionStyle) => ({ ...s }))
            }
          });
        } else {
          // No draftState in preferences - clear tex/subExpressionStyles to avoid loading stale node data
          const cleanedPreferences = {
            ...message.userPreferences,
            tex: '', // Clear tex to avoid loading old node data
            subExpressionStyles: [] // Clear subExpressionStyles to avoid loading old node data
          };
          this.loadUserPreferences(cleanedPreferences);
        }
      } else if (!this.pendingReset) {
        // No preferences exist - inject default example for first-time users
        this.injectDefaultExampleIfEmpty();
      }
    }

    // Resolve initialization promise
    if (this.initializationResolver) {
      this.initializationResolver();
      this.initializationResolver = null;
    }
  }

  // ========== Workflow Methods ==========

  /**
   * Switch to create mode
   */
  private switchToCreateMode(): void {
    const state = this.stateStore.getState();
    
    // Restore draft state if available, otherwise clear tex (keep other settings)
    if (state.draftState) {
      this.stateStore.updateState({
        mode: 'create',
        currentNodeId: null
      });
      this.restoreDraftState();
    } else {
      // No draft to restore - clear tex but preserve other settings
      // Get fresh state to ensure we have current renderOptions
      const currentState = this.stateStore.getState();
      this.stateStore.updateState({
        mode: 'create',
        currentNodeId: null,
        renderOptions: {
          ...currentState.renderOptions,
          tex: ''
        },
        lastRenderedTex: null,
        lastRenderedDisplay: null,
        currentSVGWrapper: null
      });
      // Explicitly update UI to ensure tex field is cleared
      const updatedState = this.stateStore.getState();
      this.updateUIFromState(updatedState);
      this.convert();
    }
  }

  /**
   * Switch to edit mode
   */
  private switchToEditMode(nodeId: string): void {
    // Save draft state before switching (only if currently in create mode)
    const state = this.stateStore.getState();
    if (state.mode === 'create') {
      this.saveDraftState();
    }
    
    this.stateStore.updateState({
      mode: 'edit',
      currentNodeId: nodeId
    });
    
    // Clear draftState from preferences when switching to edit mode
    // This prevents stale draftState from being restored later
    this.clearDraftStateFromPreferences();
  }

  /**
   * Save draft state to state.draftState (in-memory only, for within-session switching)
   * 
   * state.draftState: Within-session switching only - preserves draft when switching create → edit → create.
   * This is separate from preferences.draftState which handles cross-session persistence.
   */
  private saveDraftState(): void {
    const state = this.stateStore.getState();
    // Deep copy renderOptions including subExpressionStyles array
    this.stateStore.updateState({
      draftState: {
        ...state.renderOptions,
        subExpressionStyles: state.renderOptions.subExpressionStyles.map(s => ({ ...s }))
      }
    });
  }

  /**
   * Restore draft state
   */
  private restoreDraftState(): void {
    const state = this.stateStore.getState();
    if (state.draftState) {
      // Deep copy draftState including subExpressionStyles array
      this.stateStore.updateState({
        renderOptions: {
          ...state.draftState,
          subExpressionStyles: state.draftState.subExpressionStyles.map(s => ({ ...s }))
        },
        draftState: null
      });
      this.convert();
    }
  }

  /**
   * Reset plugin to default state (as if on first install)
   */
  resetToDefaults(): void {
    const state = this.stateStore.getState();
    const theme = state.theme || this.detectOSTheme();
    const defaults = THEME_DEFAULTS[theme] || THEME_DEFAULTS.dark;
    
    // Reset state to defaults
    const defaultRenderOptions: RenderOptions = {
      tex: '',
      display: DEFAULT_RENDER_OPTIONS.display,
      fontSize: DEFAULT_RENDER_OPTIONS.fontSize,
      backgroundColor: '#' + defaults.background,
      fontColor: '#' + defaults.font,
      subExpressionStyles: []
    };
    
    // Update state store with defaults
    this.stateStore.updateState({
      renderOptions: defaultRenderOptions,
      mode: 'create',
      currentNodeId: null,
      lastRenderedTex: null,
      lastRenderedDisplay: null,
      currentSVGWrapper: null,
      isLoadingNodeData: false,
      draftState: null
    });
    
    // Clear any sub-expression errors
    this.clearSubExpressionErrors();
    
    // Clear pending reset flag
    this.pendingReset = false;
    
    // Inject default example to simulate first-time user experience
    this.injectDefaultExampleIfEmpty();
    
    // Re-render with defaults
    this.convert();
  }

  /**
   * Save user preferences
   * 
   * preferences.draftState: Cross-session persistence - always reflects current create mode work.
   * This is saved from renderOptions directly, not from state.draftState, to ensure draft work
   * persists even if the user never switches modes.
   */
  private saveUserPreferences(): void {
    const state = this.stateStore.getState();
    const options = state.renderOptions;
    
    const preferences: any = {
      ...options
    };
    
    // Save current create mode work as draftState for cross-session persistence
    // Always save renderOptions directly (not state.draftState) when in create mode
    // This ensures draftState persists even if user never switches modes
    if (state.mode === 'create') {
      preferences.draftState = {
        tex: options.tex,
        subExpressionStyles: options.subExpressionStyles.map((s: SubExpressionStyle) => ({ ...s }))
      };
    } else {
      // Explicitly set to null when not in create mode
      preferences.draftState = null;
    }
    
    (window.parent as Window).postMessage({ 
      pluginMessage: { 
        type: 'saveUserPreferences',
        ...preferences
      } 
    }, '*');
  }

  /**
   * Clear draftState from preferences (preferences.draftState, not state.draftState)
   * Called when embedding or switching to edit mode to prevent stale draftState from being restored
   * on next plugin open. This clears the persisted draftState, not the in-memory state.draftState.
   */
  private clearDraftStateFromPreferences(): void {
    const state = this.stateStore.getState();
    const options = state.renderOptions;
    
    (window.parent as Window).postMessage({ 
      pluginMessage: { 
        type: 'saveUserPreferences',
        ...options,
        draftState: null
      } 
    }, '*');
  }

  /**
   * Load user preferences
   * Note: Does not call convert() - let the initialization flow handle rendering
   */
  private loadUserPreferences(prefs: Partial<UserPreferences>): void {
    const renderOptions: RenderOptions = {
      tex: prefs.tex || '',
      display: prefs.display !== undefined ? prefs.display : DEFAULT_RENDER_OPTIONS.display,
      fontSize: prefs.fontSize || DEFAULT_RENDER_OPTIONS.fontSize,
      backgroundColor: prefs.backgroundColor || DEFAULT_RENDER_OPTIONS.backgroundColor,
      fontColor: prefs.fontColor || DEFAULT_RENDER_OPTIONS.fontColor,
      subExpressionStyles: (prefs.subExpressionStyles || []).map((style: any) => ({
        expression: style.expression || '',
        color: style.color || '#000000',
        occurrences: style.occurrences
      }))
    };
    
    this.stateStore.updateState({ renderOptions });
    // Don't call convert() here - initialization flow will handle rendering
  }

  /**
   * Inject default example TeX if input is empty (for first-time users)
   */
  private injectDefaultExampleIfEmpty(): void {
    const state = this.stateStore.getState();
    const texInput = document.getElementById('input') as HTMLTextAreaElement;
    
    // Only inject if both state and DOM input are empty
    if (!state.renderOptions.tex.trim() && texInput && !texInput.value.trim()) {
      const defaultExample = 'x=\\frac{-b \\pm \\sqrt{b^2-4 a c}}{2 a}';
      this.stateStore.updateState({
        renderOptions: {
          ...state.renderOptions,
          tex: defaultExample
        }
      });
    }
  }

  /**
   * Apply theme
   */
  private applyTheme(theme: string): void {
    const defaults = THEME_DEFAULTS[theme] || THEME_DEFAULTS.dark;
    const state = this.stateStore.getState();
    
    this.stateStore.updateState({
      theme,
      renderOptions: {
        ...state.renderOptions,
        backgroundColor: '#' + defaults.background,
        fontColor: '#' + defaults.font
      }
    });
    
    this.convert();
  }

  /**
   * Detect OS theme (without applying - application happens in loadInitialStateFromDOM)
   */
  private detectOSTheme(): string {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = mediaQuery.matches;
    return isDark ? 'dark' : 'light';
  }

  /**
   * Smart dispatcher that decides between full render or styling update
   */
  private convert(): void {
    const state = this.stateStore.getState();
    
    if (this.stateStore.needsFullRender()) {
      this.renderMath();
    } else {
      this.updateStyling();
    }
  }

  /**
   * Full MathJax re-render (only when TeX or display mode changes)
   */
  private renderMath(): Promise<void> {
    const state = this.stateStore.getState();
    const options = state.renderOptions;
    
    // Clear the old output
    const output = document.getElementById('output') as HTMLDivElement;
    if (!output) return Promise.resolve();
    
    output.innerHTML = '';
    output.style.background = options.backgroundColor;
    
    // Check if TeX input is empty
    const trimmedTex = options.tex.trim();
    if (!trimmedTex) {
      // Display helpful message for empty input
      const messageElement = document.createElement('div');
      messageElement.style.cssText = 'padding: 1rem; text-align: center; color: var(--figma-color-text-secondary, #999); font-style: italic;';
      messageElement.textContent = 'Enter a TeX expression above';
      output.appendChild(messageElement);
      
      this.stateStore.updateState({ 
        currentSVGWrapper: null,
        lastRenderedTex: null,
        lastRenderedDisplay: null
      });
      return Promise.resolve();
    }
    
    this.stateStore.updateState({ currentSVGWrapper: null });
    
    // Create error callbacks for UI integration
    const errorCallbacks: SubExpressionErrorCallbacks = {
      showError: (rowIndex, field, message) => this.showSubExpressionError(rowIndex, field, message),
      clearError: (rowIndex, field) => this.clearSubExpressionError(rowIndex, field),
      clearAllErrors: () => this.clearSubExpressionErrors()
    };
    
    // Prepare typesetting options
    const typesettingOptions: TypesettingOptions = {
      display: options.display,
      fontSize: options.fontSize,
      fontColor: options.fontColor,
      subExpressionStyles: options.subExpressionStyles,
      outputElement: output,
      subExpressionErrorCallbacks: errorCallbacks
    };
    
    // Use the high-level typesetting function
    return typesetMath(options.tex, typesettingOptions)
      .then((node: HTMLElement) => {
        output.appendChild(node);
        
        // Update tracked state
        this.stateStore.updateState({
          currentSVGWrapper: node,
          lastRenderedTex: options.tex,
          lastRenderedDisplay: options.display
        });
        
        // Trigger real-time update if node is loaded and we're not just loading data
        const currentState = this.stateStore.getState();
        if (!currentState.isLoadingNodeData && currentState.mode === 'edit') {
          this.debouncedUpdate();
        }
      })
      .catch((err: Error) => {
        output.appendChild(document.createElement('pre')).appendChild(document.createTextNode(err.message));
        this.stateStore.updateState({
          currentSVGWrapper: null,
          lastRenderedTex: null,
          lastRenderedDisplay: null
        });
      });
  }

  /**
   * Updates styling on existing SVG without re-rendering MathJax
   */
  private updateStyling(): void {
    const state = this.stateStore.getState();
    const options = state.renderOptions;
    
    if (!state.currentSVGWrapper) return;
    
    // Update styling properties
    this.updateBackgroundColor(options.backgroundColor);
    this.updateFontColor(options.fontColor);
    this.updateFontSize(options.fontSize);
    this.updateSubExpressionStyles(options.subExpressionStyles);
    
    // Trigger real-time update if node is loaded and we're not just loading data
    if (!state.isLoadingNodeData && state.mode === 'edit') {
      this.debouncedUpdate();
    }
  }

  /**
   * Updates sub-expression styles directly from state (bypasses DOM sync)
   */
  private updateSubExpressionStylesDirectly(): void {
    const state = this.stateStore.getState();
    if (!state.currentSVGWrapper) return;
    
    this.updateSubExpressionStyles(state.renderOptions.subExpressionStyles);
    
    // Trigger real-time update if node is loaded and we're not just loading data
    if (!state.isLoadingNodeData && state.mode === 'edit') {
      this.debouncedUpdate();
    }
  }

  /**
   * Gets the SVG element from the wrapper node
   */
  private getSVGElement(wrapper: HTMLElement): HTMLElement | null {
    const svgElement = wrapper.querySelector('svg');
    return svgElement ? (svgElement as unknown as HTMLElement) : null;
  }

  /**
   * Updates font color on existing SVG without re-rendering
   */
  private updateFontColor(color: string): void {
    const state = this.stateStore.getState();
    if (!state.currentSVGWrapper) return;
    const svgElement = this.getSVGElement(state.currentSVGWrapper);
    if (svgElement) {
      setSVGColor(svgElement, color);
      // Ensure error nodes maintain their custom styling
      styleErrorNodes(svgElement);
    }
  }

  /**
   * Updates font size on existing SVG without re-rendering
   */
  private updateFontSize(fontSize: number): void {
    const state = this.stateStore.getState();
    if (!state.currentSVGWrapper) return;
    state.currentSVGWrapper.setAttribute('font-size', fontSize + 'px');
  }

  /**
   * Updates background color on output container
   */
  private updateBackgroundColor(color: string): void {
    const output = document.getElementById('output') as HTMLDivElement;
    if (output) {
      output.style.background = color;
    }
  }

  /**
   * Updates sub-expression styles on existing SVG without re-rendering
   */
  private updateSubExpressionStyles(styles: SubExpressionStyle[]): void {
    const state = this.stateStore.getState();
    if (!state.currentSVGWrapper) return;
    const svgElement = this.getSVGElement(state.currentSVGWrapper);
    if (svgElement) {
      const errorCallbacks: SubExpressionErrorCallbacks = {
        showError: (rowIndex, field, message) => this.showSubExpressionError(rowIndex, field, message),
        clearError: (rowIndex, field) => this.clearSubExpressionError(rowIndex, field),
        clearAllErrors: () => this.clearSubExpressionErrors()
      };
      applySubExpressionColors(svgElement, styles, errorCallbacks);
    }
  }

  /**
   * Prepare data for sending to backend
   */
  private prepareMessageData(updateExisting = false): any | null {
    const outputElement = document.getElementById('output');
    if (!outputElement || !outputElement.firstChild) {
      return null; // No SVG rendered yet
    }
    
    // MathJax wraps the SVG in a container (e.g., mjx-container)
    // Extract the actual SVG element from inside the wrapper
    const wrapper = outputElement.firstChild as Element;
    const svgElement = wrapper.querySelector('svg');
    if (!svgElement || svgElement.tagName !== 'svg') {
      return null; // No SVG found
    }
    
    const state = this.stateStore.getState();
    const options = state.renderOptions;
    
    // Use outerHTML to get the complete SVG element (not just innerHTML)
    const svg = svgElement.outerHTML;
    
    // Calculate scale from font-size
    const scale = options.fontSize / MATHJAX_DEFAULT_FONT_SIZE;
    
    return {
      tex: options.tex,
      svg,
      scale,
      display: options.display,
      backgroundColor: options.backgroundColor,
      fontColor: options.fontColor,
      fontSize: options.fontSize,
      subExpressionStyles: options.subExpressionStyles,
      updateExisting
    };
  }

  /**
   * Send update to Figma (with debouncing)
   */
  private sendUpdateToFigma(): void {
    const state = this.stateStore.getState();
    if (state.mode !== 'edit') {
      return; // Don't update if not in edit mode
    }
    
    const data = this.prepareMessageData(true);
    if (!data) {
      return; // No SVG rendered yet
    }
    
    (window.parent as Window).postMessage({ pluginMessage: data }, '*');
  }

  /**
   * Debounced update function
   */
  private debouncedUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    this.updateTimer = setTimeout(() => {
      this.sendUpdateToFigma();
    }, 300); // 300ms debounce delay
  }

  /**
   * Load node data
   */
  private loadNodeData(message: any): Promise<void> {
    this.stateStore.updateState({ isLoadingNodeData: true });
    
    // Save draft state BEFORE updating renderOptions (only if in create mode)
    // If mode is already 'edit' (e.g., from embedding), don't save draftState
    const currentState = this.stateStore.getState();
    if (currentState.mode === 'create') {
      this.saveDraftState();
    }
    
    // Apply options to state store
    const options: RenderOptions = {
      tex: message.texSource || '',
      display: message.renderOptions?.display !== undefined ? message.renderOptions.display : DEFAULT_RENDER_OPTIONS.display,
      fontSize: message.renderOptions?.fontSize || DEFAULT_RENDER_OPTIONS.fontSize,
      backgroundColor: message.renderOptions?.backgroundColor || DEFAULT_RENDER_OPTIONS.backgroundColor,
      fontColor: message.renderOptions?.fontColor || DEFAULT_RENDER_OPTIONS.fontColor,
      subExpressionStyles: (message.renderOptions?.subExpressionStyles || []).map((style: any) => ({
        expression: style.expression || '',
        color: style.color || '#000000',
        occurrences: style.occurrences
      }))
    };
    
    // Update renderOptions and switch to edit mode in one call
    // (Don't use switchToEditMode here since we already saved draft state above)
    this.stateStore.updateState({ 
      renderOptions: options,
      mode: 'edit',
      currentNodeId: message.nodeId
    });
    
    // Trigger render with promise chain
    return this.renderMath()
      .then(() => {
        this.stateStore.updateState({ isLoadingNodeData: false });
      })
      .catch((err) => {
        this.stateStore.updateState({ isLoadingNodeData: false });
        console.error('Error loading node data:', err);
      });
  }

  /**
   * Error callbacks for sub-expression styling
   */
  private showSubExpressionError(rowIndex: number, field: string, message: string): void {
    this.subExpression?.showError(rowIndex, field, message);
  }

  private clearSubExpressionError(rowIndex: number, field: string): void {
    this.subExpression?.clearError(rowIndex, field);
  }

  private clearSubExpressionErrors(): void {
    this.subExpression?.clearAllErrors();
  }

  /**
   * Helper function to reliably select all text in an input
   */
  private selectAllText(event: FocusEvent | MouseEvent): void {
    const target = event.target as HTMLInputElement;
    
    // For number inputs, check if click was on spinner buttons (right side of input)
    if (target.type === 'number' && event.type === 'mousedown') {
      const mouseEvent = event as MouseEvent;
      const inputRect = target.getBoundingClientRect();
      const clickX = mouseEvent.clientX - inputRect.left;
      const inputWidth = inputRect.width;
      // Spinner buttons are typically on the right ~20-30px of number inputs
      // If click is in the right portion, don't prevent default (allow spinner to work)
      if (clickX > inputWidth - 30) {
        return; // Let the spinner buttons work
      }
    }
    
    // Prevent default mouseup behavior that might interfere with selection
    if (event.type === 'mousedown' || event.type === 'click') {
      event.preventDefault();
    }
    // Use setTimeout to ensure selection happens after browser's default focus behavior
    setTimeout(() => {
      target.select();
    }, 0);
  }

  /**
   * Toggle preview expand/collapse
   */
  private togglePreview(): void {
    const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
    const previewOutput = document.getElementById('preview-output') as HTMLDivElement;
    
    if (previewContainer && previewOutput) {
      if (previewContainer.classList.contains('expanded')) {
        previewContainer.classList.remove('expanded');
        previewOutput.classList.add('collapsed');
      } else {
        previewContainer.classList.add('expanded');
        previewOutput.classList.remove('collapsed');
      }
    }
  }
}

export { PluginFrontend };

/**
 * Plugin frontend - orchestrates all UI components and contains all workflow methods
 */

import { StateStore, AppState } from './StateStore';
import { typesetMath, TypesettingOptions, SubExpressionErrorCallbacks, setSVGColor, applySubExpressionColors } from '../mathRenderer';
import { SubExpressionStyles } from '../components/SubExpressionStyles';
import { RenderOptions, UserPreferences, SubExpressionStyle } from '../types';
import { expandColor, THEME_DEFAULTS } from '../utils';

class PluginFrontend {
  private stateStore!: StateStore; // Initialized in initialize()
  private subExpression: SubExpressionStyles | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private previewInitialized: boolean = false;
  private preferencesLoadedResolver: ((value: void | PromiseLike<void>) => void) | null = null;
  private isInitializing: boolean = false;
  private pendingReset: boolean = false;
  private justEmbedded: boolean = false;

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
    
    // 7. Load preferences and initial render
    return this.loadUserPreferencesFromBackend()
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
      display: displayInput?.checked ?? true,
      fontSize: fontSizeInput ? parseFloat(fontSizeInput.value) : 24,
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
        this.stateStore.updateState({ draftState: null });
        this.justEmbedded = true;
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
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    this.stateStore.subscribe((state) => {
      // Always save preferences, including empty states
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        this.saveUserPreferences();
      }, 500);
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
   * Load user preferences from backend
   * Waits for preferences message from backend, with timeout fallback
   */
  private loadUserPreferencesFromBackend(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Store resolver so message listener can call it
      this.preferencesLoadedResolver = resolve;
      
      // Set up a timeout fallback (1000ms) in case preferences message never arrives
      // This ensures the plugin still initializes even if backend has issues
      // (Backend should always send a message, but this is a safety net)
      setTimeout(() => {
        if (this.preferencesLoadedResolver === resolve) {
          // Preferences message didn't arrive, assume no preferences exist
          // Inject default example for first-time users
          this.injectDefaultExampleIfEmpty();
          this.preferencesLoadedResolver = null;
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
      
      // Handle theme change
      if (message.theme === 'dark' || message.theme === 'light') {
        this.applyTheme(message.theme);
      }
      
      // Handle reset to defaults (check this first to set flag before loadUserPreferences)
      if (message.type === 'resetToDefaults') {
        this.pendingReset = true;
        // If still initializing, reset will happen after initialization completes
        // Otherwise, reset immediately
        if (!this.isInitializing) {
          this.resetToDefaults();
        }
      }
      
      // Handle user preferences load
      if (message.type === 'loadUserPreferences') {
        if (message.userPreferences) {
          // Preferences exist, load them
          this.loadUserPreferences(message.userPreferences);
        } else {
          // No preferences exist - only inject default example if not resetting
          // (when resetting, we want empty state, not the example)
          if (!this.pendingReset) {
            this.injectDefaultExampleIfEmpty();
          }
        }
        // Resolve the promise that's waiting for preferences
        if (this.preferencesLoadedResolver) {
          this.preferencesLoadedResolver();
          this.preferencesLoadedResolver = null;
        }
      }
      
      // Handle node data load
      if (message.type === 'loadNodeData') {
        this.loadNodeData(message);
      }
      
      // Handle clearing node data
      if (message.type === 'clearNodeData') {
        this.switchToCreateMode();
      }
    });
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
  }

  /**
   * Save draft state
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
  private resetToDefaults(): void {
    const state = this.stateStore.getState();
    const theme = state.theme || this.detectOSTheme();
    const defaults = THEME_DEFAULTS[theme] || THEME_DEFAULTS.dark;
    
    // Reset state to defaults
    const defaultRenderOptions: RenderOptions = {
      tex: '',
      display: true,
      fontSize: 24,
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
    
    // Re-render with defaults
    this.convert();
  }

  /**
   * Save user preferences
   */
  private saveUserPreferences(): void {
    const state = this.stateStore.getState();
    const options = state.renderOptions;
    
    (window.parent as Window).postMessage({ 
      pluginMessage: { 
        type: 'saveUserPreferences',
        ...options
      } 
    }, '*');
  }

  /**
   * Load user preferences
   * Note: Does not call convert() - let the initialization flow handle rendering
   */
  private loadUserPreferences(prefs: any): void {
    const renderOptions: RenderOptions = {
      tex: prefs.tex || '',
      display: prefs.display !== undefined ? prefs.display : true,
      fontSize: prefs.fontSize || 24,
      backgroundColor: prefs.backgroundColor || '#000000',
      fontColor: prefs.fontColor || '#E0E0E0',
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
    
    // Calculate scale from font-size (default MathJax font-size is 12px per em)
    const scale = options.fontSize / 16;
    
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
    
    // Save draft state BEFORE updating renderOptions (only if in create mode and we didn't just embed)
    // If we just embedded, don't save draft state since we intentionally cleared it
    const currentState = this.stateStore.getState();
    if (currentState.mode === 'create' && !this.justEmbedded) {
      this.saveDraftState();
    }
    // Reset the flag after checking
    this.justEmbedded = false;
    
    // Apply options to state store
    const options: RenderOptions = {
      tex: message.texSource || '',
      display: message.renderOptions?.display !== undefined ? message.renderOptions.display : true,
      fontSize: message.renderOptions?.fontSize || 16,
      backgroundColor: message.renderOptions?.backgroundColor || '#000000',
      fontColor: message.renderOptions?.fontColor || '#E0E0E0',
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

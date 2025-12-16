/**
 * Centralized state management with subscription pattern
 */

import { RenderOptions } from '../types';

/**
 * Application state interface
 */
export interface AppState {
  renderOptions: RenderOptions;
  theme: string;
  mode: 'create' | 'edit';
  currentNodeId: string | null;
  lastRenderedTex: string | null;
  lastRenderedDisplay: boolean | null;
  currentSVGWrapper: HTMLElement | null;
  isLoadingNodeData: boolean;
  draftState: RenderOptions | null;
}

/**
 * State store with subscription pattern
 */
export class StateStore {
  private state: AppState;
  private subscribers: Array<(state: AppState) => void> = [];

  constructor(initialState?: Partial<AppState>) {
    this.state = {
      renderOptions: {
        tex: '',
        display: true,
        fontSize: 24,
        backgroundColor: '#000000',
        fontColor: '#E0E0E0',
        subExpressionStyles: []
      },
      theme: 'dark',
      mode: 'create',
      currentNodeId: null,
      lastRenderedTex: null,
      lastRenderedDisplay: null,
      currentSVGWrapper: null,
      isLoadingNodeData: false,
      draftState: null,
      ...initialState
    };
  }

  /**
   * Get current state snapshot
   */
  getState(): AppState {
    // Return a shallow copy with deep copy of renderOptions
    // Note: HTMLElement references are kept as-is (they're DOM references)
    return {
      ...this.state,
      renderOptions: {
        ...this.state.renderOptions,
        subExpressionStyles: this.state.renderOptions.subExpressionStyles.map(s => ({ ...s }))
      }
    };
  }

  /**
   * Update state and notify subscribers
   */
  updateState(updates: Partial<AppState>): void {
    // Merge updates into current state
    this.state = {
      ...this.state,
      ...updates,
      // Deep merge renderOptions if it's being updated
      renderOptions: updates.renderOptions
        ? {
            ...this.state.renderOptions,
            ...updates.renderOptions,
            // Deep merge subExpressionStyles if it's being updated
            subExpressionStyles: updates.renderOptions.subExpressionStyles !== undefined
              ? updates.renderOptions.subExpressionStyles
              : this.state.renderOptions.subExpressionStyles
          }
        : this.state.renderOptions
    };

    // Notify all subscribers synchronously
    const stateSnapshot = this.getState();
    this.subscribers.forEach(callback => {
      try {
        callback(stateSnapshot);
      } catch (err) {
        console.error('Error in state subscriber:', err);
      }
    });
  }

  /**
   * Subscribe to state changes
   * @returns Unsubscribe function
   */
  subscribe(callback: (state: AppState) => void): () => void {
    this.subscribers.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /**
   * Check if a full render is needed based on current state
   */
  needsFullRender(): boolean {
    const state = this.state;
    const texChanged = state.lastRenderedTex !== state.renderOptions.tex;
    const displayChanged = state.lastRenderedDisplay !== state.renderOptions.display;
    const noSVG = !state.currentSVGWrapper;
    
    return texChanged || displayChanged || noSVG;
  }
}


import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

interface TimelineUiState {
  resetGap: number;
}

type TimelineUiAction = { type: 'set_reset_gap'; value: number };

const DEFAULT_RESET_GAP = 50;
const DEFAULT_MAX_GAP = 81;

interface UseTimelineUiStateOptions {
  maxFrameLimit?: number;
  defaultFrameGap?: number;
}

function reducer(state: TimelineUiState, action: TimelineUiAction): TimelineUiState {
  switch (action.type) {
    case 'set_reset_gap':
      return {
        ...state,
        resetGap: action.value,
      };
    default:
      return state;
  }
}

export function useTimelineUiState(options: UseTimelineUiStateOptions = {}) {
  const { maxFrameLimit = DEFAULT_MAX_GAP, defaultFrameGap } = options;
  const initialResetGap = defaultFrameGap ?? DEFAULT_RESET_GAP;

  const [state, dispatch] = useReducer(reducer, {
    resetGap: initialResetGap,
  });

  const setResetGap = useCallback((value: number) => {
    dispatch({ type: 'set_reset_gap', value });
  }, []);

  // When the underlying model's default gap changes (model switch), sync the
  // reset gap to the new default so the "Gap" slider reflects the selected model.
  const prevDefaultRef = useRef(defaultFrameGap);
  useEffect(() => {
    if (defaultFrameGap !== undefined && prevDefaultRef.current !== defaultFrameGap) {
      prevDefaultRef.current = defaultFrameGap;
      dispatch({ type: 'set_reset_gap', value: defaultFrameGap });
    }
  }, [defaultFrameGap]);

  return useMemo(() => ({
    resetGap: state.resetGap,
    setResetGap,
    maxGap: maxFrameLimit,
  }), [
    maxFrameLimit,
    setResetGap,
    state.resetGap,
  ]);
}

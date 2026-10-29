import { useEffect, useReducer } from 'react';

interface VideoShotDisplayState {
  isVideoModalOpen: boolean;
  isSelectedForAddition: boolean;
}

type VideoShotDisplayAction =
  | { type: 'set_video_modal_open'; open: boolean }
  | { type: 'set_selected_for_addition'; selected: boolean };

interface UseVideoShotDisplayStateInput {
  shotId: string;
  selectedShotId?: string | null;
  isGenerationsPaneLocked: boolean;
}

const INITIAL_STATE: VideoShotDisplayState = {
  isVideoModalOpen: false,
  isSelectedForAddition: false,
};

function reducer(state: VideoShotDisplayState, action: VideoShotDisplayAction): VideoShotDisplayState {
  switch (action.type) {
    case 'set_video_modal_open':
      return {
        ...state,
        isVideoModalOpen: action.open,
      };
    case 'set_selected_for_addition':
      return {
        ...state,
        isSelectedForAddition: action.selected,
      };
    default:
      return state;
  }
}

export function useVideoShotDisplayState({
  shotId,
  selectedShotId,
  isGenerationsPaneLocked,
}: UseVideoShotDisplayStateInput) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  useEffect(() => {
    if (!isGenerationsPaneLocked) {
      dispatch({ type: 'set_selected_for_addition', selected: false });
      return;
    }
    if (selectedShotId === undefined) {
      dispatch({ type: 'set_selected_for_addition', selected: false });
      return;
    }
    dispatch({ type: 'set_selected_for_addition', selected: selectedShotId === shotId });
  }, [isGenerationsPaneLocked, selectedShotId, shotId]);

  return {
    ...state,
    setVideoModalOpen: (open: boolean) => dispatch({ type: 'set_video_modal_open', open }),
    setSelectedForAddition: (selected: boolean) => dispatch({ type: 'set_selected_for_addition', selected }),
  };
}

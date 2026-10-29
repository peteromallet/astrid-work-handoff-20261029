// The trailing endpoint key — lives in the positions map but is not a real image
export const TRAILING_ENDPOINT_KEY = '__trailing_endpoint';

// Phantom key for a pending item (duplicate/drop/external add) — used in augmented
// positions maps so pair regions and segment strip can update before the real item arrives
export const PENDING_POSITION_KEY = '__pending__';

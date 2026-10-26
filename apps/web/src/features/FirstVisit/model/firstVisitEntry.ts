export interface FirstVisitEntryState {
  phase: 'reading' | 'waiting' | 'revealing' | 'map';
  mapStatus: 'loading' | 'ready' | 'error';
}

type FirstVisitEntryEvent = { type: 'enter' | 'ready' | 'failed' | 'retry' | 'cancel' | 'revealed' | 'show' | 'hide' };

export function firstVisitEntryReducer(state: FirstVisitEntryState, event: FirstVisitEntryEvent): FirstVisitEntryState {
  switch (event.type) {
    case 'enter':
      if (state.phase !== 'reading' || state.mapStatus === 'error') return state;
      return { ...state, phase: state.mapStatus === 'ready' ? 'revealing' : 'waiting' };
    case 'ready':
      return { mapStatus: 'ready', phase: state.phase === 'waiting' ? 'revealing' : state.phase };
    case 'failed':
      return { mapStatus: 'error', phase: state.phase === 'map' ? 'map' : 'reading' };
    case 'retry':
      return { mapStatus: 'loading', phase: state.phase === 'revealing' ? 'waiting' : state.phase };
    case 'revealed':
      return state.phase === 'revealing' && state.mapStatus === 'ready' ? { ...state, phase: 'map' } : state;
    case 'show':
    case 'cancel':
      return { ...state, phase: 'reading' };
    case 'hide':
      return { ...state, phase: 'map' };
  }
}

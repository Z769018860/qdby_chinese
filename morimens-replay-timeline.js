// Compatibility entry point. Full replay review now fetches public BattleReplay objects by battleUuid.
import('./morimens-replay-review-v2.js?v=20261004.4').catch(error=>console.error('Replay review failed to load',error));

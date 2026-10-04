// Compatibility entry point. The replay review UI now lives in a standalone tab.
import('./morimens-replay-review.js?v=20261004.3').catch(error=>console.error('Replay review failed to load',error));

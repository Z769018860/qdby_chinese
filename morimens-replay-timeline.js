// Compatibility entry point. Full replay review fetches public BattleReplay objects by battleUuid.
// The war-report object is anonymously readable but does not allow this site's browser origin via CORS.
// Rewrite only the exact BattleReplay URL to the site's constrained same-origin EdgeOne proxy.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const replayUrl=/^https:\/\/z1g-warreport\.qookkagames\.com\/publish\/BattleReplay_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json(?:[?#].*)?$/i;

  if(!window.__morimensReplayProxyFetchInstalled){
    window.__morimensReplayProxyFetchInstalled=true;
    window.fetch=(input,init={})=>{
      const url=typeof input==='string'
        ? input
        : input instanceof URL
          ? input.href
          : input&&typeof input.url==='string'
            ? input.url
            : '';
      const match=url.match(replayUrl);
      if(!match)return nativeFetch(input,init);
      const proxy=`/api/morimens/replay/${match[1].toLowerCase()}`;
      return nativeFetch(proxy,{...init,mode:'same-origin',credentials:'omit'});
    };
  }

  import('./morimens-replay-review-v2.js?v=20261004.5')
    .catch(error=>console.error('Replay review failed to load',error));
})();

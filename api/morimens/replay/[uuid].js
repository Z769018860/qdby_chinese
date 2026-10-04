const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPSTREAM='https://z1g-warreport.qookkagames.com/publish/BattleReplay_';
const MAX_BYTES=20_000_000;

module.exports=async function handler(req,res){
  const origin=String(req.headers.origin||'');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Vary','Origin');
  if(req.method==='OPTIONS'){res.status(204).end();return}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD, OPTIONS');res.status(405).send('Method Not Allowed');return}

  const raw=Array.isArray(req.query?.uuid)?req.query.uuid[0]:req.query?.uuid;
  const uuid=String(raw||'').toLowerCase();
  if(!UUID_RE.test(uuid)){res.status(400).send('Invalid replay UUID');return}

  let upstream;
  try{
    upstream=await fetch(`${UPSTREAM}${uuid}.json`,{method:req.method,redirect:'follow',headers:{Accept:'application/json,application/octet-stream;q=0.9,*/*;q=0.8'}});
  }catch(error){res.status(502).send(`Replay upstream fetch failed: ${error?.message||error}`);return}

  res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Morimens-Replay-Source','public-warreport-vercel');
  const type=upstream.headers.get('content-type');if(type)res.setHeader('Content-Type',type);
  const etag=upstream.headers.get('etag');if(etag)res.setHeader('ETag',etag);
  const lm=upstream.headers.get('last-modified');if(lm)res.setHeader('Last-Modified',lm);

  if(!upstream.ok){res.status(upstream.status).send(req.method==='HEAD'?'':`Replay upstream returned ${upstream.status}`);return}
  if(req.method==='HEAD'){res.status(upstream.status).end();return}

  const declared=Number(upstream.headers.get('content-length')||0);
  if(declared&&declared>MAX_BYTES){res.status(413).send('Replay object too large');return}
  const body=Buffer.from(await upstream.arrayBuffer());
  if(body.length>MAX_BYTES){res.status(413).send('Replay object too large');return}
  res.setHeader('Content-Length',String(body.length));
  res.status(200).send(body);
};

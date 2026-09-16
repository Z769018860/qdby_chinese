import {mkdir,writeFile} from 'node:fs/promises';
import {decodeSvelteData,fetchViaJina,findDzoneActivities,findMediaBase,findProfileHeader,walk} from './eremora_sveltekit.mjs';

const ORIGIN='https://eremora.com',OUT_DIR='data/morimens/eremora',UA='qdby-chinese-eremora-discovery/2.0 (+https://github.com/Z769018860/qdby_chinese)';
const PAGE=`${ORIGIN}/leaderboard/abyss`,RAW_INDEX=`${PAGE}/__data.json`;
const uniq=xs=>[...new Set((xs||[]).filter(Boolean))];
async function reader(url){return (await fetchViaJina(url,{ua:UA,retries:4})).text}
function challengeUrls(text=''){return uniq([...text.matchAll(/https:\/\/eremora\.com\/u\/(\d+)\/challenges\/dzone\/(\d+)/g)].map(m=>({url:m[0],uid:m[1],season:Number(m[2])})).map(x=>JSON.stringify(x))).map(JSON.parse)}
function shape(root){
  const keys=new Map(),arrays=new Map();walk(root,(v,p)=>{if(Array.isArray(v)){arrays.set(p,v.length);return}for(const k of Object.keys(v))keys.set(k,(keys.get(k)||0)+1)});
  return {topKeys:root&&typeof root==='object'?Object.keys(root):[],keyFrequency:[...keys].sort((a,b)=>b[1]-a[1]).slice(0,120),largestArrays:[...arrays].sort((a,b)=>b[1]-a[1]).slice(0,40)};
}
function apiCandidates(text=''){return uniq([...text.matchAll(/https?:\/\/[^"'`\\\s]+|\/api\/[A-Za-z0-9_?=&./:${}\-]+/g)].map(m=>m[0]).filter(x=>/api|leaderboard|dzone|challenge|season/i.test(x))).slice(0,200)}

const rendered=await reader(PAGE),links=challengeUrls(rendered);let rawIndex={ok:false,error:null,length:0,docs:[],schema:null,apiCandidates:[]};
try{const text=await reader(RAW_INDEX),decoded=decodeSvelteData(text);rawIndex={ok:true,error:null,length:decoded.raw.length,docs:decoded.docs.map(x=>({type:x?.type??null,id:x?.id??null,dataLength:Array.isArray(x?.data)?x.data.length:null,nodes:Array.isArray(x?.nodes)?x.nodes.length:null})),schema:shape(decoded.root),apiCandidates:apiCandidates(decoded.raw)}}catch(error){rawIndex.error=String(error)}
let detail={ok:false,url:null,error:null,length:0,profile:null,mediaBase:null,activities:[],schema:null,apiCandidates:[]};
if(links[0]){
  detail.url=`${links[0].url}/__data.json`;
  try{const text=await reader(detail.url),decoded=decodeSvelteData(text);detail={ok:true,url:detail.url,error:null,length:decoded.raw.length,profile:findProfileHeader(decoded),mediaBase:findMediaBase(decoded),activities:findDzoneActivities(decoded).map(x=>({period:x.period,stageCount:x.stageCount,activityId:x.node?.activity?.id??null,activityTid:x.node?.activity_tid??null,start:x.node?.activity?.start??null,end:x.node?.activity?.end??null})),schema:shape(decoded.root),apiCandidates:apiCandidates(decoded.raw)}}catch(error){detail.error=String(error)}
}
const payload={fetchedAt:new Date().toISOString(),source:{renderedLeaderboard:PAGE,structuredLeaderboard:RAW_INDEX,challengeDetailTemplate:`${ORIGIN}/u/{uid}/challenges/dzone/{season}/__data.json`,transport:'SvelteKit server-load __data.json (newline-delimited devalue stream)',relay:'Jina Reader is used only as an HTTP/browser relay because direct Eremora requests are Cloudflare-protected'},leaderboard:{renderedLength:rendered.length,challengeLinkCount:links.length,seasons:uniq(links.map(x=>x.season)).sort((a,b)=>b-a),sample:links.slice(0,5)},structuredLeaderboard:rawIndex,challengeDetail:detail,deeperPublicApi:{verified:false,candidates:uniq([...(rawIndex.apiCandidates||[]),...(detail.apiCandidates||[])]),note:'No separate documented/public backend API is treated as verified. The SvelteKit __data.json endpoints are Eremora’s own structured server-load source and are the stable source used by this project.'}};
await mkdir(OUT_DIR,{recursive:true});await writeFile(`${OUT_DIR}/discovery.json`,JSON.stringify(payload,null,2)+'\n');
console.log(`Eremora source discovery: rendered links=${links.length}, leaderboard __data=${rawIndex.ok?'ok':'unavailable'}, challenge __data=${detail.ok?'ok':'unavailable'}, periods=${detail.activities.map(x=>x.period).join(',')}`);

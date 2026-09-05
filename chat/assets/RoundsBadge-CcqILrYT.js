import{i as u,r as n,j as r,aa as i,s as l}from"./index-DJNRPp3o.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=u("Flame",[["path",{d:"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",key:"96xj49"}]]);async function d(e){return i({key:`stats:rounds:${e}`,ttlMs:5*60*1e3,persist:!0,fetcher:async()=>{const{count:t}=await l.from("round_participants").select("id",{count:"exact",head:!0}).eq("user_id",e);return t||0}})}const x=({userId:e,className:t=""})=>{const[s,c]=n.useState(null);return n.useEffect(()=>{let a=!0;return d(e).then(o=>{a&&c(o)}),()=>{a=!1}},[e]),s?r.jsxs("span",{title:`شارك في ${s} جولة دراسية`,className:`inline-flex items-center gap-0.5 text-[10px] text-orange-500 font-semibold ${t}`,children:[r.jsx(f,{className:"w-3 h-3 fill-orange-500"}),s]}):null};export{x as R};

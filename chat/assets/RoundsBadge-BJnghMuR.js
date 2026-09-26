import{i as c,r as n,j as r,w as l,s as i}from"./index-DZa86n66.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=c("Crown",[["path",{d:"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",key:"1vdc57"}],["path",{d:"M5 21h14",key:"11awu3"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=c("Flame",[["path",{d:"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",key:"96xj49"}]]);async function p(t){return l({key:`stats:rounds:${t}`,ttlMs:5*60*1e3,persist:!0,fetcher:async()=>{const{count:e}=await i.from("round_participants").select("id",{count:"exact",head:!0}).eq("user_id",t);return e||0}})}const h=({userId:t,className:e=""})=>{const[a,o]=n.useState(null);return n.useEffect(()=>{let s=!0;return p(t).then(u=>{s&&o(u)}),()=>{s=!1}},[t]),a?r.jsxs("span",{title:`شارك في ${a} جولة دراسية`,className:`inline-flex items-center gap-0.5 text-[10px] text-orange-500 font-semibold ${e}`,children:[r.jsx(d,{className:"w-3 h-3 fill-orange-500"}),a]}):null};export{x as C,h as R};

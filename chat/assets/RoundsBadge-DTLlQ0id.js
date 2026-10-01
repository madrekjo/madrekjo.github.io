import{i as s,r,j as c,w as u,s as l}from"./index-BBHxwyXE.js";import{F as x}from"./invalidation-B3WCILOJ.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=s("Crown",[["path",{d:"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",key:"1vdc57"}],["path",{d:"M5 21h14",key:"11awu3"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=s("Image",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2",key:"1m3agn"}],["circle",{cx:"9",cy:"9",r:"2",key:"af1f0g"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",key:"1xmnt7"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=s("Instagram",[["rect",{width:"20",height:"20",x:"2",y:"2",rx:"5",ry:"5",key:"2e1cvw"}],["path",{d:"M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z",key:"9exkf1"}],["line",{x1:"17.5",x2:"17.51",y1:"6.5",y2:"6.5",key:"r4j83e"}]]);async function m(e){return u({key:`stats:rounds:${e}`,ttlMs:5*60*1e3,persist:!0,fetcher:async()=>{const{count:t}=await l.from("round_participants").select("id",{count:"exact",head:!0}).eq("user_id",e);return t||0}})}const g=({userId:e,className:t=""})=>{const[a,o]=r.useState(null);return r.useEffect(()=>{let n=!0;return m(e).then(i=>{n&&o(i)}),()=>{n=!1}},[e]),a?c.jsxs("span",{title:`شارك في ${a} جولة دراسية`,className:`inline-flex items-center gap-0.5 text-[10px] text-orange-500 font-semibold ${t}`,children:[c.jsx(x,{className:"w-3 h-3 fill-orange-500"}),a]}):null};export{y as C,p as I,g as R,f as a};

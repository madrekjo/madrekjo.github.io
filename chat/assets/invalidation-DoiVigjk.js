import{c as a}from"./index-De1MB5aV.js";import{K as _,s as u,ac as f,w as m}from"./index-BgV4HBAY.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=a("Flame",[["path",{d:"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",key:"96xj49"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=a("Pen",[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]]),p=3e3,g=new Set(["posts","comments","likes","comment_likes","profiles","channel_settings","section_locks","user_roles","banned_words","study_rounds","round_participants","round_meetings","round_completions","study_records"]),h={profiles:["auth:profile:","config:rose_ids","config:shine_ids"],user_roles:["auth:roles:","config:admin_ids","config:owner_ids"],channel_settings:["config:channel_settings"],section_locks:["config:section_locks"],banned_words:["config:banned_words"],posts:[],comments:[],likes:[],comment_likes:[],study_rounds:["rounds:"]},A=()=>({READ_GATEWAY_URL:f,isReadGatewayConfigured:m});async function E(r){var o;const s=(r||"").trim().toLowerCase();if(!s)return;const c=h[s]||[];for(const n of c)_(n);const{READ_GATEWAY_URL:e,isReadGatewayConfigured:d}=A();if(!(!d()||!g.has(s)||!e))try{const t=(o=(await u.auth.getSession()).data.session)==null?void 0:o.access_token;if(!t)return;const i=new AbortController,l=setTimeout(()=>i.abort(),p);await fetch(`${e}/invalidate`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({table:s}),signal:i.signal}),clearTimeout(l)}catch{}}export{T as F,k as P,E as i};

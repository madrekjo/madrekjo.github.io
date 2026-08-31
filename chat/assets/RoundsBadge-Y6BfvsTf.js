import{g as l,r as i,j as r,s as u}from"./index-TZWV-xq0.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=l("Flame",[["path",{d:"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",key:"96xj49"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=l("ShieldCheck",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]),s=new Map,c=new Map;async function f(t){if(s.has(t))return s.get(t);if(c.has(t))return c.get(t);const n=(async()=>{const{count:e}=await u.from("round_participants").select("id",{count:"exact",head:!0}).eq("user_id",t),a=e||0;return s.set(t,a),c.delete(t),a})();return c.set(t,n),n}const d=({userId:t,className:n=""})=>{const[e,a]=i.useState(s.get(t)??null);return i.useEffect(()=>{let o=!0;return f(t).then(p=>{o&&a(p)}),()=>{o=!1}},[t]),e?r.jsxs("span",{title:`شارك في ${e} جولة دراسية`,className:`inline-flex items-center gap-0.5 text-[10px] text-orange-500 font-semibold ${n}`,children:[r.jsx(h,{className:"w-3 h-3 fill-orange-500"}),e]}):null};export{d as R,x as S};

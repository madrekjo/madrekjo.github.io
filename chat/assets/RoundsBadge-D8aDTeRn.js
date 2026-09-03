import{i as u,r,j as i,s as p}from"./index-CFa7PZjU.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=u("Flame",[["path",{d:"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",key:"96xj49"}]]),c=new Map,s=new Map;async function x(t){if(c.has(t))return c.get(t);if(s.has(t))return s.get(t);const n=(async()=>{const{count:e}=await p.from("round_participants").select("id",{count:"exact",head:!0}).eq("user_id",t),a=e||0;return c.set(t,a),s.delete(t),a})();return s.set(t,n),n}const h=({userId:t,className:n=""})=>{const[e,a]=r.useState(c.get(t)??null);return r.useEffect(()=>{let o=!0;return x(t).then(l=>{o&&a(l)}),()=>{o=!1}},[t]),e?i.jsxs("span",{title:`شارك في ${e} جولة دراسية`,className:`inline-flex items-center gap-0.5 text-[10px] text-orange-500 font-semibold ${n}`,children:[i.jsx(f,{className:"w-3 h-3 fill-orange-500"}),e]}):null};export{h as R};

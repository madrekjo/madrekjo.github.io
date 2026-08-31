import{d as c,u as g,r as l,j as e,L as j,s as i,b as o}from"./index-BLOzTtMP.js";import{C as v}from"./clock-DiMVsPQf.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=c("CircleCheck",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=c("CircleX",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=c("Hourglass",[["path",{d:"M5 22h14",key:"ehvnwv"}],["path",{d:"M5 2h14",key:"pdyrp9"}],["path",{d:"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22",key:"1d314k"}],["path",{d:"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2",key:"1vvvr6"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=c("Trash2",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}],["line",{x1:"10",x2:"10",y1:"11",y2:"17",key:"1uufr5"}],["line",{x1:"14",x2:"14",y1:"11",y2:"17",key:"xtxkd"}]]),m={approved:{label:"مقبولة",icon:k,cls:"bg-emerald-500/15 text-emerald-400"},pending:{label:"قيد المراجعة",icon:b,cls:"bg-amber-500/15 text-amber-400"},rejected:{label:"مرفوضة",icon:N,cls:"bg-red-500/15 text-red-400"}};function _(){const{user:a}=g(),[d,n]=l.useState([]),[x,u]=l.useState(!0),h=async()=>{if(!a)return;const{data:s,error:t}=await i.from("recitations").select("*").eq("user_id",a.id).order("created_at",{ascending:!1});!t&&s&&n(s),u(!1)};l.useEffect(()=>{h()},[a==null?void 0:a.id]);const p=async s=>{if(!window.confirm("هل تريد حذف هذه التلاوة نهائياً؟"))return;const{error:r}=await i.from("recitations").delete().eq("id",s.id);r?o.error("تعذّر الحذف",{description:r.message}):(n(f=>f.filter(y=>y.id!==s.id)),o.success("تم حذف التلاوة"))};return x?e.jsx("div",{className:"flex justify-center py-14",children:e.jsx(j,{className:"h-8 w-8 animate-spin text-gold"})}):e.jsxs("div",{className:"mx-auto max-w-2xl",children:[e.jsxs("div",{className:"mb-6 text-center",children:[e.jsx("h1",{className:"text-3xl font-extrabold text-gold-grad gold-glow",children:"تلاواتي"}),e.jsx("p",{className:"mt-2 text-sm text-muted-foreground",children:"كل ما أرسلته من تلاوات وحالة كل واحدة منها."})]}),d.length===0?e.jsxs("div",{className:"flex flex-col items-center gap-3 py-14 text-center text-muted-foreground",children:[e.jsx(v,{className:"h-10 w-10"}),e.jsx("p",{children:"لم تسجّل أي تلاوة بعد."})]}):e.jsx("div",{className:"space-y-3",children:d.map(s=>{const t=m[s.status]||m.pending,r=t.icon;return e.jsxs("div",{className:"rounded-2xl glass p-4",children:[e.jsxs("div",{className:"flex items-start justify-between gap-2",children:[e.jsxs("div",{children:[e.jsxs("h3",{className:"font-bold text-gold",children:[s.surah_name,s.ayah_range?` (${s.ayah_range})`:""]}),e.jsx("p",{className:"text-sm text-muted-foreground",children:s.reciter_display})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("span",{className:`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${t.cls}`,children:[e.jsx(r,{className:"h-3.5 w-3.5"}),t.label]}),e.jsx("button",{onClick:()=>p(s),className:"flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-red-500/15 hover:text-red-400",title:"حذف",children:e.jsx(w,{className:"h-4 w-4"})})]})]}),e.jsx("audio",{controls:!0,src:s.audio_url,preload:"metadata",className:"mt-3 w-full"})]},s.id)})})]})}export{_ as default};

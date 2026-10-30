import{c as m,r as s,g as T,e as C,h as H,j as c,P,i as U,Y as q,w as S}from"./index-De1MB5aV.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=m("CircleCheck",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Y=m("ImagePlus",[["path",{d:"M16 5h6",key:"1vod17"}],["path",{d:"M19 2v6",key:"4bpg5p"}],["path",{d:"M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5",key:"1ue2ih"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",key:"1xmnt7"}],["circle",{cx:"9",cy:"9",r:"2",key:"af1f0g"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=m("Search",[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["path",{d:"m21 21-4.3-4.3",key:"1qie3q"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G=m("UserMinus",[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}],["line",{x1:"22",x2:"16",y1:"11",y2:"11",key:"1shjgl"}]]);function L(e){const t=s.useRef({value:e,previous:e});return s.useMemo(()=>(t.current.value!==e&&(t.current.previous=t.current.value,t.current.value=e),t.current.previous),[e])}var k="Switch",[z,J]=T(k),[A,O]=z(k),R=s.forwardRef((e,t)=>{const{__scopeSwitch:r,name:o,checked:a,defaultChecked:b,required:u,disabled:n,value:d="on",onCheckedChange:y,form:i,...v}=e,[l,p]=s.useState(null),w=C(t,f=>p(f)),g=s.useRef(!1),x=l?i||!!l.closest("form"):!0,[h,_]=H({prop:a,defaultProp:b??!1,onChange:y,caller:k});return c.jsxs(A,{scope:r,checked:h,disabled:n,children:[c.jsx(P.button,{type:"button",role:"switch","aria-checked":h,"aria-required":u,"data-state":N(h),"data-disabled":n?"":void 0,disabled:n,value:d,...v,ref:w,onClick:U(e.onClick,f=>{_(B=>!B),x&&(g.current=f.isPropagationStopped(),g.current||f.stopPropagation())})}),x&&c.jsx(M,{control:l,bubbles:!g.current,name:o,value:d,checked:h,required:u,disabled:n,form:i,style:{transform:"translateX(-100%)"}})]})});R.displayName=k;var j="SwitchThumb",E=s.forwardRef((e,t)=>{const{__scopeSwitch:r,...o}=e,a=O(j,r);return c.jsx(P.span,{"data-state":N(a.checked),"data-disabled":a.disabled?"":void 0,...o,ref:t})});E.displayName=j;var V="SwitchBubbleInput",M=s.forwardRef(({__scopeSwitch:e,control:t,checked:r,bubbles:o=!0,...a},b)=>{const u=s.useRef(null),n=C(u,b),d=L(r),y=q(t);return s.useEffect(()=>{const i=u.current;if(!i)return;const v=window.HTMLInputElement.prototype,p=Object.getOwnPropertyDescriptor(v,"checked").set;if(d!==r&&p){const w=new Event("click",{bubbles:o});p.call(i,r),i.dispatchEvent(w)}},[d,r,o]),c.jsx("input",{type:"checkbox","aria-hidden":!0,defaultChecked:r,...a,tabIndex:-1,ref:n,style:{...a.style,...y,position:"absolute",pointerEvents:"none",opacity:0,margin:0}})});M.displayName=V;function N(e){return e?"checked":"unchecked"}var I=R,D=E;const F=s.forwardRef(({className:e,...t},r)=>c.jsx(I,{className:S("peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",e),...t,ref:r,children:c.jsx(D,{className:S("pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0")})}));F.displayName=I.displayName;export{X as C,Y as I,F as S,G as U,$ as a,L as u};

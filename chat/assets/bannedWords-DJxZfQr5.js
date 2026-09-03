import{i as r,s as t}from"./index-Mk11Ifz-.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=r("PinOff",[["path",{d:"M12 17v5",key:"bb1du9"}],["path",{d:"M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89",key:"znwnzq"}],["path",{d:"m2 2 20 20",key:"1ooewy"}],["path",{d:"M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",key:"c9qhm2"}]]);let o=[];async function i(){const{data:e}=await t.from("banned_words").select("word");return o=(e==null?void 0:e.map(a=>a.word.toLowerCase()))||[],o}function f(e,a){if(a)return!1;const n=e.toLowerCase();return o.some(s=>n.includes(s))}export{c as P,f as c,i as l};

// Kiểm tra DOM + HTTP với kho demo tạm; không thay dữ liệu MySQL.
import { JSDOM } from 'jsdom';
import { MemoryStore } from '../backend/local/database/memory-store.js';
import { seedDemo } from '../backend/local/database/seed-demo.js';
import { createApp } from '../backend/local/app.js';
import { navigation } from '../shared/role-navigation.js';
import { readFile, writeFile } from 'node:fs/promises';
const role=process.argv[2]||'MANAGER', blocked=process.argv.includes('--blocked');
const users={MANAGER:'minh.anh',STAFF:'thu.ha',LECTURER:'hoang.nam',STUDENT:'mai.lan'};
const store=new MemoryStore(); await seedDemo(store);
const server=createApp({store,config:{origin:'http://localhost:3000'},mode:'demo'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`, realFetch=globalThis.fetch;
let cookie='';const requests=[],errors=[];
globalThis.fetch=async(url,options={})=>{
 const response=await realFetch(new URL(url,base),{...options,headers:{...options.headers,Cookie:cookie,Origin:'http://localhost:3000'}});
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 if(!response.ok)requests.push({url:String(url),status:response.status});
 return response;
};
await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:users[role],password:'LizzDemo2026!'})});
let loginPassword='LizzDemo2026!';
const me=await (await fetch('/api/v1/auth/me')).json();
if(me.account.mustChangePassword){
 loginPassword='AuditLocal2026!';
 const changed=await fetch('/api/v1/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:'LizzDemo2026!',password:loginPassword,passwordConfirm:loginPassword})});
 if(!changed.ok)throw Error(await changed.text());
 await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:users[role],password:loginPassword})});
}
const dom=new JSDOM(await readFile(new URL('../frontend/app/index.html',import.meta.url),'utf8'),{url:base,pretendToBeVisual:true});
const w=dom.window;
for(const key of ['window','document','location','history','Event','CustomEvent','HTMLElement','HTMLDialogElement','FormData','File','Blob'])globalThis[key]=key==='window'?w:w[key];
globalThis.sessionStorage=blocked?{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}}:w.sessionStorage;
let mobile=false; globalThis.matchMedia=w.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
w.addEventListener('error',e=>errors.push(e.message));w.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
await import('../frontend/app/main.js');
const pause=()=>new Promise(r=>setTimeout(r,60));
const results=[];
for(const item of navigation.filter(x=>x.roles.includes(role))){
 w.location.hash=item.id;
 for(let i=0;i<80;i++){await pause();if(document.querySelector('main h1')&&!document.querySelector('main .loading'))break;}
 const content=document.querySelector('main');
 const forms=[];
 for(const button of content.querySelectorAll('button[id^="new-"]')){
  if(button.disabled||button.hidden||button.closest('[hidden]')||typeof button.onclick!=='function')continue;
  await button.onclick({currentTarget:button,target:button,preventDefault(){}});
  const editor=document.querySelector('#editor');
  if(editor.open){
   const ids=[...editor.querySelectorAll('[id]')].map(x=>x.id);
   const duplicate=ids.filter((id,i)=>ids.indexOf(id)!==i);
   forms.push({button:button.id,title:editor.querySelector('h2')?.textContent,duplicateIds:duplicate});
   if(duplicate.length)errors.push('Duplicate dialog IDs: '+button.id);
   editor.close();
  }
 }
 const ids=[...content.querySelectorAll('[id]')].map(x=>x.id);
 const duplicateIds=ids.filter((id,i)=>ids.indexOf(id)!==i);
 results.push({forms,duplicateIds,page:item.id,heading:content?.querySelector('h1')?.textContent,failed:!content?.querySelector('h1')||content.textContent.includes('Chưa tải được dữ liệu')});
}
document.querySelector('#collapse').click();
w.location.hash='home';await pause();await pause();
const groupChecks=[];
for(const button of document.querySelectorAll('.nav-group-toggle')){const links=document.getElementById(button.getAttribute('aria-controls'));button.click();groupChecks.push(links.hidden===(button.getAttribute('aria-expanded')!=='true'));button.click();}
const persisted=document.querySelector('.app-shell').classList.contains('collapsed');
mobile=true;w.dispatchEvent(new w.Event('resize'));document.querySelector('#mobile-menu').click();
const sidebar=document.querySelector('#sidebar'),last=[...sidebar.querySelectorAll('a[href], button:not(:disabled)')].filter(e=>!e.closest('[hidden]')).at(-1),first=sidebar.querySelector('a');
last.focus();last.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
const trapped=document.activeElement===first;
document.querySelector('#collapse').click();
const closed=!document.querySelector('.app-shell').classList.contains('mobile-open')&&document.activeElement.id==='mobile-menu';
const {openEditor}=await import('../frontend/app/components/ui.js');const dialog=openEditor('Kiểm tra','<input aria-label="Tên"/>');
const named=document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent==='Kiểm tra';
dialog.close();
await document.querySelector('#logout').onclick();
const loginVisible=!!document.querySelector('#login');
document.querySelector('#forgot-password').click();
const recoveryVisible=document.querySelector('#editor').open;document.querySelector('#editor').close();
document.querySelector('[data-audience=staff]').click();
const loginForm=document.querySelector('#login');loginForm.elements.identifier.value=users[role];loginForm.elements.password.value=loginPassword;
await loginForm.onsubmit({preventDefault(){}});
const signedIn=!!document.querySelector('#sidebar');
const {passwordSetupPage}=await import('../frontend/app/features/auth.js');
const setup=document.createElement('div');passwordSetupPage(setup,()=>{});
const passwordSetup=setup.querySelectorAll('input[type=password]').length===3;
const assets=[];
for(const url of ['/frontend/app/styles/glass.css','/assets/brand/logo.png','/assets/fonts/sans-regular.ttf']){const response=await fetch(url);assets.push({url,status:response.status});await response.arrayBuffer();}
const output={groupChecks,assets,passwordSetup,auth:{loginVisible,recoveryVisible,signedIn},role,blocked,results,requests,errors,menu:{persisted,trapped,closed},dialog:{named}};
await writeFile(new URL(`../docs/qa-interface-${role}${blocked?'-blocked':''}.json`,import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify(output));dom.window.close();server.closeAllConnections();await new Promise(r=>server.close(r));
if(groupChecks.some(x=>!x)||!passwordSetup||requests.length||assets.some(x=>x.status!==200)||!loginVisible||!recoveryVisible||!signedIn||results.some(x=>x.failed||x.duplicateIds.length)||errors.length||!trapped||!closed||!named||(!blocked&&!persisted))process.exitCode=1;

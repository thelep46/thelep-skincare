export const $=(s,r=document)=>r.querySelector(s); export const $$=(s,r=document)=>[...r.querySelectorAll(s)];
export function toast(message,type='success'){ const box=$('#toast'); if(!box) return alert(message); const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message; box.appendChild(el); setTimeout(()=>el.remove(),5200); }
export function setLoading(target,message='Memuat data...'){ target.innerHTML=`<div class="loading"><span class="spinner"></span>${message}</div>`; }
export function showError(target,message){ target.innerHTML=`<div class="error-state">${message}</div>`; }
export function qsFromForm(form){ const params=new URLSearchParams(new FormData(form)); [...params.entries()].forEach(([k,v])=>{ if(!v) params.delete(k); }); return params.toString()?`?${params}`:''; }
export const today=()=>new Date().toISOString().slice(0,10);

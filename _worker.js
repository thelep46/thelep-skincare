const SHEETS = {
  ENTITAS: ['idEntitas','namaEntitas','jenisEntitas','status','keterangan'],
  AKUN: ['idAkun','idEntitas','kodeAkun','namaAkun','tipeAkun','subtipe','saldoAwal','tanggalSaldoAwal','status','keterangan'],
  TRANSAKSI: ['idTransaksi','tanggal','noTransaksi','idEntitas','tipeTransaksi','idKategori','keterangan','nominal','idMetode','akunDebit','akunKredit','pihak','jatuhTempo','status','idTransaksiTerkait','entitasTujuan','akunTujuan','referensi','catatan','createdAt','updatedAt'],
  KATEGORI: ['idKategori','namaKategori','tipeTransaksi','status','keterangan'],
  METODE_PEMBAYARAN: ['idMetode','namaMetode','status','keterangan'],
  JURNAL: ['idJurnal','tanggal','idTransaksi','idEntitas','idAkun','posisi','debit','credit','keterangan','createdAt'],
  HUTANG: ['idHutang','idTransaksi','tanggal','idEntitas','pihak','nominal','terbayar','sisa','jatuhTempo','status','keterangan'],
  PIUTANG: ['idPiutang','idTransaksi','tanggal','idEntitas','pihak','nominal','terbayar','sisa','jatuhTempo','status','keterangan'],
  PENGATURAN: ['key','value','keterangan'],
  RINGKASAN_PERIODE: ['periode','idEntitas','totalDebit','totalCredit','perubahanBersih'],
  SALDO_AKUN: ['idAkun','idEntitas','saldoAwal','totalDebit','totalCredit','saldoAkhir','updatedAt'],
  KAS_BANK: ['idAkun','idEntitas','uangMasuk','uangKeluar','saldoAkhir','updatedAt']
};
const MASTER_CACHE_SECONDS = 120;
const TRANSACTION_TYPES = ['Pemasukan','Pengeluaran','Transfer Antar Akun','Transfer Antar Entitas','Hutang','Bayar Hutang','Piutang','Bayar Piutang','Modal','Prive'];
const STATUS_VALUES = ['Draft','Selesai','Batal'];

export default { async fetch(request, env) { return handleRequest(request, env); } };

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  try {
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    assertConfig(env);
    const route = url.pathname.replace(/\/+$/, '') || '/';
    const idMatch = route.match(/^\/api\/transaksi\/([^/]+)$/);
    if (route === '/api/health') return ok({ service: 'THELEP FINANCE', time: new Date().toISOString() }, 'API aktif');
    if (route === '/api/transaksi' && request.method === 'GET') return ok(await getTransactions(env, url.searchParams));
    if (route === '/api/transaksi' && request.method === 'POST') return ok(await createTransaction(env, await readJson(request)), 'Transaksi berhasil disimpan', 201);
    if (idMatch && request.method === 'PUT') return ok(await updateTransaction(env, idMatch[1], await readJson(request)), 'Transaksi berhasil diperbarui');
    if (idMatch && request.method === 'DELETE') return ok(await deleteTransaction(env, idMatch[1]), 'Transaksi berhasil dihapus');
    if (route === '/api/dashboard' && request.method === 'GET') return ok(await buildDashboard(env, url.searchParams));
    if (route === '/api/saldo-akun' && request.method === 'GET') return ok((await calculateLedger(env, url.searchParams)).saldoAkun);
    if (route === '/api/kas-bank' && request.method === 'GET') return ok((await calculateLedger(env, url.searchParams)).kasBank);
    if (route === '/api/hutang' && request.method === 'GET') return ok((await calculateLedger(env, url.searchParams)).hutang);
    if (route === '/api/piutang' && request.method === 'GET') return ok((await calculateLedger(env, url.searchParams)).piutang);
    if (route === '/api/jurnal' && request.method === 'GET') return ok((await calculateLedger(env, url.searchParams)).jurnal);
    const master = { '/api/akun':'AKUN','/api/entitas':'ENTITAS','/api/kategori':'KATEGORI','/api/metode-pembayaran':'METODE_PEMBAYARAN' }[route];
    if (master && request.method === 'GET') return ok(await readSheet(env, master, true));
    return fail('Endpoint tidak ditemukan', `Route ${request.method} ${route} tidak tersedia`, 404);
  } catch (error) {
    return fail('Terjadi kesalahan backend', error.message || String(error), error.status || 500);
  }
}
function assertConfig(env){ ['GOOGLE_SHEET_ID','GOOGLE_CLIENT_EMAIL','GOOGLE_PRIVATE_KEY'].forEach(k=>{ if(!env[k]) throw statusError(`Environment variable ${k} belum diatur`,500); }); }
async function readJson(request){ try { return await request.json(); } catch { throw statusError('Body JSON tidak valid',400); } }
function cors(response){ const h=new Headers(response.headers); h.set('Access-Control-Allow-Origin','*'); h.set('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS'); h.set('Access-Control-Allow-Headers','Content-Type,Authorization'); return new Response(response.body,{status:response.status,headers:h}); }
function json(payload,status=200){ return cors(new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}})); }
function ok(data,message='OK',status=200){ return json({ok:true,message,data},status); }
function fail(message,error,status=500){ return json({ok:false,message,error},status); }
function statusError(message,status){ const e=new Error(message); e.status=status; return e; }
function normalizeAmount(value){ if(typeof value==='number') return Number.isFinite(value)?value:0; if(value==null) return 0; let s=String(value).trim(); if(!s) return 0; s=s.replace(/[^0-9,.-]/g,''); if(s.includes(',') && s.lastIndexOf(',')>s.lastIndexOf('.')) s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(/\./g,'').replace(',','.'); const n=Number(s); return Number.isFinite(n)?Math.round(n):0; }
function toNumberFields(row){ ['nominal','saldoAwal','debit','credit','terbayar','sisa','totalDebit','totalCredit','saldoAkhir','uangMasuk','uangKeluar'].forEach(k=>{ if(k in row) row[k]=normalizeAmount(row[k]); }); return row; }
async function token(env){ const now=Math.floor(Date.now()/1000); const header={alg:'RS256',typ:'JWT'}; const claim={iss:env.GOOGLE_CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now}; const enc=o=>btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); const input=`${enc(header)}.${enc(claim)}`; const keyText=env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n'); const pem=keyText.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,''); const bin=Uint8Array.from(atob(pem),c=>c.charCodeAt(0)); const key=await crypto.subtle.importKey('pkcs8',bin,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']); const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(input)); const jwt=`${input}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}`; const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})}); const data=await res.json(); if(!res.ok) throw statusError(`Google auth gagal: ${data.error_description||data.error}`,502); return data.access_token; }
async function sheets(env,path,options={}){ const t=await token(env); const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}${path}`,{...options,headers:{authorization:`Bearer ${t}`,'content-type':'application/json',...(options.headers||{})}}); const data=await res.json().catch(()=>({})); if(!res.ok) throw statusError(`Google Sheets gagal: ${data.error?.message||res.statusText}`,502); return data; }
async function readSheet(env,name,cache=false){ const range=`/${encodeURIComponent(name)}!A:Z`; const data=await sheets(env,`/values${range}?majorDimension=ROWS`, cache?{cf:{cacheTtl:MASTER_CACHE_SECONDS}}:{}); const rows=data.values||[]; const header=rows[0]&&rows[0].length?rows[0]:SHEETS[name]; return rows.slice(1).filter(r=>r.some(Boolean)).map(r=>toNumberFields(Object.fromEntries(header.map((h,i)=>[h,r[i]??''])))); }
async function writeSheet(env,name,rows){ const values=[SHEETS[name],...rows.map(row=>SHEETS[name].map(h=>row[h]??''))]; await sheets(env,`/values/${encodeURIComponent(name)}!A:Z?valueInputOption=RAW`,{method:'PUT',body:JSON.stringify({range:`${name}!A:Z`,majorDimension:'ROWS',values})}); return rows; }
async function appendRows(env,name,rows){ await sheets(env,`/values/${encodeURIComponent(name)}!A:Z:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:JSON.stringify({values:rows.map(row=>SHEETS[name].map(h=>row[h]??''))})}); }
function filterTransactions(rows, q){ const search=(q.get('q')||'').toLowerCase(); return rows.filter(r=>(!search||JSON.stringify(r).toLowerCase().includes(search))&&(!q.get('dari')||r.tanggal>=q.get('dari'))&&(!q.get('sampai')||r.tanggal<=q.get('sampai'))&&(!q.get('idEntitas')||r.idEntitas===q.get('idEntitas'))&&(!q.get('tipeTransaksi')||r.tipeTransaksi===q.get('tipeTransaksi'))&&(!q.get('idKategori')||r.idKategori===q.get('idKategori'))); }
async function getTransactions(env, params=new URLSearchParams()){ return filterTransactions(await readSheet(env,'TRANSAKSI'), params).sort((a,b)=>`${b.tanggal}${b.createdAt}`.localeCompare(`${a.tanggal}${a.createdAt}`)); }
function computeAccounts(payload){ const amount=normalizeAmount(payload.nominal); const tipe=payload.tipeTransaksi; let akunDebit=payload.akunDebit||''; let akunKredit=payload.akunKredit||''; if(['Pemasukan','Piutang','Modal','Bayar Hutang'].includes(tipe)){ akunDebit=payload.akunDebit||payload.idAkun||payload.akunTujuan; akunKredit=payload.akunKredit||''; }
  if(['Pengeluaran','Hutang','Prive','Bayar Piutang'].includes(tipe)){ akunKredit=payload.akunKredit||payload.idAkun||payload.akunSumber; akunDebit=payload.akunDebit||''; }
  if(tipe.startsWith('Transfer')){ akunKredit=payload.akunKredit||payload.akunSumber; akunDebit=payload.akunDebit||payload.akunTujuan; }
  return { amount, akunDebit: akunDebit||'', akunKredit: akunKredit||'' };
}
function validateTransaction(p, update=false){ if(!p.tanggal) throw statusError('Tanggal wajib diisi',400); if(!p.idEntitas) throw statusError('Entitas wajib dipilih',400); if(!TRANSACTION_TYPES.includes(p.tipeTransaksi)) throw statusError('Tipe transaksi tidak valid',400); const {amount,akunDebit,akunKredit}=computeAccounts(p); if(amount<=0) throw statusError('Nominal harus lebih dari 0',400); if(!akunDebit&&!akunKredit) throw statusError('Akun wajib dipilih',400); if(p.status && !STATUS_VALUES.includes(p.status)) throw statusError('Status tidak valid',400); return {amount,akunDebit,akunKredit}; }
async function nextId(env){ const rows=await readSheet(env,'TRANSAKSI'); const today=new Date().toISOString().slice(0,10).replace(/-/g,''); const max=rows.reduce((m,r)=>Math.max(m,normalizeAmount((r.idTransaksi||'').split('-').pop())),0)+1; return `TRX-${today}-${String(max).padStart(4,'0')}`; }
async function createTransaction(env,p){ const c=validateTransaction(p); const id=await nextId(env); const now=new Date().toISOString(); const row={...p,idTransaksi:id,noTransaksi:id,nominal:c.amount,akunDebit:c.akunDebit,akunKredit:c.akunKredit,status:p.status||'Selesai',createdAt:now,updatedAt:now}; await appendRows(env,'TRANSAKSI',[row]); return row; }
async function updateTransaction(env,id,p){ const rows=await readSheet(env,'TRANSAKSI'); const i=rows.findIndex(r=>r.idTransaksi===id); if(i<0) throw statusError('Transaksi tidak ditemukan',404); const merged={...rows[i],...p,idTransaksi:id,noTransaksi:rows[i].noTransaksi}; const c=validateTransaction(merged,true); rows[i]={...merged,nominal:c.amount,akunDebit:c.akunDebit,akunKredit:c.akunKredit,updatedAt:new Date().toISOString()}; await writeSheet(env,'TRANSAKSI',rows); return rows[i]; }
async function deleteTransaction(env,id){ const rows=await readSheet(env,'TRANSAKSI'); const next=rows.filter(r=>r.idTransaksi!==id); if(next.length===rows.length) throw statusError('Transaksi tidak ditemukan',404); await writeSheet(env,'TRANSAKSI',next); return {idTransaksi:id,deleted:true}; }
function entry(tx, akun, posisi){ const val=normalizeAmount(tx.nominal); return {idJurnal:`JRN-${tx.idTransaksi}-${posisi}`,tanggal:tx.tanggal,idTransaksi:tx.idTransaksi,idEntitas:tx.idEntitas,idAkun:akun,posisi,debit:posisi==='DEBIT'?val:0,credit:posisi==='CREDIT'?val:0,keterangan:tx.keterangan,createdAt:tx.createdAt}; }
async function calculateLedger(env, params=new URLSearchParams()){ const [akun, txs]=await Promise.all([readSheet(env,'AKUN',true),getTransactions(env,params)]); const jurnal=[]; txs.forEach(t=>{ if(t.akunDebit) jurnal.push(entry(t,t.akunDebit,'DEBIT')); if(t.akunKredit) jurnal.push(entry(t,t.akunKredit,'CREDIT')); }); const saldoAkun=akun.map(a=>{ const lines=jurnal.filter(j=>j.idAkun===a.idAkun); const totalDebit=lines.reduce((s,j)=>s+j.debit,0); const totalCredit=lines.reduce((s,j)=>s+j.credit,0); return {...a,totalDebit,totalCredit,saldoAkhir:normalizeAmount(a.saldoAwal)+totalDebit-totalCredit,updatedAt:new Date().toISOString()}; }); const cashTypes=['Kas','Bank','E-Wallet','Payment Gateway']; const kasBank=saldoAkun.filter(a=>a.tipeAkun==='Aset'&&cashTypes.includes(a.subtipe)).map(a=>({...a,uangMasuk:a.totalDebit,uangKeluar:a.totalCredit})); const hutang=txs.filter(t=>['Hutang','Bayar Hutang'].includes(t.tipeTransaksi)); const piutang=txs.filter(t=>['Piutang','Bayar Piutang'].includes(t.tipeTransaksi)); return {jurnal,saldoAkun,kasBank,hutang,piutang,transaksi:txs}; }
async function buildDashboard(env, params){ const l=await calculateLedger(env,params); const totalDebit=l.jurnal.reduce((s,j)=>s+j.debit,0), totalCredit=l.jurnal.reduce((s,j)=>s+j.credit,0); return {totalTransaksi:l.transaksi.length,totalDebit,totalCredit,perubahanBersih:totalDebit-totalCredit,kasBank:{saldo:l.kasBank.reduce((s,a)=>s+a.saldoAkhir,0),uangMasuk:l.kasBank.reduce((s,a)=>s+a.uangMasuk,0),uangKeluar:l.kasBank.reduce((s,a)=>s+a.uangKeluar,0)},saldoAkun:l.saldoAkun,hutang:l.hutang,piutang:l.piutang,transaksiTerbaru:l.transaksi.slice(0,10)}; }

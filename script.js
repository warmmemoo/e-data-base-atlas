/* ATLAS-Data Base - GitHub Pages frontend
   API URL and key are intentionally not hard-coded. Configure them in the Settings dialog. */
const LINES = [
  "FRONT SEAT IMV 578W",
  "REAR SEAT IMV 578W",
  "TOYOTA 867B WELDING F/S",
  "TOYOTA 500D P8",
  "TOYOTA 500D COVERING",
  "ISUZU RT50",
  "Back up tool",
  "Back up controller",
  "Accessories",
  "Damage"
];
const BACKUP_LINES = ["Back up tool", "Back up controller", "Accessories"];
const $ = (s) => document.querySelector(s);
const state = { tools: [], history: [], view: "dashboard", selectedLine: "", apiUrl: "", apiKey: "", busy: false, adminSessionId: "", isAdmin: false };

function saveApiSettings() {
  try {
    localStorage.setItem("atlas_api_url", state.apiUrl);
    localStorage.setItem("atlas_api_key", state.apiKey);
  } catch (e) {
    console.warn("ไม่สามารถบันทึกการตั้งค่าในเบราว์เซอร์ได้", e);
  }
}

function loadApiSettings() {
  try {
    state.apiUrl = localStorage.getItem("atlas_api_url") || "";
    state.apiKey = localStorage.getItem("atlas_api_key") || "";
  } catch (e) {
    state.apiUrl = "";
    state.apiKey = "";
    console.warn("ไม่สามารถอ่านการตั้งค่าจากเบราว์เซอร์ได้", e);
  }
}
const aliasMap = {
  toolModel: ["tools model","tool model","model","tool_model","model tool"],
  serial: ["tools ms serial no.","tools ms serial number","serial no","serial number","serial","tool serial","tool ms serial no","serial no."],
  line: ["line","location","line/location","tool location","area","section"],
  process: ["process","process name"],
  tightenings: ["total no. of tightenings","total no of tightenings","total tightenings","tightening count","no. of tightenings","total tightening"],
  ipAddress: ["ip address","ip","ip address of tool"],
  controller: ["controller","controller model"],
  currentCalibration: ["currentcalibration","current date calibration","current calibration date","calibration date","last calibration","current calibration"],
  nextCalibration: ["nextcalibration","due date calibration","next calibration date","next calibration","calibration due date"],
  notes: ["notes","remark","remarks","note"],
  updatedAt: ["updated at","last updated"]
};
function normalizeHeader(v){ return String(v ?? "").trim().toLowerCase().replace(/[_\-]+/g," ").replace(/\s+/g," "); }
function normalizeLineName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase();
}
function findVal(obj, keys){ const wanted = keys.map(normalizeHeader); for(const k of Object.keys(obj||{})){if(wanted.includes(normalizeHeader(k))) return obj[k];} return ""; }
function normalizeTool(raw){
  const out = {...raw};
  for(const [field, aliases] of Object.entries(aliasMap)) out[field] = findVal(raw, [field,...aliases]);
  out.serial = String(out.serial||"").trim();
  out.line = String(out.line||"Unassigned").trim();
  out.toolModel = String(out.toolModel||"").trim();
  out.process = String(out.process||"").trim();
  out.controller = String(out.controller||"").trim();
  out.ipAddress = String(out.ipAddress||"").trim();
  out.nextCalibration = String(out.nextCalibration||"").trim();
  out.currentCalibration = String(out.currentCalibration||"").trim();
  return out;
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function dateValue(v){
  if(v === null || v === undefined || v === "") return null;
  if(v instanceof Date && !isNaN(v)) return new Date(v.getTime());
  const s = String(v).trim();
  if(!s) return null;

  // Full dates such as 30/9/2026 or 30/09/2026.
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m){
    let day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
    if(year > 2400) year -= 543;
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
  }

  // ISO dates such as 2026-09-30.
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if(m){
    let year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    if(year > 2400) year -= 543;
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
  }

  // Thai month labels such as ก.ย.-26.
  const thaiMonthMap = {"ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12};
  const compact = s.replace(/\s+/g, "");
  const thaiMatch = compact.match(/^(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)(?:-|\/)?(\d{2,4})$/);
  if(thaiMatch){
    let year = Number(thaiMatch[2]);
    if(year < 100) year += 2000;
    if(year > 2400) year -= 543;
    return new Date(year, thaiMonthMap[thaiMatch[1]] - 1, 1);
  }

  const parsed = new Date(s);
  return isNaN(parsed) ? null : parsed;
}
function fmtDate(v){const d=dateValue(v);return d?d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";}
function calStatus(tool){
  const d=dateValue(tool.nextCalibration); if(!d)return {key:"unknown",label:"ไม่ระบุวันที่"};
  const now=new Date(); now.setHours(0,0,0,0); d.setHours(0,0,0,0);
  const days=Math.ceil((d-now)/86400000);
  if(days<0)return {key:"overdue",label:"Overdue"};
  if(days<=30)return {key:"soon",label:"Due Soon"};
  return {key:"ok",label:"OK"};
}
function showNotice(msg,type=""){const n=$("#notice");n.textContent=msg;n.className="notice"+(type?" "+type:"");n.classList.remove("hidden");}
function hideNotice(){$("#notice").classList.add("hidden");}
function hasApi(){return Boolean(state.apiUrl && state.apiKey);}
function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb="atlasCallback_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script"); const timer=setTimeout(()=>finish(new Error("หมดเวลารอ API")),18000);
    function finish(err,data){clearTimeout(timer);delete window[cb];script.remove();err?reject(err):resolve(data);}
    window[cb]=(data)=>finish(null,data); script.onerror=()=>finish(new Error("เรียก API ไม่สำเร็จ ตรวจ URL/Deployment")); 
    script.src=url+(url.includes("?")?"&":"?")+"callback="+cb+"&_="+Date.now();
    document.head.appendChild(script);
  });
}
async function apiRead(action,extra={}){
  if(!hasApi())throw new Error("ยังไม่ได้ตั้งค่า API กรุณาเปิดตั้งค่าการเชื่อมต่อ");
  const url=new URL(state.apiUrl);url.searchParams.set("action",action);url.searchParams.set("key",state.apiKey);
  Object.entries(extra).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  const data=await jsonp(url.toString());if(!data||data.ok!==true)throw new Error(data?.error||"API returned an error");return data;
}
async function apiWrite(payload){
  if(!hasApi())throw new Error("ยังไม่ได้ตั้งค่า API กรุณาเปิดตั้งค่าการเชื่อมต่อ");
  // GAS cross-origin POST: use text/plain to avoid preflight. no-cors response is opaque;
  // refresh the authoritative sheet after the request before reporting the result.
  await fetch(state.apiUrl,{method:"POST",mode:"no-cors",redirect:"follow",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,key:state.apiKey})});
  await new Promise(r=>setTimeout(r,1100));
  const refreshed=await apiRead("list");
  state.tools=(refreshed.tools||[]).map(normalizeTool);
  try{const h=await apiRead("history");state.history=h.history||[];}catch(_){}
  renderAll();
  return true;
}
function makeSessionId(){
  if(window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "atlas-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
}
async function postRaw(payload){
  if(!hasApi()) throw new Error("ยังไม่ได้ตั้งค่า API");
  await fetch(state.apiUrl,{method:"POST",mode:"no-cors",redirect:"follow",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,key:state.apiKey})});
  await new Promise(r=>setTimeout(r,350));
}
async function adminLogin(password){
  const sessionId=makeSessionId();
  await postRaw({action:"adminLogin",adminPassword:password,sessionId});
  const check=await apiRead("adminStatus",{sessionId});
  if(!check.admin) throw new Error("รหัสผ่าน Admin ไม่ถูกต้อง หรือ Apps Script ยังไม่ได้อัปเดต");
  state.adminSessionId=sessionId;state.isAdmin=true;
  $("#adminBtn").textContent="Admin · Logout";
  renderTools();
}
function adminLogout(){state.adminSessionId="";state.isAdmin=false;$("#adminBtn").textContent="Admin Login";renderTools();showNotice("ออกจากระบบ Admin แล้ว","success");}
function dateInputValue(v){const d=dateValue(v);if(!d)return "";return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function openEditDialog(serial){
  if(!state.isAdmin){showNotice("กรุณาเข้าสู่ระบบ Admin ก่อนแก้ไขข้อมูล","error");return;}
  const t=state.tools.find(x=>x.serial===serial);if(!t)return;
  const f=$("#editToolForm");f.reset();
  for(const key of ["line","rowNo","toolModel","serial","status","process","tightenings","ipAddress","controller"]){if(f.elements[key])f.elements[key].value=t[key]??"";}
  f.elements.originalSerial.value=t.serial;
  f.elements.currentCalibration.value=dateInputValue(t.currentCalibration);
  f.elements.nextCalibration.value=dateInputValue(t.nextCalibration);
  $("#editToolDialog").showModal();
}
async function submitEdit(e){
  e.preventDefault();if(!state.isAdmin){showNotice("Session Admin หมดอายุ กรุณาเข้าสู่ระบบใหม่","error");adminLogout();return;}
  if(state.busy)return;
  const fd=new FormData(e.currentTarget),data=Object.fromEntries(fd.entries());
  data.action="updateTool";data.adminSessionId=state.adminSessionId;
  data.tightenings=data.tightenings===""?"":Number(data.tightenings);
  if(!data.serial.trim()||!data.toolModel.trim()){showNotice("กรุณากรอก Model และ Serial No.","error");return;}
  if(!confirm(`ยืนยันบันทึกการแก้ไข Tool ${data.originalSerial} ลง Google Sheets?`))return;
  await runMutation("กำลังบันทึกข้อมูล Tool ลง Google Sheets...",async()=>{
    await apiWrite(data);$("#editToolDialog").close();showNotice("บันทึกข้อมูลลง Google Sheets แล้ว","success");
  });
}

function populateLines(){
  const productionLines = LINES.filter(x => !BACKUP_LINES.includes(x) && x !== "Damage");
  $("#lineNav").innerHTML = productionLines.map(x =>
    `<button class="nav-item line-item" data-line="${esc(x)}"><span>◦</span>${esc(x)}</button>`
  ).join("");

  $("#backupNav").innerHTML = BACKUP_LINES.map(x =>
    `<button class="nav-item line-item" data-line="${esc(x)}"><span>◦</span>${esc(x)}</button>`
  ).join("") + `<button class="nav-item line-item damage-nav-item" data-line="Damage"><span>◦</span>Damage</button>`;

  $("#lineFilter").innerHTML = '<option value="">ทุก Line</option>' + LINES.map(x =>
    `<option value="${esc(x)}">${esc(x)}</option>`
  ).join("");
  $("#addLineSelect").innerHTML = LINES.map(x =>
    `<option value="${esc(x)}">${esc(x)}</option>`
  ).join("");
  $("#editLineSelect").innerHTML = LINES.map(x =>
    `<option value="${esc(x)}">${esc(x)}</option>`
  ).join("");
  $("#destinationSelect").innerHTML = LINES.map(x =>
    `<option value="${esc(x)}">${esc(x)}</option>`
  ).join("");
}
function setView(view,line=""){
  state.view=view;state.selectedLine=line;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.remove("active"));
  if(view==="dashboard")document.querySelector('[data-view="dashboard"]')?.classList.add("active");
  if(view==="backup")document.querySelector('[data-view="backup"]')?.classList.add("active");
  if(view==="history")document.querySelector('[data-view="history"]')?.classList.add("active");
  if(line)document.querySelector(`[data-line="${CSS.escape(line)}"]`)?.classList.add("active");
  $("#dashboardView").classList.toggle("hidden",view==="history");
  $("#historyView").classList.toggle("hidden",view!=="history");
  $("#pageTitle").textContent=view==="dashboard"?"Dashboard":view==="backup"?"Back up":view==="history"?"Movement History":line;
  $("#tableHeading").textContent=view==="backup"?"Back up Inventory":line?line+" — Tools":"Tool List";
  $("#sidebar").classList.remove("open");renderTools();
}
function currentTools(){
  let arr=[...state.tools];
  const search=$("#searchInput").value.trim().toLowerCase(),line=$("#lineFilter").value,status=$("#statusFilter").value,sort=$("#sortSelect").value;
  if(state.view==="backup")arr=arr.filter(t=>BACKUP_LINES.includes(String(t.line||"").trim()));
  else if(state.selectedLine)arr=arr.filter(t=>normalizeLineName(t.line)===normalizeLineName(state.selectedLine));
  if(line)arr=arr.filter(t=>normalizeLineName(t.line)===normalizeLineName(line));
  if(search)arr=arr.filter(t=>[t.toolModel,t.serial,t.process,t.ipAddress,t.controller,t.line].some(v=>String(v||"").toLowerCase().includes(search)));
  if(status)arr=arr.filter(t=>calStatus(t).key===status);
  arr.sort((a,b)=>sort==="serial"?a.serial.localeCompare(b.serial):sort==="calibration"?((dateValue(a.nextCalibration)||new Date(8640000000000000))-(dateValue(b.nextCalibration)||new Date(8640000000000000))):a.line.localeCompare(b.line)||a.serial.localeCompare(b.serial));
  return arr;
}
function renderTools(){
  const arr=currentTools();$("#resultCount").textContent=`${arr.length} รายการ`;
  if(!arr.length){$("#toolTableBody").innerHTML=`<tr><td colspan="9" class="empty">${state.tools.length?"ไม่พบ Tool ตามเงื่อนไข":"ยังไม่มีข้อมูล Tool หรือยังไม่ได้เชื่อมต่อ API"}</td></tr>`;return;}
  $("#toolTableBody").innerHTML=arr.map(t=>{
    const st=calStatus(t);
    const isDamage=normalizeLineName(t.line)==="damage";
    const statusBadge=isDamage?'<span class="cal-badge damage">Damage</span>':`<span class="cal-badge ${st.key}">${esc(st.label)}</span>`;
    const editButton=state.isAdmin?`<button class="mini-btn" data-action="edit" data-serial="${esc(t.serial)}">Edit</button>`:"";
    const damageButton=isDamage?"":`<button class="mini-btn danger-action" data-action="damage" data-serial="${esc(t.serial)}">Damage</button>`;
    return `<tr>
      <td><div class="tool-name">${esc(t.toolModel||"ไม่ระบุ Model")}</div><div class="tool-serial">${esc(t.serial||"ไม่มี Serial")}</div></td>
      <td><span class="line-pill" title="${esc(t.line)}">${esc(t.line)}</span></td>
      <td>${esc(t.process||"—")}</td><td>${esc(t.controller||"—")}</td><td>${esc(t.ipAddress||"—")}</td>
      <td>${esc(fmtDate(t.currentCalibration))}</td><td>${esc(fmtDate(t.nextCalibration))}</td><td>${statusBadge}</td>
      <td><div class="row-actions">${editButton}${damageButton}<button class="mini-btn" data-action="move" data-serial="${esc(t.serial)}">Move</button></div></td>
    </tr>`;
  }).join("");
}
function renderStats(){
  const statuses=state.tools.map(calStatus);$("#totalTools").textContent=state.tools.length;
  $("#calOk").textContent=statuses.filter(s=>s.key==="ok").length;
  $("#dueSoon").textContent=statuses.filter(s=>s.key==="soon").length;
  $("#overdue").textContent=statuses.filter(s=>s.key==="overdue").length;
  $("#backupCount").textContent=state.tools.filter(t=>BACKUP_LINES.includes(String(t.line||"").trim())).length;
  const old=$("#lineFilter").value;
  $("#lineFilter").innerHTML='<option value="">ทุก Line</option>'+LINES.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  $("#lineFilter").value=old;
}
function renderHistory(){
  const rows=[...state.history].reverse();
  if(!rows.length){$("#historyBody").innerHTML='<tr><td colspan="7" class="empty">ยังไม่มีประวัติการเปลี่ยนแปลง</td></tr>';return;}
  $("#historyBody").innerHTML=rows.map(h=>`<tr><td>${esc(h.timestamp||"—")}</td><td>${esc(h.action||"—")}</td><td>${esc(h.serial||"—")}</td><td>${esc(h.fromLine||"—")}</td><td>${esc(h.toLine||"—")}</td><td>${esc(h.details||"—")}</td><td>${esc(h.actor||"—")}</td></tr>`).join("");
}
function renderAll(){renderStats();renderTools();renderHistory();$("#lastUpdated").textContent="อัปเดตล่าสุด "+new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"});}
async function refreshAll(){
  hideNotice();
  if(!hasApi()){showNotice("กรุณาตั้งค่า Apps Script Web App URL และ API key ก่อนใช้งาน โดยกดปุ่มตั้งค่าที่แถบเมนู (คลิกชื่อ ATLAS-Data Base หรือกด Alt+S)","");$("#connectionLabel").textContent="ยังไม่ได้ตั้งค่า API";$("#toolTableBody").innerHTML='<tr><td colspan="9" class="empty">ยังไม่ได้เชื่อมต่อ Google Sheets API</td></tr>';return;}
  try{
    $("#connectionLabel").textContent="กำลังเชื่อมต่อ...";
    const [list,hist]=await Promise.all([apiRead("list"),apiRead("history")]);
    state.tools=(list.tools||[]).map(normalizeTool);state.history=hist.history||[];
    $("#connectionLabel").textContent="เชื่อมต่อ API แล้ว";$(".status-dot")?.classList.add("online");
    renderAll();showNotice("โหลดข้อมูลจาก Google Sheets สำเร็จ","success");
    setTimeout(()=>{if($("#notice").textContent==="โหลดข้อมูลจาก Google Sheets สำเร็จ")hideNotice();},3500);
  }catch(e){$("#connectionLabel").textContent="เชื่อมต่อไม่สำเร็จ";$(".status-dot")?.classList.remove("online");showNotice("เชื่อมต่อไม่สำเร็จ: "+e.message+" — ตรวจสอบ URL, API key และการ Deploy Apps Script","error");}
}
function openToolDialog(){$("#toolForm").reset();$("#toolDialog").showModal();}
function openActionDialog(type,serial){
  const t=state.tools.find(x=>x.serial===serial);if(!t)return;
  const f=$("#actionForm");f.reset();f.elements.actionType.value=type;f.elements.serial.value=serial;
  const isDamage=type==="damage";
  $("#actionTitle").textContent=isDamage?"Damage Tool & Replace":"Move Tool (Swap with another Tool)";
  $("#actionDescription").textContent=isDamage
    ? `เลือก Back up tool เพื่อแทนที่ ${t.toolModel} (${t.serial}) ที่อยู่ Line ${t.line}`
    : `เลือก Tool อื่นเพื่อสลับตำแหน่งกับ ${t.toolModel} (${t.serial}) ซึ่งอยู่ที่ ${t.line}`;
  $("#destinationLabel").classList.add("hidden");
  $("#swapLabel").classList.toggle("hidden",isDamage);
  $("#backupReplaceLabel").classList.toggle("hidden",!isDamage);
  $("#confirmActionBtn").textContent=isDamage?"ยืนยัน Damage และเปลี่ยน Tool":"ยืนยันสลับตำแหน่ง";
  const candidates=state.tools.filter(x=>x.serial!==serial && normalizeLineName(x.line)!==normalizeLineName(t.line) && normalizeLineName(x.line)!=="damage");
  $("#swapSerialSelect").innerHTML=candidates.map(x=>`<option value="${esc(x.serial)}">${esc(x.serial)} — ${esc(x.toolModel)} (${esc(x.line)})</option>`).join("");
  const backups=state.tools.filter(x=>normalizeLineName(x.line)==="back up tool" && x.serial!==serial);
  $("#backupSerialSelect").innerHTML=backups.map(x=>`<option value="${esc(x.serial)}">${esc(x.serial)} — ${esc(x.toolModel)}</option>`).join("");
  const selected=state.tools.find(x=>x.serial===serial);
  if(isDamage && normalizeLineName(selected.line)==="damage") {
    showNotice("Tool นี้อยู่ใน Damage อยู่แล้ว","error");return;
  }
  if(isDamage && backups.length===0) {
    showNotice("ไม่มี Tool ในหมวด Back up tool สำหรับเปลี่ยนแทน","error");return;
  }
  if(!isDamage && candidates.length===0) {
    showNotice("ไม่มี Tool อื่นใน Line ที่แตกต่างกันให้สลับ","error");return;
  }
  $("#actionDialog").showModal();
}
async function submitAdd(e){
  e.preventDefault();if(state.busy)return;const fd=new FormData(e.currentTarget);const data=Object.fromEntries(fd.entries());
  data.action="addTool";data.serial=data.serial.trim();data.tightenings=data.tightenings?Number(data.tightenings):"";
  if(!data.serial){showNotice("กรุณาระบุ Serial No.","error");return;}
  if(state.tools.some(t=>t.serial.toLowerCase()===data.serial.toLowerCase())){showNotice("Serial No. นี้มีอยู่แล้ว กรุณาตรวจสอบข้อมูล","error");return;}
  await runMutation("กำลังเพิ่ม Tool...",async()=>{await apiWrite(data);$("#toolDialog").close();showNotice("ส่งคำสั่งเพิ่ม Tool แล้ว ระบบโหลดข้อมูลล่าสุดจาก Google Sheets แล้ว","success");});
}
async function submitAction(e){
  e.preventDefault();if(state.busy)return;
  const fd=new FormData(e.currentTarget),data=Object.fromEntries(fd.entries());
  const isDamage=data.actionType==="damage";
  if(isDamage){
    if(!data.backupSerial){showNotice("กรุณาเลือก Back up tool ที่จะนำมาแทน","error");return;}
    const damaged=state.tools.find(t=>t.serial===data.serial);
    const backup=state.tools.find(t=>t.serial===data.backupSerial);
    if(!damaged||!backup){showNotice("ไม่พบ Tool ที่เลือก กรุณากด Refresh","error");return;}
    if(normalizeLineName(backup.line)!=="back up tool"){showNotice("เลือกได้เฉพาะ Tool ในหมวด Back up tool","error");return;}
    if(!confirm(`ยืนยันสลับข้อมูล Tool ${damaged.serial} กับ ${backup.serial} โดยให้แถวของ ${backup.serial} เปลี่ยน Line เป็น Damage และแถว Line ${damaged.line} คง Line/Process เดิม ?`))return;
    data.action="damageReplace";data.damagedSerial=data.serial;delete data.serial;delete data.actionType;
    await runMutation("กำลังบันทึก Damage และเปลี่ยน Tool...",async()=>{await apiWrite(data);$("#actionDialog").close();showNotice("บันทึก Damage และเปลี่ยน Tool แล้ว","success");});
    return;
  }

  if(!data.swapSerial){showNotice("กรุณาเลือก Tool ที่ต้องการสลับตำแหน่ง","error");return;}
  const first=state.tools.find(t=>t.serial===data.serial),second=state.tools.find(t=>t.serial===data.swapSerial);
  if(!first||!second){showNotice("ไม่พบ Tool ที่เลือก กรุณากด Refresh","error");return;}
  if(normalizeLineName(first.line)===normalizeLineName(second.line)){showNotice("Tool ทั้งสองอยู่ใน Line เดียวกัน ไม่จำเป็นต้องสลับ","error");return;}
  data.action="swapTools";data.serialA=data.serial;data.serialB=data.swapSerial;delete data.serial;delete data.swapSerial;delete data.actionType;
  if(!confirm(`ยืนยัน Move โดยสลับเฉพาะข้อมูล Tool ${data.serialA} กับ ${data.serialB} และคง Line/Process เดิม ?`))return;
  await runMutation("กำลังสลับตำแหน่ง Tool...",async()=>{await apiWrite(data);$("#actionDialog").close();showNotice("บันทึกการสลับตำแหน่งแล้ว","success");});
}
async function runMutation(msg,fn){
  state.busy=true;showNotice(msg);
  try{await fn();}catch(e){showNotice("ไม่สามารถยืนยันผลการบันทึกได้: "+e.message+" กรุณากด Refresh และตรวจสอบ Movement History ก่อนส่งคำสั่งซ้ำ","error");}
  finally{state.busy=false;}
}
function openSettings(){
  const f=$("#settingsForm");f.elements.apiUrl.value=state.apiUrl;f.elements.apiKey.value=state.apiKey;$("#settingsDialog").showModal();
}
function init(){
  populateLines();
  document.addEventListener("click",e=>{
    const close=e.target.closest("[data-close]");if(close){$("#"+close.dataset.close).close();return;}
    const nav=e.target.closest("[data-view]");if(nav){setView(nav.dataset.view);return;}
    const line=e.target.closest("[data-line]");if(line){setView("line",line.dataset.line);return;}
    const action=e.target.closest("[data-action]");if(action){if(action.dataset.action==="edit")openEditDialog(action.dataset.serial);else openActionDialog(action.dataset.action,action.dataset.serial);return;}
  });
  $("#adminBtn").addEventListener("click",()=>{
    if(state.isAdmin){if(confirm("ต้องการออกจากระบบ Admin หรือไม่?"))adminLogout();return;}
    if(!hasApi()){openSettings();return;}
    $("#adminLoginForm").reset();$("#adminLoginDialog").showModal();
  });
  $("#adminLoginForm").addEventListener("submit",async e=>{
    e.preventDefault();const password=String(new FormData(e.currentTarget).get("adminPassword")||"");
    try{await adminLogin(password);$("#adminLoginDialog").close();showNotice("เข้าสู่ระบบ Admin สำเร็จ สามารถแก้ไขข้อมูล Tool ได้","success");}
    catch(err){showNotice("เข้าสู่ระบบ Admin ไม่สำเร็จ: "+err.message,"error");}
    e.currentTarget.reset();
  });
  $("#editToolForm").addEventListener("submit",submitEdit);
  $("#actionForm").addEventListener("submit",submitAction);
  $("#refreshBtn").addEventListener("click",refreshAll);$("#refreshHistoryBtn").addEventListener("click",refreshAll);
  ["searchInput","lineFilter","statusFilter","sortSelect"].forEach(id=>$("#"+id).addEventListener("input",renderTools));
  $("#settingsForm").addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    state.apiUrl = String(fd.get("apiUrl")).trim();
    state.apiKey = String(fd.get("apiKey")).trim();
    saveApiSettings();
    $("#settingsDialog").close();
    refreshAll();
  });
  $("#mobileMenu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  // Settings can be opened with Alt+S. API settings are saved in this browser's localStorage.
  document.addEventListener("keydown",e=>{if(e.altKey&&e.key.toLowerCase()==="s"){e.preventDefault();openSettings();}});
  // Restore saved API settings and load Google Sheets automatically on page refresh.
  loadApiSettings();
  setView("dashboard");
  refreshAll();
}
init();

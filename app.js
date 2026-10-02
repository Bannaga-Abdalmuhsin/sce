const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const fileInput=$("#fileInput"),dropzone=$("#dropzone"),fileRow=$("#fileRow"),blueprint=$("#blueprint"),emptyState=$("#emptyState"),results=$("#results"),scanLine=$("#scanLine"),status=$("#viewerStatus");
let zoom=1;
function setFile(file){if(!file)return;$("#fileName").textContent=file.name;$("#fileSize").textContent=(file.size/1048576).toFixed(1)+" MB";fileRow.hidden=false;dropzone.style.display="none";status.textContent="الملف جاهز للتحليل"}
fileInput.addEventListener("change",e=>setFile(e.target.files[0]));
["dragenter","dragover"].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",e=>setFile(e.dataTransfer.files[0]));
$("#removeFile").onclick=()=>{fileInput.value="";fileRow.hidden=true;dropzone.style.display="flex";status.textContent="لم يبدأ التحليل"};
function demoFile(){setFile({name:"SCE_Demo_Electrical_SLD.pdf",size:2480000});}
$("#sampleBtn").onclick=demoFile;
async function analyze(){if(fileRow.hidden)demoFile();const btn=$("#analyzeBtn");btn.disabled=true;btn.innerHTML="<span>◌</span> جارٍ استخراج عناصر المخطط...";emptyState.hidden=true;blueprint.hidden=false;scanLine.hidden=false;status.textContent="تحليل المخطط ومحرك القواعد...";$("#markers").style.opacity="0";await new Promise(r=>setTimeout(r,2200));scanLine.hidden=true;$("#markers").style.opacity="1";status.textContent="اكتمل التحليل · 8 فحوصات";btn.disabled=false;btn.innerHTML="<span>✓</span> اكتمل التدقيق الذكي";results.hidden=false;results.scrollIntoView({behavior:"smooth",block:"start"})}
$("#analyzeBtn").onclick=analyze;
$("#zoomIn").onclick=()=>{zoom=Math.min(1.5,zoom+.1);applyZoom()};$("#zoomOut").onclick=()=>{zoom=Math.max(.7,zoom-.1);applyZoom()};
function applyZoom(){blueprint.style.transform="scale("+zoom+")";$("#zoomValue").textContent=Math.round(zoom*100)+"%"}
$$(".finding-tabs button").forEach(b=>b.onclick=()=>{$$(".finding-tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");const f=b.dataset.filter;$$(".finding").forEach(x=>x.style.display=f==="all"||x.dataset.type===f?"grid":"none")});
$$(".locate").forEach(b=>b.onclick=()=>{const n=b.dataset.marker;const texts=[...$$(".markers text")];const t=texts.find(x=>x.textContent===n);if(t){const circle=t.previousElementSibling;circle.classList.remove("pulse");void circle.getBoundingClientRect();circle.classList.add("pulse");blueprint.scrollIntoView({behavior:"smooth",block:"center"})}});
$("#printBtn").onclick=()=>window.print();
const modal=$("#modal");
function closeAbout(){modal.classList.remove("is-open");document.body.style.overflow=""}
function openAbout(){modal.hidden=false;modal.classList.add("is-open");document.body.style.overflow="hidden"}
closeAbout();$("#helpBtn").onclick=openAbout;$("#closeModal").onclick=closeAbout;modal.onclick=e=>{if(e.target===modal)closeAbout()};document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAbout()});

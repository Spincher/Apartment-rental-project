const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let token=localStorage.getItem("betToken"), currentUser=JSON.parse(localStorage.getItem("betUser")||"null"), currentFilter="all", selectedListing=null;

function toast(t){$("#toast").innerHTML=`<div class="toast">${t}</div>`;setTimeout(()=>$("#toast").innerHTML="",2800)}
async function api(url,opts={}){opts.headers={...(opts.headers||{}),...(token?{Authorization:"Bearer "+token}:{})};if(opts.body&&!opts.headers["Content-Type"])opts.headers["Content-Type"]="application/json";const r=await fetch(url,opts);let d=null;try{d=await r.json()}catch{d={}}if(r.status===401&&token){localStorage.removeItem("betToken");localStorage.removeItem("betUser");token=null;currentUser=null;showAuth()}if(!r.ok)throw Error(d.error||`حصل خطأ (${r.status})`);return d}
function showApp(){ $("#authView").classList.add("hidden");$("#appView").classList.remove("hidden");loadListings();loadMessages();loadAccount() }
function showAuth(){ $("#authView").classList.remove("hidden");$("#appView").classList.add("hidden") }
if(token) showApp(); else showAuth();

$$(".tab").forEach(b=>b.onclick=()=>{$$(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");let reg=b.dataset.auth==="register";$("#nameWrap").classList.toggle("hidden",!reg);$(".primary.wide").innerHTML=reg?'إنشاء حساب <i class="fa-solid fa-user-plus"></i>':'دخول <i class="fa-solid fa-arrow-left"></i>';$("#authForm").dataset.mode=reg?"register":"login"});
$("#authForm").onsubmit=async e=>{e.preventDefault();let mode=e.currentTarget.dataset.mode||"login";try{let d=await api("/api/"+mode,{method:"POST",body:JSON.stringify({name:$("#name").value,email:$("#email").value,password:$("#password").value})});token=d.token;currentUser=d.user;localStorage.setItem("betToken",token);localStorage.setItem("betUser",JSON.stringify(currentUser));showApp()}catch(e){toast(e.message)}};

$$("[data-page]").forEach(b=>b.onclick=()=>{let p=b.dataset.page;$$(".page").forEach(x=>x.classList.add("hidden"));$("#"+p+"Page").classList.remove("hidden");$$(".nav-link").forEach(x=>x.classList.remove("active"));b.classList.add("active");if(p==="messages")loadMessages();if(p==="account")loadAccount();if(p==="add"){initListingMapPicker();setTimeout(()=>listingPickerMap?.invalidateSize(),80)}if(p==="detail"){}});
$("#logout").onclick=()=>{localStorage.clear();token=null;showAuth()};
let accountCache=null, editingAccount=false, activeChat=null;
async function loadAccount(){
  try{
    const u=await api("/api/me");
    accountCache=u;
    currentUser={id:u.id,name:u.name,email:u.email,phone:u.phone||""};
    localStorage.setItem("betUser",JSON.stringify(currentUser));
    $("#accountDisplayName").textContent=u.name||"—";
    $("#accountDisplayPhone").textContent=u.phone||"مش متضاف";
    $("#accountDisplayEmail").textContent=u.email||"—";
    $("#accountEmailHint").textContent=u.email||"";
    $("#accountName").value=u.name||"";
    $("#accountEmail").value=u.email||"";
    $("#accountPhone").value=u.phone||"";
    if(!editingAccount) toggleAccountEdit(false);
  }catch(e){toast(e.message)}
}
function toggleAccountEdit(show){
  editingAccount=show;
  $("#accountView").classList.toggle("hidden",show);
  $("#accountForm").classList.toggle("hidden",!show);
}
$("#editAccountBtn").onclick=()=>toggleAccountEdit(true);
$("#cancelAccountEdit").onclick=()=>{editingAccount=false;loadAccount()};
$("#accountForm").onsubmit=async e=>{
  e.preventDefault();
  const phone=$("#accountPhone").value.trim();
  if(phone&&!/^\d{10,15}$/.test(phone)){toast("رقم الموبايل لازم يكون من 10 لـ 15 رقم");return}
  try{
    const u=await api("/api/me",{method:"PUT",body:JSON.stringify({name:$("#accountName").value.trim(),email:$("#accountEmail").value.trim(),phone})});
    accountCache=u; currentUser={name:u.name,email:u.email,phone:u.phone||""};
    localStorage.setItem("betUser",JSON.stringify(currentUser));
    editingAccount=false; toggleAccountEdit(false); loadAccount(); toast("تم حفظ بيانات الحساب بنجاح");
  }catch(e){toast(e.message)}
};

$("#themeBtn").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("dark",document.body.classList.contains("dark"));$("#themeBtn i").className=document.body.classList.contains("dark")?"fa-solid fa-sun":"fa-solid fa-moon"};
if(localStorage.getItem("dark")==="true"){$("#themeBtn").click()}

["areaFilter","typeFilter","dealFilter","roomsFilter","priceFilter"].forEach(id=>$("#"+id)?.addEventListener("change",loadListings));
$("#search").addEventListener("input",()=>{ clearTimeout(window.__searchTimer); window.__searchTimer=setTimeout(loadListings,180); });
$("#searchBtn").onclick=()=>loadListings();
$("#search").onkeydown=e=>{if(e.key==="Enter")loadListings()};
$("#resetFilters").onclick=()=>{ $("#areaFilter").value="all"; $("#typeFilter").value="all"; $("#dealFilter").value="all"; $("#roomsFilter").value="0"; $("#priceFilter").value=""; $("#search").value=""; loadListings(); };
$("#search").oninput=()=>loadListings(); $("#searchBtn").onclick=()=>loadListings(); $("#search").onkeydown=e=>{if(e.key==="Enter")loadListings()};

function money(n){return new Intl.NumberFormat("ar-EG",{maximumFractionDigits:0}).format(n)+" جنيه"}
function hasCoords(l){return Number.isFinite(Number(l.latitude))&&Number.isFinite(Number(l.longitude));}
function googleMapsUrl(l){return hasCoords(l)?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.latitude},${l.longitude}`)}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.location||l.city||"Egypt")}`;}
function googleMapEmbed(l){
  if(hasCoords(l)) return `https://www.google.com/maps?q=${encodeURIComponent(`${l.latitude},${l.longitude}`)}&z=16&output=embed`;
  return `https://www.google.com/maps?q=${encodeURIComponent(l.location||l.city||"Egypt")}&z=14&output=embed`;
}
let listingPickerMap=null, listingPickerMarker=null;
const DEFAULT_MAP_CENTER=[30.0444,31.2357];
function updateSelectedLocation(lat,lng){
  lat=Number(lat); lng=Number(lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)) return;
  $("#latitude").value=lat.toFixed(6);
  $("#longitude").value=lng.toFixed(6);
  $("#selectedLocationText").innerHTML=`المكان المحدد: <b>${lat.toFixed(6)}, ${lng.toFixed(6)}</b>`;
  if(listingPickerMarker) listingPickerMarker.setLatLng([lat,lng]);
  else if(listingPickerMap) listingPickerMarker=L.marker([lat,lng],{draggable:true}).addTo(listingPickerMap).on('dragend',()=>{const p=listingPickerMarker.getLatLng();updateSelectedLocation(p.lat,p.lng)});
}
function initListingMapPicker(){
  if(typeof L==='undefined'||!$("#listingMapPicker")) return;
  const box=$("#listingMapPicker");
  if(listingPickerMap) {listingPickerMap.invalidateSize();return;}
  let lat=parseFloat($("#latitude").value),lng=parseFloat($("#longitude").value);
  const has=Number.isFinite(lat)&&Number.isFinite(lng);
  listingPickerMap=L.map(box,{zoomControl:true}).setView(has?[lat,lng]:DEFAULT_MAP_CENTER,has?16:12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(listingPickerMap);
  listingPickerMap.on('click',e=>updateSelectedLocation(e.latlng.lat,e.latlng.lng));
  if(has) updateSelectedLocation(lat,lng);
}
function clearListingMapPin(){
  if(listingPickerMarker){listingPickerMap.removeLayer(listingPickerMarker);listingPickerMarker=null;}
  $("#latitude").value="";$("#longitude").value="";$("#selectedLocationText").textContent="لسه محددتش مكان العقار";
}
function openSelectedGoogleMaps(){
  const lat=parseFloat($("#latitude").value),lng=parseFloat($("#longitude").value);
  const query=Number.isFinite(lat)&&Number.isFinite(lng)?`${lat},${lng}`:$("#location").value.trim()||$("#city").value;
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,'_blank','noopener');
}

function renderCard(l){
  let color=l.score>=82?"#10B981":l.score>=60?"#F59E0B":"#EF4444";
  const lotta=l.lotta?`<div class="lotta-label"><i class="fa-solid fa-fire"></i> دي لقطة — السعر أقل من القيمة المتوقعة</div>`:"";
  const estimate=`<div class="estimate">AI شايف السعر العادل حوالي <b>${money(l.expected)}</b> <span>±10%</span></div>`;
  const imgs=(l.images&&l.images.length?l.images:[l.image]).filter(Boolean);
  const cover=imgs[0]||"";
  return `<article class="card clickable-card" onclick="openListing(${l.id})">
    <div class="photo">${cover?`<img src="${cover}" onerror="this.style.display='none'">`:""}<span class="badge">${l.type==="sale"?"للبيع":"للإيجار"}</span><span class="photo-count"><i class="fa-regular fa-images"></i> ${imgs.length}</span></div>
    <div class="card-body"><h3>${l.title}</h3><div class="muted">📍 ${l.location||l.city}</div><div class="price">${money(l.price)}</div>
    ${lotta}${estimate}
    <div class="details"><span><i class="fa-solid fa-ruler-combined"></i>${l.area}</span><span><i class="fa-solid fa-bed"></i>${l.bedrooms} أوض</span><span><i class="fa-solid fa-bath"></i>${l.bathrooms} حمام</span></div>
    <div class="score-section"><div class="score-head"><span>تقييم السعر بالـAI</span><span class="score-label" style="color:${color}">${l.label} ${l.score}%</span></div>
    <div class="bar"><div class="fill" style="width:${l.score}%;background:${color}"></div></div></div>
    <div class="card-actions"><button class="btn primary" onclick="event.stopPropagation();contact(${l.id},'${escapeHtml(l.title)}')"><i class="fa-regular fa-message"></i> تفاوض مع المالك</button>${l.type==="sale"?`<button class="btn outline" onclick="event.stopPropagation();predict(${l.id})">📈 توقع السعر</button>`:""}</div>
    </div></article>`
}
function openListing(id){
  $$(".page").forEach(x=>x.classList.add("hidden"));
  $$(".nav-link").forEach(x=>x.classList.remove("active"));
  $("#detailPage").classList.remove("hidden");
  loadDetail(id);
  window.scrollTo({top:0,behavior:"smooth"});
}

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));}
async function loadListings(){
  try{
    const q=$("#search").value.trim();
    const params=new URLSearchParams({
      q,
      type:$("#typeFilter").value,
      city:$("#areaFilter").value
    });
    let data=await api("/api/search?"+params.toString());
    const deal=$("#dealFilter").value;
    const rooms=Number($("#roomsFilter").value||0);
    const maxPrice=Number($("#priceFilter").value||0);
    data=data.filter(l=>(deal==="all"||(deal==="lotta"&&l.lotta)||(deal==="reasonable"&&l.score>=82))
      && Number(l.bedrooms)>=rooms
      && (!maxPrice||Number(l.price)<=maxPrice));
    $("#resultCount").textContent=`${data.length} عقار`;
    $("#listingGrid").innerHTML=data.length?data.map(renderCard).join(""):`<div class="message no-results"><i class="fa-solid fa-house-circle-xmark"></i><h3>ملقيناش عقارات بالمواصفات دي</h3><p>جرّب توسّع البحث أو امسح بعض الفلاتر.</p><button class="btn outline" onclick="document.querySelector('#resetFilters').click()">مسح الفلاتر</button></div>`;
  }catch(e){toast(e.message)}
}
function contact(id,title){selectedListing=id;$("#modalTitle").textContent=title;$("#messageText").value="";$("#contactModal").classList.remove("hidden")}
function closeModal(){$("#contactModal").classList.add("hidden")}
$("#sendMessage").onclick=async()=>{const text=$("#messageText").value.trim();if(!text)return toast("اكتب رسالتك الأول");try{await api("/api/messages",{method:"POST",body:JSON.stringify({listingId:selectedListing,text})});$("#messageText").value="";closeModal();toast("الرسالة اتبعتت لصاحب العقار بنجاح ✨");await loadMessages()}catch(e){toast(e.message)}}
async function predict(id){try{let d=await api("/api/prediction/"+id);$("#predictionBody").innerHTML=`<div class="prediction"><div class="pred">دلوقتي<b>${money(d.current)}</b></div><div class="pred">بعد سنة<b>${money(d.after1)}</b></div><div class="pred">بعد 3 سنين<b>${money(d.after3)}</b></div><div class="pred">بعد 5 سنين<b>${money(d.after5)}</b></div></div><div class="estimate detail-estimate">القيمة الحالية المتوقعة: <b>${money(d.expected)}</b><br><small>نطاق تقريبي ${money(d.low)} — ${money(d.high)} · ثقة النموذج ${d.confidence}% · نمو سنوي مفترض ${(d.annualGrowth*100).toFixed(1)}%</small></div>`;$("#predictionModal").classList.remove("hidden")}catch(e){toast(e.message)}}
function closePrediction(){$("#predictionModal").classList.add("hidden")}

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
}
function renderImagePreviews(){
  const files=[...$("#imageFiles").files];
  const box=$("#imagePreviewGrid");
  if(!files.length){box.classList.add("hidden");box.innerHTML="";return;}
  box.classList.remove("hidden");
  box.innerHTML=files.map((f,i)=>`<div class="preview-tile"><img id="preview-${i}" alt="صورة ${i+1}"><span>${i+1}</span></div>`).join("");
  files.forEach((file,i)=>{
    if(file.size>5*1024*1024){toast(`الصورة رقم ${i+1} أكبر من 5MB`);return;}
    const r=new FileReader();r.onload=e=>{const im=$("#preview-"+i);if(im)im.src=e.target.result};r.readAsDataURL(file);
  });
}
$("#imageFiles").addEventListener("change",()=>{
  const files=[...$("#imageFiles").files];
  if(files.length>10){toast("ممكن ترفع لحد 10 صور بس");$("#imageFiles").value="";renderImagePreviews();return;}
  renderImagePreviews();
});

$("#useMyLocation").onclick=()=>{
  if(!navigator.geolocation)return toast("المتصفح مش بيدعم تحديد الموقع");
  navigator.geolocation.getCurrentPosition(pos=>{
    initListingMapPicker();
    listingPickerMap.setView([pos.coords.latitude,pos.coords.longitude],17);
    updateSelectedLocation(pos.coords.latitude,pos.coords.longitude);
    toast("اتحدد موقعك الحالي، تقدر تحرك الـPin وتظبطه 📍");
  },()=>toast("مش قادرين نوصل لموقعك. اسمح للموقع باستخدام الـLocation."),{enableHighAccuracy:true,timeout:10000});
};
$("#openGoogleMaps").onclick=openSelectedGoogleMaps;
$("#clearMapPin").onclick=clearListingMapPin;
initListingMapPicker();

$("#listingForm").onsubmit=async e=>{
  e.preventDefault();
  const files=[...$("#imageFiles").files];
  if(!files.length)return toast("ارفع صورة واحدة على الأقل");
  if(files.length>10)return toast("ممكن ترفع لحد 10 صور بس");
  if(files.some(f=>f.size>5*1024*1024))return toast("كل صورة لازم تكون 5MB أو أقل");
  try{
    const images=await Promise.all(files.map(fileToDataURL));
    const body={title:$("#title").value,type:$("#type").value,city:$("#city").value,location:$("#location").value.trim(),latitude:$("#latitude").value,longitude:$("#longitude").value,area:$("#area").value,bedrooms:$("#bedrooms").value,bathrooms:$("#bathrooms").value,price:$("#price").value,images,description:$("#description").value};
    let l=await api("/api/listings",{method:"POST",body:JSON.stringify(body)});
    e.target.reset();renderImagePreviews();toast("تم نشر العقار بنجاح ✨");clearListingMapPin();if(listingPickerMap)listingPickerMap.setView(DEFAULT_MAP_CENTER,12);
    $$("[data-page]").forEach(x=>x.classList.remove("active"));$("[data-page=home]").classList.add("active");$$('.page').forEach(x=>x.classList.add('hidden'));$("#homePage").classList.remove("hidden");loadListings();
  }catch(err){toast(err.message)}
};

async function loadDetail(id){
  try{
    $("#detailContent").innerHTML=`<div class="detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> بنجهزلك تفاصيل العقار...</div>`;
    const l=await api(`/api/listings/${id}`);
    const imgs=(l.images&&l.images.length?l.images:[l.image]).filter(Boolean);
    const color=l.score>=82?"#10B981":l.score>=60?"#F59E0B":"#EF4444";
    const prediction=l.type==="sale" ?
      '<div class="detail-predictions">'+
      '<div><span>بعد سنة</span><b>'+money(Math.round(l.price*Math.pow(1+l.annualGrowth,1)))+'</b></div>'+
      '<div><span>بعد 3 سنين</span><b>'+money(Math.round(l.price*Math.pow(1+l.annualGrowth,3)))+'</b></div>'+
      '<div><span>بعد 5 سنين</span><b>'+money(Math.round(l.price*Math.pow(1+l.annualGrowth,5)))+'</b></div>'+
      '</div>' : '<div class="rent-note">العقار للإيجار، فالتوقعات السنوية لسعر البيع مش مطبقة عليه.</div>';
    $("#detailContent").innerHTML=`
      <button class="btn outline back-detail" onclick="backToHome()"><i class="fa-solid fa-arrow-right"></i> رجوع للعقارات</button>
      <div class="detail-card">
        <div class="gallery">
          <div class="gallery-main"><img id="detailMainImage" src="${imgs[0]||''}" alt="${escapeHtml(l.title)}"></div>
          <div class="gallery-thumbs">${imgs.map((im,i)=>`<button class="gallery-thumb ${i===0?'active':''}" onclick="selectDetailImage(${i})"><img src="${im}" alt="صورة ${i+1}"><span>${i+1}</span></button>`).join("")}</div>
        </div>
        <div class="detail-info">
          <div class="detail-heading"><span class="badge detail-badge">${l.type==="sale"?"للبيع":"للإيجار"}</span>${l.lotta?`<span class="lotta-label inline-lotta"><i class="fa-solid fa-fire"></i> دي لقطة</span>`:""}</div>
          <h1>${l.title}</h1>
          <p class="detail-location"><i class="fa-solid fa-location-dot"></i> ${l.location||l.city}</p>
          <div class="detail-price">${money(l.price)}</div>
          <div class="detail-details"><div><i class="fa-solid fa-ruler-combined"></i><span>المساحة<strong>${l.area}</strong></span></div><div><i class="fa-solid fa-bed"></i><span>الغرف<strong>${l.bedrooms}</strong></span></div><div><i class="fa-solid fa-bath"></i><span>الحمامات<strong>${l.bathrooms}</strong></span></div><div><i class="fa-solid fa-map-location-dot"></i><span>المحافظة<strong>${l.city}</strong></span></div></div>
          <div class="detail-description"><h3>عن العقار</h3><p>${l.description||"مفيش وصف إضافي للعقار."}</p></div>
          <div class="detail-ai"><div class="detail-ai-head"><h3>تقييم السعر بالـAI</h3><strong style="color:${color}">${l.label} · ${l.score}%</strong></div><div class="bar"><div class="fill" style="width:${l.score}%;background:${color}"></div></div><div class="detail-fair">السعر العادل المتوقع <b>${money(l.expected)}</b> <span>±10%</span></div></div>
          ${prediction}
          <div class="detail-map-section">
            <div class="detail-map-head"><div><h3><i class="fa-solid fa-map-location-dot"></i> موقع العقار على Google Maps</h3><p>${escapeHtml(l.location||l.city)}</p></div><a class="btn outline" href="${googleMapsUrl(l)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-google"></i> فتح Google Maps</a></div>
            <div class="detail-map"><iframe title="موقع العقار على Google Maps" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${googleMapEmbed(l)}"></iframe></div>
          </div>
          <button class="btn primary wide contact-owner-btn" onclick="contact(${l.id},'${escapeHtml(l.title)}')"><i class="fa-regular fa-message"></i> تواصل مع صاحب العقار وابعت رسالة</button>
        </div>
      </div>`;
    window.__detailImages=imgs;
  }catch(e){toast(e.message)}
}
function selectDetailImage(i){const imgs=window.__detailImages||[];if(!imgs[i])return;$("#detailMainImage").src=imgs[i];$$(".gallery-thumb").forEach((b,n)=>b.classList.toggle("active",n===i));}
function backToHome(){$$(".page").forEach(x=>x.classList.add("hidden"));$("#homePage").classList.remove("hidden");$$(".nav-link").forEach(x=>x.classList.remove("active"));$("[data-page=home]").classList.add("active");}

async function loadMessages(){
  try{
    const cs=await api("/api/conversations");
    $("#msgCount").textContent=cs.length;
    $("#messagesList").innerHTML=cs.length?cs.map(c=>`<button class="conversation" type="button" onclick="openChat(${c.other_id},${c.listing_id},'${escapeHtml(c.other_name)}','${escapeHtml(c.title)}')">
      <div class="conversation-avatar"><i class="fa-solid fa-user"></i></div>
      <div class="conversation-main"><div class="conversation-top"><strong>${c.other_name}</strong><small>${new Date(c.last_at.replace(" ","T")).toLocaleString("ar-EG")}</small></div><div class="conversation-title">${c.title}</div><p>${c.last_text}</p></div><i class="fa-solid fa-chevron-left conversation-arrow"></i>
    </button>`).join(""):`<div class="message">لسه مفيش محادثات. لما تبعت لحد أو حد يبعتلك، المحادثة هتظهر هنا.</div>`;
  }catch(e){toast(e.message)}
}
async function openChat(otherId,listingId,otherName,title){
  activeChat={otherId,listingId};
  $("#chatTitle").textContent=otherName;
  $("#chatSubtitle").textContent=title;
  $("#chatText").value="";
  $("#chatModal").classList.remove("hidden");
  await loadChat();
}
async function loadChat(){
  if(!activeChat)return;
  try{
    const ms=await api(`/api/conversations/${activeChat.otherId}/${activeChat.listingId}`);
    $("#chatMessages").innerHTML=ms.length?ms.map(m=>`<div class="chat-bubble ${m.sender_id===currentUser.id?"mine":"theirs"}"><div>${m.text}</div><small>${new Date(m.created_at.replace(" ","T")).toLocaleString("ar-EG")}</small></div>`).join(""): `<div class="chat-empty">ابدأ المحادثة برسالة 👋</div>`;
    const box=$("#chatMessages");box.scrollTop=box.scrollHeight;
  }catch(e){toast(e.message)}
}
$("#sendChat").onclick=async()=>{
  const text=$("#chatText").value.trim();
  if(!text)return toast("اكتب رسالتك الأول");
  try{
    await api("/api/messages",{method:"POST",body:JSON.stringify({listingId:activeChat.listingId,receiverId:activeChat.otherId,text})});
    $("#chatText").value="";
    toast("Message sent successfully");
    await loadChat(); await loadMessages();
  }catch(e){toast(e.message)}
};
$("#chatText").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#sendChat").click()}});
function closeChat(){$("#chatModal").classList.add("hidden");activeChat=null}

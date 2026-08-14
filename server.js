const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "bet-lot2a-demo-secret-change-me";
const db = new Database(path.join(__dirname, "bet-lot2a.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('sale','rent')),
  city TEXT NOT NULL,
  location TEXT DEFAULT '',
  latitude REAL,
  longitude REAL,
  area TEXT NOT NULL,
  bedrooms INTEGER NOT NULL,
  bathrooms INTEGER NOT NULL,
  price REAL NOT NULL,
  image TEXT,
  images TEXT DEFAULT '[]',
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(listing_id) REFERENCES listings(id)
);
`);

// Robust migration for databases created by older versions of بيت لقطة.
// We check the real schema instead of assuming the database is new.
function ensureColumn(table, column, definition){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if(!cols.includes(column)){
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
    catch(e){ console.error(`Migration failed for ${table}.${column}:`, e.message); }
  }
}
ensureColumn("users","phone","TEXT DEFAULT ''");
ensureColumn("listings","location","TEXT DEFAULT ''");
ensureColumn("listings","latitude","REAL");
ensureColumn("listings","longitude","REAL");
ensureColumn("listings","image","TEXT");
ensureColumn("listings","images","TEXT DEFAULT '[]'");
ensureColumn("listings","description","TEXT");
ensureColumn("listings","created_at","TEXT DEFAULT CURRENT_TIMESTAMP");

// Make sure the required messages table exists too.
db.exec(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(listing_id) REFERENCES listings(id)
);`);

app.use(express.json({limit:"100mb"}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/health",(req,res)=>res.json({ok:true,service:"bet-lot2a",time:new Date().toISOString()}));

function auth(req,res,next){
  const token = (req.headers.authorization||"").replace("Bearer ","");
  if(!token) return res.status(401).json({error:"لازم تسجل دخول الأول"});
  try { req.user = jwt.verify(token,SECRET); next(); }
  catch { res.status(401).json({error:"الجلسة انتهت، سجل دخول تاني"}); }
}

function marketModel(l){
  // AI-style valuation engine:
  // In production, replace the benchmark tables with trained model output
  // using verified transactions, listings, neighborhood, building age,
  // finishing, floor, amenities, demand and time-series market data.
  const saleSqm = {
    "القاهرة": {base: 28000, growth:.115},
    "الإسكندرية": {base: 23500, growth:.102},
    "بورسعيد": {base: 17500, growth:.088},
    "الجيزة": {base: 21500, growth:.105},
    "المنصورة": {base: 15500, growth:.082},
    "أخرى": {base: 14500, growth:.075}
  };
  const rentSqm = {
    "القاهرة": 135, "الإسكندرية": 108, "بورسعيد": 82,
    "الجيزة": 105, "المنصورة": 78, "أخرى": 70
  };
  const area = parseFloat(String(l.area).replace(/[^\d.]/g,"")) || 100;
  const rooms = Number(l.bedrooms)||2;
  const baths = Number(l.bathrooms)||1;

  if(l.type==="sale"){
    const m=saleSqm[l.city]||saleSqm["أخرى"];
    let expected = area*m.base;
    // Size/room and bathroom adjustments make the estimate less naive.
    expected *= 1 + Math.min(.08, Math.max(-.04,(rooms-2)*.025));
    expected *= 1 + Math.min(.04, Math.max(-.02,(baths-1)*.02));
    const pricePerSqm=l.price/Math.max(area,1);
    const deviation=(pricePerSqm-m.base)/m.base;
    const confidence=Math.round(Math.max(62,Math.min(94,88-Math.abs(deviation)*65)));
    const ratio=l.price/expected;
    const dealScore=Math.round(Math.max(0,Math.min(100,100-(ratio-1)*150)));
    const lotta=ratio<=.90 && dealScore>=75;
    return {
      expected:Math.round(expected),
      confidence,
      dealScore,
      lotta,
      score:Math.round(Math.max(5,Math.min(100,100-Math.abs(ratio-1)*170))),
      label: lotta?"لقطة 🔥": ratio<=1.05?"سعر منطقي":ratio<=1.18?"أعلى من المتوقع":"غالي شوية",
      annualGrowth:m.growth,
      low:Math.round(expected*.90),
      high:Math.round(expected*1.10)
    };
  }

  const expected=area*(rentSqm[l.city]||rentSqm["أخرى"]);
  const ratio=l.price/expected;
  const dealScore=Math.round(Math.max(0,Math.min(100,100-(ratio-1)*150)));
  const lotta=ratio<=.90 && dealScore>=75;
  return {
    expected:Math.round(expected),confidence:Math.round(Math.max(62,Math.min(94,88-Math.abs(ratio-1)*65))),
    dealScore,lotta,score:Math.round(Math.max(5,Math.min(100,100-Math.abs(ratio-1)*170))),
    label:lotta?"لقطة 🔥":ratio<=1.05?"سعر منطقي":ratio<=1.18?"أعلى من المتوقع":"غالي شوية",
    annualGrowth:.08,low:Math.round(expected*.90),high:Math.round(expected*1.10)
  };
}

function normalizeListing(l){
  let images=[];
  try { images=Array.isArray(l.images)?l.images:JSON.parse(l.images||"[]"); } catch(e) {}
  if(!images.length && l.image) images=[l.image];
  return {...l,images};
}
function enrichListing(l){ return {...normalizeListing(l),...marketModel(l)}; }

function predicted(l, years){
  const model=marketModel(l);
  return Math.round(l.price*Math.pow(1+model.annualGrowth,years));
}

app.post("/api/register",(req,res)=>{
  const {name,email,password,phone=""}=req.body;
  if(!name||!email||!password) return res.status(400).json({error:"كمّل البيانات كلها"});
  try{
    const hash=bcrypt.hashSync(password,10);
    const r=db.prepare("INSERT INTO users(name,email,password,phone) VALUES(?,?,?,?)").run(name,email,hash,phone);
    const token=jwt.sign({id:r.lastInsertRowid,name,email},SECRET,{expiresIn:"7d"});
    res.json({token,user:{id:r.lastInsertRowid,name,email,phone}});
  }catch(e){res.status(400).json({error:"الإيميل مستخدم قبل كده"});}
});

app.post("/api/login",(req,res)=>{
  const {email,password}=req.body;
  const u=db.prepare("SELECT * FROM users WHERE email=?").get(email||"");
  if(!u||!bcrypt.compareSync(password||"",u.password)) return res.status(401).json({error:"الإيميل أو الباسورد غلط"});
  const token=jwt.sign({id:u.id,name:u.name,email:u.email,phone:u.phone||""},SECRET,{expiresIn:"7d"});
  res.json({token,user:{id:u.id,name:u.name,email:u.email,phone:u.phone||""}});
});

app.get("/api/me",auth,(req,res)=>{const u=db.prepare("SELECT id,name,email,phone FROM users WHERE id=?").get(req.user.id);if(!u)return res.status(404).json({error:"الحساب مش موجود"});res.json(u);});
app.put("/api/me",auth,(req,res)=>{const {name,email,phone=""}=req.body;if(!name?.trim()||!email?.trim())return res.status(400).json({error:"الاسم والإيميل مطلوبين"});if(phone&&!/^\d{10,15}$/.test(String(phone)))return res.status(400).json({error:"رقم الموبايل لازم يكون من 10 لـ 15 رقم"});try{db.prepare("UPDATE users SET name=?, email=?, phone=? WHERE id=?").run(name.trim(),email.trim(),String(phone),req.user.id);res.json(db.prepare("SELECT id,name,email,phone FROM users WHERE id=?").get(req.user.id));}catch(e){res.status(400).json({error:"الإيميل مستخدم قبل كده"});}});

app.get("/api/listings",(req,res)=>{
  const rows=db.prepare(`SELECT l.*,u.name AS owner_name FROM listings l JOIN users u ON u.id=l.user_id ORDER BY l.id DESC`).all();
  res.json(rows.map(enrichListing));
});

app.get("/api/search",(req,res)=>{
  const q=String(req.query.q||"").trim();
  const type=req.query.type||"all";
  const city=req.query.city||"all";
  let rows=db.prepare(`SELECT l.*,u.name AS owner_name FROM listings l JOIN users u ON u.id=l.user_id
    WHERE (?='' OR l.title LIKE '%'||?||'%' OR l.city LIKE '%'||?||'%' OR l.location LIKE '%'||?||'%' OR l.description LIKE '%'||?||'%')
    AND (?='all' OR l.type=?)
    AND (?='all' OR l.city=?) ORDER BY l.id DESC`)
    .all(q,q,q,q,q,type,type,city,city);
  res.json(rows.map(enrichListing));
});

app.post("/api/listings",auth,(req,res)=>{
  try{
    const body=req.body || {};
    const title=String(body.title||"").trim();
    const type=String(body.type||"").trim();
    const city=String(body.city||"").trim();
    const location=String(body.location||"").trim();
    const area=String(body.area||"").trim();
    const bedrooms=Number(body.bedrooms);
    const bathrooms=Number(body.bathrooms);
    const price=Number(body.price);
    const latitude=body.latitude==="" || body.latitude==null ? null : Number(body.latitude);
    const longitude=body.longitude==="" || body.longitude==null ? null : Number(body.longitude);
    const description=String(body.description||"").trim();

    if(!title || !["sale","rent"].includes(type) || !city || !location ||
       !area || !Number.isFinite(bedrooms) || bedrooms<1 ||
       !Number.isFinite(bathrooms) || bathrooms<1 ||
       !Number.isFinite(price) || price<1000){
      return res.status(400).json({error:"كمّل بيانات العقار بشكل صحيح"});
    }

    if(latitude!==null && (!Number.isFinite(latitude)||latitude<-90||latitude>90))
      return res.status(400).json({error:"خط العرض غير صحيح"});
    if(longitude!==null && (!Number.isFinite(longitude)||longitude<-180||longitude>180))
      return res.status(400).json({error:"خط الطول غير صحيح"});

    let images=Array.isArray(body.images) ? body.images : [];
    images=images.filter(x=>typeof x==="string" && x.startsWith("data:image/") && x.length>0).slice(0,10);

    // Backward-compatible single-image support.
    if(!images.length && typeof body.image==="string" && body.image.startsWith("data:image/"))
      images=[body.image];

    if(!images.length)
      return res.status(400).json({error:"ارفع صورة واحدة على الأقل"});

    // Guard against unexpectedly huge requests.
    const totalImageSize=images.reduce((n,x)=>n+x.length,0);
    if(totalImageSize>95*1024*1024)
      return res.status(413).json({error:"حجم الصور كبير جدًا. قلل حجم الصور وجرب تاني."});

    const insert=db.prepare(`INSERT INTO listings
      (user_id,title,type,city,location,latitude,longitude,area,bedrooms,bathrooms,price,image,images,description)
      VALUES (@user_id,@title,@type,@city,@location,@latitude,@longitude,@area,@bedrooms,@bathrooms,@price,@image,@images,@description)`);

    const result=insert.run({
      user_id:req.user.id,
      title,type,city,location,latitude,longitude,area,
      bedrooms,bathrooms,price,
      image:images[0],
      images:JSON.stringify(images),
      description
    });

    const listing=db.prepare(`SELECT l.*,u.name AS owner_name
      FROM listings l JOIN users u ON u.id=l.user_id WHERE l.id=?`).get(result.lastInsertRowid);

    if(!listing) throw new Error("العقار اتحفظ لكن مش قادرين نرجعه من قاعدة البيانات");

    return res.status(201).json(enrichListing(listing));
  }catch(err){
    console.error("POST /api/listings:",err);
    return res.status(500).json({
      error: process.env.NODE_ENV==="production"
        ? "حصل خطأ في السيرفر أثناء حفظ العقار. جرّب تاني."
        : `Database error: ${err.message}`
    });
  }
});

app.get("/api/listings/:id",auth,(req,res)=>{
  const l=db.prepare(`SELECT l.*,u.name AS owner_name FROM listings l JOIN users u ON u.id=l.user_id WHERE l.id=?`).get(Number(req.params.id));
  if(!l) return res.status(404).json({error:"العقار مش موجود"});
  res.json(enrichListing(l));
});

app.get("/api/my-listings",auth,(req,res)=>{
  const rows=db.prepare("SELECT * FROM listings WHERE user_id=? ORDER BY id DESC").all(req.user.id);
  res.json(rows.map(enrichListing));
});

app.get("/api/conversations",auth,(req,res)=>{
  const rows=db.prepare(`SELECT m.*, l.title,
      CASE WHEN m.sender_id=? THEN ru.id ELSE su.id END AS other_id,
      CASE WHEN m.sender_id=? THEN ru.name ELSE su.name END AS other_name
    FROM messages m
    JOIN listings l ON l.id=m.listing_id
    JOIN users su ON su.id=m.sender_id
    JOIN users ru ON ru.id=m.receiver_id
    WHERE m.sender_id=? OR m.receiver_id=?
    ORDER BY m.id DESC`).all(req.user.id,req.user.id,req.user.id,req.user.id);
  const seen=new Set(), out=[];
  for(const r of rows){const key=`${r.listing_id}:${r.other_id}`;if(seen.has(key))continue;seen.add(key);out.push({other_id:r.other_id,other_name:r.other_name,listing_id:r.listing_id,title:r.title,last_text:r.text,last_at:r.created_at});}
  res.json(out);
});

app.get("/api/conversations/:otherId/:listingId",auth,(req,res)=>{
  const otherId=Number(req.params.otherId), listingId=Number(req.params.listingId);
  const rows=db.prepare(`SELECT m.*,u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE m.listing_id=? AND ((m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)) ORDER BY m.id ASC`)
    .all(listingId,req.user.id,otherId,otherId,req.user.id);
  res.json(rows);
});

app.post("/api/messages",auth,(req,res)=>{
  const {listingId,text,receiverId}=req.body;
  const l=db.prepare("SELECT * FROM listings WHERE id=?").get(Number(listingId));
  if(!l) return res.status(404).json({error:"العقار مش موجود"});
  if(!text?.trim()) return res.status(400).json({error:"اكتب رسالتك"});
  let receiver=Number(receiverId)||0;
  if(!receiver){
    receiver=l.user_id;
    if(receiver===req.user.id) return res.status(400).json({error:"مينفعش تبعت لنفسك"});
  }
  if(receiver===req.user.id) return res.status(400).json({error:"مينفعش تبعت لنفسك"});
  const receiverUser=db.prepare("SELECT id FROM users WHERE id=?").get(receiver);
  if(!receiverUser) return res.status(404).json({error:"المستخدم مش موجود"});
  if(req.user.id!==l.user_id && receiver!==l.user_id) return res.status(403).json({error:"المحادثة دي مش مرتبطة بالعقار"});
  if(req.user.id===l.user_id){
    const prior=db.prepare("SELECT id FROM messages WHERE listing_id=? AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) LIMIT 1")
      .get(l.id,req.user.id,receiver,receiver,req.user.id);
    if(!prior) return res.status(403).json({error:"مينفعش تبدأ محادثة مع مستخدم مش مهتم بالعقار"});
  }
  const r=db.prepare("INSERT INTO messages(listing_id,sender_id,receiver_id,text) VALUES(?,?,?,?,?)").run(l.id,req.user.id,receiver,text.trim());
  res.json({ok:true,id:r.lastInsertRowid});
});

app.get("/api/prediction/:id",auth,(req,res)=>{
  const l=db.prepare("SELECT * FROM listings WHERE id=?").get(Number(req.params.id));
  if(!l) return res.status(404).json({error:"العقار مش موجود"});
  if(l.type!=="sale") return res.status(400).json({error:"التوقع متاح لعقارات البيع بس"});
  const model=marketModel(l); res.json({current:l.price,after1:predicted(l,1),after3:predicted(l,3),after5:predicted(l,5),expected:model.expected,low:model.low,high:model.high,confidence:model.confidence,annualGrowth:model.annualGrowth});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`بيت لقطة شغال على http://localhost:${PORT}`));
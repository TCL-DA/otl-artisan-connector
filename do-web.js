/* OTL Auto Artisan Connector — bản chạy NGAY TRONG TRÌNH DUYỆT (Web Serial API, Chrome/Edge máy tính).

   Một nút. Năm bước, hiện sống như bản .exe:
     1 DÒ CÁP          — cổng đã cấp quyền cho trang này (nhớ qua các lần mở); chưa có thì hỏi MỘT lần
     2 DÒ CỔNG COM     — thử từng cổng đã có quyền
     3 DÒ TỐC ĐỘ·MODBUS— 48 tổ hợp + dò slave + NHẬN RA LÀ MÁY NÀO
     4 TẠO TỆP ARTISAN — sinh .aset đúng máy/đường nối, tải về
     5 KIỂM TRA LẠI    — chờ tới khi Artisan thật sự GIỮ cổng COM mới báo xong

   Hai việc trình duyệt bị cấm, đừng cố: cài driver (cần quyền quản trị) và tự chạy Artisan.
   Bước 4 vì thế dừng ở "tệp đã tải, bấm đúp"; bước 5 vẫn làm được đủ, bằng đúng mẹo của bản .exe:
   mở thử cổng, mở KHÔNG được nữa nghĩa là phần mềm khác (Artisan) đang cầm nó.

   Bảng ô đọc và cách chấm điểm GIỮ GIỐNG bản .exe (tools/otl_cable_may.py, otl_cable_serial.py).
   ⚠ Sửa một bên thì sửa cả bên kia, không thì hai bản nhận ra hai máy khác nhau trên cùng một dây.

   Chữ dựng bằng textContent, không bao giờ bằng innerHTML. */
"use strict";

const $ = (id) => document.getElementById(id);

/* ── Bảng máy (giữ giống bản .exe) ──────────────────────────────────────── */
const BAUDS = [9600, 19200, 38400, 57600, 115200, 4800];
const BAUDS_QUET = [9600, 19200, 38400];
const FRAMES = [["none", 1], ["even", 1], ["odd", 1], ["none", 2]];
const MODES = ["rtu", "ascii"];
const KY_HIEU = { none: "N", even: "E", odd: "O" };
const NGUOC = { N: "none", E: "even", O: "odd" };

/* Nhiệt độ là số THÔ trong thanh ghi. Máy đọc thẳng bus: 25 = 25 °C. Bo CMS: ×10, 1850 = 185,0 °C.
   Hai khoảng phải RỜI NHAU ở đầu trên mới phân biệt được hệ chia. */
const TEMP_OK = [-20, 700];
const TEMP_X10 = [-200, 7000];
const BIEN_TAN = [0, 20000];

const MAY = {
  "3kg-frecon": {
    ten: "OTL 3 kg (bản Frecon)", link: { baud: 9600, parity: "none", stopbits: 1, mode: "rtu" }, template: "3kg-frecon", motSlave: false,
    probe: [
      { slave: 1, reg: 4096, ten: "BT", range: TEMP_OK, cot: true },
      { slave: 2, reg: 4096, ten: "ET", range: TEMP_OK, cot: true },
      { slave: 4, reg: 12288, ten: "Gió", range: BIEN_TAN, cot: false },
      { slave: 5, reg: 12288, ten: "Trống", range: BIEN_TAN, cot: false },
    ],
  },
  "1kg-bus": {
    ten: "OTL 1 kg (đọc thẳng bus)", link: { baud: 9600, parity: "none", stopbits: 1, mode: "rtu" }, template: "1kg-bus", motSlave: false,
    probe: [
      { slave: 1, quet: [1, 2, 3, 4, 5, 6, 7], reg: 4096, ten: "BT", range: TEMP_OK, cot: true },
      { slave: 2, quet: [2, 3, 4, 5, 6, 7, 1], reg: 4096, ten: "ET", range: TEMP_OK, cot: true,
        khacSlave: "BT" },
      { slave: 3, quet: [3, 4, 5, 2, 1], reg: 8451, ten: "Biến tần", range: BIEN_TAN, cot: false },
    ],
  },
  "auto-board": {
    ten: "OTL bản AUTO (bo CMS)", link: { baud: 57600, parity: "none", stopbits: 1, mode: "rtu" }, template: "auto-board", motSlave: true,
    probe: [
      { slave: 1, quet: [1, 2, 3, 4, 5, 6, 7], reg: 0, ten: "BT", range: TEMP_X10, cot: true },
      { slave: 1, reg: 1, ten: "ET", range: TEMP_X10, cot: true, theoSlave: "BT" },
      { slave: 1, reg: 3, ten: "Gió", range: [0, 100], cot: false, theoSlave: "BT" },
      { slave: 1, reg: 4, ten: "Trống", range: [0, 100], cot: false, theoSlave: "BT" },
    ],
  },
};
/* Máy auto thử cuối: bảng ô của nó (ô 0, 1) nằm ở dải ô thấp mà nhiều thiết bị khác cũng dùng. */
const THU_TU = ["3kg-frecon", "1kg-bus", "auto-board"];

const CHIPS = {
  "1a86:7523": "CH340", "1a86:7522": "CH340", "1a86:5523": "CH341", "1a86:5512": "CH341",
  "1a86:55d4": "CH9102", "1a86:55d3": "CH9102",
  "10c4:ea60": "CP2102", "10c4:ea61": "CP2102", "10c4:ea63": "CP2102",
  "10c4:ea70": "CP2105", "10c4:ea71": "CP2105",
  "067b:2303": "PL2303", "067b:2304": "PL2303", "067b:23a3": "PL2303", "067b:23b3": "PL2303",
  "067b:23c3": "PL2303", "067b:23d3": "PL2303", "067b:aaa2": "PL2303",
  "0403:6001": "FTDI", "0403:6010": "FTDI", "0403:6011": "FTDI", "0403:6014": "FTDI",
  "0403:6015": "FTDI",
};
/* Lọc hộp thoại chọn cổng của Chrome về đúng các chip máy rang hay dùng — khách đỡ phải đoán. */
const LOC = [...new Set(Object.keys(CHIPS).map((k) => k.split(":")[0]))]
  .map((v) => ({ usbVendorId: parseInt(v, 16) }));

const COMPORT_RE = /^COM\d{1,3}$/;
const DEM_TOI_DA = 4096;
const NHO = "otl-artisan-connector";        // khoá localStorage

const BUOC = [
  ["cap", "DÒ CÁP", "Tìm cáp USB–RS485 đã cắm vào máy tính"],
  ["cong", "DÒ CỔNG COM", "Thử từng cổng đã được cấp quyền"],
  ["duong", "DÒ TỐC ĐỘ · MODBUS", "Thử tốc độ và kiểu khung cho tới khi máy trả lời, rồi nhận ra là máy nào"],
  ["aset", "TẠO TỆP CHO ARTISAN", "Sinh tệp .aset đúng máy và đúng đường nối vừa dò"],
  ["kiem", "KIỂM TRA LẠI", "Chờ tới khi Artisan thật sự giữ cổng COM"],
];

let cong = null, dangChay = false, dungLai = false, ketQua = null, dangCho = false;
const tt = {};        // trạng thái từng bước

/* ── Nhớ giữa các lần mở trang ──────────────────────────────────────────── */
function docNho() {
  try { return JSON.parse(localStorage.getItem(NHO) || "{}") || {}; } catch (e) { return {}; }
}

function ghiNho(them) {
  try { localStorage.setItem(NHO, JSON.stringify(Object.assign(docNho(), them))); } catch (e) { /* chế độ ẩn danh */ }
}

/* ── Khung Modbus, viết tay (hàm 3, đọc một ô) ──────────────────────────── */
function crc16(b) {
  let c = 0xFFFF;
  for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = (c & 1) ? (c >> 1) ^ 0xA001 : c >> 1; }
  return c;
}

function thanKhung(slave, reg) { return [slave, 3, reg >> 8, reg & 255, 0, 1]; }

function khungRtu(slave, reg) {
  const b = thanKhung(slave, reg), c = crc16(b);
  return new Uint8Array([...b, c & 255, c >> 8]);
}

function khungAscii(slave, reg) {
  const b = thanKhung(slave, reg);
  let l = 0; for (const x of b) l = (l + x) & 255;
  const hex = [...b, (0x100 - l) & 255].map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join("");
  return new TextEncoder().encode(":" + hex + "\r\n");
}

/* Dò khung ở MỌI vị trí: dây RS485 hay sinh một byte rác lúc đổi chiều, bắt đúng byte đầu mới chịu
   đọc thì mất khung tốt nằm ngay sau nó. */
function doKhungRtu(b, slave) {
  for (let i = 0; i + 7 <= b.length; i++) {
    if (b[i] !== slave || b[i + 1] !== 3 || b[i + 2] !== 2) continue;
    const c = crc16(b.slice(i, i + 5));
    if (b[i + 5] !== (c & 255) || b[i + 6] !== (c >> 8)) continue;
    return soCoDau(b[i + 3], b[i + 4]);
  }
  return null;
}

function doKhungAscii(b, slave) {
  const s = new TextDecoder("latin1").decode(b);
  const i = s.indexOf(":"), j = s.indexOf("\r\n", i);
  if (i < 0 || j < 0) return null;
  const hex = s.slice(i + 1, j);
  if (hex.length !== 12 || /[^0-9A-Fa-f]/.test(hex)) return null;
  const by = []; for (let k = 0; k < 12; k += 2) by.push(parseInt(hex.slice(k, k + 2), 16));
  if (by[0] !== slave || by[1] !== 3 || by[2] !== 2) return null;
  let l = 0; for (const x of by.slice(0, 5)) l = (l + x) & 255;
  if (by[5] !== ((0x100 - l) & 255)) return null;
  return soCoDau(by[3], by[4]);
}

function soCoDau(hi, lo) { const v = (hi << 8) | lo; return v >= 0x8000 ? v - 0x10000 : v; }

/* ── Đọc cổng: MỘT reader cho cả lần mở cổng ────────────────────────────── */
function moDem(c) {
  const st = { dem: [], reader: c.readable.getReader() };
  st.vong = (async () => {
    try {
      for (;;) {
        const { value, done } = await st.reader.read();
        if (done) break;
        // Nối từng byte, không dùng push(...value): mảng đối số dài làm tràn ngăn xếp.
        if (value) for (const x of value) { if (st.dem.length < DEM_TOI_DA) st.dem.push(x); }
      }
    } catch (e) { /* cổng đóng giữa lúc đọc — bình thường */ }
  })();
  return st;
}

async function dongDem(st) {
  try { await st.reader.cancel(); } catch (e) { /* đã đóng */ }
  try { st.reader.releaseLock(); } catch (e) { /* đã nhả */ }
  await st.vong;
}

function nghi(ms) { return new Promise((r) => setTimeout(r, ms)); }

function hanDay(soByte, baud) { return Math.min(1200, Math.round((soByte * 2 * 11 * 1000) / baud) + 220); }
/* Nhịp ngắn cho ô mở đầu của vòng quét sâu: hằng bù 220 ms nhân 48 tổ hợp chiếm gần hết thời gian chờ,
   mà thiết bị thật đáp trong vài ms. */
function hanNgan(soByte, baud) { return Math.min(500, Math.round((soByte * 2 * 11 * 1000) / baud) + 60); }

async function choByte(st, soByte, han) {
  const het = Date.now() + han;
  while (st.dem.length < soByte && Date.now() < het) await nghi(4);
  return new Uint8Array(st.dem.splice(0, st.dem.length));
}

async function docO(st, c, slave, reg, mode, han, lap) {
  const khung = mode === "rtu" ? khungRtu(slave, reg) : khungAscii(slave, reg);
  const soByte = mode === "rtu" ? 7 : 17;
  for (let i = 0; i < Math.max(1, lap); i++) {
    st.dem.length = 0;
    const w = c.writable.getWriter();
    try { await w.write(khung); } finally { w.releaseLock(); }
    const tl = await choByte(st, soByte, han);
    const gt = mode === "rtu" ? doKhungRtu(tl, slave) : doKhungAscii(tl, slave);
    if (gt !== null) return { gt, dau: tl.length ? tl[0] : null };
    if (i + 1 >= Math.max(1, lap)) return { gt: null, dau: tl.length ? tl[0] : null };
  }
  return { gt: null, dau: null };
}

/* Ô mở đầu: nhịp ngắn trước, chỉ chờ lại bằng nhịp đầy đủ khi ĐÁNG chờ — byte đầu đúng bằng địa chỉ
   slave vừa gọi. Chờ lại mỗi khi nghe thấy byte bất kỳ thì dây RS485 hở (nhiễu) làm lưới an toàn kích
   ở MỌI lần thử, gấp đôi thời gian chờ đúng ở trường hợp hay gặp nhất. */
async function docMoDau(st, c, slave, reg, mode, baud, ngan, lap) {
  const soByte = mode === "rtu" ? 7 : 17;
  if (!ngan) return (await docO(st, c, slave, reg, mode, hanDay(soByte, baud), lap)).gt;
  const r = await docO(st, c, slave, reg, mode, hanNgan(soByte, baud), 1);
  if (r.gt !== null) return r.gt;
  const mong = mode === "ascii" ? ":".charCodeAt(0) : slave;
  if (r.dau !== mong) return null;
  return (await docO(st, c, slave, reg, mode, hanDay(soByte, baud), 1)).gt;
}

/* ── Nhận ra là máy nào ──────────────────────────────────────────────────── */
function trongKhoang(v, k) { return v >= k[0] && v <= k[1]; }

function slaveCanThu(p, daTim) {
  if (p.theoSlave) return daTim[p.theoSlave] !== undefined ? [daTim[p.theoSlave]] : [p.slave];
  const ds = p.quet || [p.slave];
  const tru = p.khacSlave ? daTim[p.khacSlave] : undefined;
  const loc = ds.filter((x) => x !== tru);
  return loc.length ? loc : ds;
}

async function thuMotMay(st, c, may, mode, baud, lap) {
  const doc = {}, slave = {};
  let coTraLoi = false, imCot = false;
  for (const p of may.probe) {
    let gt = null;
    for (const sl of slaveCanThu(p, slave)) {
      const soByte = mode === "rtu" ? 7 : 17;
      const r = await docO(st, c, sl, p.reg, mode, hanDay(soByte, baud), p.cot ? lap : 1);
      if (r.dau !== null) coTraLoi = true;
      if (r.gt === null) continue;
      coTraLoi = true;
      if (trongKhoang(r.gt, p.range)) { gt = r.gt; slave[p.ten] = sl; break; }
      if (gt === null) gt = r.gt;
    }
    if (gt === null) { if (p.cot) imCot = true; continue; }
    doc[p.ten] = gt;
  }
  if (!coTraLoi) return null;
  const cot = may.probe.filter((p) => p.cot);
  const dung = (p) => doc[p.ten] !== undefined && trongKhoang(doc[p.ten], p.range)
    && slave[p.ten] !== undefined;
  // Điểm = số ô đọc đúng khoảng, KỂ CẢ ô phụ: máy 1 kg và 3 kg có BT/ET trùng hệt, chỉ tách được
  // bằng ô biến tần. Bỏ qua điểm là nhận nhầm máy này thành máy kia.
  return { chac: !imCot && cot.every(dung), doc, slave, diem: may.probe.filter(dung).length };
}

/* Các (slave, ô) cần hỏi để biết "đường này có ai trả lời không" — một ô cốt lõi mỗi máy, BỎ TRÙNG.
   Máy 3 kg và máy 1 kg đều mở đầu bằng (slave 1, ô 4096). */
function oMoDau(quetSlave) {
  const ra = [];
  for (const id of THU_TU) {
    const p = MAY[id].probe.find((x) => x.cot);
    for (const sl of (quetSlave ? (p.quet || [p.slave]) : [p.slave])) {
      if (!ra.some((o) => o[0] === sl && o[1] === p.reg)) ra.push([sl, p.reg]);
    }
  }
  return ra;
}

async function thuToHop(c, baud, parity, stopBits, mode, { ngan = false, quetSlave = false, lap = 1 } = {}) {
  await c.open({ baudRate: baud, dataBits: 8, parity, stopBits, bufferSize: 512, flowControl: "none" });
  // Hạ DTR/RTS: bo kiểu Arduino/ESP32 hiểu DTR lên cao là lệnh khởi động lại.
  try { await c.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { /* cáp không hỗ trợ */ }
  const st = moDem(c);
  try {
    await nghi(60);
    let ngheThay = false;
    for (const [sl, reg] of oMoDau(quetSlave)) {
      const gt = quetSlave
        ? (await docO(st, c, sl, reg, mode, hanNgan(mode === "rtu" ? 7 : 17, baud), lap)).gt
        : await docMoDau(st, c, sl, reg, mode, baud, ngan, lap);
      if (gt !== null) { ngheThay = true; break; }
    }
    if (!ngheThay) return null;
    const chung = { baud, parity: KY_HIEU[parity], stopbits: stopBits, mode };
    const chacDs = [];
    let ganDung = null;
    for (const id of THU_TU) {
      const r = await thuMotMay(st, c, MAY[id], mode, baud, lap);
      if (!r) continue;
      Object.assign(r, chung, { mayId: id });
      if (r.chac) chacDs.push(r); else if (!ganDung) ganDung = r;
    }
    if (!chacDs.length) return ganDung;
    const cao = Math.max(...chacDs.map((x) => x.diem));
    const top = chacDs.filter((x) => x.diem === cao);
    // Hoà điểm: chỉ đọc được BT/ET, không ô nào tách được hai kiểu máy ⇒ KHÔNG đoán, hỏi người dùng.
    if (top.length > 1) return Object.assign({}, top[0], { moHo: top });
    return top[0];
  } finally {
    await dongDem(st);
    try { await c.close(); } catch (e) { /* đã đóng */ }
  }
}

/* ── Vẽ trang ───────────────────────────────────────────────────────────── */
function el(tag, cls, chu) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (chu !== undefined) e.textContent = chu;
  return e;
}

const NHAN_TT = { cho: "CHỜ", dang: "ĐANG CHẠY", xong: "XONG", canh: "CẦN XEM", loi: "LỖI", bo: "BỎ QUA" };

function veBuoc() {
  const k = $("wbuoc");
  k.textContent = "";
  BUOC.forEach(([ma, ten, mota], i) => {
    const b = tt[ma] || {};
    const row = el("div", "row");
    row.dataset.tt = b.tt || "cho";
    row.appendChild(el("div", "so", String(i + 1).padStart(2, "0")));
    const giua = el("div");
    giua.appendChild(el("h2", null, ten));
    giua.appendChild(el("div", "ct", b.ct || mota));
    row.appendChild(giua);
    row.appendChild(el("div", "tt", NHAN_TT[b.tt || "cho"]));
    k.appendChild(row);
  });
}

function dat(ma, trangThai, chiTiet) {
  tt[ma] = { tt: trangThai, ct: chiTiet };
  veBuoc();
}

/* Một chỗ duy nhất viết lên dải báo — để không có hai chỗ tranh nhau nói. */
function bao(chu, buoc, loai) {
  const b = $("wbao-buoc");
  b.hidden = !buoc;
  if (buoc) b.textContent = buoc;
  $("wbao-chu").textContent = chu;
  $("wbao").className = "bao" + (loai ? " " + loai : "");
}

function tenChip(c) {
  const i = c && c.getInfo ? c.getInfo() : {};
  if (i.usbVendorId === undefined) return "cổng trên bo mạch chủ (không qua USB)";
  const ma = i.usbVendorId.toString(16).padStart(4, "0") + ":" + i.usbProductId.toString(16).padStart(4, "0");
  return CHIPS[ma] ? CHIPS[ma] + " · " + ma : "chip lạ · " + ma;
}

function hoi(tieu, noi, ds) {
  $("whoi-tieu").textContent = tieu;
  $("whoi-noi").textContent = noi;
  const nut = $("whoi-nut");
  nut.textContent = "";
  ds.forEach((m) => {
    const b = el("button", "btn");
    b.type = "button";
    b.appendChild(el("b", null, m.ten));
    if (m.phu) b.appendChild(el("span", null, m.phu));
    b.onclick = () => { $("whoi").hidden = true; m.chon(); };
    nut.appendChild(b);
  });
  $("whoi").hidden = false;
}

/* ── Bước 1–2: tìm cáp ──────────────────────────────────────────────────── */
/* Trình duyệt KHÔNG cho liệt kê cổng. Nhưng cổng nào đã được cấp quyền một lần thì getPorts() trả về
   mãi mãi — nên từ lần thứ hai trở đi khách không phải bấm chọn gì nữa. Đó là chỗ "thông minh" duy
   nhất có thật ở đây; đừng hứa hơn. */
async function timCap() {
  dat("cap", "dang", "Đang xem có cáp nào đã cấp quyền cho trang này chưa");
  let ds = await navigator.serial.getPorts();
  if (!ds.length) {
    dat("cap", "dang", "Lần đầu dùng: Chrome sẽ hỏi bạn chọn cáp — chọn một lần, lần sau tự nhớ");
    bao("Chrome đang hỏi chọn cáp — chọn cổng mang tên cáp (CH340, CP2102, PL2303, FTDI…).", "BƯỚC 1/5");
    try {
      await navigator.serial.requestPort({ filters: LOC });
    } catch (e) {
      // Lọc theo chip mà không thấy gì thì mở rộng ra mọi cổng: có xưởng dùng cáp lạ.
      // ⚠ Hỏng cả hai lần thì KHÔNG được thoát sớm ở đây — phải rơi xuống nhánh "không thấy cổng nào"
      //   bên dưới, chỗ bật hướng dẫn driver. Thoát sớm là bỏ mặc khách với một dòng chữ cụt.
      try { await navigator.serial.requestPort(); } catch (e2) { /* rơi xuống dưới */ }
    }
    try { ds = await navigator.serial.getPorts(); } catch (e) { ds = []; }
  }
  if (!ds.length) {
    // Hộp thoại Chrome rỗng (hoặc khách bấm Huỷ vì chẳng có gì để chọn) gần như luôn là một việc:
    // Windows chưa nhận cáp, tức thiếu driver. Trang KHÔNG cài được driver — nói thẳng và chỉ chỗ.
    dat("cap", "loi", "Không thấy cổng COM nào — Windows có thể chưa nhận cáp (thiếu driver)");
    $("wdriver").hidden = false;
    $("wdriver").scrollIntoView({ block: "nearest" });
    return [];
  }
  $("wdriver").hidden = true;
  dat("cap", "xong", ds.length === 1 ? "Có 1 cáp: " + tenChip(ds[0])
    : "Có " + ds.length + " cáp đã cấp quyền");
  return ds;
}

/* ── Bước 3: dò đường + nhận máy ────────────────────────────────────────── */
async function doMotCong(c, baoTien) {
  const nho = docNho();
  const uu = [];
  if (nho.link) uu.push([nho.link.baud, NGUOC[nho.link.parity] || "none", nho.link.stopbits, nho.link.mode]);
  // Xuất xưởng của MỌI kiểu máy, không chỉ của kiểu đầu danh sách: máy auto chạy 57600, hai kiểu
  // kia 9600. Thiếu 57600 ở đây là máy auto phải chờ hết vòng quét sâu mới ra.
  // ⚠ Giữ khớp với otl_cable_serial.to_hop_dau bên bản .exe.
  for (const id of THU_TU) {
    const lk = MAY[id].link;
    if (!uu.some(([b, p, st, m]) => b === lk.baud && p === lk.parity && st === lk.stopbits && m === lk.mode)) {
      uu.push([lk.baud, lk.parity, lk.stopbits, lk.mode]);
    }
  }
  if (!uu.some(([b, p, st, m]) => b === 9600 && p === "none" && st === 1 && m === "ascii")) {
    uu.push([9600, "none", 1, "ascii"]);   // vài máy cũ đặt ASCII
  }
  let ganDung = null;
  const thu = async (baud, parity, stopBits, mode, opt) => {
    if (dungLai) return null;
    baoTien(baud, parity, stopBits, mode);
    try { return await thuToHop(c, baud, parity, stopBits, mode, opt); } catch (e) {
      try { await c.close(); } catch (e2) { /* đã đóng */ }
      if (e && (e.name === "InvalidStateError" || /open|access|busy|denied/i.test(String(e.message)))) throw e;
      return null;
    }
  };
  // Vòng 1 — đường nối lần trước + thiết lập xuất xưởng, hỏi lại 2 lần mỗi ô.
  for (const [b, p, s, m] of uu) {
    const r = await thu(b, p, s, m, { lap: 2 });
    if (r && (r.chac || r.moHo)) return r;
    if (r && !ganDung) ganDung = r;
  }
  // Vòng 2 — quét đủ 48 tổ hợp, ô mở đầu dùng nhịp chờ ngắn.
  for (const mode of MODES) {
    for (const baud of BAUDS) {
      for (const [parity, stopBits] of FRAMES) {
        if (uu.some(([b, p, s, m]) => b === baud && p === parity && s === stopBits && m === mode)) continue;
        const r = await thu(baud, parity, stopBits, mode, { ngan: true });
        if (r && (r.chac || r.moHo)) return r;
        if (r && !ganDung) ganDung = r;
      }
    }
  }
  if (ganDung) return ganDung;
  // Vòng 3 — quét slave: máy đã bị đổi địa chỉ từ HMI.
  for (const baud of BAUDS_QUET) {
    const r = await thu(baud, "none", 1, "rtu", { quetSlave: true });
    if (r && (r.chac || r.moHo)) return r;
    if (r && !ganDung) ganDung = r;
  }
  return ganDung;
}

/* ── Bước 4: tệp .aset ──────────────────────────────────────────────────── */
function datKhoa(dong, muc, khoa, gt) {
  let d = -1, c = -1;
  for (let i = 0; i < dong.length; i++) {
    const s = dong[i].trim();
    if (s === "[" + muc + "]") { d = i; continue; }
    if (d >= 0 && s.startsWith("[")) { c = i; break; }
  }
  if (d < 0) return;
  if (c < 0) c = dong.length;
  for (let i = d + 1; i < c; i++) {
    if (dong[i].split("=")[0].trim() === khoa) { dong[i] = khoa + "=" + gt; return; }
  }
  dong.splice(c, 0, khoa + "=" + gt);
}

function oVao(dong) {
  const ra = [];
  let d = -1, c = dong.length;
  for (let i = 0; i < dong.length; i++) {
    const s = dong[i].trim();
    if (s === "[Modbus]") { d = i; continue; }
    if (d >= 0 && s.startsWith("[")) { c = i; break; }
  }
  if (d < 0) return ra;
  for (let i = d + 1; i < c; i++) {
    const m = /^input(\d+)register=(-?\d+)\s*$/.exec(dong[i]);
    if (m) ra.push([parseInt(m[1], 10), parseInt(m[2], 10)]);
  }
  return ra;
}

/* Ghi slave ĐÃ DÒ ĐƯỢC vào inputNdeviceId — bo CMS đổi slave id từ HMI được, và tệp .aset thật của
   máy 1 kg không ghi deviceId nào, nên ghi cứng một con số vào mẫu là đoán. */
function ghiSlave(dong, may, slave) {
  if (!slave) return 0;
  const o = oVao(dong);
  let da = 0;
  if (may.motSlave) {
    const chung = slave[may.probe[0].ten];
    if (chung === undefined) return 0;
    for (const [n] of o) { datKhoa(dong, "Modbus", "input" + n + "deviceId", chung); da++; }
    return da;
  }
  const con = o.slice();
  for (const p of may.probe) {
    const sl = slave[p.ten];
    if (sl === undefined) continue;
    const k = con.findIndex(([, reg]) => reg === p.reg);
    if (k < 0) continue;
    datKhoa(dong, "Modbus", "input" + con[k][0] + "deviceId", sl);
    con.splice(k, 1);
    da++;
  }
  return da;
}

/* ⛔ BẢN SAO của `ap_chuan` trong otl_aset.py — sửa một bên phải sửa cả bên kia (bài kiểm giữ cả hai).

   1) Artisan 4.x bỏ hẳn khoảng nghỉ giữa hai khung Modbus (`sleepBetween()` chỉ còn `pass`) và truyền
      thẳng số lần thử lại xuống pymodbus 3.7. Tệp .aset đời Artisan 2.x ghi serial_readRetries=0 nên
      bản 4.x bắn đúng MỘT khung; rớt một khung là cả lượt quét dừng giữa chừng (mọi slave chung một
      khối try) ⇒ slave đầu còn số, các slave sau về 0.0. Khách gặp đúng lỗi này 03/11/2026.
   2) Hiện đủ bốn đường ET · BT · RoR ET · RoR BT, cả nét vẽ lẫn ô số.
   3) Làm mượt gấp 5 lần mặc định. Artisan lưu số lẻ, ô giao diện = (số lưu − 1) / 2: đường cong mặc
      định lưu 3 ⇒ giao diện 1 ⇒ ×5 = 5 ⇒ lưu 11; RoR mặc định lưu 7 ⇒ giao diện 3 ⇒ ×5 = 15 ⇒ lưu 31. */
const MUOT = 5;
const muot = (macDinh) => Math.floor((macDinh - 1) / 2) * MUOT * 2 + 1;
const CHUAN = {
  General: { ETcurve: "true", BTcurve: "true", ETlcd: "true", BTlcd: "true", curvefilter: muot(3) },
  RoC: { DeltaET: "true", DeltaBT: "true", DeltaETlcd: "true", DeltaBTlcd: "true",
         deltaETfilter: muot(7), deltafilter: muot(7) },
  Modbus: { timeout: "0.5", serial_readRetries: "2", modbus_serial_connect_delay: "0.5" },
};

function apChuan(dong) {
  for (const muc of Object.keys(CHUAN)) {
    for (const [khoa, gt] of Object.entries(CHUAN[muc])) datKhoa(dong, muc, khoa, gt);
  }
  return dong;
}

async function taiAset() {
  if (!ketQua) return;
  const ten = ($("wcom").value || "").trim().toUpperCase();
  if (!COMPORT_RE.test(ten)) {
    bao("Tên cổng phải là chữ COM kèm số, ví dụ COM3. Tên đó nằm ngay trong hộp thoại chọn cổng của "
      + "Chrome, hoặc trong Device Manager của Windows.", "BƯỚC 4/5", "loi");
    $("wcom").focus();
    return;
  }
  const may = MAY[ketQua.mayId];
  let mau;
  try {
    const r = await fetch("mau-" + may.template + ".aset");
    if (!r.ok) throw new Error("HTTP " + r.status);
    mau = await r.text();
  } catch (e) {
    dat("aset", "loi", "Không tải được tệp mẫu: " + e.message);
    bao("Không tải được tệp mẫu .aset: " + e.message, "BƯỚC 4/5", "loi");
    return;
  }
  const dong = mau.split(/\r?\n/);
  datKhoa(dong, "Modbus", "type", ketQua.mode === "ascii" ? 1 : 0);   // 0 = Serial RTU · 1 = ASCII
  datKhoa(dong, "Modbus", "comport", ten);
  datKhoa(dong, "Modbus", "baudrate", ketQua.baud);
  datKhoa(dong, "Modbus", "bytesize", 8);
  datKhoa(dong, "Modbus", "parity", ketQua.parity);
  datKhoa(dong, "Modbus", "stopbits", ketQua.stopbits);
  ghiSlave(dong, may, ketQua.slave);
  apChuan(dong);
  const blob = new Blob([dong.join("\r\n") + "\r\n"], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "OTL-" + may.template + "-" + ten + ".aset";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  ghiNho({ com: ten, link: { baud: ketQua.baud, parity: ketQua.parity, stopbits: ketQua.stopbits, mode: ketQua.mode } });
  dat("aset", "xong", "Đã tải tệp " + a.download);
  choArtisan();
}

/* ── Bước 5: chờ Artisan GIỮ cổng ───────────────────────────────────────── */
/* Mẹo giống bản .exe: không đọc hộ nhiệt độ (làm thế là giành cổng của Artisan). Chỉ thử MỞ cổng —
   mở không được nữa nghĩa là phần mềm khác đang cầm nó, mà lúc này phần mềm đó là Artisan. */
async function choArtisan() {
  if (dangCho) return;
  dangCho = true;
  dat("kiem", "dang", "Bấm đúp vào tệp vừa tải — Artisan sẽ mở. Trang này đang chờ…");
  bao("Bấm đúp vào tệp .aset vừa tải. Artisan mở ra là xong — trang tự nhận ra, không cần làm gì thêm.",
    "BƯỚC 5/5");
  const het = Date.now() + 180000;            // chờ tối đa 3 phút rồi thôi, đừng quay mãi
  while (Date.now() < het && dangCho) {
    await nghi(2000);
    let moDuoc = false;
    try {
      await cong.open({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 });
      moDuoc = true;
      await cong.close();
    } catch (e) { moDuoc = false; }
    if (!moDuoc) {
      dangCho = false;
      dat("kiem", "xong", "Artisan đang giữ cổng — đã nối xong");
      bao("Xong. Artisan đang đọc máy rang — bạn không cần làm gì thêm.", null, "xong");
      return;
    }
  }
  if (dangCho) {
    dangCho = false;
    dat("kiem", "canh", "Chưa thấy Artisan cầm cổng. Mở tệp .aset rồi thử lại.");
    bao("Chưa thấy Artisan giữ cổng. Bấm đúp tệp .aset vừa tải; nếu Artisan đã mở sẵn thì đóng rồi "
      + "mở lại bằng chính tệp đó.", null, "loi");
  }
}

/* ── Chuỗi chính — một nút ──────────────────────────────────────────────── */
function xongDo(r, c) {
  ketQua = r;
  cong = c;
  const may = MAY[r.mayId];
  dat("duong", "xong", may.ten + " · " + r.baud + " bps · 8" + r.parity + r.stopbits + " · "
    + r.mode.toUpperCase());
  const so = $("wket-so");
  so.textContent = "";
  const o = (nhan, gt) => {
    const d = el("div", "o");
    d.appendChild(el("b", null, String(gt)));
    d.appendChild(el("span", null, nhan));
    so.appendChild(d);
  };
  o("TỐC ĐỘ", r.baud);
  o("KHUNG", "8" + r.parity + r.stopbits);
  o("KIỂU", r.mode.toUpperCase());
  for (const ten of Object.keys(r.doc)) o(ten, r.doc[ten]);
  $("wket-may").textContent = may.ten;
  const sl = Object.keys(r.slave || {}).map((k) => k + " slave " + r.slave[k]).join(" · ");
  $("wket-chip").textContent = "Cáp: " + tenChip(c) + (sl ? " — " + sl : "");
  $("wket").hidden = false;
  $("wtai").disabled = false;
  const nho = docNho();
  if (nho.com && COMPORT_RE.test(nho.com)) $("wcom").value = nho.com;
  // Đã biết tên cổng từ lần trước ⇒ TỰ tải tệp luôn. Trình duyệt không cho trang web biết cổng tên
  // là gì (getInfo() chỉ có VID/PID), nên lần ĐẦU vẫn phải hỏi một lần; từ lần sau thì không.
  if (nho.com && COMPORT_RE.test(nho.com)) {
    dat("aset", "dang", "Đang tạo tệp cho Artisan (" + nho.com + ", nhớ từ lần trước)");
    bao("Nhận ra " + may.ten + " — đang tạo tệp cho Artisan…", "BƯỚC 4/5", "xong");
    taiAset();
    return;
  }
  dat("aset", "dang", "Điền tên cổng rồi bấm TẢI TỆP CHO ARTISAN");
  bao("Nhận ra " + may.ten + ". Còn một việc: điền tên cổng — lần đầu thôi, lần sau trang tự nhớ.",
    "BƯỚC 4/5", "xong");
}

async function chay() {
  if (dangChay) { dungLai = true; dangCho = false; bao("Đang dừng…"); return; }
  dungLai = false; ketQua = null; dangCho = false;
  for (const [ma] of BUOC) delete tt[ma];
  veBuoc();
  $("wket").hidden = true; $("whoi").hidden = true; $("wtai").disabled = true;
  dangChay = true;
  $("wgo").textContent = "DỪNG";
  $("wgo").classList.add("dang");
  $("wprog").hidden = false;
  try {
    const ds = await timCap();
    if (!ds.length) {
      bao("Không thấy cổng COM nào. Windows có thể chưa nhận cáp — xem phần hướng dẫn driver bên dưới.",
        "BƯỚC 1/5", "loi");
      return;
    }
    dat("cong", "dang", "Đang thử " + ds.length + " cổng");
    const tong = ds.length * (MODES.length * BAUDS.length * FRAMES.length + BAUDS_QUET.length + 2);
    let i = 0;
    let ganDung = null, loiMo = null;
    for (let k = 0; k < ds.length; k++) {
      if (dungLai) break;
      const c = ds[k];
      const baoTien = (baud, parity, stopBits, mode) => {
        i++;
        $("wthanh").style.width = Math.round((i / tong) * 100) + "%";
        bao("Cổng " + (k + 1) + "/" + ds.length + " · " + baud + " bps · 8" + KY_HIEU[parity] + stopBits
          + " · " + mode.toUpperCase(), "BƯỚC 3/5");
        dat("duong", "dang", "Đang thử " + baud + " bps · 8" + KY_HIEU[parity] + stopBits + " · "
          + mode.toUpperCase());
      };
      let r = null;
      try { r = await doMotCong(c, baoTien); } catch (e) { loiMo = e; continue; }
      if (r && r.moHo) {
        dat("cong", "xong", "Cáp: " + tenChip(c));
        dat("duong", "canh", "Máy trả lời đúng nhưng chưa tách được là kiểu máy nào");
        bao("Máy đã trả lời — còn một bước: chọn đúng kiểu máy bên dưới.", "BƯỚC 3/5");
        hoi("CHƯA TÁCH ĐƯỢC LÀ KIỂU MÁY NÀO",
          "Hai kiểu máy này đọc nhiệt độ ở cùng một chỗ, chỉ khác nhau ở phần biến tần mà biến tần "
          + "đang không chạy. Chọn đúng máy của bạn.",
          r.moHo.map((m) => ({
            ten: MAY[m.mayId].ten,
            phu: Object.keys(m.doc).map((kk) => kk + " " + m.doc[kk]).join(" · "),
            chon: () => xongDo(m, c),
          })));
        return;
      }
      if (r && r.chac) {
        dat("cong", "xong", "Cáp: " + tenChip(c));
        xongDo(r, c);
        return;
      }
      if (r && !ganDung) { ganDung = r; ganDung._cong = c; }
    }
    if (dungLai) { bao("Đã dừng."); return; }
    if (ganDung) {
      dat("cong", "xong", "Cáp: " + tenChip(ganDung._cong));
      dat("duong", "canh", "Có thiết bị trả lời ở " + ganDung.baud + " bps nhưng số đọc không giống máy rang");
      bao("Có thiết bị trả lời ở " + ganDung.baud + " bps nhưng số đọc không giống máy rang O Tesla "
        + "nào. Kiểm lại xem có đúng cổng của máy rang không.", "BƯỚC 3/5", "loi");
      return;
    }
    if (loiMo) {
      dat("duong", "loi", "Không mở được cổng: " + loiMo.message);
      bao("Không mở được cổng: " + loiMo.message + ". Artisan hoặc phần mềm khác đang giữ cổng này "
        + "thì đóng nó rồi dò lại.", "BƯỚC 3/5", "loi");
      return;
    }
    dat("duong", "loi", "Không máy nào trả lời");
    bao("Không máy nào trả lời. Kiểm cáp RS485 (hai dây A/B có thể đang đấu ngược), máy rang đã bật "
      + "nguồn chưa, và có đúng là cổng này không.", null, "loi");
  } catch (e) {
    bao("Lỗi: " + e.message, null, "loi");
  } finally {
    dangChay = false;
    $("wgo").textContent = "DÒ LẠI";
    $("wgo").classList.remove("dang");
    $("wgo").classList.add("lai");
    $("wprog").hidden = true;
    $("wthanh").style.width = "0";
  }
}

/* ── Hai tab ────────────────────────────────────────────────────────────── */
function doiTab(id) {
  for (const [t, p] of [["tab-do", "panel-do"], ["tab-tai", "panel-tai"]]) {
    const chon = t === id;
    $(t).setAttribute("aria-selected", String(chon));
    $(p).hidden = !chon;
  }
  try { location.hash = id === "tab-tai" ? "#tai" : "#do"; } catch (e) { /* trình duyệt chặn */ }
}

/* ── Khởi động ──────────────────────────────────────────────────────────── */
veBuoc();
$("tab-do").onclick = () => doiTab("tab-do");
$("tab-tai").onclick = () => doiTab("tab-tai");
$("wdriver-exe").onclick = () => { doiTab("tab-tai"); window.scrollTo({ top: 0 }); };

if (!("serial" in navigator)) {
  // Điện thoại và Safari không có Web Serial ⇒ mở thẳng tab tải, đừng bắt khách bấm nút không chạy.
  $("wkhong").hidden = false;
  $("wkhoi").hidden = true;
  doiTab("tab-tai");
} else {
  $("wgo").onclick = chay;
  $("wtai").onclick = taiAset;
  const nho = docNho();
  if (nho.com && COMPORT_RE.test(nho.com)) $("wcom").value = nho.com;
  // Đã cấp quyền cáp từ lần trước ⇒ CHẠY LUÔN khi mở trang. Không bắt bấm thêm một nút vô nghĩa:
  // mọi thứ cần hỏi đã hỏi xong ở lần đầu rồi. Lần đầu (chưa có cáp nào) thì vẫn phải bấm, vì
  // requestPort() của trình duyệt chỉ mở được từ một cú bấm thật của người dùng.
  navigator.serial.getPorts().then((ds) => {
    if (!ds.length) return;
    bao("Đã nhớ " + ds.length + " cáp từ lần trước — đang dò, bạn không phải làm gì.");
    if (location.hash !== "#tai") chay();
  }).catch(() => { /* không hỏi được thì thôi */ });

  // Cắm cáp vào giữa chừng thì dò lại luôn, khỏi bắt bấm.
  navigator.serial.addEventListener("connect", () => { if (!dangChay) chay(); });
  doiTab(location.hash === "#tai" ? "tab-tai" : "tab-do");
}

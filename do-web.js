/* Dò đường nối Modbus NGAY TRONG TRÌNH DUYỆT, bằng Web Serial API (Chrome/Edge trên máy tính, HTTPS).
   Làm được: mở cổng COM người dùng chọn, thử tốc độ · khung · RTU/ASCII, DÒ RA LÀ MÁY NÀO (1 kg,
   3 kg hay bản auto), dò luôn địa chỉ slave, đọc BT/ET, rồi xuất tệp .aset đã vá đúng máy.
   KHÔNG làm được (và không cố làm): cài driver, tự liệt kê cổng, tự mở Artisan, kiểm Artisan giữ cổng
   — bốn việc đó trình duyệt bị cấm, nên vẫn phải dùng bản .exe. Xem phần giải thích trên trang.

   Bảng ô đọc và cách chấm điểm GIỮ GIỐNG bản .exe (tools/otl_cable_may.py, otl_cable_serial.py).
   Sửa một bên thì sửa cả bên kia, không thì hai bản nhận ra hai máy khác nhau trên cùng một dây.

   Chữ dựng bằng textContent, không bao giờ bằng innerHTML: tên thiết bị do Windows đặt không được
   thành thẻ HTML. */
"use strict";

const $ = (id) => document.getElementById(id);

/* Thứ tự thử: giống bản .exe — xuất xưởng của máy (9600 8N1 RTU) nằm đầu. */
const BAUDS = [9600, 19200, 38400, 57600, 115200, 4800];
const BAUDS_QUET = [9600, 19200, 38400];      // vòng quét slave chỉ ở ba tốc độ O Tesla xuất xưởng
const FRAMES = [["none", 1], ["even", 1], ["odd", 1], ["none", 2]];   // bytesize luôn 8
const MODES = ["rtu", "ascii"];
const KY_HIEU = { none: "N", even: "E", odd: "O" };

/* Nhiệt độ là số THÔ trong thanh ghi. Hai hệ chia cùng tồn tại:
     · máy đọc thẳng bus (3 kg, 1 kg): 25 = 25 °C
     · bo CMS (máy auto): firmware giữ ×10, 1850 = 185,0 °C
   Hai khoảng phải RỜI NHAU ở đầu trên mới phân biệt được hệ chia. */
const TEMP_OK = [-20, 700];
const TEMP_X10 = [-200, 7000];
const BIEN_TAN = [0, 20000];

const MAY = {
  "3kg-frecon": {
    ten: "OTL 3 kg (bản Frecon)", template: "3kg-frecon", motSlave: false,
    probe: [
      { slave: 1, reg: 4096, ten: "BT", range: TEMP_OK, cot: true },
      { slave: 2, reg: 4096, ten: "ET", range: TEMP_OK, cot: true },
      { slave: 4, reg: 12288, ten: "Gió", range: BIEN_TAN, cot: false },
      { slave: 5, reg: 12288, ten: "Trống", range: BIEN_TAN, cot: false },
    ],
  },
  "1kg-bus": {
    ten: "OTL 1 kg (đọc thẳng bus)", template: "1kg-bus", motSlave: false,
    probe: [
      { slave: 1, quet: [1, 2, 3, 4, 5, 6, 7], reg: 4096, ten: "BT", range: TEMP_OK, cot: true },
      { slave: 2, quet: [2, 3, 4, 5, 6, 7, 1], reg: 4096, ten: "ET", range: TEMP_OK, cot: true,
        khacSlave: "BT" },
      { slave: 3, quet: [3, 4, 5, 2, 1], reg: 8451, ten: "Biến tần", range: BIEN_TAN, cot: false },
    ],
  },
  "auto-board": {
    ten: "OTL bản AUTO (bo CMS)", template: "auto-board", motSlave: true,
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
const COMPORT_RE = /^COM\d{1,3}$/;
const DEM_TOI_DA = 4096;      // thiết bị nói liên tục thì chặn ở đây, đừng để đệm phình vô hạn

let cong = null, dangChay = false, dungLai = false, ketQua = null;

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

/* Trả về số đọc được, hoặc null nếu khung sai / CRC-LRC sai / không đủ byte.
   Dò khung ở MỌI vị trí, không chỉ ở byte đầu: dây RS485 hay sinh một byte rác lúc đổi chiều, và
   bắt đúng byte đầu mới chịu đọc thì mất khung tốt nằm ngay sau nó. */
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

/* ── Đọc cổng: MỘT reader cho cả lần mở cổng ────────────────────────────────
   Không gọi reader.cancel() để hết giờ: cancel đóng luôn luồng đọc, lần sau không đọc được nữa.
   Nên vòng đọc chạy nền dồn byte vào đệm, chỗ chờ chỉ ngó đệm. */
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

/* Thời gian chờ ĐẦY ĐỦ, tính theo tốc độ truyền — như bản .exe. */
function hanDay(soByte, baud) { return Math.min(1200, Math.round((soByte * 2 * 11 * 1000) / baud) + 220); }
/* Thời gian chờ NGẮN cho ô mở đầu của vòng quét sâu: chỉ cần biết "có ai trên đường này không".
   Hằng bù 220 ms nhân với 48 tổ hợp chiếm gần hết thời gian chờ; thiết bị thật đáp trong vài ms. */
function hanNgan(soByte, baud) { return Math.min(500, Math.round((soByte * 2 * 11 * 1000) / baud) + 60); }

async function choByte(st, soByte, han) {
  const het = Date.now() + han;
  while (st.dem.length < soByte && Date.now() < het) await nghi(4);
  return new Uint8Array(st.dem.splice(0, st.dem.length));
}

/* ── Đọc một ô ───────────────────────────────────────────────────────────── */
async function docO(st, slave, reg, mode, baud, han, lap) {
  const khung = mode === "rtu" ? khungRtu(slave, reg) : khungAscii(slave, reg);
  const soByte = mode === "rtu" ? 7 : 17;
  for (let i = 0; i < Math.max(1, lap); i++) {
    st.dem.length = 0;
    const w = cong.writable.getWriter();
    try { await w.write(khung); } finally { w.releaseLock(); }
    const tl = await choByte(st, soByte, han);
    const gt = mode === "rtu" ? doKhungRtu(tl, slave) : doKhungAscii(tl, slave);
    if (gt !== null) return { gt, dau: tl.length ? tl[0] : null };
    if (i + 1 >= Math.max(1, lap)) return { gt: null, dau: tl.length ? tl[0] : null };
  }
  return { gt: null, dau: null };
}

/* Ô mở đầu: nhịp ngắn trước, và chỉ chờ lại bằng nhịp đầy đủ khi ĐÁNG chờ — byte đầu đúng bằng địa chỉ
   slave vừa gọi, tức đang là khung trả lời dở. Chờ lại mỗi khi nghe thấy byte bất kỳ thì trên dây RS485
   hở (chưa có máy, chưa có điện trở đầu cuối) nhiễu làm lưới an toàn kích ở MỌI lần thử, gấp đôi thời
   gian chờ đúng ở trường hợp hay gặp nhất. */
async function docMoDau(st, slave, reg, mode, baud, ngan, lap) {
  const soByte = mode === "rtu" ? 7 : 17;
  if (!ngan) return (await docO(st, slave, reg, mode, baud, hanDay(soByte, baud), lap)).gt;
  const r = await docO(st, slave, reg, mode, baud, hanNgan(soByte, baud), 1);
  if (r.gt !== null) return r.gt;
  const mong = mode === "ascii" ? ":".charCodeAt(0) : slave;
  if (r.dau !== mong) return null;
  return (await docO(st, slave, reg, mode, baud, hanDay(soByte, baud), 1)).gt;
}

/* ── Nhận ra là máy nào ──────────────────────────────────────────────────── */
function trongKhoang(v, k) { return v >= k[0] && v <= k[1]; }

/* Các slave cần thử cho một ô:
     · theoSlave: ô này nằm trên CÙNG thiết bị với ô kia (bo CMS đăng cả dải ô trên một slave);
     · quet: dò lần lượt, bỏ slave đã thuộc về ô mà khacSlave trỏ tới (BT và ET của máy đọc thẳng bus
       là hai thiết bị khác nhau, cùng số ô — không bỏ thì ET nhận đúng slave của BT). */
function slaveCanThu(p, daTim) {
  if (p.theoSlave) return daTim[p.theoSlave] !== undefined ? [daTim[p.theoSlave]] : [p.slave];
  const ds = p.quet || [p.slave];
  const tru = p.khacSlave ? daTim[p.khacSlave] : undefined;
  const loc = ds.filter((x) => x !== tru);
  return loc.length ? loc : ds;
}

async function thuMotMay(st, may, mode, baud, lap) {
  const doc = {}, slave = {};
  let coTraLoi = false, imCot = false;
  for (const p of may.probe) {
    let gt = null;
    for (const sl of slaveCanThu(p, slave)) {
      const soByte = mode === "rtu" ? 7 : 17;
      const r = await docO(st, sl, p.reg, mode, baud, hanDay(soByte, baud), p.cot ? lap : 1);
      if (r.dau !== null) coTraLoi = true;
      if (r.gt === null) continue;
      coTraLoi = true;
      if (trongKhoang(r.gt, p.range)) { gt = r.gt; slave[p.ten] = sl; break; }
      if (gt === null) gt = r.gt;         // có số nhưng lạc khoảng — giữ để báo "cần xem"
    }
    if (gt === null) { if (p.cot) imCot = true; continue; }
    doc[p.ten] = gt;
  }
  if (!coTraLoi) return null;
  const cot = may.probe.filter((p) => p.cot);
  const chac = !imCot && cot.every((p) => doc[p.ten] !== undefined
    && trongKhoang(doc[p.ten], p.range) && slave[p.ten] !== undefined);
  // Điểm = số ô đọc được ĐÚNG KHOẢNG, kể cả ô phụ. Dùng để tách hai kiểu máy có cùng ô BT/ET:
  // máy 1 kg và máy 3 kg chỉ khác nhau ở ô biến tần, bỏ qua điểm là nhận nhầm máy này thành máy kia.
  const diem = may.probe.filter((p) => doc[p.ten] !== undefined
    && trongKhoang(doc[p.ten], p.range) && slave[p.ten] !== undefined).length;
  return { chac, doc, slave, diem };
}

/* Các (slave, ô) cần hỏi để biết "đường này có ai trả lời không" — một ô cốt lõi mỗi máy, BỎ TRÙNG.
   Máy 3 kg và máy 1 kg đều mở đầu bằng (slave 1, ô 4096); không bỏ trùng là chờ thừa một nhịp. */
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

/* ── Thử một tổ hợp ────────────────────────────────────────────────────────── */
async function thuToHop(baud, parity, stopBits, mode, { ngan = false, quetSlave = false, lap = 1 } = {}) {
  await cong.open({ baudRate: baud, dataBits: 8, parity, stopBits, bufferSize: 512, flowControl: "none" });
  // Hạ DTR/RTS: board nào tự nạp lại khi DTR lên cao thì sẽ không bị reset giữa lúc dò.
  try { await cong.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { /* cáp không hỗ trợ */ }
  const st = moDem(cong);
  try {
    await nghi(60);                     // để bus im một nhịp trước khi gửi khung đầu
    let ngheThay = false;
    for (const [sl, reg] of oMoDau(quetSlave)) {
      const gt = quetSlave
        ? (await docO(st, sl, reg, mode, baud, hanNgan(mode === "rtu" ? 7 : 17, baud), lap)).gt
        : await docMoDau(st, sl, reg, mode, baud, ngan, lap);
      if (gt !== null) { ngheThay = true; break; }
    }
    if (!ngheThay) return null;
    const chung = { baud, parity: KY_HIEU[parity], stopbits: stopBits, mode };
    const chacDs = [];
    let ganDung = null;
    for (const id of THU_TU) {
      const r = await thuMotMay(st, MAY[id], mode, baud, lap);
      if (!r) continue;
      Object.assign(r, chung, { mayId: id });
      if (r.chac) chacDs.push(r);
      else if (!ganDung) ganDung = r;
    }
    if (!chacDs.length) return ganDung;
    const cao = Math.max(...chacDs.map((x) => x.diem));
    const top = chacDs.filter((x) => x.diem === cao);
    // Hoà điểm thật: chỉ đọc được BT/ET, không ô nào tách được hai kiểu máy. KHÔNG đoán — hai kiểu máy
    // dùng hai tệp .aset khác nhau, đoán sai là khách nhận sai bảng ô đọc.
    if (top.length > 1) return Object.assign({}, top[0], { moHo: top });
    return top[0];
  } finally {
    await dongDem(st);
    try { await cong.close(); } catch (e) { /* đã đóng */ }
  }
}

/* ── Chuỗi dò ──────────────────────────────────────────────────────────────── */
function bao(chu, loai) {
  $("wbao").className = "bao" + (loai ? " " + loai : "");
  $("wbao-chu").textContent = chu;
}

function tenChip() {
  const i = cong && cong.getInfo ? cong.getInfo() : {};
  if (i.usbVendorId === undefined) return "cổng trên bo mạch chủ (không qua USB)";
  const ma = i.usbVendorId.toString(16).padStart(4, "0") + ":" + i.usbProductId.toString(16).padStart(4, "0");
  return CHIPS[ma] ? CHIPS[ma] + " · " + ma : "chip lạ · " + ma;
}

async function doHet() {
  const tong = BAUDS.length * FRAMES.length * MODES.length + BAUDS_QUET.length;
  let i = 0;
  const buoc = async (baud, parity, stopBits, mode, opt, nhan) => {
    i++;
    $("wthanh").style.width = Math.round((i / tong) * 100) + "%";
    bao(`${nhan} ${baud} bps · 8${KY_HIEU[parity]}${stopBits} · ${mode.toUpperCase()} — ${i}/${tong}`);
    return thuToHop(baud, parity, stopBits, mode, opt);
  };
  let ganDung = null;
  // Vòng 1 — thiết lập xuất xưởng, hỏi lại 2 lần mỗi ô.
  for (const mode of MODES) {
    for (const baud of [9600]) {
      for (const [parity, stopBits] of [["none", 1]]) {
        if (dungLai) return null;
        const r = await buoc(baud, parity, stopBits, mode, { lap: 2 }, "Đang thử");
        if (r && r.chac) return r;
        if (r && !ganDung) ganDung = r;
      }
    }
  }
  // Vòng 2 — quét đủ 48 tổ hợp, ô mở đầu dùng nhịp chờ ngắn.
  for (const mode of MODES) {
    for (const baud of BAUDS) {
      for (const [parity, stopBits] of FRAMES) {
        if (dungLai) return null;
        if (mode === "rtu" && baud === 9600 && parity === "none" && stopBits === 1) continue;
        if (mode === "ascii" && baud === 9600 && parity === "none" && stopBits === 1) continue;
        const r = await buoc(baud, parity, stopBits, mode, { ngan: true }, "Đang thử");
        if (r && r.chac) return r;
        if (r && !ganDung) ganDung = r;
      }
    }
  }
  if (ganDung) return ganDung;
  // Vòng 3 — quét slave: máy đã bị đổi slave id từ HMI.
  for (const baud of BAUDS_QUET) {
    if (dungLai) return null;
    const r = await buoc(baud, "none", 1, "rtu", { quetSlave: true }, "Đang dò địa chỉ máy ở");
    if (r && r.chac) return r;
    if (r && !ganDung) ganDung = r;
  }
  return ganDung;
}

function veKetQua(kq) {
  const so = $("wket-so");
  so.textContent = "";
  const o = (nhan, gt) => {
    const d = document.createElement("div"); d.className = "o";
    const b = document.createElement("b"); b.textContent = String(gt);
    const s = document.createElement("span"); s.textContent = nhan;
    d.appendChild(b); d.appendChild(s); so.appendChild(d);
  };
  o("TỐC ĐỘ", kq.baud);
  o("KHUNG", "8" + kq.parity + kq.stopbits);
  o("KIỂU", kq.mode.toUpperCase());
  for (const ten of Object.keys(kq.doc)) o(ten, kq.doc[ten]);
  $("wket-may").textContent = MAY[kq.mayId].ten;
  const sl = Object.keys(kq.slave || {}).map((k) => `${k} slave ${kq.slave[k]}`).join(" · ");
  $("wket-chip").textContent = "Cáp: " + tenChip() + (sl ? " — " + sl : "");
  $("wket").hidden = false;
}

/* Chưa tách được kiểu máy: KHÔNG chọn hộ. Hai kiểu máy dùng hai tệp .aset khác nhau. */
function veChonMay(ds) {
  const nut = $("whoi-nut");
  nut.textContent = "";
  $("whoi-noi").textContent = "Máy trả lời đúng nhưng chưa tách được là kiểu máy nào — hai kiểu này "
    + "đọc nhiệt độ ở cùng một chỗ, chỉ khác nhau ở phần biến tần mà biến tần đang không chạy. "
    + "Chọn đúng máy của bạn.";
  ds.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn";
    const t = document.createElement("b"); t.textContent = MAY[m.mayId].ten;
    const s = document.createElement("span");
    s.textContent = Object.keys(m.doc).map((k) => `${k} ${m.doc[k]}`).join(" · ");
    b.appendChild(t); b.appendChild(s);
    b.onclick = () => {
      $("whoi").hidden = true;
      ketQua = m;
      veKetQua(m);
      $("wtai").disabled = false;
      bao(`Đã chọn ${MAY[m.mayId].ten}. Điền tên cổng rồi tải tệp .aset.`, "xong");
    };
    nut.appendChild(b);
  });
  $("whoi").hidden = false;
}

async function chay() {
  if (dangChay) { dungLai = true; bao("Đang dừng…"); return; }
  dungLai = false; ketQua = null;
  $("wket").hidden = true; $("whoi").hidden = true; $("wtai").disabled = true;
  try {
    cong = await navigator.serial.requestPort();
  } catch (e) {
    bao("Chưa chọn cổng nào.");                       // người dùng bấm Huỷ trong hộp thoại Chrome
    return;
  }
  dangChay = true;
  $("wgo").textContent = "DỪNG";
  $("wgo").classList.add("dang");
  $("wprog").hidden = false;
  try {
    const r = await doHet();
    if (r && r.moHo) {
      veChonMay(r.moHo);
      bao("Máy đã trả lời — còn một bước: chọn đúng kiểu máy bên dưới.");
    } else if (r && r.chac) {
      ketQua = r;
      veKetQua(r);
      bao(`Nhận ra ${MAY[r.mayId].ten} ở ${r.baud} bps · 8${r.parity}${r.stopbits} · `
        + r.mode.toUpperCase() + ".", "xong");
      $("wtai").disabled = false;
    } else if (r) {
      bao(`Có thiết bị trả lời ở ${r.baud} bps nhưng số đọc không giống máy rang O Tesla nào. `
        + "Kiểm lại xem có đúng cổng của máy rang không.", "loi");
    } else if (dungLai) {
      bao("Đã dừng.");
    } else {
      bao("Không máy nào trả lời trên cổng này. Kiểm cáp RS485 (hai dây A/B có thể đang đấu ngược), "
        + "máy rang đã bật nguồn chưa, và có đúng là cổng này không.", "loi");
    }
  } catch (e) {
    bao("Không mở được cổng: " + e.message + ". Artisan hoặc phần mềm khác đang giữ cổng này thì "
      + "đóng nó rồi dò lại.", "loi");
  } finally {
    dangChay = false;
    $("wgo").textContent = "CHỌN CỔNG & DÒ LẠI";
    $("wgo").classList.remove("dang");
    $("wprog").hidden = true;
    $("wthanh").style.width = "0";
  }
}

/* ── Xuất tệp .aset ────────────────────────────────────────────────────────── */
/* Đặt một khoá trong ĐÚNG một mục của tệp .aset (kiểu INI của Qt). Hai mục [SerialPort] và [Modbus]
   đều có khoá comport/baudrate — sửa sai mục là Artisan nối bằng thông số cũ. */
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

/* [(số thứ tự input, ô nhớ)] theo đúng thứ tự ghi trong mục [Modbus]. */
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

async function taiAset() {
  if (!ketQua) return;
  const ten = ($("wcom").value || "").trim().toUpperCase();
  if (!COMPORT_RE.test(ten)) {
    bao("Tên cổng phải là chữ COM kèm số, ví dụ COM3. Tên đó nằm ngay trong hộp thoại chọn cổng của "
      + "Chrome, hoặc trong Device Manager của Windows.", "loi");
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
    bao("Không tải được tệp mẫu .aset: " + e.message, "loi");
    return;
  }
  const dong = mau.split(/\r?\n/);
  datKhoa(dong, "Modbus", "type", ketQua.mode === "ascii" ? 1 : 0);   // 0 = Serial RTU · 1 = Serial ASCII
  datKhoa(dong, "Modbus", "comport", ten);
  datKhoa(dong, "Modbus", "baudrate", ketQua.baud);
  datKhoa(dong, "Modbus", "bytesize", 8);
  datKhoa(dong, "Modbus", "parity", ketQua.parity);
  datKhoa(dong, "Modbus", "stopbits", ketQua.stopbits);
  ghiSlave(dong, may, ketQua.slave);
  const blob = new Blob([dong.join("\r\n") + "\r\n"], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "OTL-" + may.template + "-" + ten + "-" + ketQua.baud + "-" + ketQua.mode + ".aset";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  bao("Đã tải tệp .aset cho " + may.ten + ". Bấm đúp vào tệp đó — Artisan tự mở và nhận đúng thông số. "
    + "Đóng trang này trước đã: trang web và Artisan không giữ cùng một cổng COM được.", "xong");
}

/* ── Khởi động ─────────────────────────────────────────────────────────────── */
if (!("serial" in navigator)) {
  $("wkhong").hidden = false;
  $("wkhoi").hidden = true;
} else {
  $("wgo").onclick = chay;
  $("wtai").onclick = taiAset;
  $("wcom").addEventListener("input", () => { $("wtai").disabled = !ketQua; });
}

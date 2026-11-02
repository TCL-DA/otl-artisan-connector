/* Dò đường nối Modbus NGAY TRONG TRÌNH DUYỆT, bằng Web Serial API (Chrome/Edge trên máy tính, HTTPS).
   Làm được: mở cổng COM người dùng chọn, thử tốc độ · khung · RTU/ASCII, đọc BT/ET, xuất tệp .aset.
   KHÔNG làm được (và không cố làm): cài driver, tự liệt kê cổng, tự mở Artisan, kiểm Artisan giữ cổng
   — bốn việc đó trình duyệt bị cấm, nên vẫn phải dùng bản .exe. Xem phần giải thích trên trang.

   Chữ dựng bằng textContent, không bao giờ bằng innerHTML: tên thiết bị do Windows đặt không được
   thành thẻ HTML. */
"use strict";

const $ = (id) => document.getElementById(id);

/* Thứ tự thử: giống bản .exe — xuất xưởng của máy (9600 8N1 RTU) nằm đầu. */
const BAUDS = [9600, 19200, 38400, 57600, 115200, 4800];
const FRAMES = [["none", 1], ["even", 1], ["odd", 1], ["none", 2]];   // bytesize luôn 8
const MODES = ["rtu", "ascii"];
const KY_HIEU = { none: "N", even: "E", odd: "O" };
/* Bảng ô đọc của OTL 3 kg bản Frecon. Phải đọc được CẢ HAI ô mới coi là chắc. */
const O_DOC = [{ slave: 1, reg: 4096, ten: "BT" }, { slave: 2, reg: 4096, ten: "ET" }];
const NHIET_MIN = -20, NHIET_MAX = 700;
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
const DEM_TOI_DA = 4096;      // thiết bị nói liên tục thì chặn ở đây, đừng để đệm phình vô hạn

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

/* Chờ đủ byte hoặc hết giờ. Thời gian chờ tính theo tốc độ truyền, như bản .exe. */
async function choByte(st, soByte, baud) {
  const han = Math.min(1200, Math.round((soByte * 2 * 11 * 1000) / baud) + 220);
  const het = Date.now() + han;
  while (st.dem.length < soByte && Date.now() < het) await nghi(5);
  return new Uint8Array(st.dem.splice(0, st.dem.length));
}

/* ── Thử một tổ hợp ────────────────────────────────────────────────────────── */
async function thuToHop(baud, parity, stopBits, mode) {
  await cong.open({ baudRate: baud, dataBits: 8, parity, stopBits, bufferSize: 512, flowControl: "none" });
  // Hạ DTR/RTS: board nào tự nạp lại khi DTR lên cao thì sẽ không bị reset giữa lúc dò.
  try { await cong.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { /* cáp không hỗ trợ */ }
  const st = moDem(cong);
  const doc = {};
  try {
    await nghi(60);                     // để bus im một nhịp trước khi gửi khung đầu
    for (const o of O_DOC) {
      const khung = mode === "rtu" ? khungRtu(o.slave, o.reg) : khungAscii(o.slave, o.reg);
      const soByte = mode === "rtu" ? 7 : 17;
      let gt = null;
      for (let lan = 0; lan < 2 && gt === null; lan++) {   // khung đầu hay rụng — thử lại một lần
        st.dem.length = 0;
        const w = cong.writable.getWriter();
        try { await w.write(khung); } finally { w.releaseLock(); }
        const tl = await choByte(st, soByte, baud);
        gt = mode === "rtu" ? doKhungRtu(tl, o.slave) : doKhungAscii(tl, o.slave);
      }
      if (gt === null || gt < NHIET_MIN || gt > NHIET_MAX) return null;
      doc[o.ten] = gt;
    }
  } finally {
    await dongDem(st);
    try { await cong.close(); } catch (e) { /* đã đóng */ }
  }
  return { baud, parity: KY_HIEU[parity], stopbits: stopBits, mode, doc };
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
  const tong = BAUDS.length * FRAMES.length * MODES.length;
  let i = 0;
  for (const mode of MODES) {
    for (const baud of BAUDS) {
      for (const [parity, stopBits] of FRAMES) {
        if (dungLai) return null;
        i++;
        $("wthanh").style.width = Math.round((i / tong) * 100) + "%";
        bao("Đang thử " + baud + " bps · 8" + KY_HIEU[parity] + stopBits + " · " + mode.toUpperCase()
          + " — tổ hợp " + i + "/" + tong);
        let kq = null;
        try { kq = await thuToHop(baud, parity, stopBits, mode); }
        catch (e) {
          try { await cong.close(); } catch (e2) { /* đã đóng */ }
          // Cổng bị Artisan hay phần mềm khác giữ thì mọi tổ hợp đều hỏng — nói thẳng, đừng thử tiếp.
          if (e.name === "InvalidStateError" || /open|access|busy|denied/i.test(String(e.message))) throw e;
        }
        if (kq) return kq;
      }
    }
  }
  return null;
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
  o("BT °C", kq.doc.BT);
  o("ET °C", kq.doc.ET);
  $("wket-chip").textContent = "Cáp: " + tenChip();
  $("wket").hidden = false;
}

async function chay() {
  if (dangChay) { dungLai = true; bao("Đang dừng…"); return; }
  dungLai = false; ketQua = null;
  $("wket").hidden = true; $("wtai").disabled = true;
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
    ketQua = await doHet();
    if (ketQua) {
      veKetQua(ketQua);
      bao("Máy trả lời ở " + ketQua.baud + " bps · 8" + ketQua.parity + ketQua.stopbits + " · "
        + ketQua.mode.toUpperCase() + ".", "xong");
      $("wtai").disabled = false;
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

async function taiAset() {
  if (!ketQua) return;
  const ten = ($("wcom").value || "").trim().toUpperCase();
  if (!COMPORT_RE.test(ten)) {
    bao("Tên cổng phải là chữ COM kèm số, ví dụ COM3. Tên đó nằm ngay trong hộp thoại chọn cổng của "
      + "Chrome, hoặc trong Device Manager của Windows.", "loi");
    $("wcom").focus();
    return;
  }
  let mau;
  try {
    const r = await fetch("mau-3kg-frecon.aset");
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
  const blob = new Blob([dong.join("\r\n") + "\r\n"], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "OTL-3kg-Frecon-" + ten + "-" + ketQua.baud + "-" + ketQua.mode + ".aset";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  bao("Đã tải tệp .aset. Bấm đúp vào tệp đó — Artisan tự mở và nhận đúng thông số. Đóng trang này "
    + "trước đã: trang web và Artisan không giữ cùng một cổng COM được.", "xong");
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

/* Kiểm phần tính toán thuần của do-web.js bằng Node:  node --test test-do-web.mjs
   Phần DOM và Web Serial không kiểm ở đây — phải bấm thử bằng Chrome trên máy có cáp thật. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* Nạp mã nguồn, cắt khối "Khởi động" ở cuối (khối đó cần DOM), rồi lôi các hàm ra. */
const src = readFileSync(new URL("./do-web.js", import.meta.url), "utf8");
const moc = '/* ── Khởi động';
assert.ok(src.includes(moc), "do-web.js phải còn khối Khởi động");
const than = src.slice(0, src.indexOf(moc));
const lay = ["crc16", "khungRtu", "khungAscii", "doKhungRtu", "doKhungAscii", "soCoDau",
  "datKhoa", "oVao", "ghiSlave", "slaveCanThu", "oMoDau", "trongKhoang", "hanDay", "hanNgan",
  "COMPORT_RE", "BAUDS", "FRAMES", "MODES", "MAY", "THU_TU", "TEMP_OK", "TEMP_X10",
  "apChuan", "CHUAN", "muot", "chuanCom", "comDaNho", "tenTepAset"];
const M = new Function(than + "\nreturn {" + lay.join(",") + "};")();

/* Tệp mẫu: sau khi dựng trang thì nằm cạnh đây tên "mau-<máy>.aset"; chạy test thẳng trong kho
   mã thì chưa dựng, lùi về tệp gốc trong tools/. Cùng một nội dung, dung.py chỉ đổi tên. */
function docMau(ten) {
  for (const u of [new URL(`./mau-${ten}.aset`, import.meta.url),
                   new URL(`../otl_artisan_${ten.replace(/-/g, "_")}.aset`, import.meta.url)]) {
    try { return readFileSync(u, "utf8"); } catch { /* thử nơi kế tiếp */ }
  }
  throw new Error("không thấy tệp mẫu " + ten);
}

const hex = (u8) => [...u8].map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join("");
const crcCua = (b) => M.crc16(b);

test("CRC-16/Modbus đúng với khung trong sách", () => {
  // Khung chuẩn: slave 1, hàm 3, ô 0, một ô  →  01 03 00 00 00 01 84 0A
  assert.equal(hex(M.khungRtu(1, 0)), "010300000001840A");
});

test("khung RTU đọc ô BT của máy 3 kg (slave 1, ô 4096)", () => {
  const k = M.khungRtu(1, 4096);
  assert.equal(k.length, 8);
  assert.equal(hex(k).slice(0, 12), "010310000001");
});

test("đọc trả lời RTU hợp lệ ra đúng nhiệt độ", () => {
  const than = [1, 3, 2, 0, 185];                 // 185 °C
  const c = M.crc16(than);
  const tl = new Uint8Array([...than, c & 255, c >> 8]);
  assert.equal(M.doKhungRtu(tl, 1), 185);
});

test("trả lời RTU sai CRC, sai slave, hay thiếu byte đều bị loại", () => {
  const than = [1, 3, 2, 0, 185];
  const c = M.crc16(than);
  assert.equal(M.doKhungRtu(new Uint8Array([...than, (c & 255) ^ 1, c >> 8]), 1), null, "CRC sai");
  assert.equal(M.doKhungRtu(new Uint8Array([...than, c & 255, c >> 8]), 2), null, "slave khác");
  assert.equal(M.doKhungRtu(new Uint8Array(than), 1), null, "thiếu byte CRC");
  assert.equal(M.doKhungRtu(new Uint8Array([]), 1), null, "im lặng");
});

test("khung tốt nằm sau byte rác vẫn đọc được", () => {
  const than = [1, 3, 2, 0, 200];
  const c = crcCua(than);
  const tl = new Uint8Array([0x00, 0xFF, ...than, c & 255, c >> 8]);
  assert.equal(M.doKhungRtu(tl, 1), 200);
});

test("nhiệt độ âm đọc ra số có dấu", () => {
  const than = [1, 3, 2, 0xFF, 0xF8];             // -8
  const c = M.crc16(than);
  assert.equal(M.doKhungRtu(new Uint8Array([...than, c & 255, c >> 8]), 1), -8);
});

test("khung ASCII có dấu hai chấm, LRC và CRLF", () => {
  const s = new TextDecoder().decode(M.khungAscii(1, 4096));
  assert.ok(s.startsWith(":"), "phải mở bằng :");
  assert.ok(s.endsWith("\r\n"), "phải đóng bằng CRLF");
  assert.equal(s.length, 1 + 14 + 2);
  // LRC = phần bù 2 của tổng các byte
  const by = s.slice(1, 15).match(/../g).map((h) => parseInt(h, 16));
  const tong = by.slice(0, 6).reduce((a, b) => (a + b) & 255, 0);
  assert.equal(by[6], (0x100 - tong) & 255);
});

test("đọc trả lời ASCII hợp lệ, và loại trả lời sai LRC", () => {
  const by = [2, 3, 2, 0, 200];
  const l = (0x100 - by.reduce((a, b) => (a + b) & 255, 0)) & 255;
  const lam = (lrc) => new TextEncoder().encode(":"
    + [...by, lrc].map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join("") + "\r\n");
  assert.equal(M.doKhungAscii(lam(l), 2), 200);
  assert.equal(M.doKhungAscii(lam((l ^ 1) & 255), 2), null, "LRC sai");
  assert.equal(M.doKhungAscii(lam(l), 1), null, "slave khác");
  assert.equal(M.doKhungAscii(new TextEncoder().encode(":rác\r\n"), 2), null, "không phải hex");
});

test("datKhoa chỉ sửa mục [Modbus], không chạm [SerialPort]", () => {
  const d = ["[SerialPort]", "comport=COM1", "baudrate=115200", "", "[Modbus]", "comport=COM1",
    "baudrate=9600", "", "[Alarms]", "x=1"];
  M.datKhoa(d, "Modbus", "comport", "COM7");
  M.datKhoa(d, "Modbus", "baudrate", 38400);
  assert.equal(d[1], "comport=COM1", "[SerialPort] phải nguyên vẹn");
  assert.equal(d[2], "baudrate=115200");
  assert.equal(d[5], "comport=COM7");
  assert.equal(d[6], "baudrate=38400");
});

test("datKhoa thêm khoá còn thiếu vào đúng cuối mục", () => {
  const d = ["[Modbus]", "comport=COM1", "", "[Alarms]", "x=1"];
  M.datKhoa(d, "Modbus", "type", 1);
  assert.deepEqual(d, ["[Modbus]", "comport=COM1", "", "type=1", "[Alarms]", "x=1"]);
  assert.equal(d.indexOf("type=1") < d.indexOf("[Alarms]"), true);
});

test("datKhoa bỏ qua mục không có, không làm hỏng tệp", () => {
  const d = ["[Modbus]", "comport=COM1"];
  M.datKhoa(d, "KhongCo", "a", 1);
  assert.deepEqual(d, ["[Modbus]", "comport=COM1"]);
});

test("tên cổng COM: chỉ nhận COM kèm 1–3 số", () => {
  for (const t of ["COM1", "COM3", "COM256"]) assert.ok(M.COMPORT_RE.test(t), t);
  for (const t of ["", "COM", "COM0012", "COM3; rm", "/dev/ttyUSB0", "com3", "COM3 "])
    assert.ok(!M.COMPORT_RE.test(t), t + " phải bị loại");
});

test("ô tên cổng: gõ kiểu nào cũng ra COMn — số trần, chữ thường, dán nguyên dòng Chrome", () => {
  const dung = { "5": "COM5", " 12 ": "COM12", "com5": "COM5", "COM 7": "COM7", "Com09": "COM9",
    "USB-SERIAL CH340 (COM5)": "COM5", "USB-SERIAL CH340 (COM5) - Paired": "COM5", "COM256": "COM256" };
  for (const [vao, ra] of Object.entries(dung)) assert.equal(M.chuanCom(vao), ra, vao);
  for (const xau of ["", "COM", "COM0", "0", "COM257", "COM1234", "abc", "5a", "COM3; rm -rf", null, undefined]) {
    const r = M.chuanCom(xau);
    assert.ok(r === "" || (r === "COM3" && String(xau).startsWith("COM3;")), String(xau) + " → " + r);
  }
  // Ra gì thì cũng phải lọt cửa COMPORT_RE — tệp .aset không bao giờ nhận chuỗi lạ.
  for (const vao of Object.keys(dung)) assert.ok(M.COMPORT_RE.test(M.chuanCom(vao)), vao);
});

test("nhớ cổng THEO TỪNG CÁP, không đem COM cáp này gán cho cáp kia", () => {
  const nho = { com: "COM9", comTheoCap: { "1a86:7523": "COM5", "067b:2303": "COM9" } };
  assert.equal(M.comDaNho(nho, "1a86:7523"), "COM5");
  assert.equal(M.comDaNho(nho, "067b:2303"), "COM9");
  assert.equal(M.comDaNho(nho, "10c4:ea60"), "", "cáp lạ: không đoán bằng số của cáp khác");
  // Dữ liệu cũ chỉ có một `com` chung: vẫn dùng, khỏi bắt khách cũ gõ lại.
  assert.equal(M.comDaNho({ com: "COM3" }, "1a86:7523"), "COM3");
  assert.equal(M.comDaNho({}, "1a86:7523"), "");
  assert.equal(M.comDaNho({ com: "COM3; rm" }, "1a86:7523"), "", "chuỗi bẩn trong localStorage bị loại");
});

test("tên tệp .aset: máy · cổng · đường nối · ngày — GIỐNG HỆT bản .exe", () => {
  const ngay = new Date(2026, 10, 10);               // 10/11/2026, tháng tính từ 0
  const kq = { baud: 57600, parity: "N", stopbits: 1, mode: "rtu" };
  assert.equal(M.tenTepAset(M.MAY["auto-board"], kq, "COM5", ngay),
    "OTL-AUTO-CMS_COM5_57600-8N1-RTU_2026-11-10.aset");
  assert.equal(M.tenTepAset(M.MAY["3kg-frecon"], { baud: 9600, parity: "E", stopbits: 2, mode: "ascii" },
    "COM12", new Date(2026, 0, 5)), "OTL-3kg-Frecon_COM12_9600-8E2-ASCII_2026-01-05.aset");
  assert.equal(M.tenTepAset(M.MAY["1kg-bus"], { baud: 9600, parity: "N", stopbits: 1, mode: "rtu" },
    "COM3", ngay), "OTL-1kg_COM3_9600-8N1-RTU_2026-11-10.aset");
  for (const id of M.THU_TU) {
    assert.ok(M.MAY[id].tep, id + " thiếu tên ngắn cho tệp");
    assert.match(M.tenTepAset(M.MAY[id], kq, "COM5", ngay), /^[A-Za-z0-9._-]+\.aset$/);
  }
});

test("48 tổ hợp, xuất xưởng 9600 8N1 RTU thử đầu tiên", () => {
  assert.equal(M.BAUDS.length * M.FRAMES.length * M.MODES.length, 48);
  assert.equal(M.MODES[0], "rtu");
  assert.equal(M.BAUDS[0], 9600);
  assert.deepEqual(M.FRAMES[0], ["none", 1]);
});

test("đủ ba kiểu máy, thứ tự thử giống bản .exe", () => {
  assert.deepEqual(M.THU_TU, ["3kg-frecon", "1kg-bus", "auto-board"]);
  for (const id of M.THU_TU) assert.ok(M.MAY[id].probe.length >= 2, id);
});

test("bảng ô đọc khớp bản .exe", () => {
  const bt = (id) => M.MAY[id].probe[0], et = (id) => M.MAY[id].probe[1];
  assert.equal(bt("3kg-frecon").reg, 4096);
  assert.equal(et("3kg-frecon").reg, 4096);
  assert.equal(M.MAY["3kg-frecon"].probe[2].reg, 12288);
  assert.equal(bt("1kg-bus").reg, 4096);
  assert.equal(M.MAY["1kg-bus"].probe[2].reg, 8451);
  assert.equal(bt("auto-board").reg, 0);
  assert.equal(et("auto-board").reg, 1);
  assert.equal(M.MAY["auto-board"].motSlave, true);
});

test("hai khoảng nhiệt độ rời nhau ở đầu trên", () => {
  assert.ok(M.TEMP_OK[1] < M.TEMP_X10[1]);
  assert.equal(M.TEMP_X10[1], 10 * M.TEMP_OK[1]);
});

test("ô mở đầu bỏ trùng: máy 3 kg và 1 kg cùng (slave 1, ô 4096)", () => {
  const o = M.oMoDau(false);
  assert.equal(o.length, 2, JSON.stringify(o));
  assert.ok(o.some(([s, r]) => s === 1 && r === 4096));
  assert.ok(o.some(([s, r]) => s === 1 && r === 0));
});

test("quét slave mở rộng danh sách nhưng vẫn không trùng", () => {
  const o = M.oMoDau(true);
  const khoa = o.map((x) => x.join(":"));
  assert.equal(khoa.length, new Set(khoa).size, "còn ô trùng");
  assert.ok(o.length > M.oMoDau(false).length);
});

test("ET của máy 1 kg không được nhận trùng slave của BT", () => {
  const p = M.MAY["1kg-bus"].probe[1];
  assert.equal(p.khacSlave, "BT");
  assert.ok(!M.slaveCanThu(p, { BT: 3 }).includes(3));
  assert.ok(M.slaveCanThu(p, {}).includes(3));
});

test("ô của máy auto đi theo slave của BT", () => {
  const p = M.MAY["auto-board"].probe[1];
  assert.deepEqual(M.slaveCanThu(p, { BT: 6 }), [6]);
});

test("ghiSlave máy đọc thẳng bus: hai ô cùng 4096 nhận đúng thứ tự BT rồi ET", () => {
  const d = ["[Modbus]", "input1deviceId=1", "input1register=4096",
    "input2deviceId=1", "input2register=4096",
    "input3deviceId=1", "input3register=8451", "[Alarms]"];
  assert.equal(M.ghiSlave(d, M.MAY["1kg-bus"], { BT: 3, "ET": 5, "Biến tần": 7 }), 3);
  assert.ok(d.includes("input1deviceId=3") && d.includes("input2deviceId=5"));
  assert.ok(d.includes("input3deviceId=7"));
});

test("ghiSlave máy auto áp cho MỌI ô vào", () => {
  const d = ["[Modbus]"];
  for (let i = 1; i <= 5; i++) d.push(`input${i}deviceId=1`, `input${i}register=${i - 1}`);
  d.push("[Alarms]");
  assert.equal(M.ghiSlave(d, M.MAY["auto-board"], { BT: 6, ET: 6 }), 5);
  for (let i = 1; i <= 5; i++) assert.ok(d.includes(`input${i}deviceId=6`), String(i));
});

test("nhịp chờ ngắn thật sự ngắn hơn nhịp đầy đủ", () => {
  for (const baud of M.BAUDS) assert.ok(M.hanNgan(7, baud) < M.hanDay(7, baud), String(baud));
});

test("đủ ba tệp mẫu .aset, đúng ô BT/ET của từng máy", () => {
  const mong = { "3kg-frecon": [4096, 4096], "1kg-bus": [4096, 4096], "auto-board": [0, 1] };
  for (const [ten, [bt, et]] of Object.entries(mong)) {
    const d = docMau(ten).split(/\r?\n/);
    const o = M.oVao(d);
    assert.equal(o[0][1], bt, ten);
    assert.equal(o[1][1], et, ten);
  }
});

test("vá tệp mẫu thật ra đúng sáu khoá trong [Modbus]", () => {
  const mau = docMau("3kg-frecon");
  const d = mau.split(/\r?\n/);
  for (const [k, v] of [["type", 1], ["comport", "COM7"], ["baudrate", 19200],
    ["bytesize", 8], ["parity", "E"], ["stopbits", 2]]) M.datKhoa(d, "Modbus", k, v);
  const i = d.indexOf("[Modbus]");
  const j = d.findIndex((x, n) => n > i && x.trim().startsWith("["));
  const muc = d.slice(i + 1, j < 0 ? d.length : j);
  assert.ok(muc.includes("type=1"));
  assert.ok(muc.includes("comport=COM7"));
  assert.ok(muc.includes("baudrate=19200"));
  assert.ok(muc.includes("parity=E"));
  assert.ok(muc.includes("stopbits=2"));
  // [SerialPort] giữ nguyên 115200
  const si = d.indexOf("[SerialPort]");
  const sj = d.findIndex((x, n) => n > si && x.trim().startsWith("["));
  assert.ok(d.slice(si + 1, sj).includes("baudrate=115200"), "[SerialPort] bị sửa lây");
  // tệp vá xong vẫn không chứa dấu vết máy khách
  const t = d.join("\n");
  assert.ok(!/DAKNONG/i.test(t) && !/C:\\Users/i.test(t) && !/C:\/Users/i.test(t));
});

test("mỗi kiểu máy khai thiết lập xuất xưởng, và khớp bản .exe", () => {
  const mong = { "3kg-frecon": 9600, "1kg-bus": 9600, "auto-board": 57600 };
  for (const [id, baud] of Object.entries(mong)) {
    const lk = M.MAY[id].link;
    assert.ok(lk, id + " thiếu link");
    assert.equal(lk.baud, baud, id);
    assert.equal(lk.parity, "none");
    assert.equal(lk.stopbits, 1);
    assert.equal(lk.mode, "rtu");
  }
});

test("máy auto chạy 57600 nên 57600 phải nằm trong nhúm thử đầu", () => {
  // Giữ khớp với test_vong_nhanh_thu_xuat_xuong_cua_MOI_kieu_may bên bản .exe.
  const bauds = new Set(M.THU_TU.map((id) => M.MAY[id].link.baud));
  assert.ok(bauds.has(9600) && bauds.has(57600), [...bauds].join(","));
});

/* ── Chuẩn hiển thị + độ bền đường truyền (lỗi khách gặp 03/11/2026) ──────── */

const MAY_MAU = ["3kg-frecon", "1kg-bus", "auto-board"];

function muc(dong, ten) {
  const i = dong.indexOf("[" + ten + "]");
  const j = dong.findIndex((x, n) => n > i && x.trim().startsWith("["));
  return dong.slice(i + 1, j < 0 ? dong.length : j);
}

test("làm mượt gấp đúng 5 lần mặc định Artisan", () => {
  // Artisan lưu số lẻ, ô giao diện = (số lưu − 1) / 2. Mặc định: đường cong 3 (ô 1), RoR 7 (ô 3).
  assert.equal(M.muot(3), 11, "đường cong: ô 1 → ô 5");
  assert.equal(M.muot(7), 31, "RoR: ô 3 → ô 15");
  assert.equal(M.CHUAN.General.curvefilter, 11);
  assert.equal(M.CHUAN.RoC.deltafilter, 31);
  assert.equal(M.CHUAN.RoC.deltaETfilter, 31);
});

test("apChuan ghi đủ bốn đường, bốn ô số và ba khoá Modbus, đúng mục", () => {
  for (const ten of MAY_MAU) {
    const d = docMau(ten).split(/\r?\n/);
    M.apChuan(d);
    const g = muc(d, "General"), r = muc(d, "RoC"), m = muc(d, "Modbus");
    for (const k of ["ETcurve=true", "BTcurve=true", "ETlcd=true", "BTlcd=true", "curvefilter=11"]) {
      assert.ok(g.includes(k), ten + " thiếu " + k);
    }
    for (const k of ["DeltaET=true", "DeltaBT=true", "DeltaETlcd=true", "DeltaBTlcd=true",
      "deltaETfilter=31", "deltafilter=31"]) {
      assert.ok(r.includes(k), ten + " thiếu " + k);
    }
    // serial_readRetries=0 là thứ giết lượt quét trên Artisan 4.x — không bao giờ được để 0
    for (const k of ["timeout=0.5", "serial_readRetries=2", "modbus_serial_connect_delay=0.5"]) {
      assert.ok(m.includes(k), ten + " thiếu " + k);
    }
    assert.ok(!m.includes("serial_readRetries=0"), ten + " còn retries=0");
  }
});

test("tệp mẫu .aset đã mang sẵn chuẩn, khách không phải sửa gì", () => {
  for (const ten of MAY_MAU) {
    const d = docMau(ten).split(/\r?\n/);
    for (const [tenMuc, cap] of Object.entries(M.CHUAN)) {
      const co = muc(d, tenMuc);
      for (const [k, v] of Object.entries(cap)) {
        assert.ok(co.includes(k + "=" + v), ten + " [" + tenMuc + "] " + k + " phải là " + v);
      }
    }
  }
});

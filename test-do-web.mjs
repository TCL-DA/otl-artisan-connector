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
  "datKhoa", "COMPORT_RE", "BAUDS", "FRAMES", "MODES", "O_DOC"];
const M = new Function(than + "\nreturn {" + lay.join(",") + "};")();

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

test("48 tổ hợp, xuất xưởng 9600 8N1 RTU thử đầu tiên", () => {
  assert.equal(M.BAUDS.length * M.FRAMES.length * M.MODES.length, 48);
  assert.equal(M.MODES[0], "rtu");
  assert.equal(M.BAUDS[0], 9600);
  assert.deepEqual(M.FRAMES[0], ["none", 1]);
});

test("bảng ô đọc đúng sơ đồ máy 3 kg bản Frecon", () => {
  assert.deepEqual(M.O_DOC, [{ slave: 1, reg: 4096, ten: "BT" }, { slave: 2, reg: 4096, ten: "ET" }]);
});

test("vá tệp mẫu thật ra đúng sáu khoá trong [Modbus]", () => {
  const mau = readFileSync(new URL("./mau-3kg-frecon.aset", import.meta.url), "utf8");
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

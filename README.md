# OTL Auto Artisan Connector

Phần mềm nối [Artisan](https://artisan-scope.org) với máy rang cà phê O Tesla bản cắm dây
(USB–RS485, Modbus RTU/ASCII) — một nút bấm.

**Trang tải: https://tcl-da.github.io/otl-artisan-connector/**

Bấm **KẾT NỐI**, phần mềm tự làm năm việc:

1. Dò driver cáp USB–serial (CH340, CH9102, CP210x, PL2303, FTDI), thiếu thì cài.
2. Dò cổng COM, nhận cáp theo VID:PID, bỏ qua cổng Bluetooth.
3. Dò tốc độ truyền và kiểu Modbus — 48 tổ hợp, thử thiết lập xuất xưởng và đường nối lần trước trước.
4. Tạo tệp cài đặt `.aset` rồi mở Artisan bằng chính tệp đó.
5. Chờ tới khi Artisan thật sự giữ cổng COM mới báo xong.

Máy đã hỗ trợ: **OTL 3 kg bản Frecon**.

Yêu cầu: Windows 10/11, đã cài Artisan, máy rang đang bật nguồn.

## Dò ngay trên trang, không cần tải

Trang tải còn một khối dò chạy bằng **Web Serial API** (Chrome/Edge trên máy tính). Nó làm được
đúng việc thứ 3 ở trên: mở cổng COM bạn chọn, thử 48 tổ hợp, đọc thử BT/ET, rồi cho tải tệp `.aset`.

Bốn việc kia trình duyệt bị cấm làm, nên vẫn phải dùng bản `.exe`:

| | `.exe` | Trang web |
|---|---|---|
| Tự liệt kê và xếp thứ tự cổng COM | có | không — người dùng tự chọn cổng trong hộp thoại Chrome |
| Cài driver cáp | có | không bao giờ |
| Tự mở Artisan với tệp `.aset` | có | không — chỉ tải tệp về, người dùng bấm đúp |
| Kiểm Artisan đã giữ được cổng chưa | có | không |
| Dò tốc độ · Modbus · đọc BT/ET | có | **có** |

Trang web và Artisan không giữ cùng một cổng COM được: dò xong phải đóng trang rồi mới mở Artisan.

Mã nguồn khối đó: [`do-web.js`](do-web.js). Bài kiểm: `node --test test-do-web.mjs` (15 bài — khung
Modbus RTU/ASCII và việc vá tệp `.aset`) và `python -m pytest test-trang.py -q` (5 bài — mở trang bằng
Chromium thật). Phần cổng COM thật phải bấm tay: trình duyệt tự động không được cấp quyền cổng.

---

O Tesla · 0936 198 938 · otlpro.com@gmail.com · [otlpro.com](https://otlpro.com)

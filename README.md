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

Máy đã hỗ trợ — app **tự nhận ra là máy nào**, khách không phải chọn:

| Máy | Artisan đọc ở đâu |
|---|---|
| OTL 3 kg (bản Frecon) | thẳng bus RS485: BT slave 1 ô 4096, ET slave 2 ô 4096, biến tần Frecon ô 12288 |
| OTL 1 kg | thẳng bus RS485: BT/ET ô 4096, biến tần ô 8451 |
| OTL bản AUTO | bo điều khiển CMS làm Modbus slave: BT ô 0, ET ô 1, nhiệt độ ×10 |

Địa chỉ slave được **dò trên máy thật** rồi ghi vào tệp `.aset`, không ghi cứng — bo CMS cho đổi
slave id từ HMI. Hai máy rang cùng cắm, hoặc hai kiểu máy đọc giống hệt nhau, thì app **hỏi** chứ
không đoán.

Yêu cầu: Windows 10/11, đã cài Artisan, máy rang đang bật nguồn.

## Dò ngay trên trang, không cần tải

Trang có **hai tab**: *DÒ MÁY RANG* (chạy thẳng trong Chrome/Edge trên máy tính, bằng **Web Serial
API**) và *TẢI PHẦN MỀM* (bản Windows). Điện thoại và Safari không có Web Serial nên trang tự mở
sang tab tải.

Bản web chạy đúng **năm bước** như bản `.exe`, hiện sống từng bước:

| Việc | Web | `.exe` |
|---|---|---|
| Tìm cáp đã cắm, **nhớ cáp cho lần sau** | có | có |
| Cài driver cáp khi Windows chưa nhận | **không** | có |
| Dò tốc độ · Modbus · nhận ra là máy nào · dò slave | có | có |
| Tạo tệp cài đặt `.aset` | có | có |
| Mở Artisan lên | bấm đúp | tự mở |
| Kiểm lại xem Artisan đã nối được chưa | có | có |

Hai chỗ trình duyệt bị cấm, không phần mềm web nào làm được: **cài driver** (cần quyền quản trị) và
**tự chạy Artisan**. Phần còn lại trang làm đủ — kể cả bước 5, bằng đúng mẹo của bản `.exe`: thử mở
cổng COM, mở không được nữa nghĩa là Artisan đang cầm nó.

Hai chỗ khác với bản `.exe`, do trình duyệt:

* **Lần đầu** Chrome hỏi chọn cáp một lần (hộp thoại đã lọc sẵn theo chip CH340 / CP210x / PL2303 /
  FTDI). Từ lần sau `navigator.serial.getPorts()` nhớ luôn, bấm một nút là chạy.
* Trình duyệt **không cho trang web biết cổng tên là gì** (`getInfo()` chỉ có VID/PID), nên tệp
  `.aset` cần bạn điền `COM…` một lần — trang nhớ lại cho lần sau.

Trang web và Artisan **không giữ cùng một cổng COM được**: dò xong hãy để trang yên, mở Artisan.

Mã nguồn: [`do-web.js`](do-web.js). Bài kiểm: `node --test test-do-web.mjs` (25 bài — khung Modbus
RTU/ASCII, bảng ô ba máy, vá tệp `.aset`) và `python -m pytest test-trang.py -q` (15 bài — mở trang
bằng Chromium thật, kiểm hai tab, một nút, và bố cục ở cỡ **điện thoại 390 px**: không tràn ngang,
chữ không dưới 15 px, ô chạm không dưới 40 px). Phần cổng COM thật phải bấm tay.

---|---|---|
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

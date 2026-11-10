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
| Cài driver cáp khi Windows chưa nhận | **không** — chỉ chỗ tải | **tự cài, kèm sẵn 4 bộ** |
| Dò tốc độ · Modbus · nhận ra là máy nào · dò slave | có | có |
| Tạo tệp cài đặt `.aset` | có | có |
| Mở Artisan lên | bấm đúp | tự mở |
| Kiểm lại xem Artisan đã nối được chưa | có | có |

Bản `.exe` 1.2 **kèm sẵn driver** CH340 / CH9102, CP210x, PL2303, FTDI — không tải gì từ internet,
chỉ nạp những gì nằm trong `drivers\` cạnh exe bằng `pnputil /add-driver … /install`.

Hai chỗ trình duyệt bị cấm, không phần mềm web nào làm được: **cài driver** (cần quyền quản trị) và
**tự chạy Artisan**. Phần còn lại trang làm đủ — kể cả bước 5, bằng đúng mẹo của bản `.exe`: thử mở
cổng COM, mở không được nữa nghĩa là Artisan đang cầm nó.

Hai chỗ khác với bản `.exe`, do trình duyệt:

* **Lần đầu** Chrome hỏi chọn cáp một lần (hộp thoại đã lọc sẵn theo chip CH340 / CP210x / PL2303 /
  FTDI). Từ lần sau `navigator.serial.getPorts()` nhớ luôn, bấm một nút là chạy.
* Trình duyệt **không cho trang web biết số cổng COM** (`getInfo()` chỉ có mã chip VID:PID), nên
  lần đầu bạn gõ số cổng một lần — gõ `5`, `com5` hay dán nguyên dòng Chrome hiện
  `USB-SERIAL CH340 (COM5)` đều được. Nút **XEM TÊN CỔNG** mở lại danh sách của Chrome để nhìn số.
  Trang nhớ số đó **theo từng cáp**; lần sau cắm đúng cáp đó là tự tải tệp, không hỏi nữa.
* Artisan nạp tệp xong **chưa mở cổng** — phải bấm **ON** trong Artisan. Trang canh 5 phút và tự nhận
  ra lúc Artisan giữ cổng.

Tệp tải về có tên đọc là hiểu — máy · cổng · đường nối · ngày:
`OTL-AUTO-CMS_COM5_57600-8N1-RTU_2026-11-10.aset` (bản `.exe` đặt tên y hệt).

Trang web và Artisan **không giữ cùng một cổng COM được**: dò xong hãy để trang yên, mở Artisan.

Mã nguồn: [`do-web.js`](do-web.js). Bài kiểm: `node --test test-do-web.mjs` (33 bài — khung Modbus
RTU/ASCII, bảng ô ba máy, vá tệp `.aset`, đọc tên cổng, tên tệp) và `python -m pytest test-trang.py -q`
(mở trang bằng Chromium thật: hai tab, một nút, ô tên cổng, tải tệp, bố cục ở cỡ **điện thoại 390 px**).
Phần cổng COM thật phải bấm tay.

---

O Tesla · 0936 198 938 · otlpro.com@gmail.com · [otlpro.com](https://otlpro.com)

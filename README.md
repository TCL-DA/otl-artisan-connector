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

---

O Tesla · 0936 198 938 · otlpro.com@gmail.com · [otlpro.com](https://otlpro.com)

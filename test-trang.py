# -*- coding: utf-8 -*-
"""Mở trang bằng Chromium thật: bắt lỗi console, kiểm hai tab, một nút, và bố cục trên ĐIỆN THOẠI.

    python -m pytest test-trang.py -q

Không bấm dò thật ở đây: Chromium tự động không được cấp quyền cổng COM, mà máy này cũng không có
máy rang. Phần đó phải bấm tay ở xưởng.
"""
import functools
import http.server
import os
import threading

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DIEN_THOAI = {"width": 390, "height": 844}       # iPhone 14 dựng đứng
MAY_TINH = {"width": 1280, "height": 900}


@pytest.fixture(scope="module")
def web():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=HERE)
    sv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=sv.serve_forever, daemon=True).start()
    yield "http://127.0.0.1:%d/index.html" % sv.server_address[1]
    sv.shutdown()


@pytest.fixture(scope="module")
def pw():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _mo(pw, web, viewport):
    pg = pw.new_page(viewport=viewport)
    loi = []
    pg.on("pageerror", lambda e: loi.append("pageerror: " + str(e)))
    pg.on("console", lambda m: loi.append("console: " + m.text) if m.type == "error" else None)
    pg.on("requestfailed", lambda r: loi.append("tải hỏng: " + r.url))
    pg.goto(web)
    # Chờ theo MỐC CÓ THẬT trên trang, không chờ "networkidle": máy chủ kiểm giữ kết nối mở nên
    # networkidle có lúc không bao giờ tới, bài kiểm hỏng vì hạ tầng chứ không phải vì trang.
    pg.wait_for_selector(".tabs button", state="attached", timeout=15000)
    pg.wait_for_function("document.querySelectorAll('#wbuoc .row').length === 5"
                         " || document.getElementById('wkhoi').hidden", timeout=15000)
    return pg, loi


@pytest.fixture
def trang(pw, web):
    pg, loi = _mo(pw, web, MAY_TINH)
    yield pg, loi
    pg.close()


@pytest.fixture
def trang_dt(pw, web):
    pg, loi = _mo(pw, web, DIEN_THOAI)
    yield pg, loi
    pg.close()


def test_mo_trang_khong_loi(trang):
    pg, loi = trang
    assert pg.title() == "OTL Auto Artisan Connector"
    assert loi == []


def test_hai_tab_va_chi_mot_tab_hien_cung_luc(trang):
    pg, _ = trang
    assert pg.locator(".tabs button").count() == 2
    hien = [pg.locator("#panel-do").is_visible(), pg.locator("#panel-tai").is_visible()]
    assert hien.count(True) == 1, hien


def test_bam_tab_tai_thi_doi_panel(trang):
    pg, loi = trang
    pg.click("#tab-tai")
    assert pg.locator("#panel-tai").is_visible()
    assert pg.locator("#panel-do").is_hidden()
    assert pg.get_attribute("#tab-tai", "aria-selected") == "true"
    pg.click("#tab-do")
    assert pg.locator("#panel-do").is_visible()
    assert loi == []


def test_mot_nut_duy_nhat_trong_tab_do(trang):
    """Nút chỉ mang TÊN VIỆC. "Chọn cổng & dò" là hai việc nhét vào một nhãn — khách không hiểu."""
    pg, _ = trang
    if not pg.evaluate("'serial' in navigator"):
        pytest.skip("Chromium này không có Web Serial")
    assert pg.inner_text("#wgo").strip() == "BẮT ĐẦU"
    assert "&" not in pg.inner_text("#wgo")


def test_nam_buoc_co_mo_ta_truoc_khi_chay(trang):
    """Năm dòng "CHỜ" trống không thì người dùng không biết máy sắp làm gì."""
    pg, _ = trang
    if not pg.evaluate("'serial' in navigator"):
        pytest.skip("Chromium này không có Web Serial")
    assert pg.locator("#wbuoc .row").count() == 5
    for i in range(5):
        assert pg.locator("#wbuoc .row .ct").nth(i).inner_text().strip()


def test_bang_so_sanh_noi_that_ve_viec_web_khong_lam_duoc(trang):
    """Trang không được hứa web làm được cài driver."""
    pg, _ = trang
    chu = pg.inner_text(".sosanh")
    assert "driver" in chu.lower()
    assert pg.locator(".sosanh .khong").count() >= 1


def test_nut_tai_ve_tro_dung_goi_co_that(trang):
    """Đọc link NGAY TRÊN TRANG rồi mới kiểm — ghi cứng tên tệp vào bài kiểm thì mỗi lần lên bản mới
    lại phải sửa bài kiểm, mà quên sửa trang thì bài kiểm vẫn xanh còn khách bấm ra trang 404."""
    pg, _ = trang
    pg.click("#tab-tai")
    href = pg.get_attribute(".tai", "href")
    assert href and href.endswith(".zip"), href
    r = pg.request.head(pg.url.replace("index.html", href))
    assert r.status == 200, (href, r.status)
    assert int(r.headers.get("content-length", 0)) > 1_000_000


@pytest.mark.parametrize("ten", ["3kg-frecon", "1kg-bus", "auto-board"])
def test_tep_mau_aset_tai_duoc_va_sach(trang, ten):
    pg, _ = trang
    r = pg.request.get(pg.url.replace("index.html", "mau-%s.aset" % ten))
    assert r.status == 200
    t = r.text()
    assert "[Modbus]" in t and "[SerialPort]" in t
    for xau in ("DAKNONG", "C:/Users", "C:\\Users", "@gmail"):
        assert xau.lower() not in t.lower(), (ten, xau)


# ── Điện thoại ──────────────────────────────────────────────────────────────
def test_dien_thoai_khong_bi_tran_ngang(trang_dt):
    """Tràn ngang trên điện thoại là lỗi nặng: chữ bị cắt, nút nằm ngoài màn hình."""
    pg, loi = trang_dt
    for ten in ("tab-tai", "tab-do"):
        pg.click("#" + ten)
        rong = pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
        assert rong[0] <= rong[1] + 1, (ten, rong)
    assert loi == []


def test_dien_thoai_nut_tai_chiem_het_be_ngang(trang_dt):
    pg, _ = trang_dt
    pg.click("#tab-tai")
    h = pg.locator(".tai").bounding_box()
    rong = pg.evaluate("window.innerWidth")
    assert h["width"] > rong * 0.8, (h, rong)


def test_dien_thoai_chu_khong_qua_nho(trang_dt):
    """Cho người 50 tuổi vẫn đọc được: chữ thân bài không dưới 15 px."""
    pg, _ = trang_dt
    co = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.dan')).fontSize)")
    assert co >= 15, co


def test_dien_thoai_hai_tab_van_bam_duoc(trang_dt):
    """Ô chạm thấp hơn ~40 px là bấm trượt."""
    pg, _ = trang_dt
    for i in range(2):
        h = pg.locator(".tabs button").nth(i).bounding_box()
        assert h["height"] >= 40, h


def test_may_tinh_khong_bi_tran_ngang(trang):
    pg, _ = trang
    rong = pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    assert rong[0] <= rong[1] + 1, rong


# ── Thiếu driver: trang phải CHỈ CHỖ, không được bỏ mặc ─────────────────────
def test_khoi_driver_an_luc_binh_thuong(trang):
    pg, _ = trang
    assert pg.locator("#wdriver").is_hidden()


def test_khoi_driver_noi_THANG_la_web_khong_cai_duoc(trang):
    """Không được hứa web cài driver: cần quyền quản trị, trình duyệt bị cấm. Nói thẳng mới đúng."""
    pg, _ = trang
    chu = pg.evaluate("document.getElementById('wdriver').innerText")
    assert "không cài driver được" in chu.lower() or "không cài được driver" in chu.lower(), chu[:200]


def test_khoi_driver_co_du_bon_trang_hang(trang):
    """Chỉ bốn trang hãng — driver chạy ở mức nhân Windows, không được dẫn khách ra trang tải hộ."""
    pg, _ = trang
    links = pg.eval_on_selector_all("#wdriver a", "a => a.map(x => x.href)")
    for hang in ("wch-ic.com", "silabs.com", "prolific.com.tw", "ftdichip.com"):
        assert any(hang in h for h in links), (hang, links)
    assert all(h.startswith("https://") for h in links), links


def test_khoi_driver_hien_ra_khi_khong_thay_cong_nao(trang):
    """Dựng cảnh "không có cáp nào": trang phải bật khối driver chứ không im lặng."""
    pg, loi = trang
    if not pg.evaluate("'serial' in navigator"):
        pytest.skip("Chromium này không có Web Serial")
    pg.evaluate("""() => {
        navigator.serial.getPorts = async () => [];
        navigator.serial.requestPort = async () => { throw new DOMException('no device', 'NotFoundError'); };
    }""")
    pg.click("#wgo")
    pg.wait_for_selector("#wdriver:not([hidden])", timeout=15000)
    assert "driver" in pg.inner_text("#wbao-chu").lower()
    assert loi == []


def test_nut_trong_khoi_driver_dua_sang_tab_tai(trang):
    pg, _ = trang
    pg.evaluate("document.getElementById('wdriver').hidden = false")
    pg.click("#wdriver-exe")
    assert pg.locator("#panel-tai").is_visible()


def test_ma_sha256_tren_trang_KHOP_voi_tep_zip_that(trang):
    """Mã kiểm tệp mà lệch thì tệ hơn là không có: khách kiểm thấy khác, tưởng tệp bị sửa.
    Tính lại từ chính tệp .zip mà nút tải đang trỏ tới."""
    import hashlib
    pg, _ = trang
    pg.click("#tab-tai")
    cong_bo = pg.inner_text("#sha").strip().upper()
    assert len(cong_bo) == 64 and all(c in "0123456789ABCDEF" for c in cong_bo), cong_bo
    href = pg.get_attribute(".tai", "href")
    r = pg.request.get(pg.url.replace("index.html", href))
    assert r.status == 200
    that = hashlib.sha256(r.body()).hexdigest().upper()
    assert that == cong_bo, "trang ghi %s nhưng tệp thật là %s" % (cong_bo, that)


def test_trang_noi_ro_cach_qua_man_hinh_SmartScreen(trang):
    """Phải DẪN BẰNG cách gỡ hẳn (bỏ chặn .zip trước khi giải nén), rồi mới tới cách đi vòng.
    Đã thử trên Windows thật ngày 02/11/2026 với chính bộ giải nén của Explorer: bỏ chặn tệp .zip
    trước thì exe bung ra không còn dấu MOTW và SmartScreen không hiện gì."""
    pg, _ = trang
    pg.click("#tab-tai")
    chu = pg.inner_text("#smart")
    assert "Unblock" in chu and "trước khi giải nén" in chu, chu[:200]
    # cách gỡ hẳn phải đứng TRƯỚC cách đi vòng
    assert chu.index("Unblock") < chu.index("Run anyway"), "cách đi vòng không được đứng trước"
    assert "More info" in chu and "Run anyway" in chu
    assert "không phải báo virus" in chu, chu[:200]

# -*- coding: utf-8 -*-
"""Mở trang tải bằng Chromium thật, bắt lỗi console, kiểm khối dò hiện đúng.
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


@pytest.fixture(scope="module")
def web():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=HERE)
    sv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=sv.serve_forever, daemon=True).start()
    yield "http://127.0.0.1:%d/index.html" % sv.server_address[1]
    sv.shutdown()


@pytest.fixture
def trang(web):
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1280, "height": 900})
        loi = []
        pg.on("pageerror", lambda e: loi.append(str(e)))
        pg.on("console", lambda m: loi.append(m.text) if m.type == "error" else None)
        pg.on("requestfailed", lambda r: loi.append("tải hỏng: " + r.url))
        pg.goto(web)
        pg.wait_for_load_state("networkidle")
        yield pg, loi
        b.close()


def test_trang_khong_loi_va_du_tai_nguyen(trang):
    pg, loi = trang
    assert pg.title() == "OTL Auto Artisan Connector"
    assert loi == []


def test_hien_dung_mot_trong_hai_nhanh_web_serial(trang):
    """Có Web Serial thì hiện khối dò; không có thì hiện lời giải thích — không bao giờ cả hai."""
    pg, _ = trang
    co = pg.evaluate("'serial' in navigator")
    assert pg.locator("#wkhoi").is_visible() is bool(co)
    assert pg.locator("#wkhong").is_visible() is (not co)


def test_nut_tai_aset_khoa_san_khi_chua_do(trang):
    pg, _ = trang
    if not pg.evaluate("'serial' in navigator"):
        pytest.skip("Chromium này không có Web Serial")
    assert pg.locator("#wtai").is_disabled()
    assert pg.locator("#wket").is_hidden()
    assert pg.inner_text("#wgo").strip() == "CHỌN CỔNG & DÒ"


def test_tep_mau_aset_tai_duoc_va_sach(trang):
    pg, _ = trang
    r = pg.request.get(pg.url.replace("index.html", "mau-3kg-frecon.aset"))
    assert r.status == 200
    t = r.text()
    assert "[Modbus]" in t and "[SerialPort]" in t
    for xau in ("DAKNONG", "C:/Users", "C:\\Users"):
        assert xau.lower() not in t.lower(), xau


def test_nut_tai_ve_exe_con_song(trang):
    pg, _ = trang
    r = pg.request.head(pg.url.replace("index.html", "OTL-Auto-Artisan-Connector-v1.0.zip"))
    assert r.status == 200

from datetime import UTC, datetime, timedelta

from tram_tin.notify import MAX_ITEMS_PER_DIGEST, Item, build_messages
from tram_tin.telegram import MAX_LEN

T0 = datetime(2026, 11, 12, 10, 0, tzinfo=UTC)


def _items(n, source="bbc", name="BBC", start=0, title_len=40):
    return [
        Item(start + i, source, name, f"Tin <số> {i} " + "x" * title_len, f"https://b.test/{start + i}?a=1&b=2",
             T0 - timedelta(minutes=i))
        for i in range(n)
    ]


def test_empty():
    assert build_messages([]) == []


def test_single_message_escapes_and_covers_all():
    items = _items(3) + _items(2, "rfa", "RFA & co", start=100)
    [m] = build_messages(items, web_url="http://127.0.0.1:3100")
    assert m.text.startswith("📰 <b>Trạm Tin</b> · 5 tin mới")
    assert "&lt;số&gt;" in m.text and "RFA &amp; co" in m.text
    assert 'href="https://b.test/0?a=1&amp;b=2"' in m.text
    assert m.text.endswith('<a href="http://127.0.0.1:3100">Mở bảng tin</a>')
    assert sorted(m.ids) == sorted(i.notification_id for i in items)
    assert m.text.index("<b>BBC</b>") < m.text.index("RFA")  # nguồn nhiều tin lên trước


def test_split_respects_limit_and_never_loses_ids():
    items = _items(25, title_len=300) + _items(25, "rfa", "RFA", start=100, title_len=300)
    msgs = build_messages(items)
    assert len(msgs) > 1
    assert all(len(m.text) <= MAX_LEN for m in msgs)
    assert all(m.text.startswith("📰 <b>Trạm Tin</b> · 50 tin mới · ") for m in msgs)
    assert sorted(i for m in msgs for i in m.ids) == sorted(i.notification_id for i in items)
    for m in msgs:  # mỗi tin bắt đầu bằng tiêu đề nguồn ngay sau header
        assert m.text.split("\n\n", 1)[1].startswith("<b>")


def test_overflow_items_are_counted_not_listed():
    items = _items(MAX_ITEMS_PER_DIGEST + 30, title_len=5)
    msgs = build_messages(items)
    text = "".join(m.text for m in msgs)
    assert "… và" in text
    assert len({i for m in msgs for i in m.ids}) == len(items)

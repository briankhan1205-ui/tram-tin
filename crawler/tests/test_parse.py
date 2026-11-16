from datetime import UTC, datetime

from tram_tin.parse import html_to_text, parse_feed

NOW = datetime(2026, 11, 12, 12, 0, tzinfo=UTC)

WP_FEED = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Ng\xc6\xb0\xe1\xbb\x9di Vi\xe1\xbb\x87t</title>
<item>
  <title>T\xc3\xb2a nh\xc3\xa0 &amp; c\xe1\xbb\x95ng</title>
  <link>https://www.nguoi-viet.com/a/1/?utm_source=rss</link>
  <guid>https://www.nguoi-viet.com/?p=1</guid>
  <pubDate>Thu, 12 Nov 2026 13:24:29 +0000</pubDate>
  <description><![CDATA[<p>T\xc3\xb3m t\xe1\xba\xaft ng\xe1\xba\xafn.</p><p>The post X appeared first on Ng\xc6\xb0\xe1\xbb\x9di Vi\xe1\xbb\x87t.</p>]]></description>
  <content:encoded><![CDATA[<figure><img src="https://img.example/1.jpg"/><figcaption>Ch\xc3\xba th\xc3\xadch</figcaption></figure><p>\xc4\x90o\xe1\xba\xa1n 1</p><script>evil()</script><p>\xc4\x90o\xe1\xba\xa1n 2</p>]]></content:encoded>
</item>
<item>
  <title></title>
  <link>https://www.nguoi-viet.com/a/2/</link>
</item>
<item>
  <title>Kh\xc3\xb4ng ng\xc3\xa0y</title>
  <link>https://www.nguoi-viet.com/a/3/</link>
  <media:thumbnail url="https://img.example/3.jpg"/>
</item>
</channel></rss>"""


def test_parse_wordpress_feed():
    feed = parse_feed(WP_FEED, "https://www.nguoi-viet.com/feed/", now=NOW)
    assert feed.bozo_error is None
    assert [a.title for a in feed.articles] == ["Tòa nhà & cổng", "Không ngày"]

    a = feed.articles[0]
    assert a.summary == "Tóm tắt ngắn."  # đã bỏ footer WordPress
    assert a.content == "Đoạn 1\n\nĐoạn 2"  # bỏ script + figcaption
    assert a.image_url == "https://img.example/1.jpg"
    assert a.published_at == NOW  # 13:24 > NOW → kẹp về NOW (không để tin "tương lai")

    b = feed.articles[1]
    assert b.published_at == NOW  # không có ngày → thời điểm lấy
    assert b.image_url == "https://img.example/3.jpg"
    assert b.summary is None


def test_parse_garbage():
    feed = parse_feed(b"<html>not a feed", "https://x.test/feed")
    assert feed.articles == []
    assert feed.bozo_error


def test_html_to_text_entities_and_whitespace():
    assert html_to_text("<p>A&nbsp;&amp;   B</p><br><div>C</div>") == "A & B\n\nC"
    assert html_to_text(None) == ""

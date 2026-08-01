from wayback_downloader.urlmap import sanitize_segment, url_to_filepath


def test_root_path_gets_index_html():
    assert url_to_filepath("http://example.com/") == "example.com/index.html"
    assert url_to_filepath("http://example.com") == "example.com/index.html"


def test_directory_like_path_gets_index_html():
    assert url_to_filepath("http://example.com/blog/") == "example.com/blog/index.html"
    assert url_to_filepath("http://example.com/blog") == "example.com/blog/index.html"


def test_file_with_extension_is_kept_as_is():
    assert url_to_filepath("http://example.com/style.css") == "example.com/style.css"
    assert url_to_filepath("http://example.com/img/logo.png") == "example.com/img/logo.png"


def test_query_string_is_appended_to_filename():
    # "/search" has no extension, so it becomes a directory with an
    # index.html file, and the query string decorates that filename.
    path = url_to_filepath("http://example.com/search?q=hello")
    assert path == "example.com/search/index@q=hello.html"

    # "/style.css" already looks like a file, so the query string is
    # spliced in before the existing extension.
    path = url_to_filepath("http://example.com/style.css?v=2")
    assert path == "example.com/style@v=2.css"


def test_illegal_characters_are_sanitized():
    assert sanitize_segment('weird:"name"|<>') == "weird__name____"
    assert sanitize_segment("") == "_"


def test_percent_encoded_segments_are_decoded():
    path = url_to_filepath("http://example.com/hello%20world.html")
    assert path == "example.com/hello world.html"


def test_deep_paths_preserve_structure():
    path = url_to_filepath("http://example.com/a/b/c/page.html")
    assert path == "example.com/a/b/c/page.html"

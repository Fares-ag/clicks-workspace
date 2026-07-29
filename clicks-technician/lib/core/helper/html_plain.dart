/// Minimal HTML → plain text for content screens (no extra package).
String htmlToPlainText(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  var s = raw;
  s = s.replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'</p\s*>', caseSensitive: false), '\n\n');
  s = s.replaceAll(RegExp(r'</div\s*>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'<li[^>]*>', caseSensitive: false), '• ');
  s = s.replaceAll(RegExp(r'</li\s*>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'<[^>]+>'), '');
  s = s
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");
  s = s.replaceAll(RegExp(r'\n{3,}'), '\n\n');
  return s.trim();
}

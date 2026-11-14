import 'dart:html' as html;
import 'dart:typed_data';

Future<bool> openReceiptPdf(List<int> bytes, String filename) async {
  try {
    final blob = html.Blob(
      [Uint8List.fromList(bytes)],
      'application/pdf',
    );
    final url = html.Url.createObjectUrlFromBlob(blob);
    html.AnchorElement(href: url)
      ..setAttribute('download', filename)
      ..click();
    html.Url.revokeObjectUrl(url);
    return true;
  } catch (_) {
    return false;
  }
}

import 'package:clicks_technician/core/helper/action_errors.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ActionErrors.fromResponse', () {
    test('includes server details for mark completed failed', () {
      final msg = ActionErrors.fromResponse(
        Response(
          requestOptions: RequestOptions(path: '/'),
          statusCode: 500,
          data: {
            'error': 'Mark completed failed',
            'details': 'Receipt duplicate key',
          },
        ),
      );
      expect(msg, contains('Receipt duplicate key'));
    });

    test('humanizes wrong job status', () {
      final msg = ActionErrors.fromResponse(
        Response(
          requestOptions: RequestOptions(path: '/'),
          statusCode: 400,
          data: {'error': 'Cannot complete job with status: arrived'},
        ),
      );
      expect(msg, contains('Arrived'));
      expect(msg, contains('Start Job'));
    });
  });

  group('ActionErrors.completionReadiness', () {
    test('requires in_progress, paid, and signature', () {
      expect(
        ActionErrors.completionReadiness({
          'job_status': 'arrived',
          'payment_status': 'paid',
          'customerSignatureUrl': 'https://x/sign.png',
          'customerSignedAt': '2026-01-01T00:00:00.000Z',
        }),
        isNotNull,
      );

      expect(
        ActionErrors.completionReadiness({
          'job_status': 'in_progress',
          'payment_status': 'unpaid',
          'customerSignatureUrl': 'https://x/sign.png',
          'customerSignedAt': '2026-01-01T00:00:00.000Z',
        }),
        contains('payment'),
      );

      expect(
        ActionErrors.completionReadiness({
          'job_status': 'in_progress',
          'payment_status': 'paid',
          'customerSignatureUrl': '',
        }),
        contains('signature'),
      );

      expect(
        ActionErrors.completionReadiness({
          'job_status': 'in_progress',
          'payment_status': 'paid',
          'customerSignatureUrl': 'https://x/sign.png',
          'customerSignedAt': '2026-01-01T00:00:00.000Z',
        }),
        isNull,
      );
    });
  });
}

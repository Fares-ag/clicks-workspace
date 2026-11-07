import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/download_helper.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'payment_ui.dart';

class _FieldSpec {
  const _FieldSpec({
    required this.key,
    required this.label,
    this.hint,
    this.required = false,
    this.number = false,
    this.maxLines = 1,
    this.maxLength,
  });

  final String key;
  final String label;
  final String? hint;
  final bool required;
  final bool number;
  final int maxLines;
  final int? maxLength;
}

/// Refund actions (request, approve, reject, credit note) shared by the
/// refunds screens and the job detail screen. Every call is audited by the
/// server; errors (e.g. REFUND_SAME_APPROVER) are shown inside the dialog.
class RefundActions {
  RefundActions._();

  /// Form dialog that stays open until the server accepts the call, so a
  /// refusal is shown next to the inputs instead of a vanishing snackbar.
  /// Returns the accepted response, or null when dismissed.
  static Future<Response?> _submitDialog(
    BuildContext context, {
    required String title,
    String? intro,
    required List<_FieldSpec> fields,
    required String confirmLabel,
    bool destructive = false,
    required Future<Response> Function(Map<String, String> values) submit,
    String? Function(Map<String, String> values)? validate,
  }) {
    final controllers = {
      for (final f in fields) f.key: TextEditingController(),
    };
    String? error;
    var busy = false;
    return showDialog<Response>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          Future<void> onConfirm() async {
            final values = {
              for (final f in fields) f.key: controllers[f.key]!.text.trim(),
            };
            for (final f in fields) {
              if (f.required && values[f.key]!.isEmpty) {
                setLocal(() => error = '${f.label} is required');
                return;
              }
            }
            final invalid = validate?.call(values);
            if (invalid != null) {
              setLocal(() => error = invalid);
              return;
            }
            setLocal(() {
              busy = true;
              error = null;
            });
            try {
              final res = await submit(values);
              final ok = res.statusCode != null &&
                  res.statusCode! >= 200 &&
                  res.statusCode! < 300;
              if (ok) {
                if (ctx.mounted) Navigator.pop(ctx, res);
                return;
              }
              setLocal(() {
                busy = false;
                error = _errorText(res);
              });
            } catch (err) {
              setLocal(() {
                busy = false;
                error = 'Request failed: $err';
              });
            }
          }

          return AlertDialog(
            title: Text(title),
            content: SizedBox(
              width: 440,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (intro != null) ...[
                      Text(intro, style: AdminTypography.body),
                      const SizedBox(height: AppSpacing.sm),
                    ],
                    for (final f in fields)
                      TextField(
                        controller: controllers[f.key],
                        enabled: !busy,
                        maxLines: f.maxLines,
                        maxLength: f.maxLength,
                        keyboardType: f.number
                            ? const TextInputType.numberWithOptions(decimal: true)
                            : TextInputType.text,
                        decoration: InputDecoration(
                          labelText: f.required ? f.label : '${f.label} (optional)',
                          helperText: f.hint,
                          helperMaxLines: 3,
                        ),
                      ),
                    if (error != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        error!,
                        style: AdminTypography.body.copyWith(color: AppColors.danger),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: busy ? null : () => Navigator.pop(ctx),
                child: const Text('Back'),
              ),
              FilledButton(
                style: destructive
                    ? FilledButton.styleFrom(backgroundColor: AppColors.danger)
                    : null,
                onPressed: busy ? null : onConfirm,
                child: Text(busy ? 'Working...' : confirmLabel),
              ),
            ],
          );
        },
      ),
    );
  }

  /// Server message plus a plain-language hint for the codes ops will hit.
  static String _errorText(Response res) {
    final message = DioHelper.errorMessage(res) ?? 'Request failed (${res.statusCode})';
    final data = res.data;
    final code = data is Map ? data['code']?.toString() : null;
    switch (code) {
      case 'REFUND_SAME_APPROVER':
        return '$message\nAsk another Super Admin to approve it.';
      case 'REFUND_APPROVER_ROLE':
        return '$message\nOnly a Super Admin can approve or reject refunds.';
      case 'REFUND_REFERENCE_REQUIRED':
        return '$message\nEnter the reference of the cash / bank / portal refund.';
      case 'REFUND_PROVIDER_FAILED':
        return '$message\nThe case is now Failed: retry later, or refund in the '
            'SkipCash portal and approve again with that reference.';
      default:
        return message;
    }
  }

  static Map<String, dynamic>? _refundFrom(Response res) {
    final data = res.data;
    if (data is Map && data['refund'] is Map) {
      return Map<String, dynamic>.from(data['refund'] as Map);
    }
    return null;
  }

  /// Opens a refund case on a paid job. Amount empty = everything still
  /// refundable. Nothing moves until a different Super Admin approves it.
  static Future<bool> requestForJob(
    BuildContext context, {
    required String jobId,
    String? jobLabel,
    String? attemptId,
  }) async {
    final res = await _submitDialog(
      context,
      title: 'Request refund',
      intro: '${jobLabel == null ? '' : '$jobLabel\n'}'
          'Opens a refund case. A different Super Admin (or a finance admin) '
          'must approve it before any money moves.',
      fields: const [
        _FieldSpec(
          key: 'amount',
          label: 'Amount (QAR)',
          number: true,
          hint: 'Leave empty to refund everything still refundable',
        ),
        _FieldSpec(
          key: 'reason',
          label: 'Reason',
          required: true,
          maxLines: 3,
          maxLength: 1000,
        ),
      ],
      confirmLabel: 'Request refund',
      validate: (values) {
        final raw = values['amount']!;
        if (raw.isEmpty) return null;
        final n = double.tryParse(raw);
        if (n == null || n <= 0) return 'Enter a positive amount, or leave it empty';
        return null;
      },
      submit: (values) => DioHelper.postData(
        url: EndPoints.refunds,
        data: {
          'job_id': jobId,
          if (attemptId != null) 'attempt_id': attemptId,
          'reason': values['reason'],
          if (values['amount']!.isNotEmpty) 'amount': double.parse(values['amount']!),
        },
      ),
    );
    if (res == null || !context.mounted) return false;
    final refund = _refundFrom(res);
    PaymentUi.snack(
      context,
      'Refund of ${PaymentUi.money(refund?['amount'])} requested — awaiting approval',
    );
    return true;
  }

  /// Approve (Super Admin, not the requester). Manual-method cases need the
  /// reference of the cash/portal refund; a failed card refund can be retried
  /// (no reference) or closed with the SkipCash portal reference.
  static Future<bool> approve(BuildContext context, Map<String, dynamic> refund) async {
    final id = refund['_id']?.toString() ?? '';
    if (id.isEmpty) return false;
    final manual = refund['method']?.toString() == 'manual';
    final failed = refund['status']?.toString() == 'failed';
    final amount = PaymentUi.money(refund['amount']);
    final intro = manual
        ? 'Approve a refund of $amount. This payment was not taken by card: '
            'refund the customer yourself (cash / bank / wallet) and record the reference.'
        : failed
            ? 'The last SkipCash attempt failed: ${refund['error'] ?? 'unknown error'}.\n'
                'Leave the reference empty to retry at SkipCash, or refund in the '
                'SkipCash portal and enter its reference to close the case.'
            : 'Approve a refund of $amount. It is sent to SkipCash; the case stays '
                '"awaiting confirmation" until SkipCash confirms it.';
    final res = await _submitDialog(
      context,
      title: failed ? 'Retry / complete refund' : 'Approve refund',
      intro: intro,
      fields: [
        if (manual || failed)
          _FieldSpec(
            key: 'manual_reference',
            label: 'Refund reference',
            required: manual,
            maxLength: 200,
          ),
      ],
      confirmLabel: failed && !manual ? 'Submit' : 'Approve',
      submit: (values) => DioHelper.postData(
        url: EndPoints.refundApprove(id),
        data: {
          if ((values['manual_reference'] ?? '').isNotEmpty)
            'manual_reference': values['manual_reference'],
        },
      ),
    );
    if (res == null || !context.mounted) return false;
    final status = _refundFrom(res)?['status']?.toString() ?? '';
    PaymentUi.snack(
      context,
      status == 'succeeded'
          ? 'Refund completed'
          : status == 'processing'
              ? 'Sent to SkipCash — awaiting confirmation'
              : 'Refund ${PaymentUi.refundStatusLabel(status).toLowerCase()}',
    );
    return true;
  }

  static Future<bool> reject(BuildContext context, Map<String, dynamic> refund) async {
    final id = refund['_id']?.toString() ?? '';
    if (id.isEmpty) return false;
    final res = await _submitDialog(
      context,
      title: 'Reject refund',
      intro: 'Close this case without refunding ${PaymentUi.money(refund['amount'])}.',
      fields: const [
        _FieldSpec(
          key: 'reason',
          label: 'Reason',
          required: true,
          maxLines: 3,
          maxLength: 1000,
        ),
      ],
      confirmLabel: 'Reject',
      destructive: true,
      submit: (values) => DioHelper.postData(
        url: EndPoints.refundReject(id),
        data: {'reason': values['reason']},
      ),
    );
    if (res == null || !context.mounted) return false;
    PaymentUi.snack(context, 'Refund rejected');
    return true;
  }

  /// The credit note exists only once the refund has succeeded.
  static bool hasCreditNote(Map<String, dynamic> refund) =>
      refund['status']?.toString() == 'succeeded' &&
      (refund['credit_note_number']?.toString() ?? '').isNotEmpty &&
      (refund['job_id']?.toString() ?? '').isNotEmpty;

  static Future<void> downloadCreditNote(
    BuildContext context,
    Map<String, dynamic> refund,
  ) async {
    final id = refund['_id']?.toString() ?? '';
    final number = refund['credit_note_number']?.toString() ?? id;
    try {
      final path = await DownloadHelper.saveAuthenticatedBytes(
        url: EndPoints.refundCreditNote(id),
        filename:
            'sanadcom-credit-note-${number.replaceAll(RegExp(r'[^\w.-]+'), '-')}.pdf',
      );
      if (path == null && context.mounted) {
        PaymentUi.snack(context, 'Failed to download the credit note', error: true);
      }
    } catch (_) {
      if (context.mounted) {
        PaymentUi.snack(context, 'Failed to download the credit note', error: true);
      }
    }
  }
}

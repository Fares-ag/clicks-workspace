import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/components/admin_card.dart';
import '../../core/components/admin_detail_header.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/theme/app_colors.dart';
import 'support_tickets_screen.dart';

/// One Contact Us ticket: customer, message, reply thread, status/assignee.
/// Uses the admin API (`/api/contact-us/:id`, PATCH, POST replies); every
/// change is audited server-side and the customer is notified.
class SupportTicketDetailScreen extends StatefulWidget {
  const SupportTicketDetailScreen({super.key, required this.ticketId});
  final String ticketId;

  @override
  State<SupportTicketDetailScreen> createState() => _SupportTicketDetailScreenState();
}

class _SupportTicketDetailScreenState extends State<SupportTicketDetailScreen> {
  Map<String, dynamic>? _ticket;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  final _replyCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _replyCtrl.dispose();
    super.dispose();
  }

  void _applyTicket(dynamic data) {
    if (data is Map && data['ticket'] is Map) {
      _ticket = Map<String, dynamic>.from(data['ticket'] as Map);
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(url: '/contact-us/${widget.ticketId}');
      if (!mounted) return;
      setState(() {
        if (res.statusCode == 200) {
          _applyTicket(res.data);
        } else {
          _error = DioHelper.errorMessage(res) ?? 'Ticket not found';
        }
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load the ticket';
        _loading = false;
      });
    }
  }

  void _toast(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? Colors.red : null),
    );
  }

  Future<void> _setStatus(String status) async {
    setState(() => _saving = true);
    try {
      final res = await DioHelper.patchData(
        url: '/contact-us/${widget.ticketId}',
        data: {'status': status},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        setState(() => _applyTicket(res.data));
      } else {
        _toast(DioHelper.errorMessage(res) ?? 'Update failed', error: true);
      }
    } catch (_) {
      if (mounted) _toast('Update failed', error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _sendReply({String? status}) async {
    final message = _replyCtrl.text.trim();
    if (message.isEmpty) return;
    setState(() => _saving = true);
    try {
      final res = await DioHelper.postData(
        url: '/contact-us/${widget.ticketId}/replies',
        data: {'message': message, if (status != null) 'status': status},
      );
      if (!mounted) return;
      if (res.statusCode == 201 || res.statusCode == 200) {
        _replyCtrl.clear();
        setState(() => _applyTicket(res.data));
        _toast('Reply sent — the customer was notified');
      } else {
        _toast(DioHelper.errorMessage(res) ?? 'Reply failed', error: true);
      }
    } catch (_) {
      if (mounted) _toast('Reply failed', error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  static String _date(dynamic raw) {
    final d = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (d == null) return '';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AdminLoadingState(message: 'Loading ticket…');
    final t = _ticket;
    if (t == null) {
      return Center(child: Text(_error ?? 'Ticket not found'));
    }
    final customer = t['customer'] is Map
        ? Map<String, dynamic>.from(t['customer'] as Map)
        : const <String, dynamic>{};
    final replies = t['replies'] is List
        ? (t['replies'] as List).whereType<Map>().toList()
        : const <Map>[];
    final status = t['status']?.toString() ?? 'pending';

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: '${t['ticket_number'] ?? 'Support ticket'} · '
              '${t['category_label'] ?? supportTicketCategoryLabels[t['category']] ?? ''}',
          subtitle: [
            customer['name'],
            customer['phone_number'],
            customer['email'],
          ].where((v) => v != null && v.toString().isNotEmpty).join(' · '),
        ),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Received ${_date(t['createdAt'])}',
                  style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              const SizedBox(height: 8),
              Text(t['description']?.toString() ?? '—'),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('Status: '),
                  DropdownButton<String>(
                    value: supportTicketStatusLabels.containsKey(status) ? status : 'pending',
                    items: supportTicketStatusLabels.entries
                        .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                        .toList(),
                    onChanged: _saving
                        ? null
                        : (v) {
                            if (v != null && v != status) _setStatus(v);
                          },
                  ),
                ],
              ),
            ],
          ),
        ),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Replies (${replies.length})',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              for (final r in replies) ...[
                const SizedBox(height: 10),
                Text(
                  '${r['author_type'] == 'admin' ? (r['author_name']?.toString().isNotEmpty == true ? r['author_name'] : 'Support') : 'Customer'}'
                  ' · ${_date(r['created_at'])}',
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
                const SizedBox(height: 2),
                Text(r['message']?.toString() ?? ''),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: _replyCtrl,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(
                  hintText: 'Reply to the customer (they get a push and an inbox entry)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  FilledButton(
                    onPressed: _saving ? null : () => _sendReply(),
                    child: const Text('Send reply'),
                  ),
                  OutlinedButton(
                    onPressed: _saving ? null : () => _sendReply(status: 'resolved'),
                    child: const Text('Reply & resolve'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

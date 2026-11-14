import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/components/clicks_app_header.dart';
import '../../../../core/helper/content_repository.dart';
import '../../../../core/theme/colors_manager.dart';
import '../../../../core/theme/text_styles.dart';

/// "My requests": the customer's Contact Us tickets with status and the
/// support team's replies (scenario 100).
class MyRequestsScreen extends StatefulWidget {
  const MyRequestsScreen({super.key});

  @override
  State<MyRequestsScreen> createState() => _MyRequestsScreenState();
}

class _MyRequestsScreenState extends State<MyRequestsScreen> {
  final ContentRepository _repository = ContentRepository();
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _repository.getMyRequests();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  static String categoryLabel(Map<String, dynamic> item) {
    final code = item['category']?.toString() ?? '';
    final key = 'settings.$code';
    final label = key.tr();
    return label == key ? (item['issue']?.toString() ?? '') : label;
  }

  static String statusLabel(String? status) {
    final key = 'settings.request_status_${status ?? 'pending'}';
    final label = key.tr();
    return label == key ? (status ?? '') : label;
  }

  static String formatDate(dynamic raw) {
    final parsed = DateTime.tryParse(raw?.toString() ?? '');
    if (parsed == null) return '';
    return DateFormat('d MMM yyyy, HH:mm').format(parsed.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.canvas,
      appBar: ClicksAppHeader(
        title: 'settings.my_requests'.tr(),
        automaticallyImplyLeading: true,
      ),
      body: _loading
          ? Center(child: CircularProgressIndicator(color: ColorsManager.mainColor))
          : _error != null
              ? _ErrorState(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _items.isEmpty
                      ? ListView(
                          children: [
                            SizedBox(height: 120.h),
                            Center(child: Text('settings.no_requests'.tr())),
                          ],
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: _items.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) =>
                              _RequestCard(item: _items[index]),
                        ),
                ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final replies = (item['replies'] is List)
        ? (item['replies'] as List).whereType<Map>().toList()
        : const <Map>[];
    final ticket = item['ticket_number']?.toString();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ColorsManager.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _MyRequestsScreenState.categoryLabel(item),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFF2F4F7),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _MyRequestsScreenState.statusLabel(item['status']?.toString()),
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (ticket != null && ticket.isNotEmpty)
                'settings.ticket_number'.tr(namedArgs: {'number': ticket}),
              _MyRequestsScreenState.formatDate(item['createdAt']),
            ].where((s) => s.isNotEmpty).join(' · '),
            style: TextStyles.font12RegularGrey,
          ),
          const SizedBox(height: 8),
          Text(item['description']?.toString() ?? ''),
          for (final reply in replies) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF9FAFB),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    reply['author_type'] == 'admin'
                        ? 'settings.support_reply'.tr()
                        : (reply['author_name']?.toString() ?? ''),
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  const SizedBox(height: 4),
                  Text(reply['message']?.toString() ?? ''),
                  const SizedBox(height: 4),
                  Text(
                    _MyRequestsScreenState.formatDate(reply['created_at']),
                    style: TextStyles.font12RegularGrey,
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: Text('common.retry'.tr())),
          ],
        ),
      ),
    );
  }
}
